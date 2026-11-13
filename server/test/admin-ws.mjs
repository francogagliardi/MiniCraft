// Tests WebSocket del change admin: permisos en welcome/roster, frame perm,
// descarte del hit del bot contra bot_ignore y cierre de sockets por revocación.
// Uso: node test/admin-ws.mjs
import { startApp, connect, nextMessage, waitFor } from './support/app-fixture.mjs';

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ADMIN_PASSWORD = 'admin-12345';
const FIX = await startApp({
  users: [
    { username: 'admin', password: ADMIN_PASSWORD, role: 'admin', skin: 'human' },
    { username: 'root', password: ADMIN_PASSWORD, role: 'admin', skin: 'giant' },
    { username: 'ana', password: 'correcta-123', role: 'user', skin: 'small', permissions: { bot_ignore: true } },
    { username: 'beto', password: 'correcta-123', role: 'user', skin: 'human' },
    { username: 'carla', password: 'correcta-123', role: 'user', skin: 'fat' },
  ],
  bots: [{
    name: 'OPSX-bot', behavior: 'cazador', skin: 'robot', hp: 10, damage: 6,
    reach: 4.6, speed: 28.8, flying: true, takesDamage: false, active: true,
  }],
});

const adminCookie = await FIX.login('admin', ADMIN_PASSWORD);
const sockets = [];
async function join(cookie, helloExtra = {}) {
  const c = await connect(FIX.wsUrl(), { headers: { Cookie: cookie } });
  c.ws.send(JSON.stringify({ t: 'hello', name: 'Intruso', skin: 'giant', mode: 'admin', ...helloExtra }));
  const w = await nextMessage(c.ws, 'welcome');
  sockets.push(c.ws);
  return { ws: c.ws, w, id: w.id };
}
function waitClose(ws, timeout = 4000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { ws.off('close', h); resolve(null); }, timeout);
    function h(code) { clearTimeout(t); ws.off('close', h); resolve(code); }
    ws.on('close', h);
  });
}
function expectNo(ws, pred, ms = 450) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { ws.off('message', h); resolve(true); }, ms);
    function h(raw) {
      let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (pred(m)) { clearTimeout(t); ws.off('message', h); resolve(false); }
    }
    ws.on('message', h);
  });
}
async function idOf(name) {
  const res = await FIX.request('/api/admin/users', { cookie: adminCookie });
  const body = await res.json();
  return body.users.find(u => u.username === name).id;
}

try {
  // ===================================================================
  // 4.1 welcome.user.permissions y hello ignorado
  // ===================================================================
  {
    const ana = await join(await FIX.login('ana', 'correcta-123'), { permissions: { fly: true } });
    ok(ana.w.user && ana.w.user.permissions && typeof ana.w.user.permissions === 'object',
      'welcome.user trae el objeto permissions');
    ok(Object.keys(ana.w.user.permissions).sort().join(',') === 'bot_ignore,fly,instant_break',
      'welcome.user.permissions materializa las tres claves');
    ok(ana.w.user.permissions.bot_ignore === true, 'welcome.user refleja bot_ignore guardado');
    ok(ana.w.user.permissions.fly === false, 'un hello con permissions:{fly:true} no habilita nada');
    ana.ws.close();
  }
  {
    const beto = await join(await FIX.login('beto', 'correcta-123'), { permissions: { fly: true } });
    ok(beto.w.user.permissions.fly === false && beto.w.user.permissions.bot_ignore === false,
      'un usuario sin permisos recibe las tres claves en false, aunque el hello las declare');
    beto.ws.close();
  }

  // ===================================================================
  // 4.2 roster con botIgnore y cambio en caliente (perm)
  // ===================================================================
  {
    const beto = await join(await FIX.login('beto', 'correcta-123'));
    const anaJoin = waitFor(beto.ws, m => m.t === 'join' && m.name === 'ana');
    const ana = await join(await FIX.login('ana', 'correcta-123'));
    const jAna = await anaJoin;
    ok(jAna.botIgnore === true, 'el join de un jugador con bot_ignore difunde botIgnore:true');

    const carlaJoin = waitFor(beto.ws, m => m.t === 'join' && m.name === 'carla');
    const carla = await join(await FIX.login('carla', 'correcta-123'));
    const jCarla = await carlaJoin;
    ok(jCarla.botIgnore !== true, 'el join de un jugador sin el permiso no trae botIgnore');

    const root = await join(await FIX.login('root', ADMIN_PASSWORD));
    const seenAna = root.w.players.find(p => p.id === ana.id);
    const seenCarla = root.w.players.find(p => p.id === carla.id);
    ok(seenAna && seenAna.botIgnore === true, 'welcome.players incluye botIgnore:true del protegido');
    ok(seenCarla && seenCarla.botIgnore !== true, 'welcome.players no marca al resto');
    ok(seenAna && seenAna.name === 'ana' && seenAna.skin === 'small' && seenAna.mode === 'player',
      'el roster conserva los campos históricos junto al flag aditivo');

    const betoId = beto.id;
    const betoUserId = await idOf('beto');
    const hotBeto = waitFor(beto.ws, m => m.t === 'perm' && m.id === betoId);
    const hotAna = waitFor(ana.ws, m => m.t === 'perm' && m.id === betoId);
    const closeBeto = waitClose(beto.ws, 500);
    const patch = await FIX.request(`/api/admin/users/${betoUserId}`, {
      method: 'PATCH', cookie: adminCookie,
      body: { permissions: { fly: true, bot_ignore: true } },
    });
    ok(patch.status === 200, 'PATCH de permisos de un jugador conectado → 200');
    const [pb, pa, closed] = await Promise.all([hotBeto, hotAna, closeBeto]);
    ok(pb.permissions.fly === true && pb.permissions.bot_ignore === true,
      'el frame perm trae los permisos nuevos al propio jugador');
    ok(pa.permissions.fly === true, 'el frame perm se difunde a los demás');
    ok(closed === null, 'cambiar permisos NO cierra el socket');

    const me = await FIX.request('/api/me', { cookie: await FIX.login('beto', 'correcta-123') });
    ok((await me.json()).user.permissions.fly === true, 'los permisos persisten en el perfil sin relogin');

    const revoke = waitFor(beto.ws, m => m.t === 'perm' && m.id === betoId && m.permissions.fly === false);
    await FIX.request(`/api/admin/users/${betoUserId}`, {
      method: 'PATCH', cookie: adminCookie, body: { permissions: {} },
    });
    const pr = await revoke;
    ok(pr.permissions.bot_ignore === false, 'el frame perm también revoca los permisos');

    for (const s of [beto.ws, ana.ws, carla.ws, root.ws]) s.close();
    await sleep(50);
  }

  // ===================================================================
  // 4.3 bot in-process: roster, descarte de daño y golpe inmune
  // ===================================================================
  {
    const ana = await join(await FIX.login('ana', 'correcta-123'));
    const beto = await join(await FIX.login('beto', 'correcta-123'));
    const runtimeBot = FIX.app.bots.list()[0];
    ok(!!runtimeBot && runtimeBot.id < 0, 'el bot activo del runtime está en el roster con id negativo');
    const seen = beto.w.players.find(p => p.name === 'OPSX-bot');
    ok(seen && seen.bot === true && seen.skin === 'robot', 'welcome.players marca al bot con bot:true y su skin');

    const botId = runtimeBot.id;
    const near = [runtimeBot.pos[0] + 0.5, runtimeBot.pos[1], runtimeBot.pos[2]];
    // ana tiene bot_ignore: el cazador no debe emitirle phit ni perseguirlo.
    ana.ws.send(JSON.stringify({ t: 'mv', p: near, yaw: 0, pitch: 0, hp: 10, dead: 0, held: 0, seq: 0 }));
    await sleep(30);
    for (let i = 0; i < 3; i++) FIX.app.bots.tick(0.05);
    const noPhitAna = await expectNo(ana.ws, m => m.t === 'phit' && m.fromId === botId, 350);
    ok(noPhitAna, 'el runtime no emite phit contra un jugador con bot_ignore');

    // beto no está protegido: recibe el daño configurado del bot.
    const cur = FIX.app.bots.list()[0];
    const near2 = [cur.pos[0] + 0.5, cur.pos[1], cur.pos[2]];
    beto.ws.send(JSON.stringify({ t: 'mv', p: near2, yaw: 0, pitch: 0, hp: 10, dead: 0, held: 0, seq: 0 }));
    await sleep(30);
    const phit = waitFor(beto.ws, m => m.t === 'phit' && m.fromId === botId);
    FIX.app.bots.tick(0.05);
    const hp = await phit;
    ok(hp.dmg === 6, 'un golpe legítimo del runtime lleva el daño configurado');

    // El bot es inmune: el hit del jugador responde dmg 0 y no baja la vida.
    const immune = waitFor(beto.ws, m => m.t === 'hitok' && m.id === botId);
    beto.ws.send(JSON.stringify({ t: 'hit', id: botId, dmg: 6, dx: 1, dz: 0 }));
    const hi = await immune;
    ok(hi.dmg === 0 && hi.hp === 10, 'el runtime descarta el daño contra un bot takes_damage:false');

    // Un usuario de cookie no puede declararse bot (el hello lo ignora).
    const spoof = await join(await FIX.login('carla', 'correcta-123'), { bot: true });
    const carlaSeen = beto.w.players.find(p => p.id === spoof.id);
    ok(!carlaSeen || carlaSeen.bot !== true, 'un usuario de cookie no puede declararse bot');

    ana.ws.close(); beto.ws.close(); spoof.ws.close();
    await sleep(50);
  }

  // ===================================================================
  // 4.4 revocación administrativa cierra sockets (4001 + leave)
  // ===================================================================
  {
    const root = await join(await FIX.login('root', ADMIN_PASSWORD));
    const carlaId = await idOf('carla');
    const carlaCookie = await FIX.login('carla', 'correcta-123');

    // Cambio de rol: cierra y difunde leave.
    const carla = await join(carlaCookie);
    const leaveP = waitFor(root.ws, m => m.t === 'leave' && m.id === carla.id);
    const closeP = waitClose(carla.ws);
    const roleRes = await FIX.request(`/api/admin/users/${carlaId}`, {
      method: 'PATCH', cookie: adminCookie, body: { role: 'admin' },
    });
    ok(roleRes.status === 200, 'cambiar el rol de un usuario conectado → 200');
    const [closeCode, leave] = await Promise.all([closeP, leaveP]);
    ok(closeCode === 4001, 'el cambio de rol cierra el WebSocket con 4001');
    ok(leave.id === carla.id, 'el cierre difunde leave del jugador afectado');

    const demote = await FIX.request(`/api/admin/users/${carlaId}`, {
      method: 'PATCH', cookie: adminCookie, body: { role: 'user' },
    });
    ok(demote.status === 200, 'degradar al segundo admin se aplica');

    // Desactivar: cierra y luego no puede loguearse.
    const c2 = await join(await FIX.login('carla', 'correcta-123'));
    const offClose = waitClose(c2.ws);
    const off = await FIX.request(`/api/admin/users/${carlaId}`, {
      method: 'PATCH', cookie: adminCookie, body: { active: false },
    });
    ok(off.status === 200 && (await off.json()).user.active === false, 'desactivar la cuenta → 200');
    ok((await offClose) === 4001, 'desactivar cierra el WebSocket con 4001');
    const blocked = await FIX.request('/api/login', { method: 'POST', body: { username: 'carla', password: 'correcta-123' } });
    ok(blocked.status === 401, 'una cuenta inactiva no puede loguearse');

    // Reactivar no cierra (no hay sockets) y no devuelve sesiones.
    const on = await FIX.request(`/api/admin/users/${carlaId}`, {
      method: 'PATCH', cookie: adminCookie, body: { active: true },
    });
    ok(on.status === 200, 'reactivar la cuenta → 200');
    const relogin = await FIX.login('carla', 'correcta-123');
    ok(!!relogin, 'tras reactivar, la cuenta vuelve a loguearse');

    // Reset de contraseña: cierra.
    const c3 = await join(await FIX.login('carla', 'correcta-123'));
    const passClose = waitClose(c3.ws);
    const reset = await FIX.request(`/api/admin/users/${carlaId}/password`, {
      method: 'POST', cookie: adminCookie, body: { password: 'carla-nueva-1' },
    });
    ok(reset.status === 200, 'reset de contraseña de un usuario conectado → 200');
    ok((await passClose) === 4001, 'el reset de contraseña cierra el WebSocket con 4001');

    // Borrado: cierra.
    const c4 = await join(await FIX.login('carla', 'carla-nueva-1'));
    const delClose = waitClose(c4.ws);
    const del = await FIX.request(`/api/admin/users/${carlaId}`, { method: 'DELETE', cookie: adminCookie });
    ok(del.status === 204, 'borrar una cuenta conectada → 204');
    ok((await delClose) === 4001, 'el borrado cierra el WebSocket con 4001');

    // Cambiar solo permisos no cierra (se cubrió en 4.2; se repite con otro usuario).
    const betoId = await idOf('beto');
    const beto = await join(await FIX.login('beto', 'correcta-123'));
    const permClose = waitClose(beto.ws, 500);
    await FIX.request(`/api/admin/users/${betoId}`, {
      method: 'PATCH', cookie: adminCookie, body: { permissions: { instant_break: true } },
    });
    ok((await permClose) === null, 'cambiar solo permisos no cierra el socket');

    root.ws.close(); beto.ws.close();
    await sleep(50);
  }
} finally {
  for (const ws of sockets) { try { ws.close(); } catch (e) {} }
  await FIX.close();
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 WebSocket admin (permisos, perm en caliente, bot_ignore y revocación) OK');

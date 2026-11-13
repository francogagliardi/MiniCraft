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
const BOT_TOKEN = 'bot-secret-admin-ws';
const FIX = await startApp({
  users: [
    { username: 'admin', password: ADMIN_PASSWORD, role: 'admin', skin: 'human' },
    { username: 'root', password: ADMIN_PASSWORD, role: 'admin', skin: 'giant' },
    { username: 'ana', password: 'correcta-123', role: 'user', skin: 'small', permissions: { bot_ignore: true } },
    { username: 'beto', password: 'correcta-123', role: 'user', skin: 'human' },
    { username: 'carla', password: 'correcta-123', role: 'user', skin: 'fat' },
  ],
  botToken: BOT_TOKEN,
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
  // 4.3 bot marcado y descarte del hit contra bot_ignore
  // ===================================================================
  {
    const ana = await join(await FIX.login('ana', 'correcta-123'));
    const beto = await join(await FIX.login('beto', 'correcta-123'));

    const botConn = await connect(FIX.wsUrl(), { headers: { Authorization: `Bearer ${BOT_TOKEN}` } });
    ok(botConn.status === 101, 'el bot con BOT_TOKEN válido entra');
    botConn.ws.send(JSON.stringify({ t: 'hello', name: 'OPSX-bot', skin: 'robot', mode: 'player', bot: true }));
    const bw = await nextMessage(botConn.ws, 'welcome');
    ok(bw.admin === false && bw.user === undefined, 'el bot queda sin perfil ni admin');
    const botId = bw.id;

    // El bot se identifica en el roster por su id (los clientes de cookie lo ven).
    const noPhit = expectNo(ana.ws, m => m.t === 'phit' && m.fromId === botId, 600);
    const noHitok = expectNo(botConn.ws, m => m.t === 'hitok', 600);
    botConn.ws.send(JSON.stringify({ t: 'hit', id: ana.id, dmg: 6, dx: 1, dz: 0 }));
    const [noP, noH] = await Promise.all([noPhit, noHitok]);
    ok(noP, 'el hit del bot contra bot_ignore NO produce phit');
    ok(noH, 'el hit descartado tampoco responde hitok');

    const phitBeto = waitFor(beto.ws, m => m.t === 'phit' && m.fromId === botId);
    const hitokBeto = nextMessage(botConn.ws, 'hitok');
    botConn.ws.send(JSON.stringify({ t: 'hit', id: beto.id, dmg: 99, dx: 0, dz: 1 }));
    const [hp, hk] = await Promise.all([phitBeto, hitokBeto]);
    ok(hp.dmg <= 6 && hp.dmg > 0, 'el hit del bot contra otro jugador sí retransmite phit (daño acotado a 6)');
    ok(hk.id === beto.id, 'el golpe legítimo del bot recibe hitok');

    const phitAna = waitFor(ana.ws, m => m.t === 'phit' && m.fromId === beto.id);
    beto.ws.send(JSON.stringify({ t: 'hit', id: ana.id, dmg: 3, dx: 0, dz: 1 }));
    const pa = await phitAna;
    ok(pa.dmg === 3, 'un hit de usuario de cookie contra bot_ignore SÍ se retransmite');

    ana.ws.close(); beto.ws.close(); botConn.ws.close();
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

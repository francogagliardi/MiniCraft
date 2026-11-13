// Tests del gate WebSocket y la identidad autoritativa (createApp + MemoryStore).
// Uso: node test/ws-auth.mjs
import { createRequire } from 'module';
import { startApp, connect, nextMessage, waitFor, sleep, cookieOf } from './support/app-fixture.mjs';

const require = createRequire(import.meta.url);
const { hashToken } = require('../auth.js');

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

function helloFrame(ws, extra = {}) {
  ws.send(JSON.stringify({ t: 'hello', name: 'Intruso', skin: 'giant', mode: 'admin', key: 'x', bot: true, ...extra }));
}

const FIX = await startApp({
  users: [
    { username: 'ana', password: 'correcta-123', role: 'user', skin: 'human' },
    { username: 'root', password: 'admin-12345', role: 'admin', skin: 'giant' },
    { username: 'beto', password: 'correcta-123', role: 'user', skin: 'small' },
  ],
  // Variable legada: aunque esté seteada, ya no autentica ningún upgrade.
  env: { BOT_TOKEN: 'bot-secret-1234567890' },
});
try {
  // ---- rechazos ----
  {
    const noCookie = await connect(FIX.wsUrl());
    ok(noCookie.status === 401 && !noCookie.error, 'upgrade sin cookie → 401 HTTP');
    const badCookie = await connect(FIX.wsUrl(), { headers: { Cookie: 'mc_sid=invalido' } });
    ok(badCookie.status === 401, 'cookie inválida → 401');
    const badBearer = await connect(FIX.wsUrl(), { headers: { Authorization: 'Bearer otro-token' } });
    ok(badBearer.status === 401, 'Bearer incorrecto → 401 (no cae a cookie)');
    const legacyBearer = await connect(FIX.wsUrl(), { headers: { Authorization: 'Bearer bot-secret-1234567890' } });
    ok(legacyBearer.status === 401, 'Bearer con el BOT_TOKEN legado → 401 (credencial retirada)');
  }

  // ---- sesión válida e identidad impuesta ----
  const cAna = await FIX.login('ana', 'correcta-123');
  {
    const obs = await connect(FIX.wsUrl(), { headers: { Cookie: cAna } });
    helloFrame(obs.ws);
    const w = await nextMessage(obs.ws, 'welcome');
    ok(w.user && w.user.username === 'ana' && w.user.role === 'user' && w.user.skin === 'human',
      'welcome.user trae username/role/skin de la sesión');
    ok(w.admin === false, 'un usuario common no es admin');
    ok(typeof w.seed === 'number' && Array.isArray(w.edits), 'welcome conserva seed/edits (compatible)');
    // el hello con name/mode/key/bot fue ignorado
    const chatSeen = waitFor(obs.ws, m => m.t === 'chat' && m.fromId === w.id);
    obs.ws.send(JSON.stringify({ t: 'chat', text: 'hola' }));
    const ch = await chatSeen;
    ok(ch.from === 'ana' && !ch.admin, 'el chat usa el username e ignora name/mode del hello');

    // el welcome no creó admin ni bot
    const roster = w.players;
    ok(Array.isArray(roster), 'welcome trae la lista de jugadores');
    obs.ws.close();
  }

  // ---- spoofing: name/skin/mode/key/bot ----
  {
    const a = await connect(FIX.wsUrl(), { headers: { Cookie: cAna } });
    helloFrame(a.ws);
    const wa = await nextMessage(a.ws, 'welcome');
    ok(wa.user.skin === 'human', 'el skin del perfil manda (giant del hello ignorado)');
    const b = await connect(FIX.wsUrl(), { headers: { Cookie: await FIX.login('beto', 'correcta-123') } });
    helloFrame(b.ws);
    const wb = await nextMessage(b.ws, 'welcome');
    const seen = wb.players.find(p => p.id === wa.id);
    ok(seen && seen.name === 'ana' && seen.skin === 'human' && seen.mode === 'player',
      'el resto ve ana/human/player aunque el hello intentó admin/giant');
    ok(wb.sleepNeed === 2, 'bot:true de un usuario de cookie no lo excluye del quórum (need=2)');
    a.ws.close(); b.ws.close();
  }

  // ---- admin real ----
  {
    const c = await FIX.login('root', 'admin-12345');
    const ws = await connect(FIX.wsUrl(), { headers: { Cookie: c } });
    helloFrame(ws.ws);
    const w = await nextMessage(ws.ws, 'welcome');
    ok(w.admin === true && w.user.role === 'admin', 'rol admin de la base entra como admin sin clave');
    const chatP = waitFor(ws.ws, m => m.t === 'chat' && m.fromId === w.id);
    ws.ws.send(JSON.stringify({ t: 'chat', text: 'ordeno' }));
    const ch = await chatP;
    ok(ch.admin === true, 'el chat de un admin lleva admin:true');
    ws.ws.close();
  }

  // ---- un usuario de cookie no puede declararse bot ----
  {
    const botLike = await connect(FIX.wsUrl(), { headers: { Cookie: cAna } });
    helloFrame(botLike.ws);
    const w = await nextMessage(botLike.ws, 'welcome');
    ok(w.admin === false && w.user.role === 'user',
      'el hello con bot:true no crea un bot ni cambia el rol');
    ok(w.sleepNeed === 1, 'el intento de bot:true no lo excluye del quórum de sueño (need=1)');
    botLike.ws.close();
  }

  // ---- DB caída en el upgrade ----
  {
    FIX.store.failNext = { op: 'getSessionByTokenHash', error: new Error('db caída') };
    const res = await connect(FIX.wsUrl(), { headers: { Cookie: cAna } });
    ok(res.status === 503, 'DB caída durante el upgrade → 503');
  }

  // ---- expiración en caliente ----
  {
    const c = await FIX.login('ana', 'correcta-123');
    const token = c.split('=')[1];
    const found = await FIX.store.getSessionByTokenHash(hashToken(token));
    FIX.store.sessions.find(s => s.id === found.session.id).expiresAt = new Date(Date.now() + 300);
    const ws = await connect(FIX.wsUrl(), { headers: { Cookie: c } });
    helloFrame(ws.ws);
    await nextMessage(ws.ws, 'welcome');
    const code = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 4000);
      ws.ws.on('close', (cd) => { clearTimeout(timer); resolve(cd); });
    });
    ok(code === 4001, `sesión expirada cierra el socket en ≤60 s (código ${code})`);
  }

  // ---- logout cierra el socket y difunde leave ----
  {
    const cA = await FIX.login('ana', 'correcta-123');
    const cB = await FIX.login('beto', 'correcta-123');
    const a = await connect(FIX.wsUrl(), { headers: { Cookie: cA } });
    helloFrame(a.ws);
    const wa = await nextMessage(a.ws, 'welcome');
    const b = await connect(FIX.wsUrl(), { headers: { Cookie: cB } });
    helloFrame(b.ws);
    await nextMessage(b.ws, 'welcome');
    const leaveP = waitFor(b.ws, m => m.t === 'leave' && m.id === wa.id);
    const closeP = new Promise((resolve) => a.ws.on('close', (cd) => resolve(cd)));
    await FIX.request('/api/logout', { method: 'POST', cookie: cA, body: {} });
    const [leave, closeCode] = await Promise.all([leaveP, closeP]);
    ok(leave.id === wa.id, 'logout difunde leave del jugador');
    ok(closeCode === 4001, 'logout cierra el socket con 4001');
    b.ws.close();
  }
} finally { await FIX.close(); }

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 gate WebSocket e identidad autoritativa OK');

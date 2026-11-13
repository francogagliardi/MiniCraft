// Tests de la API administrativa de bots (HTTP + MemoryStore, sin DB real).
// Uso: node test/bots-api.mjs
import { startApp } from './support/app-fixture.mjs';

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};
const json = (res) => res.json().catch(() => null);

const ADMIN_PASSWORD = 'admin-12345';
const FIX = await startApp({
  users: [
    { username: 'admin', password: ADMIN_PASSWORD, role: 'admin' },
    { username: 'ana', password: 'correcta-123', role: 'user' },
    { username: 'ocupado', password: 'correcta-123', role: 'user' },
  ],
});

let adminCookie = await FIX.login('admin', ADMIN_PASSWORD);
const anaCookie = await FIX.login('ana', 'correcta-123');

const list = async () => {
  const res = await FIX.request('/api/admin/bots', { cookie: adminCookie });
  return { res, body: await json(res) };
};
const create = (body) => FIX.request('/api/admin/bots', { method: 'POST', cookie: adminCookie, body });
const patch = (id, body) => FIX.request(`/api/admin/bots/${id}`, { method: 'PATCH', cookie: adminCookie, body });
const del = (id) => FIX.request(`/api/admin/bots/${id}`, { method: 'DELETE', cookie: adminCookie });
const start = (id) => FIX.request(`/api/admin/bots/${id}/start`, { method: 'POST', cookie: adminCookie });
const stop = (id) => FIX.request(`/api/admin/bots/${id}/stop`, { method: 'POST', cookie: adminCookie });
const byName = async (name) => (await list()).body.bots.find(b => b.name === name) || null;

try {
  // ===================================================================
  // 4.1 gate, listado, catálogo y runtime
  // ===================================================================
  {
    const anon = await FIX.request('/api/admin/bots');
    ok(anon.status === 401, 'GET sin cookie → 401');
    ok(!('bots' in (await json(anon))), 'el 401 no expone datos de bots');

    const user = await FIX.request('/api/admin/bots', { cookie: anaCookie });
    ok(user.status === 403 && (await json(user)).error === 'admin_required', 'GET con rol user → 403 admin_required');

    const { res, body } = await list();
    ok(res.status === 200 && Array.isArray(body.bots), 'GET con admin → 200 con bots[]');
    ok(body.bots.length === 0, 'sin auto-seed: la tabla vacía no crea ningún bot');
    ok((res.headers.get('cache-control') || '').includes('no-store'), 'el listado responde Cache-Control: no-store');
    ok(body.limits && body.limits.maxActive === 5, 'el listado trae limits.maxActive=5');
    const ids = (body.catalog.behaviors || []).map(b => b.id);
    ok(ids.includes('cazador') && ids.includes('merodeador'), 'el catálogo trae cazador y merodeador');
    ok(ids.includes('guardian') && ids.includes('neutral'), 'el catálogo trae guardián y neutral');
    ok((body.catalog.behaviors || []).every(b => typeof b.label === 'string' && typeof b.hostile === 'boolean'),
      'el catálogo trae etiqueta y hostilidad');
    ok((body.catalog.behaviors || []).every(b => typeof b.attacksPlayers === 'boolean' && typeof b.attacksEnemies === 'boolean'),
      'el catálogo declara contra qué ataca cada comportamiento');
    ok((body.catalog.behaviors || []).find(b => b.id === 'guardian').attacksEnemies === true,
      'el catálogo marca al guardián como atacante de criaturas');
    ok(Array.isArray(body.catalog.skins) && body.catalog.skins.includes('robot'), 'el catálogo de skins incluye robot');
  }

  // ===================================================================
  // 4.2 alta y validaciones
  // ===================================================================
  {
    const res = await create({ name: 'OPSX-bot', behavior: 'cazador' });
    const body = await json(res);
    ok(res.status === 201 && body.bot && body.bot.active === false, 'alta válida → 201 con active:false');
    ok(body.bot.name === 'OPSX-bot' && body.bot.behavior === 'cazador' && body.bot.skin === 'robot',
      'el alta aplica nombre, comportamiento y skin');
    ok(body.bot.hp === 10 && body.bot.damage === 6 && body.bot.reach === 4.6 && body.bot.speed === 28.8,
      'el alta aplica los defaults del cazador');
    ok(body.bot.flying === true && body.bot.takesDamage === false, 'el alta aplica vuelo y takes_damage por default');
    ok(body.bot.runtime === null || body.bot.runtime.online === false, 'un bot recién creado no está en línea');
    ok(!('createdBy' in body.bot), 'la vista pública no expone createdBy');
    ok(FIX.app.bots.getByDbId(body.bot.id) === null, 'el alta nace detenida: no aparece en el juego');
    const stored = await FIX.store.getBotById(body.bot.id);
    ok(stored && stored.runtime === undefined, 'el bloque runtime no se persiste en la base');
  }
  {
    const dup = await create({ name: 'opsx-BOT', behavior: 'cazador' });
    const db = await json(dup);
    ok(dup.status === 409 && db.error === 'bot_name_taken', 'nombre duplicado con otra capitalización → 409');
    ok(db.details && db.details.field === 'name', 'el 409 señala el campo name');

    const userClash = await create({ name: 'ocupado', behavior: 'cazador' });
    ok(userClash.status === 409 && (await json(userClash)).error === 'bot_name_taken',
      'nombre igual a un username existente → 409');

    const cases = [
      [{ name: 'ab', behavior: 'cazador' }, 422, 'invalid_bot_name', 'name'],
      [{ name: 'a'.repeat(17), behavior: 'cazador' }, 422, 'invalid_bot_name', 'name'],
      [{ name: 'mal nombre', behavior: 'cazador' }, 422, 'invalid_bot_name', 'name'],
      [{ name: 'b-fantasma', behavior: 'fantasma' }, 422, 'invalid_behavior', 'behavior'],
      [{ name: 'b-skin', behavior: 'cazador', skin: 'dragon' }, 422, 'invalid_skin', 'skin'],
      [{ name: 'b-hp0', behavior: 'cazador', hp: 0 }, 422, 'invalid_hp', 'hp'],
      [{ name: 'b-hp101', behavior: 'cazador', hp: 101 }, 422, 'invalid_hp', 'hp'],
      [{ name: 'b-dmg', behavior: 'cazador', damage: 21 }, 422, 'invalid_damage', 'damage'],
      [{ name: 'b-reach', behavior: 'cazador', reach: 4.65 }, 422, 'invalid_reach', 'reach'],
      [{ name: 'b-speed', behavior: 'cazador', speed: 31 }, 422, 'invalid_speed', 'speed'],
      [{ name: 'b-flag', behavior: 'cazador', flying: 'si' }, 422, 'invalid_flag', 'flying'],
      [{ name: 'b-active', behavior: 'cazador', active: true }, 422, 'invalid_field', 'active'],
      [{ name: 'b-unknown', behavior: 'cazador', foo: 1 }, 422, 'invalid_field', 'foo'],
    ];
    for (const [body, status, code, field] of cases) {
      const r = await create(body);
      const b = await json(r);
      ok(r.status === status && b.error === code, `alta ${JSON.stringify(body).slice(0, 48)} → ${status} ${code}`);
      ok(b.details && b.details.field === field, `el ${code} señala el campo ${field}`);
    }
    const both = await json(await create({ name: 'b-varios', behavior: 'cazador', hp: 0, skin: 'dragon' }));
    ok(Array.isArray(both.details.errors) && both.details.errors.length >= 2,
      'un 422 con varios campos inválidos los detalla a todos');
    for (const name of ['b-fantasma', 'b-skin', 'b-hp0', 'b-active', 'b-varios']) {
      ok((await byName(name)) === null, `el rechazo (${name}) no crea filas`);
    }
    for (const [name, behavior] of [['b-guard', 'guardian'], ['b-neutro', 'neutral']]) {
      const r = await create({ name, behavior });
      const b = await json(r);
      ok(r.status === 201 && b.bot && b.bot.behavior === behavior && b.bot.active === false,
        `alta ${behavior} → 201 con la configuración por defecto`);
      ok(b.bot && typeof b.bot.hp === 'number' && typeof b.bot.damage === 'number' &&
        typeof b.bot.reach === 'number' && typeof b.bot.speed === 'number' &&
        typeof b.bot.flying === 'boolean' && typeof b.bot.takesDamage === 'boolean',
        `${behavior} acepta la misma ficha (vida/daño/alcance/velocidad/vuelo/recibe daño)`);
    }
  }

  // ===================================================================
  // 4.3 edición y borrado
  // ===================================================================
  {
    const created = (await json(await create({ name: 'editable', behavior: 'merodeador' }))).bot;
    const res = await patch(created.id, { damage: 4, speed: 12.5 });
    const body = await json(res);
    ok(res.status === 200 && body.bot.damage === 4 && body.bot.speed === 12.5, 'PATCH aplica solo los campos enviados');
    ok(body.bot.name === 'editable' && body.bot.behavior === 'merodeador', 'PATCH conserva el resto de la configuración');

    const renamed = await json(await patch(created.id, { name: 'renombrado' }));
    ok(renamed.bot.name === 'renombrado', 'PATCH permite cambiar el nombre con unicidad');

    const dup = await patch(created.id, { name: 'OPSX-bot' });
    ok(dup.status === 409 && (await json(dup)).error === 'bot_name_taken', 'PATCH a un nombre ocupado → 409');

    const active = await patch(created.id, { active: true });
    const ab = await json(active);
    ok(active.status === 422 && ab.error === 'invalid_field', 'PATCH con active → 422 invalid_field');
    ok((await byName('renombrado')).active === false, 'el PATCH con active no cambió el estado');

    const empty = await patch(created.id, {});
    ok(empty.status === 400, 'PATCH con {} → 400');
    const badId = await patch('abc', { hp: 5 });
    ok(badId.status === 400, 'PATCH con :id no numérico → 400');
    const missing = await patch(999999, { hp: 5 });
    ok(missing.status === 404 && (await json(missing)).error === 'bot_not_found', 'PATCH de inexistente → 404 bot_not_found');

    const delOff = await del(created.id);
    ok(delOff.status === 204 && (await delOff.text()) === '', 'DELETE de un bot inactivo → 204 sin cuerpo');
    ok((await byName('renombrado')) === null, 'el bot borrado desaparece del listado');
    const again = await del(created.id);
    ok(again.status === 404 && (await json(again)).error === 'bot_not_found', 'borrar dos veces → 404');
  }
  {
    // Edición en caliente de un bot activo: se reemplaza el avatar y la vida vuelve
    // a su hp configurado.
    const created = (await json(await create({
      name: 'caliente', behavior: 'merodeador', hp: 20, damage: 3, flying: false,
    }))).bot;
    await start(created.id);
    const before = FIX.app.bots.getByDbId(created.id);
    before.hp = 5; // vida runtime distinta de la configurada
    const res = await patch(created.id, { behavior: 'cazador', skin: 'giant', hp: 30 });
    const body = await json(res);
    ok(res.status === 200 && body.bot.behavior === 'cazador' && body.bot.skin === 'giant' && body.bot.hp === 30,
      'PATCH de un bot activo aplica la configuración nueva');
    const live = FIX.app.bots.getByDbId(created.id);
    ok(live && live.behavior === 'cazador' && live.skin === 'giant', 'el cambio se aplica en caliente al runtime');
    ok(live && live.hp === 30 && live.hpMax === 30, 'la edición activa reinicia la vida al hp configurado');
    ok(FIX.app.bots.list().filter(b => b.dbId === created.id).length === 1, 'la edición no deja el bot duplicado');
    await stop(created.id);
  }
  {
    const created = (await json(await create({ name: 'activo-borrar', behavior: 'merodeador' }))).bot;
    await start(created.id);
    const res = await del(created.id);
    ok(res.status === 409 && (await json(res)).error === 'bot_active', 'DELETE de un bot activo → 409 bot_active');
    const still = await byName('activo-borrar');
    ok(still && still.active === true, 'el bot activo sigue funcionando tras el 409');
    await stop(created.id);
  }

  // ===================================================================
  // 4.4 start / stop y cupo
  // ===================================================================
  {
    const a = (await json(await create({ name: 'lanza-1', behavior: 'merodeador' }))).bot;
    const r1 = await start(a.id);
    const b1 = await json(r1);
    ok(r1.status === 200 && b1.bot.active === true, 'start de inactivo → 200 y active:true');
    ok(b1.bot.runtime && b1.bot.runtime.online === true, 'el bot lanzado reporta runtime.online');
    const r2 = await start(a.id);
    const b2 = await json(r2);
    ok(r2.status === 200 && b2.bot.active === true, 'start repetido → 200 sin duplicar');
    ok(FIX.app.bots.list().filter(b => b.dbId === a.id).length === 1, 'start repetido no duplica en el runtime');
    const listBody = (await list()).body;
    const runtimeIds = listBody.bots.filter(b => b.runtime && b.runtime.online).map(b => b.id);
    ok(new Set(runtimeIds).size === runtimeIds.length, 'el listado no repite bots en línea');

    const r3 = await stop(a.id);
    ok(r3.status === 200 && (await json(r3)).bot.active === false, 'stop de activo → 200 y active:false');
    const r4 = await stop(a.id);
    ok(r4.status === 200 && (await json(r4)).bot.active === false, 'stop de inactivo → 200 (inocuo)');
  }
  {
    // Cupo: el bot activo del caso anterior quedó detenido; se llenan 5.
    const rows = [];
    for (let i = 0; i < 6; i++) {
      rows.push((await json(await create({ name: 'cupo-' + i, behavior: 'merodeador' }))).bot);
    }
    for (let i = 0; i < 5; i++) {
      const r = await start(rows[i].id);
      ok(r.status === 200, `start del bot ${i + 1}/5 → 200`);
    }
    const sixth = await start(rows[5].id);
    const sb = await json(sixth);
    ok(sixth.status === 409 && sb.error === 'bot_limit_reached', 'sexto start → 409 bot_limit_reached');
    ok((await byName('cupo-5')).active === false, 'el sexto bot sigue inactivo tras el rechazo');
    ok(FIX.app.bots.list().length === 5, 'el runtime no supera los cinco activos');

    // La carrera se prueba con MemoryStore directo (startBot serializado).
    const fresh = await startApp({
      users: [{ username: 'admin', password: ADMIN_PASSWORD, role: 'admin' }],
      bots: [
        { name: 'r1', behavior: 'merodeador', damage: 0, active: true },
        { name: 'r2', behavior: 'merodeador', damage: 0, active: true },
        { name: 'r3', behavior: 'merodeador', damage: 0, active: true },
        { name: 'r4', behavior: 'merodeador', damage: 0, active: true },
        { name: 'r5', behavior: 'merodeador', damage: 0, active: false },
        { name: 'r6', behavior: 'merodeador', damage: 0, active: false },
      ],
    });
    try {
      const c = await fresh.login('admin', ADMIN_PASSWORD);
      const rowsF = await fresh.store.listBots();
      const [p1, p2] = await Promise.all([
        fresh.request(`/api/admin/bots/${rowsF.find(b => b.name === 'r5').id}/start`, { method: 'POST', cookie: c }),
        fresh.request(`/api/admin/bots/${rowsF.find(b => b.name === 'r6').id}/start`, { method: 'POST', cookie: c }),
      ]);
      const statuses = [p1.status, p2.status].sort();
      ok(statuses[0] === 200 && statuses[1] === 409, 'dos start simultáneos con cupo para uno: uno pasa y el otro 409');
      ok((await fresh.store.listBots({ active: true })).length === 5, 'la carrera de cupo deja exactamente cinco activos');
    } finally { await fresh.close(); }

    await stop(rows[0].id);
    const afterFree = await start(rows[5].id);
    ok(afterFree.status === 200, 'detener un bot libera el cupo para lanzar otro');
  }

  // ===================================================================
  // 4.5 protección, rate limit, caída y auditoría
  // ===================================================================
  {
    const foreign = await FIX.request('/api/admin/bots', {
      method: 'POST', cookie: adminCookie,
      body: { name: 'csrf-bot', behavior: 'cazador' },
      headers: { Origin: 'https://otro-sitio.example' },
    });
    ok(foreign.status === 403, 'Origin ajeno → 403');
    ok((await byName('csrf-bot')) === null, 'el pedido con Origin ajeno no crea el bot');

    const plain = await FIX.request('/api/admin/bots', {
      method: 'POST', cookie: adminCookie, body: 'name=x',
      headers: { 'Content-Type': 'text/plain' },
    });
    ok(plain.status === 415, 'Content-Type text/plain → 415');

    const big = await FIX.request('/api/admin/bots', {
      method: 'POST', cookie: adminCookie,
      body: { name: 'grande', behavior: 'cazador', relleno: 'x'.repeat(9000) },
    });
    ok(big.status === 413, 'body > 8 KB → 413');

    FIX.store.failNext = { op: 'getSessionByTokenHash', error: new Error('db caída') };
    const down = await FIX.request('/api/admin/bots', { cookie: adminCookie });
    ok(down.status === 503 && (await json(down)).error === 'unavailable', 'base caída → 503 unavailable');
  }
  {
    const audit = await FIX.store.listAudit(200);
    const actions = new Set(audit.map(e => e.action));
    for (const action of ['bot.create', 'bot.update', 'bot.start', 'bot.stop', 'bot.delete']) {
      ok(actions.has(action), `la auditoría registra ${action}`);
    }
    const entry = audit.find(e => e.action === 'bot.create' && e.details && e.details.botName === 'OPSX-bot');
    ok(entry && entry.details && entry.details.botName === 'OPSX-bot' && entry.details.behavior === 'cazador',
      'la entrada de alta guarda id/nombre/comportamiento en details');
    ok(entry && entry.target.id === null, 'la auditoría de bots no usa target_user_id');
    const serialized = JSON.stringify(audit);
    ok(!serialized.includes(ADMIN_PASSWORD) && !serialized.includes('mc_sid='), 'la auditoría no contiene secretos');
  }
} finally {
  await FIX.close();
}

// ===================================================================
// 4.5bis rate limit del bucket administrativo
// ===================================================================
{
  const L = await startApp({
    users: [{ username: 'admin', password: ADMIN_PASSWORD, role: 'admin' }],
    env: { ADMIN_RATE_CAPACITY: '2', ADMIN_RATE_REFILL_PER_SEC: '0' },
  });
  try {
    const c = await L.login('admin', ADMIN_PASSWORD);
    const first = await L.request('/api/admin/bots', { cookie: c });
    const second = await L.request('/api/admin/bots', { cookie: c });
    const third = await L.request('/api/admin/bots', { cookie: c });
    ok(first.status === 200 && second.status === 200, 'rate limit de bots: las dos primeras pasan');
    ok(third.status === 429 && (await third.json()).error === 'rate_limited', 'rate limit de bots: la tercera → 429');
    const blocked = await L.request('/api/admin/bots', {
      method: 'POST', cookie: c, body: { name: 'bloqueado', behavior: 'cazador' },
    });
    ok(blocked.status === 429, 'el POST de bots también recibe 429');
    ok((await L.store.getBotByName('bloqueado')) === null, 'el 429 no tiene efectos en la base');
  } finally { await L.close(); }
}

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 API administrativa de bots OK');

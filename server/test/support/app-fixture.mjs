// Fixture de tests: levanta `createApp` EN PROCESO con MemoryStore, en un puerto
// efímero. Ningún test toca Docker ni un Postgres real salvo auth-db.mjs.
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);

export async function startApp(opts = {}) {
  const { createApp } = require('../../app.js');
  const { hashPassword } = require('../../auth.js');
  const { MemoryStore } = await import('./memory-store.mjs');

  const store = opts.store || new MemoryStore();
  for (const u of opts.users || []) {
    await store.createUser({
      username: u.username,
      passwordHash: await hashPassword(u.password),
      role: u.role || 'user',
      skin: u.skin || 'human',
      active: u.active !== false,
    });
  }

  const env = {
    HB_INTERVAL_MS: '200',
    IDLE_TIMEOUT_MS: '60000',
    TOD_INTERVAL_MS: '60000',
    ZOMBIE_TICK_MS: '60000',
    ZOMBIE_SNAP_MS: '60000',
    // Auth: los tests funcionales no deben chocar con el bucket real; los tests
    // de rate limit lo pisan a propósito con valores chicos.
    LOGIN_RATE_CAPACITY: '1000',
    LOGIN_RATE_REFILL_PER_SEC: '1000',
    REGISTER_RATE_CAPACITY: '1000',
    REGISTER_RATE_REFILL_PER_SEC: '1000',
    ...(opts.env || {}),
  };
  if (opts.botToken !== undefined) env.BOT_TOKEN = opts.botToken;
  else if (env.BOT_TOKEN === undefined) env.BOT_TOKEN = 'test-bot-token';

  const app = createApp({
    env, store, staticDir: opts.staticDir,
    log: opts.log, warn: opts.warn,
    // Nunca el world.json real del repo: cada app de test usa un archivo temporal.
    worldFile: opts.worldFile || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mc-world-')), 'world.json'),
  });
  const addr = await app.listen(0, '127.0.0.1');
  const port = addr.port;
  const base = `http://127.0.0.1:${port}`;

  async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
    const h = { ...headers };
    if (cookie) h.Cookie = cookie;
    if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
    return fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  }

  async function login(username, password) {
    const res = await request('/api/login', { method: 'POST', body: { username, password } });
    if (res.status !== 200) throw new Error(`login ${username}: ${res.status}`);
    return cookieOf(res);
  }

  function wsUrl() { return `ws://127.0.0.1:${port}`; }

  async function close() { await app.close(); }

  return { app, store, port, base, request, login, wsUrl, close, env };
}

export function cookieOf(res) {
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}

// Conecta un WebSocket y espera 'open' o el rechazo HTTP.
export function connect(url, opts = {}) {
  const ws = new WebSocket(url, opts);
  return new Promise((resolve) => {
    const out = { ws, status: null, error: null };
    let settled = false;
    const done = () => { if (settled) return false; settled = true; resolve(out); return true; };
    ws.on('open', () => { out.status = 101; done(); });
    ws.on('unexpected-response', (req, res) => {
      out.status = res.statusCode;
      res.resume();
      try { ws.terminate(); } catch (e) {}
      done();
    });
    ws.on('error', (e) => { if (settled) return; out.error = e; done(); });
  });
}

export function nextMessage(ws, type, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', onMsg); reject(new Error('no llegó ' + type)); }, timeout);
    function onMsg(raw) {
      let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (m.t === type) { clearTimeout(timer); ws.off('message', onMsg); resolve(m); }
    }
    ws.on('message', onMsg);
  });
}

export function waitFor(ws, pred, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', onMsg); reject(new Error('no llegó el frame')); }, timeout);
    function onMsg(raw) {
      let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (pred(m)) { clearTimeout(timer); ws.off('message', onMsg); resolve(m); }
    }
    ws.on('message', onMsg);
  });
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

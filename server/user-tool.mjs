#!/usr/bin/env node
// Herramienta de aprovisionamiento (change auth-usuarios-lobby, sin CRUD todavía).
//
//   node server/user-tool.mjs create <username> [--role user|admin]
//   node server/user-tool.mjs passwd <username>
//   node server/user-tool.mjs list
//   node server/user-tool.mjs disable <username>
//   node server/user-tool.mjs enable <username>
//
// La contraseña se lee por stdin (pipe o prompt), NUNCA por argv: no queda en el
// historial ni en `ps`. La salida no imprime contraseñas ni hashes.
// Requiere DATABASE_URL (o --url <url>).
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createDb } = require('./db.js');
const { createPgStore } = require('./store-pg.js');
const { runMigrations } = require('./migrate.js');
const A = require('./auth.js');

const USAGE = `Uso:
  node server/user-tool.mjs create <username> [--role user|admin]
  node server/user-tool.mjs passwd <username>
  node server/user-tool.mjs list
  node server/user-tool.mjs disable <username>
  node server/user-tool.mjs enable <username>
La contraseña se lee por stdin (nunca por argv).
`;

function readStdin() {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      process.stderr.write('Contraseña: ');
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data.replace(/\r?\n$/, '')));
    process.stdin.on('error', reject);
  });
}

function parse(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  const username = args[1];
  let role = 'user';
  let url = process.env.DATABASE_URL;
  // Las flags pueden ir en cualquier posición después del comando (p. ej.
  // `list --url <url>` debe funcionar igual que `--url <url> list`).
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--role' && args[i + 1]) { role = args[++i]; }
    else if (args[i] === '--url' && args[i + 1]) { url = args[++i]; }
  }
  return { cmd, username, role, url };
}

function validRole(role) {
  return role === 'user' || role === 'admin';
}

async function main() {
  const { cmd, username, role, url } = parse(process.argv);
  if (!cmd || cmd === '-h' || cmd === '--help') { process.stdout.write(USAGE); process.exit(0); }
  if (!url) {
    console.error('❌ falta DATABASE_URL (o --url).');
    process.exit(1);
  }
  const db = createDb({ connectionString: url, max: 2 });
  const store = createPgStore({ db });
  try {
    await runMigrations(db, { log: () => {} });

    if (cmd === 'list') {
      const users = await store.listUsers();
      for (const u of users) {
        console.log(`${u.username}\t${u.role}\t${u.skin}\t${u.active ? 'activo' : 'inactivo'}`);
      }
      return;
    }

    if (!username) { console.error(USAGE); process.exitCode = 1; return; }
    if (!A.isValidUsername(username)) {
      console.error('❌ username inválido (3–16, [A-Za-z0-9_-]).');
      process.exitCode = 1;
      return;
    }

    if (cmd === 'create') {
      if (!validRole(role)) { console.error('❌ --role debe ser user o admin.'); process.exitCode = 1; return; }
      if (await store.getUserByUsername(username)) {
        console.error(`❌ "${username}" ya existe.`);
        process.exitCode = 1;
        return;
      }
      const password = await readStdin();
      if (!A.isValidPassword(password)) {
        console.error(`❌ la contraseña debe tener entre ${A.PASSWORD_MIN} y ${A.PASSWORD_MAX} caracteres.`);
        process.exitCode = 1;
        return;
      }
      const passwordHash = await A.hashPassword(password);
      const user = await store.createUser({ username, passwordHash, role, skin: 'human', active: true });
      console.log(`✅ usuario "${user.username}" creado (rol ${user.role}).`);
      return;
    }

    const user = await store.getUserByUsername(username);
    if (!user) { console.error(`❌ no existe "${username}".`); process.exitCode = 1; return; }

    if (cmd === 'passwd') {
      const password = await readStdin();
      if (!A.isValidPassword(password)) {
        console.error(`❌ la contraseña debe tener entre ${A.PASSWORD_MIN} y ${A.PASSWORD_MAX} caracteres.`);
        process.exitCode = 1;
        return;
      }
      await store.setUserPassword(user.id, await A.hashPassword(password));
      const n = await store.revokeUserSessions(user.id);
      console.log(`✅ contraseña de "${user.username}" actualizada; ${n} sesión(es) revocada(s).`);
      return;
    }
    if (cmd === 'disable') {
      await store.setUserActive(user.id, false);
      const n = await store.revokeUserSessions(user.id);
      console.log(`✅ "${user.username}" desactivado; ${n} sesión(es) revocada(s).`);
      return;
    }
    if (cmd === 'enable') {
      await store.setUserActive(user.id, true);
      console.log(`✅ "${user.username}" activado.`);
      return;
    }
    console.error(USAGE);
    process.exitCode = 1;
  } finally {
    try { await store.close(); } catch (e) {}
    try { await db.close(); } catch (e) {}
  }
}

main().catch((e) => {
  console.error('❌ ' + (e && e.message));
  process.exit(1);
});

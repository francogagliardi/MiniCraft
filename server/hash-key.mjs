#!/usr/bin/env node
// server/hash-key.mjs — herramienta LOCAL para generar el hash de la clave admin.
//
//   node server/hash-key.mjs "mi-clave-nueva"   # clave por argv
//   node server/hash-key.mjs                    # la pide por stdin (sin eco si hay TTY)
//   ADMIN_KEY_FOR_HASH=... node server/hash-key.mjs
//
// Imprime SOLO la línea `ADMIN_KEY_HASH=pbkdf2_sha256$...` lista para pegar en la
// config de entorno (Easypanel). NUNCA imprime la clave en claro, y NO corre en el
// runtime del server: el `Dockerfile` copia `server/*.js`, no los `.mjs`.
import { createRequire } from 'module';
import readline from 'readline';

const require = createRequire(import.meta.url);
const { makeHash } = require('./admin-auth.js');

// Lee una línea de stdin. Si hay TTY, desactiva el eco (la clave no se ve).
function readStdinput(prompt) {
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin });
      rl.once('line', (line) => { rl.close(); resolve(line.trim()); });
      rl.once('close', () => resolve(''));
    });
  }
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
        process.stdout.write('\n'); resolve(buf);
      } else if (ch === '\u0003') { // Ctrl-C
        stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        buf = buf.slice(0, -1);
      } else {
        buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  let clave = process.argv[2] || process.env.ADMIN_KEY_FOR_HASH || '';
  if (!clave) clave = await readStdinput('Clave admin (no se muestra): ');
  if (!clave) { console.error('✖ No se recibió ninguna clave.'); process.exit(1); }
  const hash = makeHash(clave);
  // stdout: SOLO el string de configuración (nunca la clave).
  console.log(`ADMIN_KEY_HASH=${hash}`);
  // stderr: ayuda para el humano.
  console.error('');
  console.error(`✔ Hash generado (PBKDF2-SHA256, ${hash.split('$')[1]} iteraciones).`);
  console.error('  Pegá esa línea en Environment y BORRÁ ADMIN_KEY en claro.');
}

main().catch((e) => { console.error('✖ ' + e.message); process.exit(1); });

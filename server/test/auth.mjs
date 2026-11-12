// Tests unitarios de auth: hash scrypt, tokens, cookies y validaciones.
// Uso: node test/auth.mjs   (sin DB ni red)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const A = require('../auth.js');

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✅ ' : '❌ ') + msg);
  if (!cond) fails++;
};

// ---- hash de contraseñas ----
const h1 = await A.hashPassword('correcta-123');
const h2 = await A.hashPassword('correcta-123');
ok(/^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/.test(h1), 'hashPassword emite scrypt$N$r$p$salt$hash');
ok(h1 !== h2, 'dos hashes de la misma contraseña difieren por el salt');
ok(await A.verifyPassword('correcta-123', h1) === true, 'la contraseña correcta verifica');
ok(await A.verifyPassword('correcta-124', h1) === false, 'la contraseña incorrecta no verifica');
ok(await A.verifyPassword('correcta-123', 'scrypt$16384$8$1$abc') === false, 'un hash corrupto deniega sin lanzar');
ok(await A.verifyPassword('x', 'otro-formato') === false, 'un formato desconocido deniega sin lanzar');
ok(await A.verifyPassword('x', null) === false, 'un hash nulo deniega sin lanzar');
ok(await A.verifyPassword('x', 'scrypt$999999999$8$1$AA$AA') === false, 'parámetros absurdos se rechazan sin derivar caro');

// ---- validación de username / password ----
const goodUsers = ['ana', 'ana_01', 'A-B_c', 'x'.repeat(16)];
const badUsers = ['ab', '', 'x'.repeat(17), 'con espacio', 'ñandú', 'a.b', null, undefined, 123];
ok(goodUsers.every(A.isValidUsername), 'usernames válidos (3–16, [A-Za-z0-9_-])');
ok(badUsers.every(u => !A.isValidUsername(u)), 'usernames inválidos rechazados (largo/caracteres)');
ok(A.isValidPassword('12345678') && A.isValidPassword('x'.repeat(128)), 'password acepta 8 y 128');
ok(!A.isValidPassword('1234567') && !A.isValidPassword('x'.repeat(129)), 'password rechaza 7 y 129');
ok(!A.isValidPassword(null) && !A.isValidPassword(123), 'password rechaza tipos no string');

// ---- reservados ----
const reserved = ['admin', 'system', 'server', 'bot', 'null', 'undefined', 'Administrador'];
ok(reserved.every(u => A.isReservedUsername(u, { adminUsername: 'Administrador' })), 'reservados: lista mínima + ADMIN_USERNAME (case-insensitive)');
ok(A.isReservedUsername('Admin'), 'reservado case-insensitive');
ok(!A.isReservedUsername('ana', { adminUsername: 'admin' }), 'un nombre normal no es reservado');

// ---- tokens de sesión ----
const t = A.createSessionToken();
ok(typeof t.token === 'string' && t.token.length >= 40, 'token de sesión de al menos 32 bytes (base64url)');
ok(/^[a-f0-9]{64}$/.test(t.tokenHash), 'el hash guardado es SHA-256 hex (64)');
ok(A.hashToken(t.token) === t.tokenHash, 'hashToken es determinista');
ok(A.tokensEqual(A.hashToken(t.token), t.tokenHash) === true, 'tokensEqual acepta el mismo hash');
ok(A.tokensEqual(A.hashToken(t.token), A.hashToken('otro')) === false, 'tokensEqual rechaza hashes distintos');

// ---- cookies ----
const cookie = A.serializeSessionCookie('TOKEN', { secure: false });
ok(cookie.includes('mc_sid=TOKEN'), 'la cookie se llama mc_sid');
ok(/Path=\//.test(cookie) && /HttpOnly/.test(cookie) && /SameSite=Lax/.test(cookie), 'cookie con Path=/, HttpOnly y SameSite=Lax');
ok(/Max-Age=604800/.test(cookie), 'cookie con Max-Age de 7 días');
ok(!/Secure/.test(cookie), 'sin COOKIE_SECURE no agrega Secure (dev HTTP)');
ok(/Secure/.test(A.serializeSessionCookie('TOKEN', { secure: true })), 'en producción agrega Secure');
const clear = A.clearSessionCookie({ secure: false });
ok(/mc_sid=;/.test(clear) && /Max-Age=0/.test(clear), 'clearSessionCookie borra con Max-Age=0');
const parsed = A.parseCookies('a=1; mc_sid=TOKEN; b=2');
ok(parsed.mc_sid === 'TOKEN' && parsed.a === '1', 'parseCookies lee mc_sid');
ok(A.parseCookies('') .mc_sid === undefined, 'parseCookies tolera header vacío');

// ---- dummy hash / timing ----
ok(typeof A.getDummyHash === 'function' && /^scrypt\$/.test(await A.getDummyHash()), 'getDummyHash devuelve un hash scrypt válido');
ok(await A.verifyPassword('cualquiera', await A.getDummyHash()) === false, 'el dummy hash nunca verifica');

if (fails) { console.log(`\n💥 ${fails} chequeo(s) fallaron`); process.exit(1); }
console.log('\n🎉 auth (scrypt, tokens, cookies, validaciones) OK');

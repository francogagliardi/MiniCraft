# ⛏ Minicraft — Servidor multijugador (VPS)

Servidor Node.js que sirve el juego (`index.html`) y sincroniza jugadores por
WebSocket: posiciones, bloques, daño PvP, chat y cuentas. La identidad vive en
PostgreSQL (usuarios, sesiones y roles).

## Estructura

```
Minicraft/
├── index.html        ← el juego (se sirve en /game)
├── login.html        ← login
├── register.html     ← registro público
├── lobby.html        ← lobby y selector de skin
└── server/
    ├── server.js     ← bootstrap (env → DB → migraciones → app)
    ├── app.js        ← HTTP + WebSocket + mundo
    ├── migrations/   ← esquema SQL versionado
    ├── user-tool.mjs ← crear/cambiar contraseña/listar/activar cuentas
    ├── package.json
    ├── world.json    ← se crea solo (mundo persistido)
    └── README.md
```

## Probarlo en tu PC

Necesitás un PostgreSQL accesible (local o en Docker) y `DATABASE_URL`.

```bash
cd server
npm install
DATABASE_URL=postgres://usuario:clave@localhost:5432/minicraft \
ADMIN_PASSWORD=admin-local-12345 \
node server.js
```

Abrí http://localhost:3000 → te redirige a `/login`. Creá una cuenta en
`/register` o entrá con `admin` / la contraseña que definiste. El registro
público se cierra con `REGISTRATION_ENABLED=0`.

## Subirlo a una VPS (Ubuntu/Debian)

```bash
# 1. Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Subir archivos (ej: con scp desde tu PC)
scp -r Minicraft root@TU_IP:/opt/

# 3. Instalar y correr
cd /opt/Minicraft/server
npm install --omit=dev

# 4a. Correr simple (sesión actual)
PORT=3000 \
DATABASE_URL=postgres://usuario:clave@localhost:5432/minicraft \
ADMIN_PASSWORD=una-clave-larga-y-secreta \
node server.js

# 4b. Correr persistente con pm2 (recomendado)
sudo npm i -g pm2
PORT=3000 DATABASE_URL=... ADMIN_PASSWORD=... pm2 start server.js --name minicraft
pm2 save
pm2 startup   # seguir la instrucción que imprime
```

Tus amigos entran a **`http://TU_IP:3000`** y crean su cuenta.

## Firewall / puertos

```bash
sudo ufw allow 3000/tcp
```

Si usás un proveedor con panel (AWS, DigitalOcean, etc.), abrí el
puerto 3000 ahí también. Si hay router con NAT, redirigí el puerto.

## Variables de entorno

| Var | Default | Qué hace |
|-----|---------|----------|
| `PORT` | `3000` | Puerto HTTP+WebSocket |
| `DATABASE_URL` | *(obligatoria)* | PostgreSQL de usuarios y sesiones |
| `ADMIN_USERNAME` | `admin` | Cuenta admin del bootstrap (reservada en el registro) |
| `ADMIN_PASSWORD` | *(vacío)* | Contraseña del admin **solo en el primer arranque** |
| `BOT_TOKEN` | *(vacío)* | Credencial de servicio del bot |
| `COOKIE_SECURE` | `0` | `1` en HTTPS (agrega `Secure` a la cookie) |
| `TRUST_PROXY` | `0` | `1` solo detrás de un proxy propio que sanee `X-Forwarded-For` |
| `REGISTRATION_ENABLED` | `1` | `0` cierra el registro público |
| `MINICRAFT_DIR` | `..` | Carpeta de donde servir `index.html` |
| `WORLD_FILE` | `server/world.json` | Dónde persistir el mundo (en Docker: `/data/world.json`) |

> No hay clave admin por defecto ni variable `ADMIN_KEY`/`ADMIN_KEY_HASH`: el
> admin es una **cuenta con rol admin**. Si esas variables siguen en el entorno,
> el server las ignora y avisa una vez.

## Operar cuentas sin panel (change 1)

```bash
DATABASE_URL=... node server/user-tool.mjs create ana --role user
DATABASE_URL=... node server/user-tool.mjs passwd ana
DATABASE_URL=... node server/user-tool.mjs list
DATABASE_URL=... node server/user-tool.mjs disable ana
DATABASE_URL=... node server/user-tool.mjs enable ana
```

La contraseña se lee por stdin, nunca por argv, y `passwd`/`disable` revocan
las sesiones de la cuenta. El CRUD desde panel queda para el change 2.

## Probar multijugador en tu PC (2 jugadores)

1. Abrí **http://localhost:3000** → creá la cuenta `Franco` en `/register`.
2. Abrí una **ventana de incógnito** → creá `Invitado` (o entrá con otra cuenta).
3. En el lobby elegí skin y **Jugar Legacy**; se ven mutuamente, chat (Enter),
   romper/poner bloques y espada ⚔️.
4. Para probar el admin: entrá con la cuenta `admin` (rol admin) → vuela (F),
   pica instantáneo y es inmune al daño 🛡️.

## Notas

- El mundo se guarda solo en `server/world.json` cada 15 s.
  Para mundo nuevo: borrar `world.json` y reiniciar.
- **La identidad no vive en `world.json`**: usuarios, sesiones y roles están en
  PostgreSQL. Borrar el mundo no borra cuentas.
- El juego carga Three.js desde CDN: el VPS **no** necesita nada
  especial, pero los jugadores necesitan internet.
- Pensado para jugar entre amigos (hasta ~15 jugadores). El servidor no es
  anti-cheat.
- Jugar por `http://` en red local funciona bien. Si querés `https`
  con dominio propio, poné nginx o Caddy como reverse proxy y usá
  `COOKIE_SECURE=1` + `TRUST_PROXY=1`.

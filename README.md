# ⛏ MiniCraft

Un mini Minecraft hecho con amor: voxel, súper básico pero pulido, con
multijugador. Un solo `index.html` (Three.js por CDN) + un servidor
chiquito en Node.js con WebSocket.

![stack](https://img.shields.io/badge/three.js-r160-blue) ![node](https://img.shields.io/badge/node-20-green) ![docker](https://img.shields.io/badge/docker-ready-blue) [![CI](https://github.com/francogagliardi/MiniCraft/actions/workflows/ci.yml/badge.svg)](https://github.com/francogagliardi/MiniCraft/actions)

## ✨ Qué tiene

- 🌍 Mundo voxel 208×208 con colinas, lagos, playas, árboles y flores
- 👤 **Cuentas y lobby**: registro público, login con sesión persistida, lobby
  con selector de aspecto y elección de mundo (Legacy; Infinito “Próximamente”)
- 🌱 **Modo jugador**: pica con progreso y grietas, sin volar, con vida,
  daño por caída, muerte con animación y respawn
- 🛠 **Modo admin**: vuela, pica instantáneo, inmune al daño (rol admin de la cuenta)
- 🛂 **Panel `/admin`**: CRUD de cuentas, permisos por usuario (`bot_ignore`, `fly`,
  `instant_break`), activar/desactivar, reset de contraseña y auditoría append-only
- ⚔️ Espada con cooldown, animación y anillo de recarga + PvP
- 🐷🐑 Chanchitos y ovejitas acariciables (con corazones)
- 🎒 Inventario creativo (20 bloques) + hotbar de 9
- 🌐 **Multijugador**: avatares con nombre, barras de vida, números de
  daño, hitmarker, chat y mundo sincronizado y persistido

## 🗂 Estructura

```
MiniCraft/
├── index.html            ← todo el juego (cliente, se sirve en /game)
├── login.html            ← formulario de login
├── register.html         ← registro público
├── lobby.html            ← username, skins y elección de mundo
├── admin.html            ← panel de administración (/admin, solo rol admin)
├── Dockerfile            ← imagen del server para Easypanel / VPS
├── Dockerfile.bot        ← imagen del bot cazador (servicio aparte)
├── docker-compose.yml    ← db + server + bot con persistencia
├── .dockerignore
├── bot/
│   ├── cazador.js        ← lógica pura del bot (presa, golpes, modos)
│   └── index.js          ← cableado: WebSocket, reconexión y CLI
├── server/
│   ├── server.js         ← bootstrap: env → DB → migraciones → app
│   ├── app.js            ← HTTP estático + API + WebSocket + mundo
│   ├── auth.js           ← scrypt, tokens, cookies y validaciones
│   ├── http-auth.js      ← rutas /api/* y páginas de login/registro/lobby
│   ├── admin-api.js      ← CRUD admin, guardas, auditoría y gate de /admin
│   ├── permissions.js    ← allowlist y materialización de permisos por usuario
│   ├── ws-auth.js        ← gate del upgrade (cookie o BOT_TOKEN)
│   ├── db.js             ← Pool PostgreSQL + transacciones
│   ├── migrate.js        ← runner de migraciones SQL
│   ├── migrations/       ← esquema versionado (001-auth.sql, 002-admin-permissions.sql)
│   ├── store-pg.js       ← users/sessions/admin_audit sobre PostgreSQL
│   ├── user-tool.mjs     ← crear/cambiar contraseña/listar/activar cuentas
│   ├── package.json
│   └── README.md         ← deploy clásico en VPS
└── README.md             ← este archivo
```

## 🚀 Correr local

**Solo (sin server):** doble click a `index.html` → ENTRAR AL MUNDO (modo
solitario sin cuentas).

**Multijugador local con Docker:**

```bash
# La primera vez, definí una contraseña de admin y un token de bot:
ADMIN_PASSWORD=admin-local-12345 BOT_TOKEN=dev-bot-token-1234567890 docker compose up --build -d
```

Abrí http://localhost:3000, creá una cuenta en `/register` o entrá con
`admin` / `admin-local-12345`. El juego vive en `/game` y el lobby en
`/lobby`; sin sesión todo redirige a `/login`.

**Sin Docker** (Postgres local o remoto):

```bash
cd server
npm install
DATABASE_URL=postgres://usuario:clave@localhost:5432/minicraft \
ADMIN_PASSWORD=admin-local-12345 node server.js
```

Al arrancar, el server aplica las migraciones y crea el admin si no existe.
El registro público queda abierto salvo `REGISTRATION_ENABLED=0`.

## 🎭 Aspectos (skins)

Elegís cómo te ven **los demás** y qué tan grande es tu cuerpo en el **lobby**
(`/lobby`). La elección se guarda en tu perfil con `PATCH /api/me` y se aplica
al entrar a `/game`; `localStorage` (`mc-skin`) queda solo como caché
cosmética y nunca pisa el perfil del server. El nombre de jugador es tu
username y no se puede editar desde el juego.

| id | Etiqueta | Altura | Notas |
|---|---|---|---|
| `human` | Humano | 1.97 | Por defecto; valores históricos intactos |
| `fat` | Gordo | 1.70 | Más ancho, con panza y extremidades rechonchas; factor ≈ 0.863 |
| `giant` | Gigante | 5.00 | Escala `5.00/1.97`: **ya no es sólo visual** — ojo, hitbox y alcances ×2.538 |
| `small` | Pequeño | 0.90 | Escala `0.90/1.97`: **ya no es sólo visual** — ojo, hitbox y alcances ×0.457 |
| `zombie` | Zombi | 1.97 | Piel verde, ojos rojos y ropa oscura; **no** es la criatura hostil |
| `mujer` | Mujer | 1.97 | Variante visual de 1.97: torso angosto, pecho marcado, falda, melena y mechones; paleta fija |
| `moreno` | Piel oscura | 1.97 | Variante visual de 1.97 con el rig de `human`: piel oscura, pelo corto y barba sutil |
| `gojo` | Gojo | 1.97 | Variante visual de 1.97: uniforme oscuro, pelo blanco en puntas y venda negra (sin ojos) |
| `robot` | Robot | 1.90 | Nominal; reservado para el bot, no aparece en el lobby |

La altura real del rig humano es **1.97** (cabellera incluida): la etiqueta con el
nombre, la barra de vida, los corazones del saludo y el daño flotante se derivan
de la altura de cada aspecto.

El tamaño también cambia la **jugabilidad**: la altura de los ojos (1.62 × factor),
la **hitbox** (0.3 × factor de radio y 1.8 × factor de alto) y los **alcances**
(8 / 4.6 / 6 bloques × factor). Así, `human` conserva 0.3 × 1.8, ojo 1.62 y
alcances 8 / 4.6 / 6; `giant` no pasa por un techo de 4 bloques pero sí por uno de
5, y rompe/coloca desde ≈ 20.3 bloques; `small` pasa por un hueco de 1 bloque con
ojo y alcances cortos (≈ 3.66 / 2.10 / 2.74). La **velocidad, el salto, la
gravedad, el daño de caída y la vida no cambian** con el aspecto. La cámara `V`
(1ª/3ª trasera/3ª frontal) también escala su distancia y su mínimo con el factor.

## 🐳 Docker

```bash
# build + run (db + server + bot; mundo en volumen)
ADMIN_PASSWORD=admin-local-12345 BOT_TOKEN=dev-bot-token-1234567890 docker compose up --build -d
# solo server (+ db)
ADMIN_PASSWORD=admin-local-12345 docker compose up --build -d minicraft
# ver logs
docker compose logs -f
# parar
docker compose down
```

`docker compose up --build -d` levanta **tres** servicios: `db` (PostgreSQL 16,
volumen `minicraft-db`, sin puertos públicos), `minicraft` (el server, espera el
healthcheck de la DB) y `minicraft-bot` (el bot cazador, un cliente aparte).
Para inspeccionar la base: `docker compose exec db psql -U minicraft`.

Variables principales (todas con default seguro en compose, salvo las
credenciales): `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`,
`BOT_TOKEN`, `COOKIE_SECURE`, `TRUST_PROXY`, `REGISTRATION_ENABLED`, `PORT`.
Sin `BOT_TOKEN` el bot sale con error claro; el server sigue funcionando para
usuarios. En **dev por HTTP** dejá `COOKIE_SECURE=0`; en producción HTTPS,
`COOKIE_SECURE=1`.

## 🤖 Bot cazador (24/7)

Un **robot humanoide** (`skin:'robot'`) entra como un cliente de **servicio**,
autenticado con `BOT_TOKEN` (sin cookie, modo `player`, **nunca** admin), a
perseguir y fulminar jugadores. Es un **huésped de solo lectura**: nunca rompe
ni pone bloques (cero `edit`).

- **A quién caza:** a cualquier jugador **no-admin** vivo. **Nunca** ataca admins.
- **Cómo se mueve:** **vuela y atraviesa bloques** (no-clip, siempre activo, sin
  interruptor): paredes, techos, pisos, construcciones cerradas, cuevas y torres no
  lo frenan. Ajusta su altura a la del objetivo (presa, admin o spawn) para
  alcanzarlo aunque esté arriba o abajo, y sólo lo limita el borde del mundo. Va a
  **28.8 u/s** (3× su velocidad anterior y 6× la caminata de 4.8 del jugador).
- **Cómo mata:** dos toques de `dmg: 6` separados ≥0.65 s (6+6=12 > 10 de vida), así
  respeta la ventana de invulnerabilidad de 0.6 s del cliente: la víctima **ve dos
  golpes rápidos** y muere en ~0.65 s. Es **invulnerable** (reporta siempre 10/0).
- **Sin presas:** vuelve al punto de aparición y se queda quieto ahí (sigue latiendo).
- **Comandos de chat (solo admin):** el bot autoriza por el **flag `admin:true` del
  server** o por el rol admin de su roster, nunca por nombre (un impostor no lo comanda).

| Comando | Efecto |
|---|---|
| `sigueme` (o `seguime`) | Sigue al admin que lo ordenó; si ese admin se va, vuelve a cazar |
| `espera` | Se clava donde está (turreta): mata a quien se le acerque. No vuelve al spawn |

El match es **exacto** (trim + sin distinguir mayúsculas, sin prefijo): el mensaje debe
ser exactamente el comando. El bot anuncia por chat los cambios de modo y las kills.

**Local:**

```bash
# BOT_TOKEN es obligatorio (el mismo valor que usa el server)
BOT_TOKEN=dev-bot-token-1234567890 SERVER_URL=ws://localhost:3000 node bot/index.js
```

**Variables de entorno (bot):**

| Var | Default | Qué hace |
|---|---|---|
| `SERVER_URL` | `ws://minicraft:3000` | WebSocket del server (interno en compose; en Easypanel `wss://tu-dominio`) |
| `BOT_TOKEN` | *(obligatorio)* | Credencial de servicio; debe coincidir con la del server |
| `BOT_NAME` | `OPSX-bot` | Nombre con el que entra al mundo |
| `BOT_SKIN` | `robot` | Aspecto con el que se presenta: `robot`, `human`, `fat`, `giant`, `small` o `zombie` (un valor desconocido se dibuja como humano) |

En Docker, `docker-compose.yml` pasa `BOT_SKIN` al contenedor del bot con
`BOT_SKIN: ${BOT_SKIN:-robot}`: `BOT_SKIN=giant docker compose up --build -d`
levanta el bot gigante sin editar el compose.

**Easypanel (segundo servicio):** el server se despliega igual que antes; agregá un
**segundo App** apuntando al mismo repo pero con **Build → Dockerfile** =
`Dockerfile.bot`, sin dominios ni volumen, y en **Environment** poné
`SERVER_URL=wss://minicraft.francogagliardi.me` y (opcional) `BOT_NAME`. El bot
reconecta solo con backoff, así que sobrevive a los redeploys del server.

## ☁️ Deploy en Easypanel (VPS)

1. Subí este repo a GitHub (ya está) y conectalo en Easypanel:
   **New → App → From GitHub → MiniCraft**.
2. En **Build**, elegí **Dockerfile** (usa el de la raíz).
3. En **Environment**, agregá:
   - `DATABASE_URL` = la cadena de tu PostgreSQL (interno de Easypanel o externo)
   - `ADMIN_PASSWORD` = contraseña del admin inicial (**solo el primer deploy**;
     después puede removerse: un reinicio no rota nada)
   - `BOT_TOKEN` = token de servicio del bot (mismo valor en la app del bot)
   - `COOKIE_SECURE=1` y `TRUST_PROXY=1` (Easypanel sirve HTTPS detrás de proxy)
   - `REGISTRATION_ENABLED=1` (o `0` para cerrar el registro público)
   - **NO** agregues `ADMIN_KEY`/`ADMIN_KEY_HASH`: ya no se usan. Si quedaron,
     el server las ignora y avisa una vez en el log.
4. En **Domains/Ports**, exponé el puerto **`3000`**.
5. En **Volumes**, montá un volumen en **`/data`**
   (ahí vive `world.json`; la identidad vive en PostgreSQL, no en el volumen).
6. Deploy ▶️ — tus amigos entran a `https://TU_DOMINIO`, crean su cuenta en
   `/register` (si el toggle está abierto) y eligen mundo en `/lobby`.

**Cerrar el registro en producción:** cambiá `REGISTRATION_ENABLED=0` en el
servicio `minicraft` y redeployá/reiniciá. No requiere migración: `/register`
pasa a mostrar “Registro cerrado” y `POST /api/register` responde `403`. Las
cuentas existentes y el login no se ven afectados.

### 🔄 Deploy automático (push a main → se actualiza solo)

1. Pusheá a `main`: corren los workflows **CI** y **Deploy** (los dos testean).
2. Si los tests pasan ✅, **Deploy** llama al deploy webhook de Easypanel.
3. Para activarlo: en Easypanel copiá la **Deploy Webhook URL** de la app
   y guardala en GitHub → repo **Settings → Secrets and variables →
   Actions** → secret `EASYPANEL_DEPLOY_WEBHOOK`.
4. **El bot es una app aparte** (mismo repo, build con `Dockerfile.bot`): su
   imagen **no** la buildea el webhook del server. Copiá la Deploy Webhook URL
   de la app del bot y guardala como secret `EASYPANEL_BOT_WEBHOOK`; el workflow
   le pega a los dos. *(Si en cambio desplegás los dos servicios con el
   `docker-compose.yml` de la raíz, es **una sola app**: no configures el webhook
   del bot, porque ya queda cubierto.)*
5. Sin esos secrets el deploy se omite (no falla) y desplegás a mano.

<!-- test deploy webhook: 2026-10-02 -->

> El juego carga Three.js desde CDN: los jugadores necesitan internet,
> pero tu VPS no necesita nada especial.

## 🎮 Controles

| Tecla | Acción |
|---|---|
| `W A S D` + mouse | Moverse y mirar |
| Click izq. | Romper / pegar (mantener para picar en modo jugador) |
| Click der. | Poner bloque · acariciar 🐷🐑 · espada ⚔️ ataca |
| `E` / `Enter` | Inventario / chat |
| `V` | Cámara: 1ª / 3ª trasera / 3ª frontal (también 👁 arriba) |
| `F` | Volar (admin o permiso `fly`) |

### 📱 Controles táctiles (celular)

| Gesto / botón | Acción |
|---|---|
| Joystick (abajo izq.) | Moverse |
| Arrastrar en pantalla | Mirar |
| Tocar (rápido) | Romper / acariciar 🐷🐑 (equivale a click izq.) |
| Mantener el dedo | Picar progresivo ⛏ |
| ⚔️ | Atacar (**solo con la espada en la mano**) |
| 🧱 | Poner bloque / saludar / acariciar (equivale a click der.) |
| ⤒ / 🕊 / 🎒 / 💬 | Saltar / volar (admin o permiso `fly`) / inventario / chat |
| 👁 (arriba) | Cambiar cámara: 1ª / 3ª trasera / 3ª frontal |
| ⛶ (arriba) | Pantalla completa |

> Sin la espada en la mano no se puede dañar a otros jugadores
> (romper, poner y acariciar siguen funcionando con cualquier item).
> La 3ª frontal es una **vista de vanidad**: la cámara mira al jugador, así que el
> crosshair no coincide con la mirada. Romper, poner y golpear siguen saliendo del
> ojo y de la mirada, con los mismos alcances; `V` vuelve a la primera persona.
> Probá el modo táctil en PC con `?touch=1` en la URL.

## 🔑 Variables de entorno (server)

| Var | Default | Qué hace |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP + WebSocket |
| `DATABASE_URL` | *(obligatoria)* | PostgreSQL de usuarios y sesiones |
| `ADMIN_USERNAME` | `admin` | Cuenta admin que crea el bootstrap; queda reservada en el registro |
| `ADMIN_PASSWORD` | *(vacío)* | Contraseña del admin **solo en el primer arranque**. Si falta o tiene <8, no se crea admin (avisa sin exponer nada). Nunca se loguea |
| `BOT_TOKEN` | *(vacío)* | Credencial de servicio del bot (`Authorization: Bearer`). Sin ella el bot no entra |
| `COOKIE_SECURE` | `0` (`1` si `NODE_ENV=production`) | Agrega `Secure` a la cookie de sesión. **1** en HTTPS |
| `TRUST_PROXY` | `0` | Usa el primer `X-Forwarded-For` para el rate limit. Solo detrás de un proxy propio |
| `REGISTRATION_ENABLED` | `1` | `1`/`true` abierto; `0`/`false` cerrado; otro valor → cerrado + warning |
| `MIGRATIONS_AUTO` | `1` | `0` salta el runner (ops que migran aparte) |
| `MINICRAFT_DIR` | `..` (local) / `/app` (docker) | De dónde servir el cliente y las páginas |
| `WORLD_FILE` | `server/world.json` (local) / `/data/world.json` (docker) | Dónde persistir el mundo |

### 👑 Admin, cuentas y CLI

**Bootstrap:** en el primer arranque, si no existe `ADMIN_USERNAME` y
`ADMIN_PASSWORD` es válida (≥8), se crea la cuenta con `role='admin'`,
`skin='human'`, activa y contraseña `scrypt`. Si la cuenta ya existe **no se
sobrescribe**: cambiar `ADMIN_PASSWORD` no rota nada. Para rotarla, usá la CLI.

**Registro público:** `/register` crea cuentas `role='user'` con skin
`human`, contraseña de 8–128 y username de 3–16 (`^[A-Za-z0-9_-]+$`), único
sin distinguir mayúsculas. Los nombres `admin`, `system`, `server`, `bot`,
`null`, `undefined` y el `ADMIN_USERNAME` están reservados. El registro
**nunca** puede crear un admin.

**CLI** (misma validación y mismo hash que el login; la contraseña se lee por
stdin, nunca por argv):

```bash
DATABASE_URL=... node server/user-tool.mjs create ana --role user
DATABASE_URL=... node server/user-tool.mjs passwd ana     # revoca sus sesiones
DATABASE_URL=... node server/user-tool.mjs list
DATABASE_URL=... node server/user-tool.mjs disable ana    # active=false + revoca
DATABASE_URL=... node server/user-tool.mjs enable ana
```

### 🛂 Panel de administración y permisos (`/admin`)

Con una cuenta `role='admin'`, el lobby muestra el link **Administración** y
`/admin` sirve el panel. Sin sesión redirige a `/login`; un usuario común que
escribe `/admin` vuelve a `/lobby` (y la API le responde `403 admin_required`).
El gate real es el servidor: la página solo oculta lo que igual está prohibido.

**Qué se puede hacer desde el panel**

- **Listar** todas las cuentas (nunca se muestran hashes).
- **Crear** una cuenta con username, contraseña, rol, aspecto y permisos. El
  alta no inicia sesión por vos.
- **Editar** solo `skin`, `role`, `active` y `permissions`. El **username es
  inmutable** después del alta (la UI lo muestra como texto de solo lectura).
- **Activar/desactivar** una cuenta. Desactivar revoca sus sesiones y cierra
  su WebSocket; reactivar no devuelve sesiones.
- **Resetear la contraseña** (8–128): revoca todas las sesiones del afectado.
  Si reseteás la tuya, se cierra tu sesión y el panel te manda a `/login`.
- **Borrar** una cuenta con confirmación destructiva escribiendo el username
  exacto. El borrado es definitivo y arrastra sus sesiones; la auditoría
  conserva el username histórico con `target` nulo.

**Contraseñas y autocompletado:** las contraseñas se guardan hasheadas con
`scrypt`; no se pueden ver ni recuperar desde el panel ni por la API. Si alguien
la olvidó, se define una nueva con el reset (revoca sus sesiones). Los
formularios de login, registro, alta y reset declaran `autocomplete="off"` y
atributos para que los gestores de contraseñas ignoren los campos: eso reduce
las pestañas y el aviso de guardado, pero **ningún sitio puede garantizar al
100%** que el navegador no lo ofrezca igual.

**Guardas de integridad:** no podés desactivarte, borrarte ni degradarte a vos
mismo (`guard_self_action`) y el sistema nunca queda sin admin activo
(`guard_last_admin`). Los rechazos también se auditan.

**Permisos por usuario** (columna `users.permissions` JSONB, allowlist estricta;
una clave desconocida o un valor no booleano responde `422 invalid_permissions`):

| Permiso | Efecto real |
|---|---|
| `bot_ignore` | El bot cazador lo excluye de sus presas y el **server descarta** cualquier `hit` de la conexión de servicio del bot contra esa cuenta. Defensa en el servidor, no solo cosmética |
| `fly` | Habilita el vuelo del cliente igual que el rol admin (tecla `F`, botón y touch). El daño de caída, la regen y la inmunidad del admin **no** se heredan |
| `instant_break` | Rompe el bloque apuntado al instante por la misma ruta del admin; `BEDROCK` sigue inviolable |

Los cambios de permisos se aplican **en caliente** (frame `perm`) sin relogin.
`fly` e `instant_break` son **client-authoritative**: el server no puede impedir
que un cliente modificado vuele o pique rápido; el cambio no promete anti-cheat.
`bot_ignore` sí tiene la defensa server-side descrita.

**Auditoría:** tabla `admin_audit` append-only (`user.create`, `user.update`,
`user.permissions`, `user.password`, `user.activate`, `user.deactivate`,
`user.delete`, `user.guard_rejected`), con actor, target, detalle y fecha. No
guarda contraseñas, hashes ni tokens. Se consulta desde el panel
(`GET /api/admin/audit`). La API no tiene rutas para editar ni borrar entradas;
un operador con SQL directo sí puede hacerlo (límite documentado).

La CLI `user-tool` sigue disponible como **vía de emergencia** (por ejemplo, si
te quedaste sin admin). No aplica las guardas de self/último admin: es una
operación de operador, no el camino normal.

**Migración desde el deploy viejo:** creá la base, seteá
`DATABASE_URL`/`ADMIN_PASSWORD`/`BOT_TOKEN`, deployá (las migraciones corren
solas) y **borrá `ADMIN_KEY` y `ADMIN_KEY_HASH`** del entorno. Si quedan, el
server las ignora y registra un único aviso, sin imprimir sus valores. Las
cuentas se crean con `/register` o con la CLI. **Rollback:** volver a la imagen
anterior deja la base intacta, pero esa versión no usa cuentas.

## 🧪 Tests

```bash
cd server && npm test
```

- **Estáticos** (`test/static.mjs`): sintaxis cliente/servidor, tiles del
  atlas, winding de caras, inventario, hotbar, páginas de auth y rutas.
- **Auth unitaria** (`auth.mjs`, `rate-limit.mjs`, `http-auth.mjs`,
  `register.mjs`, `ws-auth.mjs`, `admin-retirement.mjs`): `scrypt`,
  cookies, validaciones, rate limit, login/perfil/logout, registro público,
  gate del WebSocket, identidad impuesta y retiro de `ADMIN_KEY*`.
- **Permisos y admin** (`permissions.mjs`, `admin.mjs`, `admin-ws.mjs`):
  allowlist/materialización, CRUD administrativo, guardas de self y último
  admin, auditoría, rate limit, CSRF, gate de `/admin`, `perm` en caliente,
  descarte del `hit` del bot y cierre de sockets por revocación.
- **Integración DB** (`auth-db.mjs`, `admin-db.mjs`): migraciones idempotentes
  (001 y 002), unicidad case-insensitive, hash de sesión, registro transaccional
  y carrera de usernames, bootstrap del admin, JSONB de permisos, auditoría con
  `ON DELETE SET NULL`, cascada de sesiones y carrera de guardas con advisory
  lock. Corre solo si `TEST_DATABASE_URL` está definida; en CI
  `REQUIRE_DB_TESTS=1` la exige.
- **Protocolo** (`test/protocol.mjs`): levanta `createApp` + `MemoryStore`
  en proceso, autentica por `POST /api/login` y verifica welcome, movimiento,
  bloques, daño PvP, muerte, chat, sueño y zombis.
- **Bot cazador** (`test/bot-cazador.mjs`): cablea el bot con `BOT_TOKEN` y
  clientes falsos — mata a un no-admin con **dos toques separados** (el cliente
  falso emula la ventana de 0.6 s), ignora admins, `sigueme`/`espera`,
  seguridad por id/flag admin, invulnerabilidad, vuelo/no-clip, reconexión,
  cero `edit` y `skin:'robot'`.

`npm test` local corre **sin Docker**: los unitarios usan `MemoryStore` y la
integración de DB se omite con aviso. En CI corre con PostgreSQL 16 y la exige.

El workflow **CI** los corre en cada push/PR a `main`.

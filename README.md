# ⛏ MiniCraft

Un mini Minecraft hecho con amor: voxel, súper básico pero pulido, con
multijugador. Un solo `index.html` (Three.js por CDN) + un servidor
chiquito en Node.js con WebSocket.

![stack](https://img.shields.io/badge/three.js-r160-blue) ![node](https://img.shields.io/badge/node-20-green) ![docker](https://img.shields.io/badge/docker-ready-blue) [![CI](https://github.com/francogagliardi/MiniCraft/actions/workflows/ci.yml/badge.svg)](https://github.com/francogagliardi/MiniCraft/actions)

## ✨ Qué tiene

- 🌍 Mundo voxel 160×160 con colinas, lagos, playas, árboles y flores
- 🌱 **Modo jugador**: pica con progreso y grietas, sin volar, con vida,
  daño por caída, muerte con animación y respawn
- 🛠 **Modo admin**: vuela, pica instantáneo, inmune al daño (con clave)
- ⚔️ Espada con cooldown, animación y anillo de recarga + PvP
- 🐷🐑 Chanchitos y ovejitas acariciables (con corazones)
- 🎒 Inventario creativo (20 bloques) + hotbar de 9
- 🌐 **Multijugador**: avatares con nombre, barras de vida, números de
  daño, hitmarker, chat y mundo sincronizado y persistido

## 🗂 Estructura

```
MiniCraft/
├── index.html            ← todo el juego (cliente)
├── Dockerfile            ← imagen del server para Easypanel / VPS
├── Dockerfile.bot        ← imagen del bot cazador (servicio aparte)
├── docker-compose.yml    ← server + bot con persistencia
├── .dockerignore
├── bot/
│   ├── cazador.js        ← lógica pura del bot (presa, golpes, modos)
│   └── index.js          ← cableado: WebSocket, reconexión y CLI
├── server/
│   ├── server.js         ← HTTP + WebSocket multijugador
│   ├── package.json
│   └── README.md         ← deploy clásico en VPS
└── README.md             ← este archivo
```

## 🚀 Correr local

**Solo (sin server):** doble click a `index.html` → JUGAR.

**Multijugador local:**

```bash
cd server
npm install
node server.js
```

Abrí http://localhost:3000 en tu navegador **y** en una ventana de
incógnito, con nombres distintos.

**Modo admin:** no hay clave por defecto. En desarrollo local podés setear
`ADMIN_KEY=<tu-clave>` (queda **en claro** en el entorno: solo dev). En
**producción** usá `ADMIN_KEY_HASH` (ver [Clave admin](#-clave-admin-hash-pbkdf2)):
el server no acepta ninguna clave publicada acá, y sin configuración el modo
admin queda **deshabilitado**.

## 🎭 Aspectos (skins)

En el menú inicial elegís cómo te ven **los demás** y qué tan grande es tu
cuerpo en el mundo. La elección se guarda en `localStorage` (`mc-skin`) y viaja
en el `hello`; el server sólo la difunde.

| id | Etiqueta | Altura | Notas |
|---|---|---|---|
| `human` | Humano | 1.97 | Por defecto; valores históricos intactos |
| `fat` | Gordo | 1.70 | Más ancho, con panza y extremidades rechonchas; factor ≈ 0.863 |
| `giant` | Gigante | 5.00 | Escala `5.00/1.97`: **ya no es sólo visual** — ojo, hitbox y alcances ×2.538 |
| `small` | Pequeño | 0.90 | Escala `0.90/1.97`: **ya no es sólo visual** — ojo, hitbox y alcances ×0.457 |
| `zombie` | Zombi | 1.97 | Piel verde, ojos rojos y ropa oscura; **no** es la criatura hostil |
| `robot` | Robot | 1.90 | Nominal; reservado para el bot, no aparece en el menú |

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
# build + run (puerto 3000, mundo persistido en volumen)
docker compose up --build -d
# ver logs
docker compose logs -f
# parar
docker compose down
```

Variables: `ADMIN_KEY_HASH` (producción, ver abajo), `ADMIN_KEY` (solo dev local), `PORT`.

`docker compose up --build -d` levanta **dos** servicios: `minicraft` (el server) y
`minicraft-bot` (el bot cazador, un cliente aparte). Para correr solo el server:
`docker compose up --build -d minicraft`.

## 🤖 Bot cazador (24/7)

Un **robot humanoide** (`skin:'robot'`) entra como un jugador normal (modo `player`,
**no** usa clave de admin) a perseguir y fulminar jugadores. Es un **huésped de solo
lectura**: nunca rompe ni pone bloques (cero `edit`).

- **A quién caza:** a cualquier jugador **no-admin** vivo. **Nunca** ataca admins.
- **Cómo mata:** dos toques de `dmg: 6` separados ≥0.65 s (6+6=12 > 10 de vida), así
  respeta la ventana de invulnerabilidad de 0.6 s del cliente: la víctima **ve dos
  golpes rápidos** y muere en ~0.65 s. Va al **doble de velocidad** (9.6 u/s) y es
  **invulnerable** (reporta siempre 10/0).
- **Sin presas:** camina al punto de aparición y se queda quieto ahí (sigue latiendo).
- **Comandos de chat (solo admin):** el bot autoriza por el **id del server**, nunca
  por nombre (un impostor con el nombre del admin no lo comanda).

| Comando | Efecto |
|---|---|
| `sigueme` (o `seguime`) | Sigue al admin que lo ordenó; si ese admin se va, vuelve a cazar |
| `espera` | Se clava donde está (turreta): mata a quien se le acerque. No vuelve al spawn |

El match es **exacto** (trim + sin distinguir mayúsculas, sin prefijo): el mensaje debe
ser exactamente el comando. El bot anuncia por chat los cambios de modo y las kills.

**Local:**

```bash
node bot/index.js                       # SERVER_URL por defecto ws://minicraft:3000
SERVER_URL=ws://localhost:3000 BOT_NAME=OPSX-bot node bot/index.js
```

**Variables de entorno (bot):**

| Var | Default | Qué hace |
|---|---|---|
| `SERVER_URL` | `ws://minicraft:3000` | WebSocket del server (interno en compose; en Easypanel `wss://tu-dominio`) |
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
   - `ADMIN_KEY_HASH` = el hash PBKDF2 de tu clave admin (ver
     [Clave admin](#-clave-admin-hash-pbkdf2))
   - (opcional) `PORT` = `3000`
   - **NO** agregues `ADMIN_KEY` en claro: cualquiera con acceso al host
     (root, `docker inspect`, panel de Easypanel) la leería.
4. En **Domains/Ports**, exponé el puerto **`3000`**.
5. En **Volumes**, montá un volumen en **`/data`**
   (ahí vive `world.json`, así no perdés el mundo en cada deploy).
6. Deploy ▶️ — tus amigos entran a `http://TU_IP:3000`.

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
| `F` | Volar (solo admin) |

### 📱 Controles táctiles (celular)

| Gesto / botón | Acción |
|---|---|
| Joystick (abajo izq.) | Moverse |
| Arrastrar en pantalla | Mirar |
| Tocar (rápido) | Romper / acariciar 🐷🐑 (equivale a click izq.) |
| Mantener el dedo | Picar progresivo ⛏ |
| ⚔️ | Atacar (**solo con la espada en la mano**) |
| 🧱 | Poner bloque / saludar / acariciar (equivale a click der.) |
| ⤒ / 🕊 / 🎒 / 💬 | Saltar / volar (admin) / inventario / chat |
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
| `ADMIN_KEY_HASH` | *(vacío)* | **Producción.** Hash PBKDF2 de la clave admin (`pbkdf2_sha256$...`). Si está, se usa **solo** eso y se ignora `ADMIN_KEY` en claro. |
| `ADMIN_KEY` | *(vacío)* | Solo **dev local**: clave admin EN CLARO (legible por quien acceda al host). Fallback de desarrollo/tests. |
| `MINICRAFT_DIR` | `..` (local) / `/app` (docker) | De dónde servir `index.html` |
| `WORLD_FILE` | `server/world.json` (local) / `/data/world.json` (docker) | Dónde persistir el mundo |

### 🔐 Clave admin (PBKDF2)

En **producción la clave no se guarda**: el entorno guarda un **hash
PBKDF2-SHA256** (`ADMIN_KEY_HASH`) y el server deriva el hash de lo que recibe
para compararlo. Leer la config del host (`docker inspect`, `/proc/<pid>/environ`,
panel de Easypanel) **no entrega una credencial usable**: mandar el hash como
clave **no entra** (el server hashea lo que recibe) y, con salt + 210000
iteraciones, crackearlo offline tampoco es barato.

Generá el hash con la herramienta local (nunca imprime la clave):

```bash
node server/hash-key.mjs "tu-clave-admin-nueva"     # o sin argumento: la pide por stdin (sin eco)
# imprime:  ADMIN_KEY_HASH=pbkdf2_sha256$210000$<saltB64>$<hashB64>
```

Pegá esa línea en **Easypanel → Environment** y **borrá** cualquier `ADMIN_KEY`
en claro (la precedencia hace ganar al hash, pero la clave en claro sigue siendo
legible en el host hasta que se borre: el server lo advierte al arrancar).

- **Precedencia:** si hay `ADMIN_KEY_HASH`, se usa **solo** el hash.
- **Fail closed:** sin hash y sin `ADMIN_KEY` no vacía, el modo admin queda
  **deshabilitado** (una variable vacía **no** abre el admin; antes sí).
- **El camino en claro existe solo como fallback de código** (dev local y los
  tests de protocolo, que corren con `ADMIN_KEY: 'test-key'`); en **producción se
  cierra por configuración**: se borra `ADMIN_KEY` y se deja **solo**
  `ADMIN_KEY_HASH`, con lo que no queda ninguna clave en claro en el host.

> **Rotá la clave si estuvo expuesta.** El hash no des-expone nada: si la clave
> vieja estuvo en claro en el host, hay que **cambiarla** (paso operativo, no de código).

## 🧪 Tests

```bash
cd server && npm test
```

- **Estáticos** (`test/static.mjs`): sintaxis cliente/servidor, tiles del
  atlas, winding de caras, inventario y hotbar.
- **Protocolo** (`test/protocol.mjs`): levanta el server de verdad y
  verifica welcome, movimiento, bloques, daño PvP, muerte, chat y admin key.
- **Admin / hash** (`test/admin-hash.mjs`): verificación PBKDF2, formato
  autodescriptivo, anti pass-the-hash, precedencia hash-vs-claro, fail-closed,
  limitador del KDF (token bucket + concurrencia) y el e2e WS del cableado
  (incluido el flood del KDF y el no-bloqueo del event loop).
- **Bot cazador** (`test/bot-cazador.mjs`): levanta el server de verdad y cablea el
  bot con clientes falsos — mata a un no-admin con **dos toques separados** (el
  cliente falso emula la ventana de 0.6 s, así un burst no pasa), ignora admins,
  `sigueme`/`espera`, seguridad por id (impostor con el nombre del admin),
  invulnerabilidad, velocidad doble, reconexión, cero `edit` y `skin:'robot'`.

El workflow **CI** los corre en cada push/PR a `main`.

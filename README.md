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
├── Dockerfile            ← imagen para Easypanel / VPS
├── docker-compose.yml    ← correr local con persistencia
├── .dockerignore
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
incógnito, con nombres distintos. Clave admin por defecto:
`minicraft-admin-2026` (cambiala con `ADMIN_KEY`).

## 🐳 Docker

```bash
# build + run (puerto 3000, mundo persistido en volumen)
docker compose up --build -d
# ver logs
docker compose logs -f
# parar
docker compose down
```

Variables: `ADMIN_KEY` (recomendado cambiarla), `PORT`.

## ☁️ Deploy en Easypanel (VPS)

1. Subí este repo a GitHub (ya está) y conectalo en Easypanel:
   **New → App → From GitHub → MiniCraft**.
2. En **Build**, elegí **Dockerfile** (usa el de la raíz).
3. En **Environment**, agregá:
   - `ADMIN_KEY` = una clave larga solo para vos
   - (opcional) `PORT` = `3000`
4. En **Domains/Ports**, exponé el puerto **`3000`**.
5. En **Volumes**, montá un volumen en **`/data`**
   (ahí vive `world.json`, así no perdés el mundo en cada deploy).
6. Deploy ▶️ — tus amigos entran a `http://TU_IP:3000`.

### 🔄 Deploy automático (push a main → se actualiza solo)

1. Pusheá a `main`: corre el workflow **CI** (tests estáticos + protocolo).
2. Si pasa ✅, el workflow **Deploy** llama al deploy webhook de Easypanel.
3. Para activarlo: en Easypanel copiá la **Deploy Webhook URL** de la app
   y guardala en GitHub → repo **Settings → Secrets and variables →
   Actions** → secret `EASYPANEL_WEBHOOK`.
4. Sin ese secret el deploy se omite (no falla) y desplegás a mano.

> El juego carga Three.js desde CDN: los jugadores necesitan internet,
> pero tu VPS no necesita nada especial.

## 🎮 Controles

| Tecla | Acción |
|---|---|
| `W A S D` + mouse | Moverse y mirar |
| Click izq. | Romper / pegar (mantener para picar en modo jugador) |
| Click der. | Poner bloque · acariciar 🐷🐑 · espada ⚔️ ataca |
| `E` / `Enter` | Inventario / chat |
| `F` | Volar (solo admin) |

## 🔑 Variables de entorno (server)

| Var | Default | Qué hace |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP + WebSocket |
| `ADMIN_KEY` | `minicraft-admin-2026` | Clave del modo admin (**cambiala en producción**) |
| `MINICRAFT_DIR` | `..` (local) / `/app` (docker) | De dónde servir `index.html` |
| `WORLD_FILE` | `server/world.json` (local) / `/data/world.json` (docker) | Dónde persistir el mundo |

## 🧪 Tests

```bash
cd server && npm test
```

- **Estáticos** (`test/static.mjs`): sintaxis cliente/servidor, tiles del
  atlas, winding de caras, inventario y hotbar.
- **Protocolo** (`test/protocol.mjs`): levanta el server de verdad y
  verifica welcome, movimiento, bloques, daño PvP, muerte, chat y admin key.

El workflow **CI** los corre en cada push/PR a `main`.

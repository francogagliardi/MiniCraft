# ⛏ Minicraft — Servidor multijugador (VPS)

Servidorcito en Node.js que sirve el juego (`index.html`) y sincroniza
jugadores por WebSocket: posiciones, bloques, daño PvP y chat.

## Estructura

```
Minicraft/
├── index.html        ← el juego (se sirve tal cual)
└── server/
    ├── package.json
    ├── server.js     ← este servidor
    ├── world.json    ← se crea solo (mundo persistido)
    └── README.md
```

## Probarlo en tu PC

```bash
cd server
npm install
node server.js
```

Abrí http://localhost:3000 en tu navegador (y otro en incógnito
para probar 2 jugadores).

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
PORT=3000 ADMIN_KEY=tu-clave-secreta node server.js

# 4b. Correr persistente con pm2 (recomendado)
sudo npm i -g pm2
PORT=3000 ADMIN_KEY=tu-clave-secreta pm2 start server.js --name minicraft
pm2 save
pm2 startup   # seguir la instrucción que imprime
```

Tus amigos entran a **`http://TU_IP:3000`** y listo.
No hace falta build ni base de datos.

## Firewall / puertos

```bash
sudo ufw allow 3000/tcp
```

Si usás un proveedor con panel (AWS, DigitalOcean, etc.), abrí el
puerto 3000 ahí también. Si hay router con NAT, redirigí el puerto.

## Variables de entorno

| Var         | Default | Qué hace                                    |
|-------------|---------|---------------------------------------------|
| `PORT`      | 3000    | Puerto HTTP+WebSocket                        |
| `ADMIN_KEY` | `minicraft-admin-2026` | Clave modo admin. **Cambiala en tu VPS** |
| `MINICRAFT_DIR` | `..` | Carpeta de donde servir `index.html`        |
| `WORLD_FILE` | `server/world.json` | Dónde persistir el mundo (en Docker: `/data/world.json`) |

> La clave admin por defecto es **`minicraft-admin-2026`**.
> En tu VPS corré con tu propia clave:
> `ADMIN_KEY=una-clave-larga-y-secreta node server.js`

## Probar multijugador en tu PC (2 jugadores)

```bash
cd server
npm install   # solo la primera vez
node server.js
```

1. Abrí **http://localhost:3000** en tu navegador → poné nombre
   (ej: `Franco`) → **🌱 JUGAR**.
2. Abrí una **ventana de incógnito** (Ctrl+Shift+N) en la misma URL →
   otro nombre (ej: `Invitado`) → **🌱 JUGAR**.
   (Incógnito es clave: si no, ambas pestañas comparten sesión
   y es más difícil distinguirlas.)
3. Muevanse: ¡se ven mutuamente! Prueben el chat (Enter),
   romper/poner bloques (se sincroniza) y pegarse con la espada ⚔️
   (clic derecho, medio corazón).
4. Para probar el admin: en una ventana elegí **🛠 ENTRAR COMO ADMIN**
   con clave `minicraft-admin-2026` → vuela (F), pica instantáneo
   y es inmune al daño 🛡️.

## Notas

- El mundo se guarda solo en `server/world.json` cada 15 s.
  Para mundo nuevo: borrar `world.json` y reiniciar.
- El juego carga Three.js desde CDN: el VPS **no** necesita nada
  especial, pero los jugadores necesitan internet.
- Pensado para jugar entre amigos (hasta ~15 jugadores). El servidor
  confía en los clientes: no es anti-cheat.
- Jugar por `http://` en red local funciona bien. Si querés `https`
  con dominio propio, poné nginx o Caddy como reverse proxy.

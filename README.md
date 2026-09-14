# Scorched Arena

Neon, modern take on classic **Scorched Earth** artillery combat — procedural hills, destructible craters, wind, and turn-based tanks. Play solo vs AI, local hotseat (2–4), or online via Socket.IO lobby.

## Stack

- Node.js + Express + Socket.IO
- Canvas 2D client (vanilla JS)

## Run

```bash
cd /workspace/scorched-arena   # or your clone path
npm install
npm start
```

Server prefers **port 3850**, then tries the next free ports if busy.

Open: **http://localhost:3850**

On a LAN, use `http://<host-ip>:3850`.

## Controls

| Key | Action |
|-----|--------|
| ← → / A D | Barrel angle |
| ↑ ↓ / W S | Power |
| 1 / 2 / 3 | Missile / Nuke / Dirt Cluster |
| Space | Fire |
| Esc | Return to menu |

Touch/mouse: use on-screen weapon + FIRE buttons.

## Modes

1. **Single Player** — you + AI bots (total tanks 2–4; default 2).
2. **Local Multiplayer** — hotseat 2–4 humans.
3. **Online Lobby** — nickname, global chat, create/join rooms (2–4 seats), ready up, host starts; server-authoritative turns.

## Weapons

- **Missile** — standard crater + damage  
- **Nuke** — large blast radius  
- **Dirt Cluster** — adds terrain (fills craters / builds hills)

## Project layout

```
server/index.js      Express + Socket.IO lobby & sync
server/game.js       Authoritative physics / match state
public/index.html
public/css/style.css
public/js/main.js    UI wiring
public/js/game.js    Local + online game loop
public/js/lobby.js   Online lobby client
public/js/render.js  Canvas renderer
public/js/physics.js Client physics (SP / local)
```

## License

MIT

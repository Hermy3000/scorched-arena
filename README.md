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

## Settings

Open **Settings** from the main menu (or mid-game via the HUD). Values persist in `localStorage`.

| Setting | Description |
|---------|-------------|
| **Resolution** | Arena size: 800×600, 960×540, 1024×768, 1280×720, 1600×900, 1920×1080, 1920×800, 2560×1080. Terrain & physics use the active size. |
| **Wind enabled** | When off, wind is always 0. |
| **Max wind** | Clamp for random wind each turn (0–30). |
| **Pre-shot move** | Max horizontal pixels you may drive before firing (0 = disabled). Reset each turn. |

Online: the **host’s** settings are applied when they start the match (resolution, wind, move). Movement is enforced on the server.

## Controls

| Key | Action |
|-----|--------|
| ← → / A D | Barrel angle |
| ↑ ↓ / W S | Power |
| Q E (or , .) | Pre-shot tank move (if enabled) |
| 1–8 | Select weapon |
| Space | Fire |
| Esc | Return to menu |

Touch/mouse: use on-screen weapon + FIRE / Settings buttons.

## Weapons

| Key | Weapon | Effect |
|-----|--------|--------|
| 1 | **Missile** | Standard crater + damage |
| 2 | **Nuke** | Large blast radius |
| 3 | **Dirt Cluster** | Adds terrain (fills / builds hills) |
| 4 | **Bouncer** | Skips across the ground a few times, then detonates |
| 5 | **Digger** | Burrows underground, then explodes |
| 6 | **Napalm** | Impact + cluster of firelets |
| 7 | **MIRV** | Splits mid-air into multiple warheads |
| 8 | **Mega Dirt** | Large dirt deposit |

## Modes

1. **Single Player** — you + AI bots (total tanks 2–4; default 2).
2. **Local Multiplayer** — hotseat 2–4 humans.
3. **Online Lobby** — nickname, global chat, create/join rooms (2–4 seats), ready up, host starts; server-authoritative turns, weapons, move, and wind.

## Project layout

```
server/index.js      Express + Socket.IO lobby & sync
server/game.js       Authoritative physics / match state
public/index.html
public/css/style.css
public/js/main.js    UI wiring + settings panel
public/js/settings.js Resolution / wind / move persistence
public/js/game.js    Local + online game loop
public/js/lobby.js   Online lobby client
public/js/render.js  Canvas renderer
public/js/physics.js Client physics (SP / local)
```

## License

MIT

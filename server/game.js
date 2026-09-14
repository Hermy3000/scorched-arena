/**
 * Authoritative game state for online matches.
 * Deterministic-enough physics with fixed timestep.
 */

const WIDTH = 960;
const HEIGHT = 540;
const GROUND_Y = HEIGHT - 40;
const TANK_RADIUS = 14;
const GRAVITY = 0.18;
const MAX_POWER = 100;
const WEAPONS = {
  missile: { name: 'Missile', radius: 28, damage: 45, dirt: false },
  nuke: { name: 'Nuke', radius: 72, damage: 90, dirt: false },
  dirt: { name: 'Dirt Cluster', radius: 36, damage: 0, dirt: true },
};

const COLORS = ['#00f5ff', '#ff2d95', '#b8ff3c', '#ffaa00'];

function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function generateTerrain(seed, width = WIDTH, segments = 160) {
  const rand = seededRandom(seed);
  const heights = new Float32Array(segments + 1);
  let h = HEIGHT * 0.55 + rand() * 40;
  for (let i = 0; i <= segments; i++) {
    h += (rand() - 0.5) * 28;
    h = Math.max(HEIGHT * 0.35, Math.min(HEIGHT * 0.78, h));
    heights[i] = h;
  }
  // Smooth
  for (let pass = 0; pass < 4; pass++) {
    const next = new Float32Array(heights.length);
    for (let i = 0; i < heights.length; i++) {
      const a = heights[Math.max(0, i - 1)];
      const b = heights[i];
      const c = heights[Math.min(heights.length - 1, i + 1)];
      next[i] = (a + b * 2 + c) / 4;
    }
    heights.set(next);
  }
  return { heights, segments, width, height: HEIGHT };
}

function terrainY(terrain, x) {
  const t = Math.max(0, Math.min(1, x / terrain.width));
  const idx = t * terrain.segments;
  const i = Math.floor(idx);
  const f = idx - i;
  const h0 = terrain.heights[Math.min(i, terrain.segments)];
  const h1 = terrain.heights[Math.min(i + 1, terrain.segments)];
  return h0 + (h1 - h0) * f;
}

function deformTerrain(terrain, cx, cy, radius, addDirt) {
  const segW = terrain.width / terrain.segments;
  for (let i = 0; i <= terrain.segments; i++) {
    const x = i * segW;
    const dx = x - cx;
    if (Math.abs(dx) > radius) continue;
    const drop = Math.sqrt(Math.max(0, radius * radius - dx * dx));
    if (addDirt) {
      terrain.heights[i] = Math.max(80, terrain.heights[i] - drop * 0.85);
    } else {
      terrain.heights[i] = Math.min(terrain.height - 20, terrain.heights[i] + drop * 0.95);
    }
  }
  // light smooth around crater
  for (let pass = 0; pass < 2; pass++) {
    const next = terrain.heights.slice();
    for (let i = 1; i < terrain.segments; i++) {
      const x = i * segW;
      if (Math.abs(x - cx) > radius * 1.4) continue;
      next[i] = (terrain.heights[i - 1] + terrain.heights[i] * 2 + terrain.heights[i + 1]) / 4;
    }
    terrain.heights.set(next);
  }
}

function placeTanks(terrain, count) {
  const tanks = [];
  const margin = 60;
  const usable = terrain.width - margin * 2;
  for (let i = 0; i < count; i++) {
    const x = margin + (usable * (i + 0.5)) / count + (i - (count - 1) / 2) * 8;
    const y = terrainY(terrain, x) - TANK_RADIUS;
    tanks.push({
      id: i,
      x,
      y,
      angle: i < count / 2 ? -0.6 : Math.PI + 0.6,
      power: 50,
      hp: 100,
      alive: true,
      color: COLORS[i % COLORS.length],
      weapon: 'missile',
      name: `Player ${i + 1}`,
      isAI: false,
      socketId: null,
    });
  }
  return tanks;
}

function settleTank(terrain, tank) {
  if (!tank.alive) return;
  const ground = terrainY(terrain, tank.x);
  tank.y = ground - TANK_RADIUS;
  if (tank.y > terrain.height + 40) {
    tank.alive = false;
    tank.hp = 0;
  }
}

function createProjectile(tank, weaponKey) {
  const w = WEAPONS[weaponKey] || WEAPONS.missile;
  const power = (tank.power / MAX_POWER) * 14 + 2;
  return {
    x: tank.x + Math.cos(tank.angle) * (TANK_RADIUS + 6),
    y: tank.y + Math.sin(tank.angle) * (TANK_RADIUS + 6),
    vx: Math.cos(tank.angle) * power,
    vy: Math.sin(tank.angle) * power,
    weapon: weaponKey,
    ownerId: tank.id,
    radius: w.radius,
    damage: w.damage,
    dirt: w.dirt,
    alive: true,
    trail: [],
  };
}

function stepProjectile(proj, wind, terrain) {
  if (!proj.alive) return null;
  proj.trail.push({ x: proj.x, y: proj.y });
  if (proj.trail.length > 24) proj.trail.shift();
  proj.vx += wind * 0.012;
  proj.vy += GRAVITY;
  proj.x += proj.vx;
  proj.y += proj.vy;

  if (proj.x < -20 || proj.x > terrain.width + 20 || proj.y > terrain.height + 80) {
    proj.alive = false;
    return { type: 'miss', x: proj.x, y: proj.y };
  }
  const ground = terrainY(terrain, proj.x);
  if (proj.y >= ground) {
    proj.alive = false;
    proj.y = ground;
    return { type: 'impact', x: proj.x, y: proj.y, weapon: proj.weapon, ownerId: proj.ownerId, radius: proj.radius, damage: proj.damage, dirt: proj.dirt };
  }
  return null;
}

function applyImpact(state, impact) {
  deformTerrain(state.terrain, impact.x, impact.y, impact.radius, impact.dirt);
  const hits = [];
  for (const tank of state.tanks) {
    if (!tank.alive) continue;
    const dx = tank.x - impact.x;
    const dy = tank.y - impact.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (!impact.dirt && dist < impact.radius + TANK_RADIUS) {
      const falloff = 1 - dist / (impact.radius + TANK_RADIUS);
      const dmg = Math.round(impact.damage * (0.35 + 0.65 * falloff));
      tank.hp = Math.max(0, tank.hp - dmg);
      hits.push({ id: tank.id, damage: dmg, hp: tank.hp });
      if (tank.hp <= 0) tank.alive = false;
    }
    settleTank(state.terrain, tank);
  }
  // falling check after settle
  for (const tank of state.tanks) {
    if (tank.alive && tank.y > state.terrain.height - 10) {
      tank.alive = false;
      tank.hp = 0;
    }
  }
  return hits;
}

function livingTanks(state) {
  return state.tanks.filter((t) => t.alive);
}

function nextTurn(state) {
  const living = livingTanks(state);
  if (living.length <= 1) {
    state.phase = 'ended';
    state.winnerId = living.length === 1 ? living[0].id : null;
    state.projectile = null;
    return;
  }
  let next = (state.currentTurn + 1) % state.tanks.length;
  let guard = 0;
  while (!state.tanks[next].alive && guard < state.tanks.length) {
    next = (next + 1) % state.tanks.length;
    guard++;
  }
  state.currentTurn = next;
  state.phase = 'aiming';
  state.projectile = null;
  state.wind = Math.round((Math.random() * 2 - 1) * 10); // -10..10
}

function createMatch({ seed, players, roomId }) {
  const count = players.length;
  const terrain = generateTerrain(seed || Date.now());
  const tanks = placeTanks(terrain, count);
  players.forEach((p, i) => {
    tanks[i].name = p.nickname || `Player ${i + 1}`;
    tanks[i].socketId = p.socketId || null;
    tanks[i].isAI = !!p.isAI;
  });
  return {
    roomId,
    seed,
    terrain,
    tanks,
    currentTurn: 0,
    phase: 'aiming', // aiming | flying | ended
    wind: Math.round((Math.random() * 2 - 1) * 10),
    projectile: null,
    particles: [],
    shake: 0,
    tick: 0,
    width: WIDTH,
    height: HEIGHT,
  };
}

function serializeTerrain(terrain) {
  return {
    heights: Array.from(terrain.heights),
    segments: terrain.segments,
    width: terrain.width,
    height: terrain.height,
  };
}

function publicState(state) {
  return {
    roomId: state.roomId,
    seed: state.seed,
    terrain: serializeTerrain(state.terrain),
    tanks: state.tanks.map((t) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      angle: t.angle,
      power: t.power,
      hp: t.hp,
      alive: t.alive,
      color: t.color,
      weapon: t.weapon,
      name: t.name,
      isAI: t.isAI,
    })),
    currentTurn: state.currentTurn,
    phase: state.phase,
    wind: state.wind,
    projectile: state.projectile
      ? {
          x: state.projectile.x,
          y: state.projectile.y,
          vx: state.projectile.vx,
          vy: state.projectile.vy,
          weapon: state.projectile.weapon,
          ownerId: state.projectile.ownerId,
          trail: state.projectile.trail.slice(-12),
        }
      : null,
    shake: state.shake,
    tick: state.tick,
    winnerId: state.winnerId ?? null,
    width: state.width,
    height: state.height,
  };
}

function fire(state, tankId, { angle, power, weapon }) {
  if (state.phase !== 'aiming') return { ok: false, error: 'Not aiming phase' };
  const tank = state.tanks[tankId];
  if (!tank || !tank.alive || state.currentTurn !== tankId) {
    return { ok: false, error: 'Not your turn' };
  }
  tank.angle = angle;
  tank.power = Math.max(5, Math.min(MAX_POWER, power));
  tank.weapon = WEAPONS[weapon] ? weapon : 'missile';
  state.projectile = createProjectile(tank, tank.weapon);
  state.phase = 'flying';
  return { ok: true };
}

function simulateFlight(state, maxSteps = 600) {
  const events = [];
  if (!state.projectile || state.phase !== 'flying') return events;
  for (let i = 0; i < maxSteps; i++) {
    state.tick++;
    const hit = stepProjectile(state.projectile, state.wind, state.terrain);
    if (hit) {
      if (hit.type === 'impact') {
        const hits = applyImpact(state, hit);
        state.shake = hit.dirt ? 4 : Math.min(18, hit.radius / 4);
        events.push({ type: 'impact', ...hit, hits });
      } else {
        events.push({ type: 'miss', x: hit.x, y: hit.y });
      }
      state.projectile = null;
      nextTurn(state);
      events.push({ type: 'turn', currentTurn: state.currentTurn, phase: state.phase, wind: state.wind, winnerId: state.winnerId ?? null });
      break;
    }
  }
  if (state.shake > 0) state.shake *= 0.85;
  return events;
}

module.exports = {
  WIDTH,
  HEIGHT,
  WEAPONS,
  COLORS,
  generateTerrain,
  terrainY,
  deformTerrain,
  placeTanks,
  createMatch,
  publicState,
  fire,
  simulateFlight,
  createProjectile,
  stepProjectile,
  applyImpact,
  nextTurn,
  settleTank,
  livingTanks,
  GRAVITY,
  MAX_POWER,
  TANK_RADIUS,
};

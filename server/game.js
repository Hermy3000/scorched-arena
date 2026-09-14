const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 540;
const TANK_RADIUS = 14;
const GRAVITY = 0.18;
const MAX_POWER = 100;
const WEAPONS = {
  missile: { name: 'Missile', radius: 28, damage: 45, dirt: false },
  nuke: { name: 'Nuke', radius: 72, damage: 90, dirt: false },
  dirt: { name: 'Dirt Cluster', radius: 36, damage: 0, dirt: true },
  bounce: { name: 'Bouncer', radius: 32, damage: 40, dirt: false, bounces: 3 },
  digger: { name: 'Digger', radius: 40, damage: 55, dirt: false, dig: true },
  napalm: { name: 'Napalm', radius: 20, damage: 22, dirt: false, cluster: true },
  mirv: { name: 'MIRV', radius: 24, damage: 28, dirt: false, split: true },
  megadirt: { name: 'Mega Dirt', radius: 70, damage: 0, dirt: true },
};
const COLORS = ['#00f5ff', '#ff2d95', '#b8ff3c', '#ffaa00'];
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function generateTerrain(seed, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, segments) {
  const rand = seededRandom(seed);
  const segs = segments || Math.max(120, Math.round(width / 6));
  const heights = new Float32Array(segs + 1);
  let h = height * 0.55 + rand() * 40;
  for (let i = 0; i <= segs; i++) {
    h += (rand() - 0.5) * 28;
    h = Math.max(height * 0.35, Math.min(height * 0.78, h));
    heights[i] = h;
  }
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
  return { heights, segments: segs, width, height };
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
    if (addDirt) terrain.heights[i] = Math.max(80, terrain.heights[i] - drop * 0.85);
    else terrain.heights[i] = Math.min(terrain.height - 20, terrain.heights[i] + drop * 0.95);
  }
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
      id: i, x, y, angle: i < count / 2 ? -0.6 : Math.PI + 0.6, power: 50, hp: 100, alive: true,
      color: COLORS[i % COLORS.length], weapon: 'missile', name: `Player ${i + 1}`, isAI: false, socketId: null, turnOriginX: x,
    });
  }
  return tanks;
}
function settleTank(terrain, tank) {
  if (!tank.alive) return;
  tank.y = terrainY(terrain, tank.x) - TANK_RADIUS;
  if (tank.y > terrain.height + 40) { tank.alive = false; tank.hp = 0; }
}
function rollWind(opts) {
  const o = opts || {};
  if (o.windEnabled === false) return 0;
  const max = Math.max(0, Number(o.maxWind != null ? o.maxWind : 10));
  if (max <= 0) return 0;
  return Math.round((Math.random() * 2 - 1) * max);
}
function beginTurnMove(tank) { if (!tank) return; tank.turnOriginX = tank.x; }
function moveTank(state, tankId, dx) {
  if (state.phase !== 'aiming') return { ok: false, error: 'Not aiming phase' };
  const tank = state.tanks[tankId];
  if (!tank || !tank.alive || state.currentTurn !== tankId) return { ok: false, error: 'Not your turn' };
  const maxMove = state.moveDistance || 0;
  if (maxMove <= 0) return { ok: false, error: 'Movement disabled' };
  const origin = tank.turnOriginX != null ? tank.turnOriginX : tank.x;
  let nx = tank.x + (Number(dx) || 0);
  if (Math.abs(nx - origin) > maxMove) nx = origin + (nx >= origin ? 1 : -1) * maxMove;
  nx = Math.max(TANK_RADIUS + 8, Math.min(state.width - TANK_RADIUS - 8, nx));
  tank.x = nx; settleTank(state.terrain, tank); return { ok: true };
}
function createProjectile(tank, weaponKey) {
  const key = weaponKey || tank.weapon;
  const w = WEAPONS[key] || WEAPONS.missile;
  const power = (tank.power / MAX_POWER) * 14 + 2;
  return {
    x: tank.x + Math.cos(tank.angle) * (TANK_RADIUS + 6), y: tank.y + Math.sin(tank.angle) * (TANK_RADIUS + 6),
    vx: Math.cos(tank.angle) * power, vy: Math.sin(tank.angle) * power, weapon: key, ownerId: tank.id,
    radius: w.radius, damage: w.damage, dirt: !!w.dirt, alive: true, trail: [],
    bouncesLeft: w.bounces || 0, digging: false, digFrames: 0, splitDone: false, isSub: false,
  };
}
function makeSubProjectile(parent, angleOffset, speedScale, weapon, radius, damage) {
  const speed = Math.sqrt(parent.vx * parent.vx + parent.vy * parent.vy) * speedScale;
  const ang = Math.atan2(parent.vy, parent.vx) + angleOffset;
  return {
    x: parent.x, y: parent.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
    weapon: weapon || parent.weapon, ownerId: parent.ownerId,
    radius: radius != null ? radius : parent.radius * 0.7,
    damage: damage != null ? damage : Math.round(parent.damage * 0.7),
    dirt: false, alive: true, trail: [], bouncesLeft: 0, digging: false, digFrames: 0, splitDone: true, isSub: true,
  };
}
function stepProjectile(proj, wind, terrain, spawnQueue) {
  if (!proj.alive) return null;
  proj.trail.push({ x: proj.x, y: proj.y });
  if (proj.trail.length > 24) proj.trail.shift();
  const wdef = WEAPONS[proj.weapon] || {};
  if (wdef.split && !proj.splitDone && !proj.isSub && proj.vy > 0.5) {
    proj.splitDone = true; proj.alive = false;
    if (spawnQueue) for (let i = -2; i <= 2; i++) spawnQueue.push(makeSubProjectile(proj, i * 0.22, 0.85, 'missile', 22, 26));
    return { type: 'split', x: proj.x, y: proj.y };
  }
  proj.vx += wind * 0.012; proj.vy += GRAVITY;
  if (proj.digging) {
    proj.digFrames--; proj.x += proj.vx * 0.35; proj.y += Math.max(0.8, Math.abs(proj.vy) * 0.25);
    if (proj.digFrames <= 0) {
      proj.alive = false;
      return { type: 'impact', x: proj.x, y: proj.y, weapon: proj.weapon, ownerId: proj.ownerId, radius: proj.radius, damage: proj.damage, dirt: false };
    }
    return null;
  }
  proj.x += proj.vx; proj.y += proj.vy;
  if (proj.x < -20 || proj.x > terrain.width + 20 || proj.y > terrain.height + 80) {
    proj.alive = false; return { type: 'miss', x: proj.x, y: proj.y };
  }
  const ground = terrainY(terrain, proj.x);
  if (proj.y >= ground) {
    if (proj.bouncesLeft > 0) {
      proj.y = ground - 1; proj.vy = -Math.abs(proj.vy) * 0.72; proj.vx *= 0.88; proj.bouncesLeft--;
      if (Math.abs(proj.vy) < 1.2) proj.bouncesLeft = 0; else return null;
    }
    if (wdef.dig && !proj.isSub) { proj.digging = true; proj.digFrames = 22; proj.y = ground + 2; return null; }
    proj.alive = false; proj.y = ground;
    if (wdef.cluster && !proj.isSub && spawnQueue) {
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (i - 2) * 0.28; const sp = 2.5 + Math.random() * 2;
        spawnQueue.push({ x: proj.x + (i - 2) * 8, y: ground - 4, vx: Math.cos(ang) * sp + (Math.random() - 0.5),
          vy: -Math.abs(Math.sin(ang) * sp) - 1.5, weapon: 'napalm', ownerId: proj.ownerId, radius: 16, damage: 18,
          dirt: false, alive: true, trail: [], bouncesLeft: 0, digging: false, digFrames: 0, splitDone: true, isSub: true });
      }
      return { type: 'impact', x: proj.x, y: proj.y, weapon: proj.weapon, ownerId: proj.ownerId, radius: Math.round(proj.radius * 0.6), damage: Math.round(proj.damage * 0.5), dirt: false };
    }
    return { type: 'impact', x: proj.x, y: proj.y, weapon: proj.weapon, ownerId: proj.ownerId, radius: proj.radius, damage: proj.damage, dirt: proj.dirt };
  }
  return null;
}
function applyImpact(state, impact) {
  deformTerrain(state.terrain, impact.x, impact.y, impact.radius, impact.dirt);
  const hits = [];
  for (const tank of state.tanks) {
    if (!tank.alive) continue;
    const dx = tank.x - impact.x, dy = tank.y - impact.y, dist = Math.sqrt(dx * dx + dy * dy);
    if (!impact.dirt && dist < impact.radius + TANK_RADIUS) {
      const falloff = 1 - dist / (impact.radius + TANK_RADIUS);
      const dmg = Math.round(impact.damage * (0.35 + 0.65 * falloff));
      tank.hp = Math.max(0, tank.hp - dmg); hits.push({ id: tank.id, damage: dmg, hp: tank.hp });
      if (tank.hp <= 0) tank.alive = false;
    }
    settleTank(state.terrain, tank);
  }
  for (const tank of state.tanks) if (tank.alive && tank.y > state.terrain.height - 10) { tank.alive = false; tank.hp = 0; }
  return hits;
}
function livingTanks(state) { return state.tanks.filter((t) => t.alive); }
function nextTurn(state) {
  const living = livingTanks(state);
  if (living.length <= 1) {
    state.phase = 'ended'; state.winnerId = living.length === 1 ? living[0].id : null;
    state.projectile = null; state.projectiles = []; return;
  }
  let next = (state.currentTurn + 1) % state.tanks.length, guard = 0;
  while (!state.tanks[next].alive && guard < state.tanks.length) { next = (next + 1) % state.tanks.length; guard++; }
  state.currentTurn = next; state.phase = 'aiming'; state.projectile = null; state.projectiles = [];
  state.wind = rollWind({ windEnabled: state.windEnabled, maxWind: state.maxWind });
  beginTurnMove(state.tanks[next]);
}
function createMatch({ seed, players, roomId, options }) {
  const opts = options || {};
  const width = opts.width || DEFAULT_WIDTH, height = opts.height || DEFAULT_HEIGHT;
  const terrain = generateTerrain(seed || Date.now(), width, height);
  const tanks = placeTanks(terrain, players.length);
  players.forEach((p, i) => { tanks[i].name = p.nickname || `Player ${i + 1}`; tanks[i].socketId = p.socketId || null; tanks[i].isAI = !!p.isAI; });
  beginTurnMove(tanks[0]);
  const windEnabled = opts.windEnabled !== false;
  const maxWind = opts.maxWind != null ? Number(opts.maxWind) : 10;
  const moveDistance = opts.moveDistance != null ? Number(opts.moveDistance) : 50;
  return {
    roomId, seed, terrain, tanks, currentTurn: 0, phase: 'aiming',
    wind: rollWind({ windEnabled, maxWind }), windEnabled, maxWind, moveDistance,
    projectile: null, projectiles: [], particles: [], shake: 0, tick: 0, width, height,
  };
}
function serializeTerrain(terrain) {
  return { heights: Array.from(terrain.heights), segments: terrain.segments, width: terrain.width, height: terrain.height };
}
function serializeProjectile(p) {
  if (!p) return null;
  return {
    x: p.x, y: p.y, vx: p.vx, vy: p.vy, weapon: p.weapon, ownerId: p.ownerId, radius: p.radius, damage: p.damage,
    dirt: p.dirt, alive: p.alive, bouncesLeft: p.bouncesLeft, digging: p.digging, digFrames: p.digFrames,
    splitDone: p.splitDone, isSub: p.isSub, trail: (p.trail || []).slice(-12),
  };
}
function publicState(state) {
  const projectiles = (state.projectiles || []).filter((p) => p.alive).map(serializeProjectile);
  return {
    roomId: state.roomId, seed: state.seed, terrain: serializeTerrain(state.terrain),
    tanks: state.tanks.map((t) => ({
      id: t.id, x: t.x, y: t.y, angle: t.angle, power: t.power, hp: t.hp, alive: t.alive,
      color: t.color, weapon: t.weapon, name: t.name, isAI: t.isAI, turnOriginX: t.turnOriginX,
    })),
    currentTurn: state.currentTurn, phase: state.phase, wind: state.wind, windEnabled: state.windEnabled,
    maxWind: state.maxWind, moveDistance: state.moveDistance, projectile: projectiles[0] || null, projectiles,
    shake: state.shake, tick: state.tick, winnerId: state.winnerId ?? null, width: state.width, height: state.height,
  };
}
function fire(state, tankId, { angle, power, weapon }) {
  if (state.phase !== 'aiming') return { ok: false, error: 'Not aiming phase' };
  const tank = state.tanks[tankId];
  if (!tank || !tank.alive || state.currentTurn !== tankId) return { ok: false, error: 'Not your turn' };
  tank.angle = angle; tank.power = Math.max(5, Math.min(MAX_POWER, power));
  tank.weapon = WEAPONS[weapon] ? weapon : 'missile';
  const proj = createProjectile(tank, tank.weapon);
  state.projectiles = [proj]; state.projectile = proj; state.phase = 'flying';
  return { ok: true };
}
function simulateFlight(state, maxSteps = 600) {
  const events = [];
  if (state.phase !== 'flying') return events;
  if (!state.projectiles) state.projectiles = [];
  if (state.projectile && !state.projectiles.includes(state.projectile)) state.projectiles.push(state.projectile);
  for (let i = 0; i < maxSteps; i++) {
    state.tick++;
    const spawnQueue = [], impacts = [];
    for (const proj of state.projectiles) {
      if (!proj.alive) continue;
      const hit = stepProjectile(proj, state.wind, state.terrain, spawnQueue);
      if (hit && hit.type === 'impact') {
        const hits = applyImpact(state, hit);
        state.shake = hit.dirt ? 4 : Math.min(18, hit.radius / 4);
        impacts.push({ type: 'impact', ...hit, hits });
      } else if (hit && hit.type === 'miss') events.push({ type: 'miss', x: hit.x, y: hit.y });
    }
    for (const s of spawnQueue) state.projectiles.push(s);
    for (const imp of impacts) events.push(imp);
    state.projectiles = state.projectiles.filter((p) => p.alive);
    state.projectile = state.projectiles[0] || null;
    if (state.projectiles.length === 0) {
      nextTurn(state);
      events.push({ type: 'turn', currentTurn: state.currentTurn, phase: state.phase, wind: state.wind, winnerId: state.winnerId ?? null });
      break;
    }
  }
  if (state.shake > 0) state.shake *= 0.85;
  return events;
}
module.exports = {
  WIDTH: DEFAULT_WIDTH, HEIGHT: DEFAULT_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT, WEAPONS, COLORS,
  generateTerrain, terrainY, deformTerrain, placeTanks, createMatch, publicState, fire, simulateFlight,
  createProjectile, stepProjectile, applyImpact, nextTurn, settleTank, livingTanks, moveTank, rollWind,
  beginTurnMove, GRAVITY, MAX_POWER, TANK_RADIUS,
};

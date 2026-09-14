/**
 * Client-side physics (single-player / local). Mirrors server/game.js.
 */
window.Physics = (function () {
  const WIDTH = 960;
  const HEIGHT = 540;
  const TANK_RADIUS = 14;
  const GRAVITY = 0.18;
  const MAX_POWER = 100;
  const WEAPONS = {
    missile: { name: 'Missile', radius: 28, damage: 45, dirt: false, key: '1' },
    nuke: { name: 'Nuke', radius: 72, damage: 90, dirt: false, key: '2' },
    dirt: { name: 'Dirt Cluster', radius: 36, damage: 0, dirt: true, key: '3' },
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

  function placeTanks(terrain, count, names, aiFlags) {
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
        angle: i < count / 2 ? -0.55 : Math.PI + 0.55,
        power: 50,
        hp: 100,
        alive: true,
        color: COLORS[i % COLORS.length],
        weapon: 'missile',
        name: (names && names[i]) || (aiFlags && aiFlags[i] ? `Bot ${i}` : `Player ${i + 1}`),
        isAI: !!(aiFlags && aiFlags[i]),
      });
    }
    return tanks;
  }

  function settleTank(terrain, tank) {
    if (!tank.alive) return;
    tank.y = terrainY(terrain, tank.x) - TANK_RADIUS;
    if (tank.y > terrain.height + 40) {
      tank.alive = false;
      tank.hp = 0;
    }
  }

  function createProjectile(tank) {
    const w = WEAPONS[tank.weapon] || WEAPONS.missile;
    const power = (tank.power / MAX_POWER) * 14 + 2;
    return {
      x: tank.x + Math.cos(tank.angle) * (TANK_RADIUS + 6),
      y: tank.y + Math.sin(tank.angle) * (TANK_RADIUS + 6),
      vx: Math.cos(tank.angle) * power,
      vy: Math.sin(tank.angle) * power,
      weapon: tank.weapon,
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
      return {
        type: 'impact',
        x: proj.x,
        y: proj.y,
        weapon: proj.weapon,
        ownerId: proj.ownerId,
        radius: proj.radius,
        damage: proj.damage,
        dirt: proj.dirt,
      };
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
    for (const tank of state.tanks) {
      if (tank.alive && tank.y > state.terrain.height - 10) {
        tank.alive = false;
        tank.hp = 0;
      }
    }
    return hits;
  }

  function living(state) {
    return state.tanks.filter((t) => t.alive);
  }

  function nextTurn(state) {
    const alive = living(state);
    if (alive.length <= 1) {
      state.phase = 'ended';
      state.winnerId = alive.length === 1 ? alive[0].id : null;
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
    state.wind = Math.round((Math.random() * 2 - 1) * 10);
  }

  function createLocalMatch({ count, humanCount, seed, names }) {
    const terrain = generateTerrain(seed || (Date.now() & 0xffffffff));
    const aiFlags = [];
    for (let i = 0; i < count; i++) aiFlags.push(i >= humanCount);
    const tanks = placeTanks(terrain, count, names, aiFlags);
    return {
      terrain,
      tanks,
      currentTurn: 0,
      phase: 'aiming',
      wind: Math.round((Math.random() * 2 - 1) * 10),
      projectile: null,
      particles: [],
      shake: 0,
      width: WIDTH,
      height: HEIGHT,
      winnerId: null,
      mode: 'local',
    };
  }

  /** Simple AI: aim toward nearest enemy with noisy power */
  function aiDecide(state, tank) {
    const enemies = state.tanks.filter((t) => t.alive && t.id !== tank.id);
    if (!enemies.length) return;
    let best = enemies[0];
    let bestD = Infinity;
    for (const e of enemies) {
      const d = Math.abs(e.x - tank.x);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    const dx = best.x - tank.x;
    const dy = best.y - tank.y - 40;
    let angle = Math.atan2(dy, dx);
    // prefer lob
    if (dx > 0) angle = -0.4 - Math.random() * 0.5;
    else angle = Math.PI + 0.4 + Math.random() * 0.5;
    const dist = Math.abs(dx);
    let power = 35 + dist / 12 + (Math.random() - 0.5) * 15;
    power = Math.max(20, Math.min(95, power));
    const weapons = ['missile', 'missile', 'missile', 'nuke', 'dirt'];
    tank.weapon = weapons[Math.floor(Math.random() * weapons.length)];
    tank.angle = angle;
    tank.power = power;
  }

  function spawnParticles(state, x, y, color, count, dirt) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * (dirt ? 3 : 6);
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 2,
        life: 30 + Math.random() * 30,
        max: 60,
        color: dirt ? '#6b4a2e' : color || '#ffaa44',
        size: dirt ? 2 + Math.random() * 3 : 2 + Math.random() * 4,
      });
    }
  }

  function updateParticles(state) {
    for (const p of state.particles) {
      p.vy += 0.12;
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  return {
    WIDTH,
    HEIGHT,
    TANK_RADIUS,
    GRAVITY,
    MAX_POWER,
    WEAPONS,
    COLORS,
    generateTerrain,
    terrainY,
    deformTerrain,
    placeTanks,
    settleTank,
    createProjectile,
    stepProjectile,
    applyImpact,
    living,
    nextTurn,
    createLocalMatch,
    aiDecide,
    spawnParticles,
    updateParticles,
  };
})();

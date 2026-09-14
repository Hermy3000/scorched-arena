window.Render = (function () {
  const P = () => window.Physics;

  let stars = null;

  function ensureStars(w, h) {
    if (stars && stars.w === w) return;
    stars = { w, h, pts: [] };
    for (let i = 0; i < 120; i++) {
      stars.pts.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.7,
        r: Math.random() * 1.6 + 0.3,
        a: 0.3 + Math.random() * 0.7,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  function drawSky(ctx, w, h, t) {
    ensureStars(w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#050816');
    g.addColorStop(0.45, '#0c1638');
    g.addColorStop(0.75, '#1a1040');
    g.addColorStop(1, '#2a1830');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (const s of stars.pts) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * 0.002 + s.tw);
      ctx.globalAlpha = s.a * twinkle;
      ctx.fillStyle = '#e8f0ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // distant moons
    ctx.beginPath();
    ctx.fillStyle = 'rgba(200,210,255,0.15)';
    ctx.arc(w * 0.82, h * 0.18, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,200,160,0.12)';
    ctx.arc(w * 0.18, h * 0.22, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTerrain(ctx, terrain) {
    const { heights, segments, width, height } = terrain;
    const segW = width / segments;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, heights[0]);
    for (let i = 1; i <= segments; i++) {
      ctx.lineTo(i * segW, heights[i]);
    }
    ctx.lineTo(width, height);
    ctx.closePath();

    const g = ctx.createLinearGradient(0, height * 0.3, 0, height);
    g.addColorStop(0, '#3d9b5f');
    g.addColorStop(0.35, '#2a6b45');
    g.addColorStop(0.7, '#1e4030');
    g.addColorStop(1, '#121a16');
    ctx.fillStyle = g;
    ctx.fill();

    // rim glow
    ctx.strokeStyle = 'rgba(120,255,180,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, heights[0]);
    for (let i = 1; i <= segments; i++) ctx.lineTo(i * segW, heights[i]);
    ctx.stroke();
  }

  function drawWind(ctx, wind, w) {
    const cx = w / 2;
    const cy = 36;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, cx - 70, cy - 18, 140, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#9ecbff';
    ctx.font = '600 12px Orbitron, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WIND', cx, cy - 4);
    ctx.fillStyle = '#fff';
    ctx.font = '700 14px Orbitron, Segoe UI, sans-serif';
    const dir = wind === 0 ? '—' : wind > 0 ? '→' : '←';
    ctx.fillText(`${dir} ${Math.abs(wind)}`, cx, cy + 14);
    // arrow
    ctx.strokeStyle = wind >= 0 ? '#7cf0ff' : '#ff7ad9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - wind * 4, cy + 2);
    ctx.lineTo(cx + wind * 4, cy + 2);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTank(ctx, tank, isActive, showAim) {
    if (!tank.alive && tank.hp <= 0) {
      // wreck
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.translate(tank.x, tank.y);
      ctx.fillStyle = '#444';
      ctx.beginPath();
      ctx.ellipse(0, 4, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const R = P().TANK_RADIUS;
    ctx.save();
    ctx.translate(tank.x, tank.y);

    // glow
    ctx.shadowColor = tank.color;
    ctx.shadowBlur = isActive ? 22 : 12;

    // tracks
    ctx.fillStyle = '#1a1a22';
    ctx.beginPath();
    ctx.ellipse(0, R * 0.55, R * 1.15, R * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    const body = ctx.createLinearGradient(-R, -R, R, R);
    body.addColorStop(0, tank.color);
    body.addColorStop(1, '#111');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-R, 2);
    ctx.quadraticCurveTo(-R * 0.2, -R * 0.9, R * 0.85, -R * 0.15);
    ctx.lineTo(R, R * 0.35);
    ctx.quadraticCurveTo(0, R * 0.7, -R, 2);
    ctx.fill();

    // dome
    ctx.beginPath();
    ctx.fillStyle = tank.color;
    ctx.globalAlpha = 0.9;
    ctx.arc(0, -2, R * 0.45, Math.PI, 0);
    ctx.fill();
    ctx.globalAlpha = 1;

    // barrel
    ctx.shadowBlur = 8;
    ctx.strokeStyle = tank.color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(Math.cos(tank.angle) * (R + 16), Math.sin(tank.angle) * (R + 16) - 4);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.shadowBlur = 0;

    // HP bar
    const bw = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, -bw / 2, -R - 16, bw, 5, 2);
    ctx.fill();
    ctx.fillStyle = tank.hp > 40 ? '#3dff9a' : tank.hp > 20 ? '#ffcc33' : '#ff3355';
    roundRect(ctx, -bw / 2, -R - 16, (bw * tank.hp) / 100, 5, 2);
    ctx.fill();

    // name
    ctx.fillStyle = isActive ? '#fff' : 'rgba(255,255,255,0.7)';
    ctx.font = `${isActive ? '700' : '500'} 11px Orbitron, Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(tank.name, 0, -R - 22);

    if (showAim && isActive) {
      // power ghost arc
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      let x = Math.cos(tank.angle) * (R + 6);
      let y = Math.sin(tank.angle) * (R + 6) - 4;
      let vx = Math.cos(tank.angle) * ((tank.power / 100) * 14 + 2);
      let vy = Math.sin(tank.angle) * ((tank.power / 100) * 14 + 2);
      ctx.moveTo(x, y);
      for (let i = 0; i < 40; i++) {
        vx += 0; // wind preview omitted in local ghost relative
        vy += P().GRAVITY;
        x += vx;
        y += vy;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  function drawProjectile(ctx, proj) {
    if (!proj) return;
    ctx.save();
    // trail
    if (proj.trail && proj.trail.length) {
      for (let i = 0; i < proj.trail.length; i++) {
        const p = proj.trail[i];
        const a = (i + 1) / proj.trail.length;
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = proj.weapon === 'nuke' ? '#ff6644' : proj.weapon === 'dirt' ? '#c4a882' : '#7cf0ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 + a * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = proj.weapon === 'nuke' ? '#ff4400' : '#00f5ff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.weapon === 'nuke' ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles(ctx, particles) {
    for (const p of particles || []) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD(ctx, state, opts) {
    const tank = state.tanks[state.currentTurn];
    if (!tank || state.phase === 'ended') return;
    const w = state.width;
    const h = state.height;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, 12, h - 78, 280, 64, 12);
    ctx.fill();
    ctx.fillStyle = '#9ecbff';
    ctx.font = '600 11px Orbitron, Segoe UI, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`TURN: ${tank.name}`, 24, h - 56);
    ctx.fillStyle = '#fff';
    ctx.fillText(`ANGLE ${Math.round((-tank.angle * 180) / Math.PI)}°`, 24, h - 36);
    ctx.fillText(`POWER ${Math.round(tank.power)}`, 140, h - 36);
    const wpn = P().WEAPONS[tank.weapon];
    ctx.fillStyle = tank.color;
    ctx.fillText(`WEAPON: ${wpn ? wpn.name : tank.weapon}`, 24, h - 18);

    // right help
    if (opts && opts.showHelp) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, w - 210, h - 78, 198, 64, 12);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '10px Segoe UI, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('←→ angle  ↑↓ power', w - 198, h - 52);
      ctx.fillText('1/2/3 weapons  SPACE fire', w - 198, h - 34);
      ctx.fillText('Esc menu', w - 198, h - 16);
    }
    ctx.restore();
  }

  function drawEndBanner(ctx, state) {
    if (state.phase !== 'ended') return;
    const w = state.width;
    const h = state.height;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = '800 36px Orbitron, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    const winner = state.tanks.find((t) => t.id === state.winnerId);
    ctx.shadowColor = winner ? winner.color : '#fff';
    ctx.shadowBlur = 20;
    ctx.fillText(winner ? `${winner.name} WINS!` : 'DRAW', w / 2, h / 2 - 10);
    ctx.shadowBlur = 0;
    ctx.font = '500 14px Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Press Esc or click Menu to return', w / 2, h / 2 + 28);
    ctx.restore();
  }

  function frame(ctx, state, opts = {}) {
    const w = state.width || 960;
    const h = state.height || 540;
    const shake = state.shake || 0;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;

    ctx.save();
    ctx.translate(sx, sy);
    drawSky(ctx, w, h, performance.now());
    drawTerrain(ctx, state.terrain);
    drawWind(ctx, state.wind || 0, w);
    for (const tank of state.tanks) {
      const active = tank.id === state.currentTurn && state.phase === 'aiming';
      const localControl = opts.canControl !== false;
      drawTank(ctx, tank, active, active && localControl && !tank.isAI);
    }
    drawProjectile(ctx, state.projectile);
    drawParticles(ctx, state.particles);
    drawHUD(ctx, state, opts);
    drawEndBanner(ctx, state);
    ctx.restore();
  }

  /** Hydrate terrain heights from server array */
  function hydrateTerrain(t) {
    return {
      heights: t.heights instanceof Float32Array ? t.heights : Float32Array.from(t.heights),
      segments: t.segments,
      width: t.width,
      height: t.height,
    };
  }

  return { frame, hydrateTerrain, drawSky, drawTerrain };
})();

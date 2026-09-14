window.Game = (function () {
  let canvas, ctx;
  let state = null;
  let raf = null;
  let keys = {};
  let mode = 'menu';
  let onExit = null;
  let onlineSocket = null;
  let myTankId = null;
  let aiTimer = null;
  let moveAccum = 0;

  function init(c, exitCb) {
    canvas = c;
    ctx = canvas.getContext('2d');
    onExit = exitCb;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  function weaponFromDigit(code) {
    const map = {
      Digit1: 'missile', Digit2: 'nuke', Digit3: 'dirt', Digit4: 'bounce',
      Digit5: 'digger', Digit6: 'napalm', Digit7: 'mirv', Digit8: 'megadirt',
    };
    return map[code] || null;
  }

  function onKeyDown(e) {
    keys[e.code] = true;
    if (mode !== 'playing' && mode !== 'online') return;
    if (e.code === 'Escape') { e.preventDefault(); stop(); if (onExit) onExit(); return; }
    if (state && state.phase === 'ended') return;
    const tank = currentControllable();
    if (!tank || (state && state.phase !== 'aiming')) return;
    const wpn = weaponFromDigit(e.code);
    if (wpn && Physics.WEAPONS[wpn]) {
      tank.weapon = wpn; updateWeaponUI();
      if (mode === 'online' && onlineSocket) onlineSocket.emit('game:aim', { angle: tank.angle, power: tank.power, weapon: tank.weapon });
    }
    if (e.code === 'Space') { e.preventDefault(); fire(); }
  }

  function onKeyUp(e) { keys[e.code] = false; }

  function currentControllable() {
    if (!state) return null;
    const tank = state.tanks[state.currentTurn];
    if (!tank || !tank.alive) return null;
    if (mode === 'online') { if (tank.id !== myTankId) return null; return tank; }
    if (tank.isAI) return null;
    return tank;
  }

  function resizeCanvasToState() {
    if (!canvas || !state) return;
    if (canvas.width !== state.width || canvas.height !== state.height) {
      canvas.width = state.width; canvas.height = state.height;
    }
    if (window.Settings) Settings.fitCanvasDisplay(canvas);
  }

  function startLocal({ total = 2, humans = 1, names } = {}) {
    stopLoopOnly(); mode = 'playing';
    const humanCount = Math.max(1, Math.min(4, humans));
    const count = Math.max(humanCount, Math.min(4, total));
    const options = window.Settings ? Settings.matchOptions() : {};
    if (window.Settings && canvas) Settings.applyCanvas(canvas);
    state = Physics.createLocalMatch({ count, humanCount, seed: Date.now() & 0xffffffff, names, options });
    state.particles = []; resizeCanvasToState(); showGameUI(true); updateWeaponUI(); loop(); scheduleAI();
  }

  function startOnline(socket, initialState, tankId) {
    stopLoopOnly(); mode = 'online'; onlineSocket = socket; myTankId = tankId;
    applyServerState(initialState); resizeCanvasToState(); showGameUI(true); updateWeaponUI(); loop();
  }

  function applyServerState(s) {
    if (!s) return;
    const particles = state?.particles || [];
    const prevShake = state?.shake || 0;
    state = { ...s, terrain: Render.hydrateTerrain(s.terrain), particles, shake: s.shake != null ? s.shake : prevShake,
      projectiles: s.projectiles || (s.projectile ? [s.projectile] : []) };
    if (!state.particles) state.particles = [];
    resizeCanvasToState();
  }

  function showGameUI(show) {
    document.getElementById('game-overlay')?.classList.toggle('hidden', !show);
    document.getElementById('canvas-wrap')?.classList.toggle('hidden', !show);
  }

  function updateWeaponUI() {
    const tank = currentControllable() || (state && state.tanks[state.currentTurn]);
    document.querySelectorAll('.weapon-btn').forEach((btn) => {
      btn.classList.toggle('active', tank && btn.dataset.weapon === tank.weapon);
    });
  }

  function fire() {
    const tank = currentControllable();
    if (!tank || !state || state.phase !== 'aiming') return;
    if (mode === 'online' && onlineSocket) {
      onlineSocket.emit('game:fire', { angle: tank.angle, power: tank.power, weapon: tank.weapon }); return;
    }
    const proj = Physics.createProjectile(tank, tank.weapon, state.bombSpeed);
    state.projectiles = [proj]; state.projectile = proj; state.phase = 'flying';
  }

  function scheduleAI() {
    if (aiTimer) clearTimeout(aiTimer);
    if (mode !== 'playing' || !state || state.phase !== 'aiming') return;
    const tank = state.tanks[state.currentTurn];
    if (!tank || !tank.isAI || !tank.alive) return;
    aiTimer = setTimeout(() => {
      if (!state || state.phase !== 'aiming') return;
      Physics.aiDecide(state, tank); updateWeaponUI();
      setTimeout(() => {
        if (!state || state.phase !== 'aiming') return;
        const proj = Physics.createProjectile(tank, tank.weapon, state.bombSpeed);
        state.projectiles = [proj]; state.projectile = proj; state.phase = 'flying';
      }, 400);
    }, 700 + Math.random() * 600);
  }

  function handleAimInput(dt) {
    const tank = currentControllable();
    if (!tank || state.phase !== 'aiming') return;
    let changed = false;
    const angSpeed = 1.2 * dt, powSpeed = 40 * dt;
    if (keys['ArrowLeft'] || keys['KeyA']) { tank.angle -= angSpeed; changed = true; }
    if (keys['ArrowRight'] || keys['KeyD']) { tank.angle += angSpeed; changed = true; }
    if (keys['ArrowUp'] || keys['KeyW']) { tank.power = Math.min(100, tank.power + powSpeed); changed = true; }
    if (keys['ArrowDown'] || keys['KeyS']) { tank.power = Math.max(5, tank.power - powSpeed); changed = true; }
    const moveSpeed = 55 * dt; let moveDx = 0;
    if (keys['KeyQ'] || keys['Comma']) moveDx -= moveSpeed;
    if (keys['KeyE'] || keys['Period']) moveDx += moveSpeed;
    if (moveDx !== 0) {
      if (mode === 'online' && onlineSocket) {
        moveAccum += moveDx;
        if (Math.abs(moveAccum) >= 1) { const send = Math.trunc(moveAccum); moveAccum -= send; onlineSocket.emit('game:move', { dx: send }); }
      } else if (Physics.moveTank(state, tank, moveDx)) changed = true;
    }
    if (changed && mode === 'online' && onlineSocket) {
      onlineSocket.emit('game:aim', { angle: tank.angle, power: tank.power, weapon: tank.weapon });
    }
    if (changed) updateWeaponUI();
  }

  let last = 0;
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!state) return;
    const now = ts || performance.now();
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (mode === 'playing') {
      handleAimInput(dt);
      if (state.phase === 'flying') {
        for (let i = 0; i < 2; i++) {
          const { impacts, done } = Physics.stepAllProjectiles(state);
          for (const hit of impacts) {
            Physics.applyImpact(state, hit);
            Physics.spawnParticles(state, hit.x, hit.y, hit.dirt ? '#8b6914' : hit.weapon === 'napalm' ? '#ff6622' : '#ff8844', hit.dirt ? 28 : hit.radius > 50 ? 70 : 40, hit.dirt);
            state.shake = hit.dirt ? 4 : Math.min(18, hit.radius / 4);
          }
          if (done) { Physics.nextTurn(state); scheduleAI(); updateWeaponUI(); break; }
        }
      }
      Physics.updateParticles(state);
      if (state.shake > 0) state.shake *= 0.88;
      if (state.shake < 0.2) state.shake = 0;
    } else if (mode === 'online') {
      handleAimInput(dt); Physics.updateParticles(state);
      if (state.shake > 0) state.shake *= 0.88;
      if (state.shake < 0.2) state.shake = 0;
    }
    Render.frame(ctx, state, { canControl: !!currentControllable(), showHelp: mode === 'playing' || mode === 'online' });
    syncHudDom();
  }

  function syncHudDom() {
    if (!state) return;
    const turnEl = document.getElementById('hud-turn');
    const windEl = document.getElementById('hud-wind');
    const moveEl = document.getElementById('hud-move');
    if (turnEl) {
      const t = state.tanks[state.currentTurn];
      turnEl.textContent = state.phase === 'ended' ? 'Match Over' : t ? `${t.name}'s turn` : '';
      if (t) turnEl.style.color = t.color;
    }
    if (windEl) {
      if (state.windEnabled === false) windEl.textContent = 'Wind OFF';
      else { const w = state.wind || 0; windEl.textContent = w === 0 ? 'Wind — 0' : w > 0 ? `Wind → ${w}` : `Wind ← ${Math.abs(w)}`; }
    }
    if (moveEl) {
      const t = currentControllable() || state.tanks[state.currentTurn];
      const max = state.moveDistance || 0;
      if (max <= 0) moveEl.textContent = 'Move OFF';
      else if (t) {
        const origin = t.turnOriginX != null ? t.turnOriginX : t.x;
        moveEl.textContent = `Move ${Math.max(0, Math.round(max - Math.abs(t.x - origin)))}/${max}`;
      }
    }
  }

  function stopLoopOnly() {
    if (raf) cancelAnimationFrame(raf); raf = null;
    if (aiTimer) clearTimeout(aiTimer); aiTimer = null; last = 0; moveAccum = 0;
  }

  function stop() {
    stopLoopOnly(); mode = 'menu'; state = null; onlineSocket = null; myTankId = null; showGameUI(false);
  }

  function setWeapon(w) {
    const tank = currentControllable();
    if (!tank || !Physics.WEAPONS[w]) return;
    tank.weapon = w; updateWeaponUI();
    if (mode === 'online' && onlineSocket) onlineSocket.emit('game:aim', { angle: tank.angle, power: tank.power, weapon: tank.weapon });
  }

  function onServerState(s) {
    if (mode !== 'online') return;
    const prev = state;
    const hadProj = (prev?.projectiles && prev.projectiles.length) || prev?.projectile;
    applyServerState(s);
    if (hadProj && !(s.projectiles && s.projectiles.length) && s.phase !== 'flying') {
      const lastP = Array.isArray(hadProj) ? hadProj[0] : hadProj;
      const trail = lastP && lastP.trail; const pt = trail && trail[trail.length - 1];
      if (pt) { Physics.spawnParticles(state, pt.x, pt.y, '#ff8844', 45, false); state.shake = 10; }
    }
    updateWeaponUI();
  }

  function onServerEnded(payload) {
    if (payload?.state) applyServerState(payload.state);
    if (state) state.phase = 'ended';
  }

  return { init, startLocal, startOnline, stop, setWeapon, onServerState, onServerEnded, getState: () => state, getMode: () => mode };
})();

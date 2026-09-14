window.Game = (function () {
  let canvas, ctx;
  let state = null;
  let raf = null;
  let keys = {};
  let mode = 'menu'; // menu | playing | online
  let onExit = null;
  let onlineSocket = null;
  let myTankId = null;
  let aiTimer = null;

  function init(c, exitCb) {
    canvas = c;
    ctx = canvas.getContext('2d');
    onExit = exitCb;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  function onKeyDown(e) {
    keys[e.code] = true;
    if (mode !== 'playing' && mode !== 'online') return;
    if (e.code === 'Escape') {
      e.preventDefault();
      stop();
      if (onExit) onExit();
      return;
    }
    if (state && state.phase === 'ended') return;
    const tank = currentControllable();
    if (!tank || (state && state.phase !== 'aiming')) return;

    if (e.code === 'Digit1') tank.weapon = 'missile';
    if (e.code === 'Digit2') tank.weapon = 'nuke';
    if (e.code === 'Digit3') tank.weapon = 'dirt';
    if (e.code === 'Space') {
      e.preventDefault();
      fire();
    }
    if (mode === 'online' && onlineSocket && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) {
      onlineSocket.emit('game:aim', { angle: tank.angle, power: tank.power, weapon: tank.weapon });
    }
  }

  function onKeyUp(e) {
    keys[e.code] = false;
  }

  function currentControllable() {
    if (!state) return null;
    const tank = state.tanks[state.currentTurn];
    if (!tank || !tank.alive) return null;
    if (mode === 'online') {
      if (tank.id !== myTankId) return null;
      return tank;
    }
    if (tank.isAI) return null;
    return tank;
  }

  function startLocal({ total = 2, humans = 1, names } = {}) {
    stopLoopOnly();
    mode = 'playing';
    const humanCount = Math.max(1, Math.min(4, humans));
    const count = Math.max(humanCount, Math.min(4, total));
    state = Physics.createLocalMatch({
      count,
      humanCount,
      seed: Date.now() & 0xffffffff,
      names,
    });
    state.particles = [];
    showGameUI(true);
    updateWeaponUI();
    loop();
    scheduleAI();
  }

  function startOnline(socket, initialState, tankId) {
    stopLoopOnly();
    mode = 'online';
    onlineSocket = socket;
    myTankId = tankId;
    applyServerState(initialState);
    showGameUI(true);
    updateWeaponUI();
    loop();
  }

  function applyServerState(s) {
    if (!s) return;
    const particles = state?.particles || [];
    const prevShake = state?.shake || 0;
    state = {
      ...s,
      terrain: Render.hydrateTerrain(s.terrain),
      particles,
      shake: s.shake != null ? s.shake : prevShake,
    };
    if (!state.particles) state.particles = [];
  }

  function showGameUI(show) {
    const el = document.getElementById('game-overlay');
    if (el) el.classList.toggle('hidden', !show);
    const canvasWrap = document.getElementById('canvas-wrap');
    if (canvasWrap) canvasWrap.classList.toggle('hidden', !show);
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
      onlineSocket.emit('game:fire', {
        angle: tank.angle,
        power: tank.power,
        weapon: tank.weapon,
      });
      return;
    }
    state.projectile = Physics.createProjectile(tank);
    state.phase = 'flying';
  }

  function scheduleAI() {
    if (aiTimer) clearTimeout(aiTimer);
    if (mode !== 'playing' || !state || state.phase !== 'aiming') return;
    const tank = state.tanks[state.currentTurn];
    if (!tank || !tank.isAI || !tank.alive) return;
    aiTimer = setTimeout(() => {
      if (!state || state.phase !== 'aiming') return;
      Physics.aiDecide(state, tank);
      updateWeaponUI();
      setTimeout(() => {
        if (!state || state.phase !== 'aiming') return;
        state.projectile = Physics.createProjectile(tank);
        state.phase = 'flying';
      }, 400);
    }, 700 + Math.random() * 600);
  }

  function handleAimInput(dt) {
    const tank = currentControllable();
    if (!tank || state.phase !== 'aiming') return;
    let changed = false;
    const angSpeed = 1.2 * dt;
    const powSpeed = 40 * dt;
    if (keys['ArrowLeft'] || keys['KeyA']) {
      tank.angle -= angSpeed;
      changed = true;
    }
    if (keys['ArrowRight'] || keys['KeyD']) {
      tank.angle += angSpeed;
      changed = true;
    }
    if (keys['ArrowUp'] || keys['KeyW']) {
      tank.power = Math.min(100, tank.power + powSpeed);
      changed = true;
    }
    if (keys['ArrowDown'] || keys['KeyS']) {
      tank.power = Math.max(5, tank.power - powSpeed);
      changed = true;
    }
    // clamp angle roughly upward hemisphere relative to facing
    if (changed && mode === 'online' && onlineSocket) {
      onlineSocket.emit('game:aim', {
        angle: tank.angle,
        power: tank.power,
        weapon: tank.weapon,
      });
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
      if (state.phase === 'flying' && state.projectile) {
        // multiple substeps
        for (let i = 0; i < 2; i++) {
          const hit = Physics.stepProjectile(state.projectile, state.wind, state.terrain);
          if (hit) {
            if (hit.type === 'impact') {
              Physics.applyImpact(state, hit);
              Physics.spawnParticles(
                state,
                hit.x,
                hit.y,
                hit.dirt ? '#8b6914' : '#ff8844',
                hit.dirt ? 28 : hit.radius > 50 ? 70 : 40,
                hit.dirt
              );
              state.shake = hit.dirt ? 4 : Math.min(18, hit.radius / 4);
            }
            state.projectile = null;
            Physics.nextTurn(state);
            scheduleAI();
            updateWeaponUI();
            break;
          }
        }
      }
      Physics.updateParticles(state);
      if (state.shake > 0) state.shake *= 0.88;
      if (state.shake < 0.2) state.shake = 0;
    } else if (mode === 'online') {
      handleAimInput(dt);
      Physics.updateParticles(state);
      if (state.shake > 0) state.shake *= 0.88;
      if (state.shake < 0.2) state.shake = 0;
    }

    const canControl = !!currentControllable();
    Render.frame(ctx, state, { canControl, showHelp: mode === 'playing' || mode === 'online' });
    syncHudDom();
  }

  function syncHudDom() {
    if (!state) return;
    const turnEl = document.getElementById('hud-turn');
    const windEl = document.getElementById('hud-wind');
    if (turnEl) {
      const t = state.tanks[state.currentTurn];
      turnEl.textContent = state.phase === 'ended'
        ? 'Match Over'
        : t
          ? `${t.name}'s turn`
          : '';
      if (t) turnEl.style.color = t.color;
    }
    if (windEl) {
      const w = state.wind || 0;
      windEl.textContent = w === 0 ? 'Wind — 0' : w > 0 ? `Wind → ${w}` : `Wind ← ${Math.abs(w)}`;
    }
  }

  function stopLoopOnly() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = null;
    last = 0;
  }

  function stop() {
    stopLoopOnly();
    mode = 'menu';
    state = null;
    onlineSocket = null;
    myTankId = null;
    showGameUI(false);
  }

  function setWeapon(w) {
    const tank = currentControllable();
    if (!tank || !Physics.WEAPONS[w]) return;
    tank.weapon = w;
    updateWeaponUI();
    if (mode === 'online' && onlineSocket) {
      onlineSocket.emit('game:aim', { angle: tank.angle, power: tank.power, weapon: tank.weapon });
    }
  }

  function onServerState(s) {
    if (mode !== 'online') return;
    const prev = state;
    const hadProj = prev?.projectile;
    applyServerState(s);
    // spawn particles on impact detection (projectile vanished)
    if (hadProj && !s.projectile && s.phase !== 'flying') {
      // approximate from last trail
      const last = hadProj.trail && hadProj.trail[hadProj.trail.length - 1];
      if (last) {
        Physics.spawnParticles(state, last.x, last.y, '#ff8844', 45, false);
        state.shake = 10;
      }
    }
    updateWeaponUI();
  }

  function onServerEnded(payload) {
    if (payload?.state) applyServerState(payload.state);
    if (state) state.phase = 'ended';
  }

  return {
    init,
    startLocal,
    startOnline,
    stop,
    setWeapon,
    onServerState,
    onServerEnded,
    getState: () => state,
    getMode: () => mode,
  };
})();

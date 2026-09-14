(function () {
  const canvas = document.getElementById('game');
  const screens = {
    landing: document.getElementById('screen-landing'),
    sp: document.getElementById('screen-sp'),
    local: document.getElementById('screen-local'),
    lobby: document.getElementById('screen-lobby'),
    settings: document.getElementById('screen-settings'),
  };

  let settingsReturnScreen = 'landing';
  let settingsFromGame = false;

  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => {
      if (el) el.classList.toggle('hidden', k !== name);
    });
    document.getElementById('canvas-wrap')?.classList.add('hidden');
    document.getElementById('game-overlay')?.classList.add('hidden');
  }

  function goMenu() {
    Game.stop();
    settingsFromGame = false;
    showScreen('landing');
  }

  function populateSettingsForm() {
    const s = Settings.get();
    const resSel = document.getElementById('set-resolution');
    if (resSel && !resSel.options.length) {
      Settings.RESOLUTIONS.forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.label;
        resSel.appendChild(opt);
      });
    }
    if (resSel) resSel.value = s.resolution;
    const windOn = document.getElementById('set-wind-enabled');
    if (windOn) windOn.checked = !!s.windEnabled;
    const maxWind = document.getElementById('set-max-wind');
    if (maxWind) maxWind.value = String(s.maxWind);
    const maxWindLabel = document.getElementById('set-max-wind-val');
    if (maxWindLabel) maxWindLabel.textContent = String(s.maxWind);
    const move = document.getElementById('set-move-distance');
    if (move) move.value = String(s.moveDistance);
    const moveLabel = document.getElementById('set-move-distance-val');
    if (moveLabel) moveLabel.textContent = String(s.moveDistance);
    const bombSpeed = document.getElementById('set-bomb-speed');
    if (bombSpeed) bombSpeed.value = String(s.bombSpeed != null ? s.bombSpeed : 2);
  }

  function openSettings(from) {
    settingsReturnScreen = from || 'landing';
    settingsFromGame = from === 'game';
    populateSettingsForm();
    if (settingsFromGame) {
      // keep canvas visible behind; show settings as overlay panel
      Object.entries(screens).forEach(([k, el]) => {
        if (el) el.classList.toggle('hidden', k !== 'settings');
      });
    } else {
      showScreen('settings');
    }
  }

  function applySettingsFromForm() {
    const resolution = document.getElementById('set-resolution')?.value || '1200x675';
    const windEnabled = !!document.getElementById('set-wind-enabled')?.checked;
    const maxWind = Number(document.getElementById('set-max-wind')?.value) || 0;
    const moveDistance = Number(document.getElementById('set-move-distance')?.value) || 0;
    const bombSpeed = Math.max(1, Math.min(3, Math.round(Number(document.getElementById('set-bomb-speed')?.value) || 2)));
    Settings.set({ resolution, windEnabled, maxWind, moveDistance, bombSpeed });
    Settings.applyCanvas(canvas);
    Settings.fitCanvasDisplay(canvas);
    // Live-update SP match options if mid-aiming (wind/move for next turn / remaining)
    const st = Game.getState && Game.getState();
    if (st && Game.getMode() === 'playing' && st.phase === 'aiming') {
      st.windEnabled = windEnabled;
      st.maxWind = maxWind;
      st.moveDistance = moveDistance;
      st.bombSpeed = bombSpeed;
      if (!windEnabled) st.wind = 0;
      else if (Math.abs(st.wind) > maxWind) {
        st.wind = Math.sign(st.wind) * maxWind || 0;
      }
    }
  }

  function closeSettings(save) {
    if (save) applySettingsFromForm();
    else populateSettingsForm();
    if (settingsFromGame && (Game.getMode() === 'playing' || Game.getMode() === 'online')) {
      Object.entries(screens).forEach(([, el]) => {
        if (el) el.classList.add('hidden');
      });
      document.getElementById('canvas-wrap')?.classList.remove('hidden');
      document.getElementById('game-overlay')?.classList.remove('hidden');
      settingsFromGame = false;
      return;
    }
    showScreen(settingsReturnScreen || 'landing');
  }

  Game.init(canvas, goMenu);
  Settings.applyCanvas(canvas);
  Settings.fitCanvasDisplay(canvas);

  // Landing buttons
  document.getElementById('btn-sp').addEventListener('click', () => showScreen('sp'));
  document.getElementById('btn-local').addEventListener('click', () => showScreen('local'));
  document.getElementById('btn-settings').addEventListener('click', () => openSettings('landing'));
  document.getElementById('btn-online').addEventListener('click', () => {
    showScreen('lobby');
    Lobby.connect({
      onGameStart: (socket, state, room, yourTankId) => {
        document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
        Game.startOnline(socket, state, yourTankId ?? 0);
      },
      onGameState: (state) => Game.onServerState(state),
      onGameEnded: (payload) => Game.onServerEnded(payload),
    });
    const nickInput = document.getElementById('nick-input');
    if (nickInput && Lobby.getNick()) nickInput.value = Lobby.getNick();
  });

  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.back === 'lobby-leave') {
        Lobby.leaveRoom();
        return;
      }
      if (btn.dataset.back === 'settings-close') {
        closeSettings(false);
        return;
      }
      showScreen(btn.dataset.back || 'landing');
    });
  });

  document.getElementById('btn-save-settings')?.addEventListener('click', () => {
    closeSettings(true);
  });

  document.getElementById('set-max-wind')?.addEventListener('input', (e) => {
    const el = document.getElementById('set-max-wind-val');
    if (el) el.textContent = e.target.value;
  });
  document.getElementById('set-move-distance')?.addEventListener('input', (e) => {
    const el = document.getElementById('set-move-distance-val');
    if (el) el.textContent = e.target.value;
  });

  // Single player start
  document.getElementById('btn-start-sp').addEventListener('click', () => {
    const total = Number(document.getElementById('sp-total').value) || 2;
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    Game.startLocal({ total, humans: 1, names: ['You'] });
  });

  // Local multiplayer
  document.getElementById('btn-start-local').addEventListener('click', () => {
    const humans = Number(document.getElementById('local-humans').value) || 2;
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    const names = [];
    for (let i = 0; i < humans; i++) names.push(`P${i + 1}`);
    Game.startLocal({ total: humans, humans, names });
  });

  // Weapons
  document.querySelectorAll('.weapon-btn').forEach((btn) => {
    btn.addEventListener('click', () => Game.setWeapon(btn.dataset.weapon));
  });

  document.getElementById('btn-menu-game')?.addEventListener('click', () => {
    if (Game.getMode() === 'online') Lobby.leaveRoom();
    goMenu();
  });

  document.getElementById('btn-settings-game')?.addEventListener('click', () => {
    openSettings('game');
  });

  document.getElementById('btn-fire')?.addEventListener('click', () => {
    const ev = new KeyboardEvent('keydown', { code: 'Space' });
    window.dispatchEvent(ev);
  });

  // Lobby UI
  document.getElementById('btn-set-nick')?.addEventListener('click', () => {
    Lobby.setNick(document.getElementById('nick-input').value);
  });
  document.getElementById('nick-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') Lobby.setNick(e.target.value);
  });

  document.getElementById('btn-create-room')?.addEventListener('click', () => {
    const name = document.getElementById('room-name').value;
    const seats = Number(document.getElementById('room-seats').value) || 2;
    Lobby.setNick(document.getElementById('nick-input').value);
    Lobby.createRoom(name, seats);
  });

  document.getElementById('btn-ready')?.addEventListener('click', (e) => {
    const ready = e.currentTarget.dataset.ready !== '1';
    Lobby.setReady(ready);
  });

  document.getElementById('btn-start-room')?.addEventListener('click', () => Lobby.startGame());

  document.getElementById('global-chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('global-chat-input');
    if (input.value.trim()) {
      Lobby.sendGlobalChat(input.value);
      input.value = '';
    }
  });

  document.getElementById('room-chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('room-chat-input');
    if (input.value.trim()) {
      Lobby.sendRoomChat(input.value);
      input.value = '';
    }
  });

  function fit() {
    Settings.fitCanvasDisplay(canvas);
  }
  window.addEventListener('resize', fit);
  fit();

  showScreen('landing');
})();

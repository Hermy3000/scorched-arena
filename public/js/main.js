(function () {
  const canvas = document.getElementById('game');
  const screens = {
    landing: document.getElementById('screen-landing'),
    sp: document.getElementById('screen-sp'),
    local: document.getElementById('screen-local'),
    lobby: document.getElementById('screen-lobby'),
  };

  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => {
      if (el) el.classList.toggle('hidden', k !== name);
    });
    document.getElementById('canvas-wrap')?.classList.add('hidden');
    document.getElementById('game-overlay')?.classList.add('hidden');
  }

  function goMenu() {
    Game.stop();
    showScreen('landing');
  }

  Game.init(canvas, goMenu);

  // Landing buttons
  document.getElementById('btn-sp').addEventListener('click', () => showScreen('sp'));
  document.getElementById('btn-local').addEventListener('click', () => showScreen('local'));
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
      showScreen(btn.dataset.back || 'landing');
    });
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

  // Fit canvas
  function fit() {
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap) return;
    const maxW = Math.min(window.innerWidth - 24, 960);
    const scale = maxW / 960;
    canvas.style.width = `${960 * scale}px`;
    canvas.style.height = `${540 * scale}px`;
  }
  window.addEventListener('resize', fit);
  fit();

  showScreen('landing');
})();

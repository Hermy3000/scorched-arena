window.Lobby = (function () {
  let socket = null;
  let nickname = localStorage.getItem('sa_nick') || '';
  let currentRoom = null;
  let callbacks = {};

  function connect(cbs) {
    callbacks = cbs || {};
    if (socket) return socket;
    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      setStatus('Connected');
      if (nickname) socket.emit('lobby:nick', nickname);
    });
    socket.on('disconnect', () => setStatus('Disconnected'));
    socket.on('lobby:nickOk', (n) => {
      nickname = n;
      localStorage.setItem('sa_nick', n);
      const input = document.getElementById('nick-input');
      if (input) input.value = n;
    });
    socket.on('lobby:rooms', renderRooms);
    socket.on('lobby:chat', (m) => appendChat('global-chat', m));
    socket.on('room:joined', (room) => {
      currentRoom = room;
      showRoomPanel(true);
      renderRoom(room);
      if (callbacks.onJoined) callbacks.onJoined(room);
    });
    socket.on('room:update', (room) => {
      currentRoom = room;
      renderRoom(room);
    });
    socket.on('room:chat', (m) => appendChat('room-chat', m));
    socket.on('game:start', (payload) => {
      const state = payload.state || payload;
      const yourTankId = payload.yourTankId;
      if (callbacks.onGameStart) callbacks.onGameStart(socket, state, currentRoom, yourTankId);
    });
    socket.on('game:state', (state) => {
      if (callbacks.onGameState) callbacks.onGameState(state);
    });
    socket.on('game:ended', (payload) => {
      if (callbacks.onGameEnded) callbacks.onGameEnded(payload);
    });
    socket.on('errorMsg', (msg) => {
      toast(msg);
    });
    return socket;
  }

  function setStatus(text) {
    const el = document.getElementById('net-status');
    if (el) el.textContent = text;
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return alert(msg);
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2800);
  }

  function setNick(n) {
    nickname = String(n || '').trim().slice(0, 16) || 'Guest';
    localStorage.setItem('sa_nick', nickname);
    if (socket) socket.emit('lobby:nick', nickname);
  }

  function sendGlobalChat(text) {
    if (socket) socket.emit('lobby:chat', text);
  }

  function sendRoomChat(text) {
    if (socket) socket.emit('room:chat', text);
  }

  function createRoom(name, seats) {
    if (socket) socket.emit('room:create', { name, seats });
  }

  function joinRoom(id) {
    if (socket) socket.emit('room:join', id);
  }

  function leaveRoom() {
    if (socket) socket.emit('room:leave');
    currentRoom = null;
    showRoomPanel(false);
  }

  function setReady(ready) {
    if (socket) socket.emit('room:ready', ready);
  }

  function startGame() {
    const settings = window.Settings ? Settings.matchOptions() : {};
    if (socket) socket.emit('room:start', { settings });
  }

  function renderRooms(list) {
    const el = document.getElementById('room-list');
    if (!el) return;
    if (!list || !list.length) {
      el.innerHTML = '<div class="muted">No open rooms — create one!</div>';
      return;
    }
    el.innerHTML = list
      .map(
        (r) => `
      <div class="room-row">
        <div>
          <strong>${escapeHtml(r.name)}</strong>
          <span class="muted"> ${r.id}</span>
          <div class="muted">${r.players}/${r.seats} · host ${escapeHtml(r.host)}</div>
        </div>
        <button class="btn small" data-join="${r.id}">Join</button>
      </div>`
      )
      .join('');
    el.querySelectorAll('[data-join]').forEach((btn) => {
      btn.addEventListener('click', () => joinRoom(btn.dataset.join));
    });
  }

  function renderRoom(room) {
    const el = document.getElementById('room-detail');
    if (!el || !room) return;
    const sid = socket && socket.id;
    document.getElementById('room-title').textContent = `${room.name} (${room.id})`;
    el.innerHTML = room.players
      .map(
        (p, i) => `
      <div class="seat-row">
        <span class="seat-dot" style="background:${Physics.COLORS[i % 4]}"></span>
        <span>${escapeHtml(p.nickname)}${i === 0 ? ' 👑' : ''}${p.socketId === sid ? ' (you)' : ''}</span>
        <span class="badge ${p.ready ? 'ready' : ''}">${p.ready ? 'READY' : '…'}</span>
      </div>`
      )
      .join('');
    const readyBtn = document.getElementById('btn-ready');
    const startBtn = document.getElementById('btn-start-room');
    const self = room.players.find((p) => p.socketId === sid);
    if (readyBtn) {
      readyBtn.textContent = self?.ready ? 'Unready' : 'Ready';
      readyBtn.dataset.ready = self?.ready ? '1' : '0';
    }
    if (startBtn) {
      const isHost = room.players[0]?.socketId === sid;
      startBtn.disabled = !isHost;
      startBtn.classList.toggle('hidden', !isHost);
    }
  }

  function showRoomPanel(show) {
    document.getElementById('lobby-browse')?.classList.toggle('hidden', show);
    document.getElementById('lobby-room')?.classList.toggle('hidden', !show);
  }

  function appendChat(id, m) {
    const el = document.getElementById(id);
    if (!el) return;
    const line = document.createElement('div');
    line.className = 'chat-line';
    line.innerHTML = `<strong>${escapeHtml(m.from)}</strong>: ${escapeHtml(m.text)}`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getSocket() {
    return socket;
  }

  function getRoom() {
    return currentRoom;
  }

  function getNick() {
    return nickname;
  }

  return {
    connect,
    setNick,
    sendGlobalChat,
    sendRoomChat,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    getSocket,
    getRoom,
    getNick,
    toast,
  };
})();

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const game = require('./game');

const PREFERRED_PORT = Number(process.env.PORT) || 3850;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '..', 'public')));

/** @type {Map<string, object>} */
const rooms = new Map();
/** socketId -> { nickname, roomId } */
const players = new Map();

function makeRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(id) ? makeRoomId() : id;
}

function roomListPublic() {
  return Array.from(rooms.values())
    .filter((r) => r.status === 'lobby')
    .map((r) => ({
      id: r.id,
      name: r.name,
      seats: r.seats,
      players: r.players.length,
      host: r.players[0]?.nickname || '?',
    }));
}

function broadcastLobby() {
  io.emit('lobby:rooms', roomListPublic());
}

function roomPublic(room) {
  return {
    id: room.id,
    name: room.name,
    seats: room.seats,
    status: room.status,
    players: room.players.map((p) => ({
      socketId: p.socketId,
      nickname: p.nickname,
      ready: p.ready,
      seat: p.seat,
    })),
  };
}

function emitRoom(room) {
  io.to(room.id).emit('room:update', roomPublic(room));
}

function getRoomForSocket(socket) {
  const info = players.get(socket.id);
  if (!info?.roomId) return null;
  return rooms.get(info.roomId) || null;
}

io.on('connection', (socket) => {
  players.set(socket.id, { nickname: 'Guest', roomId: null });

  socket.emit('lobby:rooms', roomListPublic());

  socket.on('lobby:nick', (nick) => {
    const n = String(nick || 'Guest').trim().slice(0, 16) || 'Guest';
    const info = players.get(socket.id);
    if (info) info.nickname = n;
    socket.emit('lobby:nickOk', n);
    const room = getRoomForSocket(socket);
    if (room) {
      const p = room.players.find((x) => x.socketId === socket.id);
      if (p) p.nickname = n;
      emitRoom(room);
      broadcastLobby();
    }
  });

  socket.on('lobby:chat', (msg) => {
    const info = players.get(socket.id);
    const text = String(msg || '').trim().slice(0, 200);
    if (!text) return;
    io.emit('lobby:chat', {
      from: info?.nickname || 'Guest',
      text,
      ts: Date.now(),
    });
  });

  socket.on('room:create', ({ name, seats }) => {
    const info = players.get(socket.id);
    if (info?.roomId) {
      socket.emit('errorMsg', 'Leave your current room first');
      return;
    }
    const seatCount = Math.max(2, Math.min(4, Number(seats) || 2));
    const id = makeRoomId();
    const room = {
      id,
      name: String(name || `${info.nickname}'s Arena`).trim().slice(0, 24),
      seats: seatCount,
      status: 'lobby',
      players: [
        {
          socketId: socket.id,
          nickname: info.nickname,
          ready: false,
          seat: 0,
        },
      ],
      match: null,
      simTimer: null,
    };
    rooms.set(id, room);
    info.roomId = id;
    socket.join(id);
    emitRoom(room);
    broadcastLobby();
    socket.emit('room:joined', roomPublic(room));
  });

  socket.on('room:join', (roomId) => {
    const info = players.get(socket.id);
    if (info?.roomId) {
      socket.emit('errorMsg', 'Already in a room');
      return;
    }
    const room = rooms.get(String(roomId || '').toUpperCase());
    if (!room) {
      socket.emit('errorMsg', 'Room not found');
      return;
    }
    if (room.status !== 'lobby') {
      socket.emit('errorMsg', 'Game already started');
      return;
    }
    if (room.players.length >= room.seats) {
      socket.emit('errorMsg', 'Room full');
      return;
    }
    room.players.push({
      socketId: socket.id,
      nickname: info.nickname,
      ready: false,
      seat: room.players.length,
    });
    info.roomId = room.id;
    socket.join(room.id);
    emitRoom(room);
    broadcastLobby();
    socket.emit('room:joined', roomPublic(room));
  });

  socket.on('room:leave', () => leaveRoom(socket));

  socket.on('room:chat', (msg) => {
    const room = getRoomForSocket(socket);
    const info = players.get(socket.id);
    const text = String(msg || '').trim().slice(0, 200);
    if (!room || !text) return;
    io.to(room.id).emit('room:chat', {
      from: info?.nickname || 'Guest',
      text,
      ts: Date.now(),
    });
  });

  socket.on('room:ready', (ready) => {
    const room = getRoomForSocket(socket);
    if (!room || room.status !== 'lobby') return;
    const p = room.players.find((x) => x.socketId === socket.id);
    if (!p) return;
    p.ready = !!ready;
    emitRoom(room);
  });

  socket.on('room:start', () => {
    const room = getRoomForSocket(socket);
    if (!room || room.status !== 'lobby') return;
    if (room.players[0]?.socketId !== socket.id) {
      socket.emit('errorMsg', 'Only host can start');
      return;
    }
    if (room.players.length < 2) {
      socket.emit('errorMsg', 'Need at least 2 players');
      return;
    }
    const allReady = room.players.every((p) => p.ready);
    if (!allReady) {
      socket.emit('errorMsg', 'All players must be ready');
      return;
    }
    startMatch(room);
  });

  socket.on('game:aim', ({ angle, power, weapon }) => {
    const room = getRoomForSocket(socket);
    if (!room?.match || room.status !== 'playing') return;
    const tank = room.match.tanks.find((t) => t.socketId === socket.id);
    if (!tank || room.match.currentTurn !== tank.id) return;
    if (room.match.phase !== 'aiming') return;
    tank.angle = Number(angle) || tank.angle;
    tank.power = Math.max(5, Math.min(100, Number(power) || tank.power));
    if (weapon && game.WEAPONS[weapon]) tank.weapon = weapon;
    io.to(room.id).emit('game:state', game.publicState(room.match));
  });

  socket.on('game:fire', ({ angle, power, weapon }) => {
    const room = getRoomForSocket(socket);
    if (!room?.match || room.status !== 'playing') return;
    const tank = room.match.tanks.find((t) => t.socketId === socket.id);
    if (!tank) return;
    const result = game.fire(room.match, tank.id, {
      angle: Number(angle),
      power: Number(power),
      weapon,
    });
    if (!result.ok) {
      socket.emit('errorMsg', result.error);
      return;
    }
    io.to(room.id).emit('game:state', game.publicState(room.match));
    runSimulation(room);
  });

  socket.on('disconnect', () => {
    leaveRoom(socket);
    players.delete(socket.id);
  });
});

function leaveRoom(socket) {
  const info = players.get(socket.id);
  if (!info?.roomId) return;
  const roomId = info.roomId;
  const room = rooms.get(roomId);
  info.roomId = null;
  socket.leave(roomId);
  if (!room) return;
  room.players = room.players.filter((p) => p.socketId !== socket.id);
  if (room.simTimer) {
    clearInterval(room.simTimer);
    room.simTimer = null;
  }
  if (room.players.length === 0) {
    rooms.delete(room.id);
  } else {
    room.players.forEach((p, i) => {
      p.seat = i;
    });
    if (room.status === 'playing') {
      // mark tank as AI / dead leave
      if (room.match) {
        const t = room.match.tanks.find((x) => x.socketId === socket.id);
        if (t) {
          t.socketId = null;
          t.isAI = true;
          t.name = (t.name || 'Player') + ' (left)';
        }
      }
    }
    emitRoom(room);
  }
  broadcastLobby();
}

function startMatch(room) {
  room.status = 'playing';
  const seed = Date.now() & 0xffffffff;
  room.match = game.createMatch({
    seed,
    roomId: room.id,
    players: room.players.map((p) => ({
      nickname: p.nickname,
      socketId: p.socketId,
      isAI: false,
    })),
  });
  emitRoom(room);
  const pub = game.publicState(room.match);
  for (const p of room.players) {
    const tank = room.match.tanks.find((t) => t.socketId === p.socketId);
    io.to(p.socketId).emit('game:start', { state: pub, yourTankId: tank ? tank.id : 0 });
  }
  broadcastLobby();
}

function runSimulation(room) {
  if (room.simTimer) clearInterval(room.simTimer);
  room.simTimer = setInterval(() => {
    if (!room.match || room.match.phase !== 'flying') {
      clearInterval(room.simTimer);
      room.simTimer = null;
      io.to(room.id).emit('game:state', game.publicState(room.match));
      if (room.match?.phase === 'ended') {
        io.to(room.id).emit('game:ended', {
          winnerId: room.match.winnerId,
          state: game.publicState(room.match),
        });
        // reset to lobby after brief moment handled client-side; keep status
        room.status = 'ended';
      }
      return;
    }
    // step a few physics frames per tick for snappy feel
    for (let s = 0; s < 3; s++) {
      if (room.match.phase !== 'flying') break;
      game.simulateFlight(room.match, 1);
    }
    io.to(room.id).emit('game:state', game.publicState(room.match));
  }, 1000 / 30);
}

function listen(port, attemptsLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
  server.listen(port, '0.0.0.0', () => {
    const addr = server.address();
    console.log(`Scorched Arena running at http://localhost:${addr.port}`);
    console.log(`LAN: http://0.0.0.0:${addr.port}`);
  });
}

listen(PREFERRED_PORT, 10);

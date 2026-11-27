'use strict';

const GameRoom = require('../game/GameRoom');
const { verifyToken } = require('../config/auth');
const { RoomInputGuard } = require('./gameInputGuard');
const {
  parseAllowedOrigins,
  isOriginAllowed,
  validateClientMessage,
  isDevBypassTokenAllowed,
  isDebugCommandAllowed,
} = require('./gameSecurity');
const { CHARACTER_ROLES, getAvailableCharacterRole, removePlayer: removeRedisPlayer } = require('../utils/roomUtils');
const redis    = require('../config/redis');

const TICK_RATE = 60;
const TICK_DELTA = 1 / TICK_RATE;
const TICK_MS = 1000 / TICK_RATE;
const BROADCAST_EVERY = 1; // broadcast snapshot every tick (60 Hz) for buttery smooth movement
const DISCONNECT_TIMEOUT_MS = 12_000;
const MAX_CLIENT_MESSAGE_BYTES = 1024;

const allowedOrigins = parseAllowedOrigins();

// roomId → GameRoom
const gameRooms = new Map();
// roomId → Set<WebSocket>
const gameClients = new Map();
// roomId → NodeJS.Timeout (game loop interval)
const gameLoops = new Map();
// roomId → RoomInputGuard
const roomInputGuards = new Map();
// `${roomId}:${playerId}` → NodeJS.Timeout (disconnect timer)
const disconnectTimers = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function validateToken(token) {
  if (!token) return null;
  if (isDevBypassTokenAllowed(token)) {
    return token;
  }
  const result = await verifyToken(token);
  return result ? result.user.id : null;
}

function send(ws, payload) {
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // socket already closed
  }
}

function broadcastRoom(roomId, payload) {
  const clients = gameClients.get(roomId);
  if (!clients) return;
  const data = JSON.stringify(payload);
  for (const ws of clients) {
    try {
      ws.send(data);
    } catch {
      // ignore closed sockets
    }
  }
}

// ── Game loop ─────────────────────────────────────────────────────────────────

function startGameLoop(roomId) {
  if (gameLoops.has(roomId)) return;

  let tickCounter = 0;
  let lastTime = performance.now();
  let accumulator = 0;

  const interval = setInterval(() => {
    const room = gameRooms.get(roomId);
    if (!room) {
      clearInterval(interval);
      gameLoops.delete(roomId);
      return;
    }

    const now = performance.now();
    accumulator = Math.min(accumulator + Math.max(0, now - lastTime), TICK_MS * 4);
    lastTime = now;

    let stepped = false;
    let steps = 0;
    while (accumulator >= TICK_MS && steps < 3) {
      accumulator -= TICK_MS;
      steps++;
      stepped = true;

      const { hits, phaseChanged } = room.update(TICK_DELTA);
      for (const hit of hits) {
        broadcastRoom(roomId, { type: 'hit', ...hit });
      }
      if (phaseChanged) {
        broadcastRoom(roomId, { type: 'phase', phase: phaseChanged });
      }
      tickCounter++;
    }

    if (stepped && tickCounter >= BROADCAST_EVERY) {
      broadcastRoom(roomId, room.getState());
      tickCounter = 0;
    }
  }, 4);

  gameLoops.set(roomId, interval);
  console.info('[Game] Loop started roomId=%s', roomId);
}

function stopGameLoop(roomId) {
  const interval = gameLoops.get(roomId);
  if (interval) {
    clearInterval(interval);
    gameLoops.delete(roomId);
    console.info('[Game] Loop stopped roomId=%s', roomId);
  }
}

function roomCodeFromRoomId(roomId) {
  return String(roomId || '')
    .replace(/-/g, '')
    .slice(0, 6)
    .toUpperCase();
}

function clearRoomDisconnectTimers(roomId) {
  const prefix = `${roomId}:`;
  for (const [key, timer] of disconnectTimers.entries()) {
    if (key.startsWith(prefix)) {
      clearTimeout(timer);
      disconnectTimers.delete(key);
    }
  }
}

async function cleanupRedisRoom(roomId, extraPlayerIds = []) {
  try {
    const playerIds = new Set(extraPlayerIds);
    const raw = await redis.get(`room:${roomId}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.players)) {
          for (const pid of parsed.players) playerIds.add(pid);
        }
        if (parsed.hostId) playerIds.add(parsed.hostId);
      } catch {
        // ignore corrupted JSON
      }
    }

    const pipeline = redis.pipeline();
    pipeline.del(`room:${roomId}`);
    pipeline.del(`room:${roomId}:pwd`);
    pipeline.del(`room:code:${roomCodeFromRoomId(roomId)}`);
    pipeline.zrem('rooms:public', roomId);
    for (const pid of playerIds) {
      pipeline.del(`player:${pid}:room`);
    }
    await pipeline.exec();
  } catch (err) {
    console.error('[Game] Redis cleanup error roomId=%s', roomId, err?.message || err);
  }
}

function teardownRoom(roomId) {
  stopGameLoop(roomId);
  clearRoomDisconnectTimers(roomId);
  gameRooms.delete(roomId);
  gameClients.delete(roomId);
  roomInputGuards.delete(roomId);
}

async function closeGameRoom(
  roomId,
  reason = 'host-left',
  message = 'El host abandonó la partida. La sala fue cerrada.'
) {
  const room = gameRooms.get(roomId);
  const clients = gameClients.get(roomId);
  const peersSnapshot = clients ? [...clients] : [];
  const knownPlayers = room ? [...room.players.keys()] : [];

  for (const peer of peersSnapshot) {
    peer.explicitLeave = true;
    send(peer, {
      type: 'room-closed',
      roomId,
      reason,
      message,
    });
  }

  teardownRoom(roomId);

  // Close peer sockets after brief flush so every client receives 'room-closed'
  if (peersSnapshot.length > 0) {
    const closeTimer = setTimeout(() => {
      for (const peer of peersSnapshot) {
        try {
          peer.close();
        } catch {
          // socket already closed
        }
      }
    }, 60);
    if (typeof closeTimer.unref === 'function') closeTimer.unref();
  }

  // Also notify any lingering signaling peers in this room
  try {
    const signalPath = require.resolve('../signal');
    const signalExports = require.cache[signalPath]?.exports;
    if (signalExports?.broadcast) {
      signalExports.broadcast(roomId, {
        type: 'host-disconnected',
        message,
      });
    }
  } catch {
    // ignore if signal module is not loaded
  }

  await cleanupRedisRoom(roomId, knownPlayers);
  console.info('[Game] Room closed roomId=%s reason=%s', roomId, reason);
}

async function removePlayerFromGameRoom(roomId, userId, { died = true } = {}) {
  const timerKey = `${roomId}:${userId}`;
  const pending = disconnectTimers.get(timerKey);
  if (pending) {
    clearTimeout(pending);
    disconnectTimers.delete(timerKey);
  }

  const room = gameRooms.get(roomId);
  const inputGuard = roomInputGuards.get(roomId);
  const clients = gameClients.get(roomId);

  let lastPos = null;
  if (room) {
    const player = room.players.get(userId);
    if (player) {
      const pos = player.body?.getPosition?.();
      if (pos) lastPos = { x: pos.x, y: pos.y };
      player.hp = 0;
      player.active = false;
      player.input = { dx: 0, dy: 0, action: null, focus: false };
    }
    room.removePlayer(userId);
  }
  if (inputGuard) inputGuard.unregisterPlayer(userId);

  const departingSockets = [];
  if (clients) {
    for (const peer of [...clients]) {
      if (peer.userId === userId) {
        peer.explicitLeave = true;
        clients.delete(peer);
        departingSockets.push(peer);
      }
    }
  }

  for (const peer of departingSockets) {
    try {
      peer.close();
    } catch {
      // ignore close errors
    }
  }

  if (room) {
    broadcastRoom(roomId, {
      type: 'player-left',
      playerId: userId,
      died: Boolean(died),
      x: lastPos?.x,
      y: lastPos?.y,
    });
    broadcastRoom(roomId, room.getState());
    console.info('[Game] Player left match userId=%s roomId=%s died=%s', userId, roomId, Boolean(died));
  }

  await removeRedisPlayer(roomId, userId).catch(() => {});

  if (room && room.players.size === 0) {
    teardownRoom(roomId);
    await cleanupRedisRoom(roomId, [userId]);
  }
}

// ── Route setup ───────────────────────────────────────────────────────────────

/**
 * Register the /game WebSocket route on the given µWebSockets app.
 * Must be called before app.listen().
 * @param {import('uWebSockets.js').TemplatedApp} app
 */
function setupGameRoute(app) {
  app.ws('/game', {
    compression: 0,
    maxPayloadLength: 2 * 1024, // 2 KB
    idleTimeout: 120,

    /**
     * Authenticate the client during the WebSocket upgrade.
     */
    upgrade: async (res, req, context) => {
      const query = req.getQuery();
      const origin = req.getHeader('origin');
      const secKey = req.getHeader('sec-websocket-key');
      const secProto = req.getHeader('sec-websocket-protocol');
      const secExt = req.getHeader('sec-websocket-extensions');

      let aborted = false;
      res.onAborted(() => { aborted = true; });

      if (!isOriginAllowed(origin, allowedOrigins)) {
        res.writeStatus('403 Forbidden').end('Forbidden origin');
        return;
      }

      const params = new URLSearchParams(query);
      const token = params.get('token') || '';
      const userId = token ? await validateToken(token) : null;

      if (aborted) return;

      if (!userId) {
        res.writeStatus('401 Unauthorized').end('Unauthorized');
        return;
      }

      res.upgrade({ userId }, secKey, secProto, secExt, context);
    },

    open: (ws) => {
      ws.roomId = null;
      console.info('[Game] Connected userId=%s', ws.userId);
    },

    message: (ws, rawMsg, isBinary) => {
      if (isBinary) {
        return send(ws, { type: 'error', message: 'Binary payloads are not supported' });
      }
      if (rawMsg.byteLength > MAX_CLIENT_MESSAGE_BYTES) {
        return send(ws, { type: 'error', message: 'Payload too large' });
      }

      let msg;
      try {
        msg = JSON.parse(Buffer.from(rawMsg).toString('utf8'));
      } catch {
        return send(ws, { type: 'error', message: 'Invalid JSON' });
      }

      const validation = validateClientMessage(msg);
      if (!validation.ok) {
        return send(ws, { type: 'error', message: `Invalid payload (${validation.reason})` });
      }

      switch (msg.type) {
        case 'join-game': {
          // Needs async for Redis lookup — wrap in IIFE to stay in sync handler
          (async () => {
            const { roomId } = msg;

            // Cancel any pending disconnect timer for this player
            const timerKey = `${roomId}:${ws.userId}`;
            const existing = disconnectTimers.get(timerKey);
            if (existing) {
              clearTimeout(existing);
              disconnectTimers.delete(timerKey);
            }

            // Look up room metadata from Redis before creating or joining
            let roomData = null;
            try {
              const raw = await redis.get(`room:${roomId}`);
              if (raw) {
                roomData = JSON.parse(raw);
              }
            } catch { /* ignore */ }

            if (!gameRooms.has(roomId) && !roomData) {
              ws.explicitLeave = true;
              send(ws, {
                type: 'room-closed',
                roomId,
                reason: 'not-found',
                message: 'La sala fue cerrada o ya no existe.',
              });
              return;
            }

            if (roomData && Array.isArray(roomData.players) && !roomData.players.includes(ws.userId)) {
              ws.explicitLeave = true;
              send(ws, {
                type: 'room-closed',
                roomId,
                reason: 'not-member',
                message: 'Ya no pertenecés a esta sala.',
              });
              return;
            }

            ws.roomId = roomId;

            if (!gameRooms.has(roomId)) {
              const hostId = roomData?.hostId || ws.userId;
              const difficulty = roomData?.difficulty || msg.difficulty || 'normal';
              const world = roomData?.world || msg.world || 1;
              const stage = roomData?.stage || msg.stage || 1;
              const expectedPlayerCount = Array.isArray(roomData?.players) ? roomData.players.length : 1;
              gameRooms.set(roomId, new GameRoom(roomId, hostId, {
                difficulty,
                world,
                stage,
                expectedPlayerCount,
                initialPhase: 'loading',
              }));
            }
            if (!gameClients.has(roomId)) gameClients.set(roomId, new Set());
            if (!roomInputGuards.has(roomId)) roomInputGuards.set(roomId, new RoomInputGuard(roomId));

            const room = gameRooms.get(roomId);
            const inputGuard = roomInputGuards.get(roomId);

            // Update expected player count if Redis has more players now
            if (roomData && Array.isArray(roomData.players)) {
              room.setExpectedPlayerCount(roomData.players.length);
            }

            // If the same user is already connected in this room (duplicate tab / reconnect),
            // drop the previous socket so only one input stream remains active.
            const roomPeers = gameClients.get(roomId);
            for (const peer of roomPeers) {
              if (peer !== ws && peer.userId === ws.userId) {
                peer.explicitLeave = true;
                try {
                  peer.close();
                } catch {
                  // ignore close errors
                }
                roomPeers.delete(peer);
              }
            }

            gameClients.get(roomId).add(ws);

            // Read character assigned during character selection from Redis room data
            let character = roomData?.playerCharacters?.[ws.userId] || null;

            if (!character && msg.character && CHARACTER_ROLES.includes(msg.character)) {
              character = msg.character;
            }

            // Ensure unique character assignment across active players in this room
            const takenRoles = [];
            for (const [pid, p] of room.players) {
              if (pid !== ws.userId && p.active && p.character) {
                takenRoles.push(p.character);
              }
            }
            if (!character || !CHARACTER_ROLES.includes(character) || takenRoles.includes(character)) {
              character = getAvailableCharacterRole(takenRoles);
            }

            room.addPlayer(ws.userId, character);
            // Reset anti-replay counters on every explicit join to allow fresh client seq from 0.
            inputGuard.registerPlayer(ws.userId, true);

            startGameLoop(roomId);

            send(ws, {
              type:         'joined',
              playerId:     ws.userId,
              isHost:       ws.userId === room.hostId,
              initialState: room.getState(),
              players:      room.getReadyStatus(),
            });
            broadcastRoom(roomId, {
              type: 'player-joined',
              playerId: ws.userId,
              players: room.getReadyStatus(),
            });
            console.info('[Game] Player joined roomId=%s userId=%s', roomId, ws.userId);
          })().catch(err => {
            console.error('[Game] join-game error', err);
            send(ws, { type: 'error', message: 'Internal error' });
          });
          break;
        }

        case 'player-loaded':
        case 'client-ready':
        case 'ready': {
          if (!ws.roomId) return;
          const room = gameRooms.get(ws.roomId);
          if (!room) return;

          const newPhase = room.setPlayerLoaded(ws.userId);

          // Broadcast updated ready status to everyone
          broadcastRoom(ws.roomId, {
            type:    'ready-status',
            players: room.getReadyStatus(),
            phase:   room.phase,
          });

          // If all ready / loaded → countdown started
          if (newPhase === 'countdown') {
            broadcastRoom(ws.roomId, {
              type:        'phase',
              phase:       'countdown',
              countdownMs: room._countdownMs,
            });
          }
          break;
        }

        case 'start-ready': {
          if (!ws.roomId) return;
          const room = gameRooms.get(ws.roomId);
          if (!room) return;

          if (room.startReadyCheck(ws.userId)) {
            broadcastRoom(ws.roomId, {
              type:    'phase',
              phase:   'ready',
              players: room.getReadyStatus(),
            });
          } else {
            send(ws, { type: 'error', message: 'Solo el host puede iniciar el ready check' });
          }
          break;
        }

        case 'input': {
          if (!ws.roomId) return;
          const room = gameRooms.get(ws.roomId);
          const inputGuard = roomInputGuards.get(ws.roomId);
          if (!room) return;
          if (!inputGuard) return;

          const verdict = inputGuard.validateAndSanitize(ws.userId, msg);
          if (!verdict.accepted) {
            if (verdict.meta.violations >= 8) {
              send(ws, {
                type: 'error',
                message: `Input rechazado (${verdict.reason}). Violaciones acumuladas: ${verdict.meta.violations}`,
              });
            }
            return;
          }

          room.setInput(ws.userId, verdict.input);
          break;
        }

        case 'advance-stage': {
          if (!ws.roomId) return;
          const room = gameRooms.get(ws.roomId);
          if (!room) return;
          if (room.advanceStage()) {
            broadcastRoom(ws.roomId, room.getState());
          }
          break;
        }

        case 'restart-stage': {
          if (!ws.roomId) return;
          const room = gameRooms.get(ws.roomId);
          if (!room) return;
          room.restartStage();
          broadcastRoom(ws.roomId, room.getState());
          break;
        }

        case 'spawn-boss': {
          if (!isDebugCommandAllowed()) return;
          if (!ws.roomId) return;
          const room = gameRooms.get(ws.roomId);
          if (!room) return;
          room.spawnBossNow();
          broadcastRoom(ws.roomId, room.getState());
          break;
        }

        case 'leave-game': {
          if (!ws.roomId) return;
          const targetRoomId = ws.roomId;
          const departingUserId = ws.userId;
          ws.explicitLeave = true;
          (async () => {
            const room = gameRooms.get(targetRoomId);
            let isHost = Boolean(room && room.hostId === departingUserId);
            if (!isHost) {
              try {
                const raw = await redis.get(`room:${targetRoomId}`);
                if (raw) {
                  const parsed = JSON.parse(raw);
                  if (parsed?.hostId === departingUserId) {
                    isHost = true;
                  }
                }
              } catch {
                // ignore
              }
            }

            if (isHost) {
              await closeGameRoom(
                targetRoomId,
                'host-left',
                'El host abandonó la partida. La sala fue cerrada.'
              );
            } else {
              await removePlayerFromGameRoom(targetRoomId, departingUserId, { died: true });
            }
          })().catch((err) => {
            console.error('[Game] leave-game error', err);
          });
          break;
        }

        case 'start-struggle': {
          if (!isDebugCommandAllowed()) return;
          if (!ws.roomId) return;
          const room = gameRooms.get(ws.roomId);
          if (!room) return;
          room.startBeamStruggleTest(ws.userId);
          broadcastRoom(ws.roomId, room.getState());
          break;
        }

        default:
          send(ws, { type: 'error', message: `Unknown type: ${msg.type}` });
      }
    },

    close: (ws, _code, _msg) => {
      const { roomId, userId } = ws;
      console.info('[Game] Disconnected userId=%s roomId=%s explicit=%s', userId, roomId, Boolean(ws.explicitLeave));

      if (!roomId) return;

      const clients = gameClients.get(roomId);
      if (clients) clients.delete(ws);

      if (ws.explicitLeave) return;

      const room = gameRooms.get(roomId);
      if (!room) return;
      const inputGuard = roomInputGuards.get(roomId);

      const wasPreGame = room.phase === 'ready' || room.phase === 'countdown';
      room.setPlayerInactive(userId);
      if (inputGuard) inputGuard.unregisterPlayer(userId);
      broadcastRoom(roomId, { type: 'player-disconnected', playerId: userId });

      // A disconnect during ready/countdown cancels the phase and returns to lobby
      if (wasPreGame) {
        room.cancelToLobby();
        broadcastRoom(roomId, { type: 'phase', phase: 'lobby' });
      }

      // Give the player a brief grace window to reconnect before killing/removing them
      const timerKey = `${roomId}:${userId}`;
      const timer = setTimeout(() => {
        disconnectTimers.delete(timerKey);
        const r = gameRooms.get(roomId);
        if (!r) return;

        if (userId === r.hostId) {
          closeGameRoom(
            roomId,
            'host-disconnected',
            'El host se desconectó. La sala fue cerrada.'
          ).catch(() => {});
          return;
        }

        removePlayerFromGameRoom(roomId, userId, { died: true }).catch(() => {});
      }, DISCONNECT_TIMEOUT_MS);
      if (typeof timer.unref === 'function') timer.unref();

      disconnectTimers.set(timerKey, timer);
    },
  });

  console.info('[Game] /game route registered');
}

module.exports = { setupGameRoute, closeGameRoom, removePlayerFromGameRoom, validateToken };

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseAllowedOrigins,
  isOriginAllowed,
  validateClientMessage,
} = require('../src/ws/gameSecurity');
const { RoomInputGuard } = require('../src/ws/gameInputGuard');
const redis = require('../src/config/redis');
const {
  CHARACTER_ROLES,
  getRandomCharacterRole,
  getAvailableCharacterRole,
  syncPlayerCharacters,
  syncPlayerReady,
  addPlayer,
  removePlayer,
  setPlayerReadyState,
  getPlayerRoom,
} = require('../src/utils/roomUtils');

describe('gameSecurity', () => {
  it('parses comma-separated FRONTEND_URL origins', () => {
    const prev = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://nomercygames.me, http://localhost:3000 , ';
    assert.deepEqual(parseAllowedOrigins(), [
      'https://nomercygames.me',
      'http://localhost:3000',
    ]);
    if (prev === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = prev;
  });

  it('allows trusted origins and blocks untrusted ones', () => {
    const allowed = ['https://custom.example.com'];
    assert.equal(isOriginAllowed('', allowed), true);
    assert.equal(isOriginAllowed('https://custom.example.com', allowed), true);
    assert.equal(isOriginAllowed('http://localhost:3000', allowed), true);
    assert.equal(isOriginAllowed('http://192.168.1.50:5173', allowed), true);
    assert.equal(isOriginAllowed('https://nomercygames.me', allowed), true);
    assert.equal(isOriginAllowed('https://www.nomercygames.me', allowed), true);
    assert.equal(isOriginAllowed('https://abc-123.ngrok-free.dev', allowed), true);
    assert.equal(isOriginAllowed('https://evil.attacker.com', allowed), false);
  });

  it('validates join-game and input client messages', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    assert.deepEqual(validateClientMessage(null), { ok: false, reason: 'invalid-payload' });
    assert.deepEqual(validateClientMessage({ type: 'hack' }), { ok: false, reason: 'invalid-type' });

    assert.deepEqual(validateClientMessage({ type: 'join-game', roomId: 'bad' }), {
      ok: false,
      reason: 'invalid-room-id',
    });
    assert.deepEqual(validateClientMessage({ type: 'join-game', roomId: validUuid, world: 9 }), {
      ok: false,
      reason: 'invalid-world',
    });
    assert.deepEqual(validateClientMessage({ type: 'join-game', roomId: validUuid, stage: 0 }), {
      ok: false,
      reason: 'invalid-stage',
    });
    assert.deepEqual(
      validateClientMessage({
        type: 'join-game',
        roomId: validUuid,
        character: 'DPS',
        difficulty: 'normal',
        world: 2,
        stage: 3,
      }),
      { ok: true }
    );

    assert.deepEqual(validateClientMessage({ type: 'input', dx: NaN, dy: 0 }), {
      ok: false,
      reason: 'invalid-vector',
    });
    assert.deepEqual(validateClientMessage({ type: 'input', dx: 1, dy: 0, action: 'nuke' }), {
      ok: false,
      reason: 'invalid-action',
    });
    assert.deepEqual(validateClientMessage({ type: 'input', dx: 1, dy: 0, focus: 'yes' }), {
      ok: false,
      reason: 'invalid-focus',
    });
    assert.deepEqual(validateClientMessage({ type: 'input', dx: 1, dy: 0, seq: 1.5 }), {
      ok: false,
      reason: 'invalid-seq',
    });
    assert.deepEqual(
      validateClientMessage({
        type: 'input',
        dx: 0.5,
        dy: -0.5,
        action: 'shoot',
        focus: true,
        seq: 10,
        clientTs: Date.now(),
      }),
      { ok: true }
    );
  });
});

describe('RoomInputGuard', () => {
  it('sanitizes diagonal movement vectors and validates actions', () => {
    const guard = new RoomInputGuard('room-1');
    const res = guard.validateAndSanitize('p1', {
      dx: 5,
      dy: 5,
      action: 'shoot',
      focus: true,
      seq: 1,
      clientTs: Date.now(),
    });
    assert.equal(res.accepted, true);
    assert.equal(res.input.action, 'shoot');
    assert.equal(res.input.focus, true);
    const mag = Math.hypot(res.input.dx, res.input.dy);
    assert.ok(mag <= 1.001, `Vector magnitude should be <= 1, got ${mag}`);
  });

  it('rejects excessive clock skew and enforces special action rate limits', () => {
    const guard = new RoomInputGuard('room-2');
    const skewed = guard.validateAndSanitize('p1', {
      dx: 0,
      dy: 0,
      clientTs: Date.now() - 120_000,
    });
    assert.equal(skewed.accepted, false);
    assert.equal(skewed.reason, 'clock-skew');

    const firstWall = guard.validateAndSanitize('p2', { dx: 0, dy: 0, action: 'wall' });
    assert.equal(firstWall.accepted, true);

    const immediateSecondWall = guard.validateAndSanitize('p2', { dx: 0, dy: 0, action: 'wall' });
    assert.equal(immediateSecondWall.accepted, false);
    assert.equal(immediateSecondWall.reason, 'action-rate-limit');

    guard.unregisterPlayer('p2');
    const afterUnregister = guard.validateAndSanitize('p2', { dx: 0, dy: 0, action: 'wall' });
    assert.equal(afterUnregister.accepted, true);
  });
});

describe('InMemoryRedis and roomUtils', () => {
  beforeEach(async () => {
    redis.store.clear();
    redis.zsets.clear();
  });

  it('handles Redis KV, sorted sets, and pipelines', async () => {
    await redis.set('k1', 'v1', 'EX', 60);
    assert.equal(await redis.get('k1'), 'v1');
    assert.equal(await redis.exists('k1'), 1);
    assert.equal(await redis.ttl('k1'), 7200);

    await redis.zadd('scores', 10, 'a');
    await redis.zadd('scores', 30, 'b');
    await redis.zadd('scores', 20, 'c');
    assert.deepEqual(await redis.zrange('scores', 0, -1), ['a', 'c', 'b']);
    assert.deepEqual(await redis.zrevrange('scores', 0, -1), ['b', 'c', 'a']);
    assert.equal(await redis.zrem('scores', 'c'), 1);

    const pipe = redis.pipeline();
    pipe.set('p1', 'ok');
    pipe.get('p1');
    pipe.del('k1');
    const results = await pipe.exec();
    assert.equal(results[1][1], 'ok');
    assert.equal(await redis.get('k1'), null);
  });

  it('assigns unique character roles and manages player room transitions', async () => {
    assert.ok(CHARACTER_ROLES.includes(getRandomCharacterRole('Tank')));
    assert.notEqual(getAvailableCharacterRole(['Tank', 'Support'], 'DPS'), 'Tank');
    assert.equal(getAvailableCharacterRole(['Tank', 'Support', 'DPS']), 'Special_Attack');

    const roomA = {
      id: 'room-a',
      players: ['u1'],
      playerCharacters: { u1: 'Tank' },
      playerReady: { u1: false },
    };
    const roomB = {
      id: 'room-b',
      players: ['u2'],
      playerCharacters: { u2: 'Tank' },
      playerReady: { u2: false },
    };
    await redis.set('room:room-a', JSON.stringify(roomA));
    await redis.set('room:room-b', JSON.stringify(roomB));

    const joinedA = await addPlayer('room-a', 'u3');
    assert.equal(joinedA.playersCount, 2);
    assert.notEqual(joinedA.playerCharacters.u3, 'Tank');
    assert.equal(await getPlayerRoom('u3'), 'room-a');

    const readyA = await setPlayerReadyState('room-a', 'u3', true);
    assert.equal(readyA.playerReady.u3, true);

    // Joining room-b automatically evicts u3 from room-a
    const joinedB = await addPlayer('room-b', 'u3');
    assert.equal(joinedB.playersCount, 2);
    assert.equal(await getPlayerRoom('u3'), 'room-b');
    const updatedRoomA = JSON.parse(await redis.get('room:room-a'));
    assert.equal(updatedRoomA.players.includes('u3'), false);

    const afterRemove = await removePlayer('room-b', 'u3');
    assert.equal(afterRemove.playersCount, 1);
    assert.equal(await getPlayerRoom('u3'), null);

    // Sync helpers prune stale entries
    const staleRoom = {
      players: ['u1'],
      playerCharacters: { u1: 'Tank', ghost: 'DPS' },
      playerReady: { u1: true, ghost: true },
    };
    syncPlayerCharacters(staleRoom);
    syncPlayerReady(staleRoom);
    assert.equal('ghost' in staleRoom.playerCharacters, false);
    assert.equal('ghost' in staleRoom.playerReady, false);
  });
});


'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const db = require('../src/config/database');
const redis = require('../src/config/redis');
const { User, Friend, FriendRequest, Inventory, Chip } = require('../src/models');
const mailer = require('../src/utils/mailer');
const { buildApp } = require('../src/app');

describe('Fastify REST API & OpenAPI integration tests', () => {
  let app;
  let store;
  let origDbQuery;
  let origMailer;
  let origModels;

  before(async () => {
    origDbQuery = db.query;
    origMailer = mailer.sendVerificationEmail;
    origModels = {
      User: { ...User },
      Friend: { ...Friend },
      FriendRequest: { ...FriendRequest },
      Inventory: { ...Inventory },
      Chip: { ...Chip },
    };

    mailer.sendVerificationEmail = async () => {};

    store = {
      dbHealthy: true,
      users: new Map(),
      friends: new Set(),
      friendRequests: new Map(),
      inventories: new Map(),
      chips: new Map(),
      nextReqId: 1,
      nextInvId: 1,
      nextChipId: 1,
    };

    db.query = async () => {
      if (!store.dbHealthy) throw new Error('DB down');
      return { rows: [{ '?column?': 1 }] };
    };

    User.findByEmail = async (email) => [...store.users.values()].find((u) => u.email === email) || null;
    User.findById = async (id) => store.users.get(id) || null;
    User.findAll = async () =>
      [...store.users.values()].map(({ id, username, email, is_verified, danmas }) => ({
        id,
        username,
        email,
        is_verified,
        danmas,
      }));
    User.create = async ({ id, username, email, password, verificationToken, danmas = 0 }) => {
      const user = { id, username, email, password, is_verified: 0, verification_token: verificationToken, danmas };
      store.users.set(id, user);
      const invId = store.nextInvId++;
      store.inventories.set(id, { id: invId, owner_id: id, scraps: 0, character_skins: [], effect_skins: [], chips: [] });
      return user;
    };
    User.verify = async (id) => {
      const u = store.users.get(id);
      if (u) {
        u.is_verified = 1;
        u.verification_token = null;
      }
    };
    User.setVerificationToken = async (id, token) => {
      const u = store.users.get(id);
      if (u) {
        u.verification_token = token;
        u.is_verified = 0;
      }
    };

    Friend.exists = async (a, b) => store.friends.has(`${a}:${b}`);
    Friend.createPair = async (a, b) => {
      store.friends.add(`${a}:${b}`);
      store.friends.add(`${b}:${a}`);
    };

    FriendRequest.hasPending = async (a, b) =>
      [...store.friendRequests.values()].some(
        (r) => r.status === 0 && ((r.sender_id === a && r.receiver_id === b) || (r.sender_id === b && r.receiver_id === a))
      );
    FriendRequest.create = async (senderId, receiverId) => {
      const id = store.nextReqId++;
      const row = { id, sender_id: senderId, receiver_id: receiverId, status: 0, created_at: new Date().toISOString() };
      store.friendRequests.set(id, row);
      return row;
    };
    FriendRequest.findPendingForReceiver = async (receiverId) =>
      [...store.friendRequests.values()]
        .filter((r) => r.receiver_id === receiverId && r.status === 0)
        .map((r) => ({ ...r, sender_username: store.users.get(r.sender_id)?.username || 'unknown' }));
    FriendRequest.findById = async (id) => store.friendRequests.get(id) || null;
    FriendRequest.updateStatus = async (id, status) => {
      const r = store.friendRequests.get(id);
      if (r) r.status = status;
    };

    Inventory.findByOwner = async (ownerId) => store.inventories.get(ownerId) || null;
    Inventory.create = async (ownerId) => {
      const inv = { id: store.nextInvId++, owner_id: ownerId, scraps: 0, character_skins: [], effect_skins: [], chips: [] };
      store.inventories.set(ownerId, inv);
      return inv;
    };

    Chip.create = async ({ inventoryId, name, rarity = 1, level = 1, image = null, stats = null }) => {
      const chip = { id: store.nextChipId++, inventory_id: inventoryId, name, rarity, level, image, is_equipped: false, stats };
      store.chips.set(chip.id, chip);
      const inv = [...store.inventories.values()].find((i) => i.id === inventoryId);
      if (inv) inv.chips.push(chip);
      return chip;
    };
    Chip.findEquippedByInventory = async (inventoryId) =>
      [...store.chips.values()].filter((c) => c.inventory_id === inventoryId && c.is_equipped);
    Chip.setEquipped = async (chipId, inventoryId, isEquipped) => {
      const chip = store.chips.get(chipId);
      if (!chip || Number(chip.inventory_id) !== Number(inventoryId)) {
        const err = new Error('La chip no existe o no pertenece a tu inventario.');
        err.statusCode = 404;
        throw err;
      }
      const want = Boolean(isEquipped);
      if (want && !chip.is_equipped) {
        const equipped = await Chip.findEquippedByInventory(inventoryId);
        if (equipped.length >= Chip.MAX_EQUIPPED_CHIPS) {
          const err = new Error(`Solo podés equiparte un máximo de ${Chip.MAX_EQUIPPED_CHIPS} chips a la vez.`);
          err.statusCode = 400;
          throw err;
        }
      }
      chip.is_equipped = want;
      return chip;
    };

    app = await buildApp({ logger: false, enableRateLimit: false, enableSwagger: true });
    await app.ready();
  });

  after(async () => {
    await app.close();
    db.query = origDbQuery;
    mailer.sendVerificationEmail = origMailer;
    Object.assign(User, origModels.User);
    Object.assign(Friend, origModels.Friend);
    Object.assign(FriendRequest, origModels.FriendRequest);
    Object.assign(Inventory, origModels.Inventory);
    Object.assign(Chip, origModels.Chip);
  });

  beforeEach(() => {
    store.dbHealthy = true;
    store.users.clear();
    store.friends.clear();
    store.friendRequests.clear();
    store.inventories.clear();
    store.chips.clear();
    redis.store.clear();
    redis.zsets.clear();
  });

  it('serves root info, /api/health (ok & degraded), and OpenAPI spec at /docs/json', async () => {
    const rootRes = await app.inject({ method: 'GET', url: '/' });
    assert.equal(rootRes.statusCode, 200);
    assert.equal(rootRes.json().docsUrl, '/docs');

    const okRes = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.json().database, 'connected');

    store.dbHealthy = false;
    const degRes = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(degRes.json().status, 'degraded');
    assert.equal(degRes.json().database, 'error');

    const docsRes = await app.inject({ method: 'GET', url: '/docs/json' });
    assert.equal(docsRes.statusCode, 200);
    const spec = docsRes.json();
    assert.equal(spec.openapi, '3.0.3');
    assert.ok(spec.paths['/api/auth/login']);
    assert.ok(spec.paths['/api/rooms']);
    assert.ok(spec.components.securitySchemes.bearerAuth);
  });

  it('runs complete register -> verify -> login -> /me -> inventory/chips flow', async () => {
    const badReg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'a', email: 'invalid', password: '123' },
    });
    assert.equal(badReg.statusCode, 400);

    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'Pilot1', email: 'pilot1@nomercygames.me', password: 'password123' },
    });
    assert.equal(reg.statusCode, 200);

    // Login before verification returns 403
    const unverifiedLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'pilot1@nomercygames.me', password: 'password123' },
    });
    assert.equal(unverifiedLogin.statusCode, 403);

    // Resend verification
    const resend = await app.inject({
      method: 'POST',
      url: '/api/auth/resend-verification',
      payload: { email: 'pilot1@nomercygames.me' },
    });
    assert.equal(resend.statusCode, 200);

    // Verify email with stored token
    const user = await User.findByEmail('pilot1@nomercygames.me');
    const verify = await app.inject({
      method: 'GET',
      url: `/api/auth/verify-email?userId=${user.id}&token=${user.verification_token}&email=${encodeURIComponent(user.email)}`,
    });
    assert.equal(verify.statusCode, 200);

    // Login now succeeds with JWT
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'pilot1@nomercygames.me', password: 'password123' },
    });
    assert.equal(login.statusCode, 200);
    const { token } = login.json();
    assert.equal(token.split('.').length, 3);

    // Authenticated /me & /AllAuthorized
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().username, 'Pilot1');

    const pub = await app.inject({ method: 'GET', url: '/api/auth/AllGood' });
    assert.equal(pub.statusCode, 200);

    const authz = await app.inject({
      method: 'GET',
      url: '/api/auth/AllAuthorized',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(authz.statusCode, 200);

    // Inventory & Chips
    const chipRes = await app.inject({
      method: 'POST',
      url: '/api/auth/user/inventory/chips',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Laser Amp', rarity: 2, level: 1, stats: { Ultimate_Damage: 20 } },
    });
    assert.equal(chipRes.statusCode, 201);
    assert.equal(chipRes.json().name, 'Laser Amp');

    const invRes = await app.inject({
      method: 'GET',
      url: '/api/auth/user/inventory',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(invRes.statusCode, 200);
    assert.equal(invRes.json().chips.length, 1);
    const createdChipId = chipRes.json().id;

    // Equip / unequip chip & stats calculation
    const badChipIdRes = await app.inject({
      method: 'PATCH',
      url: '/api/auth/user/inventory/chips/abc/equip',
      headers: { authorization: `Bearer ${token}` },
      payload: { equipped: true },
    });
    assert.equal(badChipIdRes.statusCode, 400);

    const badBodyRes = await app.inject({
      method: 'PATCH',
      url: `/api/auth/user/inventory/chips/${createdChipId}/equip`,
      headers: { authorization: `Bearer ${token}` },
      payload: { equipped: 'yes' },
    });
    assert.equal(badBodyRes.statusCode, 400);

    const equipRes = await app.inject({
      method: 'PATCH',
      url: `/api/auth/user/inventory/chips/${createdChipId}/equip`,
      headers: { authorization: `Bearer ${token}` },
      payload: { equipped: true },
    });
    assert.equal(equipRes.statusCode, 200);
    assert.equal(equipRes.json().chip.is_equipped, true);
    assert.equal(equipRes.json().equippedCount, 1);

    const statsRes = await app.inject({
      method: 'GET',
      url: '/api/auth/user/inventory/stats?class=DPS',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(statsRes.statusCode, 200);
    assert.equal(statsRes.json().equippedCount, 1);
    assert.equal(statsRes.json().bonuses.Ultimate_Damage, 20);

    const missingChipRes = await app.inject({
      method: 'PATCH',
      url: '/api/auth/user/inventory/chips/999999/equip',
      headers: { authorization: `Bearer ${token}` },
      payload: { equipped: true },
    });
    assert.equal(missingChipRes.statusCode, 404);
  });

  it('handles friend requests and full multiplayer room lifecycle', async () => {
    const hash = await bcrypt.hash('secret123', 6);
    await User.create({ id: 'host-1', username: 'HostOne', email: 'host@test.com', password: hash });
    await User.verify('host-1');
    await User.create({ id: 'guest-2', username: 'GuestTwo', email: 'guest@test.com', password: hash });
    await User.verify('guest-2');

    const hostToken = (
      await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'host@test.com', password: 'secret123' } })
    ).json().token;
    const guestToken = (
      await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'guest@test.com', password: 'secret123' } })
    ).json().token;

    // Friend request flow
    const sendFr = await app.inject({
      method: 'POST',
      url: '/api/auth/guest-2/friend-request',
      headers: { authorization: `Bearer ${hostToken}` },
    });
    assert.equal(sendFr.statusCode, 200);

    const listFr = await app.inject({
      method: 'GET',
      url: '/api/auth/guest-2/friend-requests',
      headers: { authorization: `Bearer ${guestToken}` },
    });
    assert.equal(listFr.statusCode, 200);
    const reqId = listFr.json()[0].requestId;

    const acceptFr = await app.inject({
      method: 'POST',
      url: `/api/auth/friend-requests/${reqId}/accept`,
      headers: { authorization: `Bearer ${guestToken}` },
    });
    assert.equal(acceptFr.statusCode, 200);

    // Open public room appears in GET /api/rooms
    const openRoomRes = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { name: 'Public Lobby', isPublic: true, difficulty: 'normal', world: 1, stage: 1 },
    });
    assert.equal(openRoomRes.statusCode, 201);

    const listRooms = await app.inject({ method: 'GET', url: '/api/rooms' });
    assert.equal(listRooms.statusCode, 200);
    assert.equal(listRooms.json().length, 1);

    // Password-protected room creation (excluded from open listing, accessible by code)
    const createRoom = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { name: 'Alpha Squad', password: '42', isPublic: true, difficulty: 'normal', world: 1, stage: 1 },
    });
    assert.equal(createRoom.statusCode, 201);
    const room = createRoom.json();
    assert.equal(room.hasPassword, true);

    const code = room.id.replace(/-/g, '').slice(0, 6).toUpperCase();
    const byCode = await app.inject({ method: 'GET', url: `/api/rooms/by-code/${code}` });
    assert.equal(byCode.statusCode, 200);
    assert.equal(byCode.json().id, room.id);

    // Non-host patch fails 403; host patch succeeds
    const badPatch = await app.inject({
      method: 'PATCH',
      url: `/api/rooms/${room.id}`,
      headers: { authorization: `Bearer ${guestToken}` },
      payload: { world: 2 },
    });
    assert.equal(badPatch.statusCode, 403);

    const goodPatch = await app.inject({
      method: 'PATCH',
      url: `/api/rooms/${room.id}`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { world: 2, stage: 2 },
    });
    assert.equal(goodPatch.statusCode, 200);
    assert.equal(goodPatch.json().world, 2);

    // Host picks Tank first (deterministic), then guest joins and cannot steal Tank
    const setHostRole = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/character`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { role: 'Tank' },
    });
    assert.equal(setHostRole.statusCode, 200);

    // Join wrong password 403, right password 200
    const badJoin = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: { authorization: `Bearer ${guestToken}` },
      payload: { password: 'wrong' },
    });
    assert.equal(badJoin.statusCode, 403);

    const okJoin = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/join`,
      headers: { authorization: `Bearer ${guestToken}` },
      payload: { password: '42' },
    });
    assert.equal(okJoin.statusCode, 200);

    // Unique role enforcement (guest cannot pick Tank while host holds it)
    const dupRole = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/character`,
      headers: { authorization: `Bearer ${guestToken}` },
      payload: { role: 'Tank' },
    });
    assert.equal(dupRole.statusCode, 409);

    // Ready & game start transition
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/ready`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { isReady: true },
    });
    const allReady = await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/ready`,
      headers: { authorization: `Bearer ${guestToken}` },
      payload: { isReady: true },
    });
    assert.equal(allReady.statusCode, 200);
    assert.equal(allReady.json().allReady, true);

    // Leave & delete room
    const leaveRes = await app.inject({
      method: 'DELETE',
      url: `/api/rooms/${room.id}/join`,
      headers: { authorization: `Bearer ${guestToken}` },
    });
    assert.equal(leaveRes.statusCode, 200);

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/rooms/${room.id}`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    assert.equal(delRes.statusCode, 200);
  });
});


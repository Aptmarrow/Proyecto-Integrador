'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/database');
const { User, Friend, FriendRequest, FRIEND_REQUEST_STATUS, Inventory, Chip } = require('../src/models');
const { generateUserId, signToken, verifyToken } = require('../src/config/auth');
const authenticate = require('../src/middleware/auth');

function createFakeReply() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.payload = body;
      return this;
    },
  };
}

describe('Models, JWT auth, and authenticate middleware (mocked PG)', () => {
  let origQuery;
  let origConnect;
  let state;

  beforeEach(() => {
    origQuery = db.query;
    origConnect = db.pool.connect;

    state = {
      users: new Map(),
      inventories: new Map(),
      charSkins: new Set(),
      effSkins: new Set(),
      chips: new Map(),
      chipStats: new Map(),
      friends: new Set(),
      friendRequests: new Map(),
      nextInvId: 1,
      nextChipId: 1,
      nextReqId: 1,
    };

    const runQuery = async (sql, params = []) => {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      if (s === 'SELECT * FROM users WHERE email = $1') {
        const u = [...state.users.values()].find((x) => x.email === params[0]);
        return { rows: u ? [u] : [] };
      }
      if (s === 'SELECT * FROM users WHERE id = $1') {
        const u = state.users.get(params[0]);
        return { rows: u ? [u] : [] };
      }
      if (s.startsWith('SELECT id, username, email, is_verified, danmas FROM users')) {
        return {
          rows: [...state.users.values()].map(({ id, username, email, is_verified, danmas }) => ({
            id,
            username,
            email,
            is_verified,
            danmas,
          })),
        };
      }
      if (s.startsWith('INSERT INTO users')) {
        const [id, username, email, password, verification_token, danmas] = params;
        state.users.set(id, { id, username, email, password, is_verified: 0, verification_token, danmas });
        return { rows: [], rowCount: 1 };
      }
      if (s.startsWith('UPDATE users SET is_verified = 1')) {
        const u = state.users.get(params[0]);
        if (u) {
          u.is_verified = 1;
          u.verification_token = null;
        }
        return { rows: [], rowCount: u ? 1 : 0 };
      }
      if (s.startsWith('UPDATE users SET verification_token = $1')) {
        const u = state.users.get(params[1]);
        if (u) {
          u.verification_token = params[0];
          u.is_verified = 0;
        }
        return { rows: [], rowCount: u ? 1 : 0 };
      }
      if (s.startsWith('INSERT INTO inventory (owner_id)')) {
        const ownerId = params[0];
        if (![...state.inventories.values()].some((i) => i.owner_id === ownerId)) {
          const id = state.nextInvId++;
          state.inventories.set(id, { id, owner_id: ownerId, scraps: 0 });
        }
        return { rows: [], rowCount: 1 };
      }
      if (s === 'SELECT * FROM inventory WHERE owner_id = $1' || s === 'SELECT id FROM inventory WHERE owner_id = $1') {
        const inv = [...state.inventories.values()].find((i) => i.owner_id === params[0]);
        return { rows: inv ? [{ ...inv }] : [] };
      }
      if (s.startsWith('UPDATE inventory SET scraps = scraps + $1')) {
        const inv = [...state.inventories.values()].find((i) => i.owner_id === params[1]);
        if (inv) inv.scraps += params[0];
        return { rows: [], rowCount: 1 };
      }
      if (s.startsWith('UPDATE inventory SET scraps = GREATEST')) {
        const inv = [...state.inventories.values()].find((i) => i.owner_id === params[1]);
        if (inv) inv.scraps = Math.max(0, inv.scraps - params[0]);
        return { rows: [], rowCount: 1 };
      }
      if (s.startsWith('INSERT INTO inventory_character_skin')) {
        state.charSkins.add(`${params[0]}:${params[1]}`);
        return { rows: [], rowCount: 1 };
      }
      if (s === 'SELECT skin_id FROM inventory_character_skin WHERE inventory_id = $1') {
        const rows = [...state.charSkins]
          .filter((k) => k.startsWith(`${params[0]}:`))
          .map((k) => ({ skin_id: Number(k.split(':')[1]) }));
        return { rows };
      }
      if (s.startsWith('INSERT INTO inventory_effect_skin')) {
        state.effSkins.add(`${params[0]}:${params[1]}`);
        return { rows: [], rowCount: 1 };
      }
      if (s === 'SELECT skin_id FROM inventory_effect_skin WHERE inventory_id = $1') {
        const rows = [...state.effSkins]
          .filter((k) => k.startsWith(`${params[0]}:`))
          .map((k) => ({ skin_id: Number(k.split(':')[1]) }));
        return { rows };
      }
      if (s.startsWith('INSERT INTO chip (')) {
        const id = state.nextChipId++;
        const [inventory_id, name, rarity, level, image] = params;
        state.chips.set(id, { id, inventory_id, name, rarity, level, image });
        return { rows: [{ id }] };
      }
      if (s.startsWith('INSERT INTO chip_stats')) {
        const [chip_id, HP, Bullet_Damage, SP_Charge, Defense, Ultimate_Damage, Cadency, Critic_Chance, Crit_Damage] = params;
        state.chipStats.set(chip_id, {
          HP: HP !== null ? String(HP) : null,
          Bullet_Damage: Bullet_Damage !== null ? String(Bullet_Damage) : null,
          SP_Charge: SP_Charge !== null ? String(SP_Charge) : null,
          Defense: Defense !== null ? String(Defense) : null,
          Ultimate_Damage: Ultimate_Damage !== null ? String(Ultimate_Damage) : null,
          Cadency: Cadency !== null ? String(Cadency) : null,
          Critic_Chance: Critic_Chance !== null ? String(Critic_Chance) : null,
          Crit_Damage: Crit_Damage !== null ? String(Crit_Damage) : null,
        });
        return { rows: [], rowCount: 1 };
      }
      if (s.startsWith('UPDATE chip SET level = $1')) {
        const c = state.chips.get(params[1]);
        if (c) c.level = params[0];
        return { rows: [], rowCount: 1 };
      }
      if (s.includes('FROM chip c') && s.includes('WHERE c.id = $1')) {
        const c = state.chips.get(params[0]);
        if (!c) return { rows: [] };
        return { rows: [{ ...c, ...(state.chipStats.get(c.id) || {}) }] };
      }
      if (s.includes('FROM chip c') && s.includes('WHERE c.inventory_id = $1')) {
        const rows = [...state.chips.values()]
          .filter((c) => c.inventory_id === params[0])
          .map((c) => ({ ...c, ...(state.chipStats.get(c.id) || {}) }));
        return { rows };
      }
      if (s.startsWith('SELECT 1 FROM friend WHERE')) {
        return { rows: state.friends.has(`${params[0]}:${params[1]}`) ? [{ '?column?': 1 }] : [] };
      }
      if (s.startsWith('INSERT INTO friend (')) {
        state.friends.add(`${params[0]}:${params[1]}`);
        return { rows: [], rowCount: 1 };
      }
      if (s.startsWith('SELECT 1 FROM friend_request')) {
        const found = [...state.friendRequests.values()].some(
          (r) =>
            r.status === 0 &&
            ((r.sender_id === params[0] && r.receiver_id === params[1]) ||
              (r.sender_id === params[2] && r.receiver_id === params[3]))
        );
        return { rows: found ? [{ '?column?': 1 }] : [] };
      }
      if (s.startsWith('INSERT INTO friend_request')) {
        const id = state.nextReqId++;
        const row = { id, sender_id: params[0], receiver_id: params[1], status: 0, created_at: new Date().toISOString() };
        state.friendRequests.set(id, row);
        return { rows: [row] };
      }
      if (s.includes('FROM friend_request fr')) {
        const rows = [...state.friendRequests.values()]
          .filter((r) => r.receiver_id === params[0] && r.status === 0)
          .map((r) => ({ ...r, sender_username: state.users.get(r.sender_id)?.username || 'unknown' }));
        return { rows };
      }
      if (s === 'SELECT * FROM friend_request WHERE id = $1') {
        const r = state.friendRequests.get(params[0]);
        return { rows: r ? [r] : [] };
      }
      if (s.startsWith('UPDATE friend_request SET status = $1')) {
        const r = state.friendRequests.get(params[1]);
        if (r) r.status = params[0];
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unhandled mock SQL: ${s}`);
    };

    db.query = runQuery;
    db.pool.connect = async () => ({
      query: runQuery,
      release: () => {},
    });
  });

  afterEach(() => {
    db.query = origQuery;
    db.pool.connect = origConnect;
  });

  it('creates users, verifies them, signs and validates JWTs, and runs authenticate middleware', async () => {
    const uid = generateUserId();
    assert.equal(uid.length, 20);

    const created = await User.create({
      id: uid,
      username: 'PlayerOne',
      email: 'p1@nomercygames.me',
      password: 'hashed_password',
      verificationToken: 'tok123',
    });
    assert.equal(created.username, 'PlayerOne');
    assert.equal(created.is_verified, 0);

    await User.verify(uid);
    const verified = await User.findById(uid);
    assert.equal(verified.is_verified, 1);
    assert.equal(verified.verification_token, null);

    await User.setVerificationToken(uid, 'newtok');
    assert.equal((await User.findByEmail('p1@nomercygames.me')).verification_token, 'newtok');
    await User.verify(uid);

    const all = await User.findAll();
    assert.equal(all.length, 1);
    assert.equal('password' in all[0], false);

    const jwt = signToken(verified);
    const decoded = await verifyToken(jwt);
    assert.equal(decoded.user.id, uid);
    assert.equal(await verifyToken('not-a-jwt'), null);
    assert.equal(await verifyToken(''), null);

    // Middleware tests
    const replyNoAuth = createFakeReply();
    await authenticate({ headers: {} }, replyNoAuth);
    assert.equal(replyNoAuth.statusCode, 401);

    const replyBadJwt = createFakeReply();
    await authenticate({ headers: { authorization: 'Bearer invalid.token.value' } }, replyBadJwt);
    assert.equal(replyBadJwt.statusCode, 401);

    const reqGuest = { headers: { authorization: 'Bearer guest_local' } };
    await authenticate(reqGuest, createFakeReply());
    assert.equal(reqGuest.user.id, 'guest_local');

    const reqValid = { headers: { authorization: `Bearer ${jwt}` } };
    await authenticate(reqValid, createFakeReply());
    assert.equal(reqValid.user.email, 'p1@nomercygames.me');
    assert.equal(reqValid.user.isVerified, true);
  });

  it('manages inventory scraps, skins, chips with numeric stats, and friends', async () => {
    await User.create({ id: 'u1', username: 'Alpha', email: 'a@test.com', password: 'pw' });
    await User.create({ id: 'u2', username: 'Beta', email: 'b@test.com', password: 'pw' });

    await Inventory.addScraps('u1', 50);
    await Inventory.removeScraps('u1', 20);
    await Inventory.removeScraps('u1', 999); // clamps to 0
    await Inventory.addCharacterSkin('u1', 7);
    await Inventory.addEffectSkin('u1', 12);

    const inv = await Inventory.findByOwner('u1');
    assert.equal(inv.scraps, 0);
    assert.deepEqual(inv.character_skins, [7]);
    assert.deepEqual(inv.effect_skins, [12]);

    const chip = await Chip.create({
      inventoryId: inv.id,
      name: 'Plasma Core',
      rarity: 3,
      level: 1,
      stats: { HP: 25, Bullet_Damage: 4.5, Critic_Chance: 10 },
    });
    assert.equal(chip.name, 'Plasma Core');
    assert.equal(chip.stats.HP, 25);
    assert.equal(chip.stats.Bullet_Damage, 4.5);

    await Chip.updateLevel(chip.id, 5);
    await Chip.updateStats(chip.id, { HP: 40, Defense: 15 });
    const updatedChip = await Chip.findById(chip.id);
    assert.equal(updatedChip.level, 5);
    assert.equal(updatedChip.stats.HP, 40);
    assert.equal(updatedChip.stats.Defense, 15);

    const fr = await FriendRequest.create('u1', 'u2');
    assert.equal(await FriendRequest.hasPending('u1', 'u2'), true);
    const pending = await FriendRequest.findPendingForReceiver('u2');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].sender_username, 'Alpha');

    await FriendRequest.updateStatus(fr.id, FRIEND_REQUEST_STATUS.Aceptada);
    await Friend.createPair('u1', 'u2');
    assert.equal(await Friend.exists('u1', 'u2'), true);
    assert.equal(await Friend.exists('u2', 'u1'), true);
    assert.equal(await FriendRequest.hasPending('u1', 'u2'), false);
  });
});


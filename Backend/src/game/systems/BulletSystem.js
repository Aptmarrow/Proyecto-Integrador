'use strict';

const { acquireBullet, releaseBullet } = require('../entities/Bullet');
const SpatialHash                      = require('./SpatialHash');
const { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_RADIUS } = require('../physics');

const BULLET_RADIUS = 4;
const BULLET_SPEED  = 400;  // px / s
const BULLET_TTL    = 3.8;  // seconds
// Largest radius we ever query from a player position
const MAX_QUERY_R   = PLAYER_RADIUS + 16;

class BulletSystem {
  constructor() {
    /** @type {import('../entities/Bullet').Bullet[]} */
    this.active = [];
    this.hash   = new SpatialHash(100);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Spawn a new bullet from (x, y) in direction `angle` (radians).
   */
  spawn(ownerId, x, y, angle, speed = BULLET_SPEED, radius = BULLET_RADIUS, ttl = BULLET_TTL, type = 'normal', damage = 5, color = null, opts = null) {
    const vx     = Math.cos(angle) * speed;
    const vy     = Math.sin(angle) * speed;
    const bullet = acquireBullet(ownerId, x, y, vx, vy, radius, ttl, type, damage, color, opts);
    this.active.push(bullet);
    this.hash.insert(bullet);
    return bullet;
  }

  /**
   * Spawn a bullet directly with velocity components vx, vy.
   */
  spawnBullet(ownerId, x, y, vx, vy, radius = BULLET_RADIUS, ttl = BULLET_TTL, type = 'normal', damage = 5, color = null, opts = null) {
    const bullet = acquireBullet(ownerId, x, y, vx, vy, radius, ttl, type, damage, color, opts);
    this.active.push(bullet);
    this.hash.insert(bullet);
    return bullet;
  }

  _findNearestPlayerPos(x, y, players) {
    if (!players) return null;
    let best = null;
    let bestD2 = Infinity;
    for (const [, p] of players) {
      if (!p.active || p.hp <= 0) continue;
      const pos = p.body.getPosition();
      const d2 = (pos.x - x) * (pos.x - x) + (pos.y - y) * (pos.y - y);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = pos;
      }
    }
    return best;
  }

  _splitBoulder(b) {
    const count = b.splitCount || 6;
    const sx = Math.max(12, Math.min(WORLD_WIDTH - 12, b.x));
    const sy = Math.max(12, Math.min(WORLD_HEIGHT - 12, b.y));
    const baseRot = Math.atan2(b.vy, b.vx);
    for (let k = 0; k < count; k++) {
      const a = baseRot + (Math.PI * 2 * k) / count;
      this.spawn(
        'boss',
        sx,
        sy,
        a,
        165,
        4.5,
        3.4,
        'normal',
        4,
        b.color || 0x9ca3af,
        { spriteType: b.spriteType || 'MObullet4png' }
      );
    }
  }

  /**
   * Advance the simulation one tick.
   */
  update(deltaTime, players) {
    const toSplit = [];

    // ── Phase 1: move & expire ────────────────────────────────────────────────
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];

      this.hash.remove(b);
      const targetPos = b.homeRate > 0 && b.homeTime > 0 ? this._findNearestPlayerPos(b.x, b.y, players) : null;
      b.update(deltaTime, targetPos);

      const hitMapEdge =
        b.splitOnImpact &&
        b.age > 0.14 &&
        (b.x <= 6 ||
          b.y <= 6 ||
          b.y >= WORLD_HEIGHT - 6 ||
          (b.x >= WORLD_WIDTH - 6 && b.vx > 0));

      if (hitMapEdge) {
        toSplit.push(b);
        releaseBullet(b);
        this.active.splice(i, 1);
        continue;
      }

      if (
        b.ttl <= 0 ||
        b.x < -24 || b.x > WORLD_WIDTH + 24 ||
        b.y < -24 || b.y > WORLD_HEIGHT + 24
      ) {
        releaseBullet(b);
        this.active.splice(i, 1);
        continue;
      }

      this.hash.insert(b); // insert at new position
    }

    // ── Phase 2 & 3: collision detection ─────────────────────────────────────
    const hits    = [];
    const toKill  = new Set();

    for (const [playerId, player] of players) {
      if (!player.active || player.hp <= 0) continue;
      const pos = player.body.getPosition();

      const candidates = this.hash.query(pos.x, pos.y, MAX_QUERY_R);
      for (const b of candidates) {
        if (toKill.has(b)) continue;
        if (b.delay > 0) continue;
        if (b.ownerId === playerId) continue;
        if (b.ownerId !== 'boss') continue;

        const dx = b.x - pos.x;
        const dy = b.y - pos.y;
        const hitboxRadius = player.input?.focus ? 5 : PLAYER_RADIUS;
        const minDist = hitboxRadius + b.radius;
        if (dx * dx + dy * dy <= minDist * minDist) {
          hits.push({ playerId, bulletId: b.id, ownerId: b.ownerId, damage: b.damage || 5 });
          if (b.splitOnImpact) toSplit.push(b);
          toKill.add(b);
        }
      }
    }

    for (const b of toKill) {
      this.hash.remove(b);
      releaseBullet(b);
      const idx = this.active.indexOf(b);
      if (idx !== -1) this.active.splice(idx, 1);
    }

    for (const b of toSplit) {
      this._splitBoulder(b);
    }

    return hits;
  }

  clearByOwner(ownerId) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      if (b.ownerId === ownerId) {
        this.hash.remove(b);
        releaseBullet(b);
        this.active.splice(i, 1);
      }
    }
  }

  /**
   * Release all suspended boss wake bullets matching `holdTag` with an optional
   * cascading stagger (seconds per bullet) for Byakuren-style synchronized wakeups.
   */
  releaseHeldBullets(holdTag, staggerSec = 0.012) {
    let idx = 0;
    for (let i = 0; i < this.active.length; i++) {
      const b = this.active[i];
      if (b.holdTag === holdTag) {
        b.holdTag = null;
        b.delay = idx * staggerSec;
        idx++;
      }
    }
    return idx;
  }

  clear() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      this.hash.remove(b);
      releaseBullet(b);
    }
    this.active.length = 0;
  }

  getState() {
    return this.active.map((b) => {
      const item = {
        id:      b.id,
        x:       b.x,
        y:       b.y,
        radius:  b.radius,
        ownerId: b.ownerId,
        type:    b.type || 'normal',
      };
      if (typeof b.color === 'number') {
        item.color = b.color;
      }
      if (b.spriteType) {
        item.spriteType = b.spriteType;
        item.angle = Number(Math.atan2(b.vy, b.vx).toFixed(2));
      }
      return item;
    });
  }
}

module.exports = { BulletSystem, BULLET_RADIUS, BULLET_SPEED };

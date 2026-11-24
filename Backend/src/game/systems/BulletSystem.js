'use strict';

const { acquireBullet, releaseBullet } = require('../entities/Bullet');
const SpatialHash                      = require('./SpatialHash');
const { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_RADIUS } = require('../physics');

const BULLET_RADIUS = 4;
const BULLET_SPEED  = 400;  // px / s
const BULLET_TTL    = 3.8;  // seconds
// Largest radius we ever query from a player position
const MAX_QUERY_R   = PLAYER_RADIUS + 8;

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
  spawn(ownerId, x, y, angle, speed = BULLET_SPEED, radius = BULLET_RADIUS, ttl = BULLET_TTL, type = 'normal', damage = 5, color = null) {
    const vx     = Math.cos(angle) * speed;
    const vy     = Math.sin(angle) * speed;
    const bullet = acquireBullet(ownerId, x, y, vx, vy, radius, ttl, type, damage, color);
    this.active.push(bullet);
    this.hash.insert(bullet);
    return bullet;
  }

  /**
   * Spawn a bullet directly with velocity components vx, vy.
   */
  spawnBullet(ownerId, x, y, vx, vy, radius = BULLET_RADIUS, ttl = BULLET_TTL, type = 'normal', damage = 5, color = null) {
    const bullet = acquireBullet(ownerId, x, y, vx, vy, radius, ttl, type, damage, color);
    this.active.push(bullet);
    this.hash.insert(bullet);
    return bullet;
  }

  /**
   * Advance the simulation one tick.
   */
  update(deltaTime, players) {
    // ── Phase 1: move & expire ────────────────────────────────────────────────
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];

      this.hash.remove(b);
      b.update(deltaTime);

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
        if (b.ownerId === playerId) continue;
        if (b.ownerId !== 'boss') continue;

        const dx = b.x - pos.x;
        const dy = b.y - pos.y;
        const hitboxRadius = player.input?.focus ? 5 : PLAYER_RADIUS;
        const minDist = hitboxRadius + b.radius;
        if (dx * dx + dy * dy <= minDist * minDist) {
          hits.push({ playerId, bulletId: b.id, ownerId: b.ownerId, damage: b.damage || 5 });
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
      return item;
    });
  }
}

module.exports = { BulletSystem, BULLET_RADIUS, BULLET_SPEED };

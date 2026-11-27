'use strict';

let _nextId = 0;

class Bullet {
  constructor() {
    this.id      = '';
    this.x       = 0;
    this.y       = 0;
    this.vx      = 0;
    this.vy      = 0;
    this.radius  = 4;
    this.damage  = 5;   // int = 5 default damage
    this.ownerId = '';
    this.type    = 'normal';
    this.color   = null;
    this.ttl     = 0;   // remaining life in seconds
    this.active  = false;
    this.spriteType    = null;
    this.accel         = 0;
    this.expAccel      = 0;
    this.maxSpeed      = 0;
    this.homeRate      = 0;
    this.homeTime      = 0;
    this.splitOnImpact = false;
    this.splitCount    = 6;
    this.age           = 0;
    this.delay         = 0;
    this.turnAfter     = 0;
    this.turnAngle     = 0;
    this.turnSpeedMult = 1;
    this.turnColor     = null;
    this._turned       = false;
    this.holdTag       = null;
    // Spatial hash tracking (set by SpatialHash)
    this._cellX  = NaN;
    this._cellY  = NaN;
  }

  /**
   * Reuse this bullet (pool pattern).
   */
  init(ownerId, x, y, vx, vy, radius = 4, ttl = 3, type = 'normal', damage = 5, color = null, opts = null) {
    this.id      = `b${_nextId++}`;
    this.ownerId = ownerId;
    this.x       = x;
    this.y       = y;
    this.vx      = vx;
    this.vy      = vy;
    this.radius  = radius;
    this.damage  = damage;
    this.ttl     = ttl;
    this.type    = type;
    this.color   = color;
    this.active  = true;
    this.spriteType    = opts?.spriteType || null;
    this.accel         = Number(opts?.accel) || 0;
    this.expAccel      = Number(opts?.expAccel) || 0;
    this.maxSpeed      = Number(opts?.maxSpeed) || 0;
    this.homeRate      = Number(opts?.homeRate) || 0;
    this.homeTime      = Number(opts?.homeTime) || 0;
    this.splitOnImpact = Boolean(opts?.splitOnImpact);
    this.splitCount    = opts?.splitCount || 6;
    this.age           = 0;
    this.delay         = Math.max(0, Number(opts?.delay) || 0);
    this.turnAfter     = Math.max(0, Number(opts?.turnAfter) || 0);
    this.turnAngle     = Number(opts?.turnAngle) || 0;
    this.turnSpeedMult = Number(opts?.turnSpeedMult) || 1;
    this.turnColor     = opts?.turnColor ?? null;
    this._turned       = false;
    this.holdTag       = opts?.holdTag ?? null;
    this._cellX  = NaN;
    this._cellY  = NaN;
    return this;
  }

  update(deltaTime, targetPos = null) {
    // Suspended wake phase: bullet glows stationary along boss tackle trail until delay expires
    if (this.delay > 0) {
      this.delay = Math.max(0, this.delay - deltaTime);
      return;
    }

    this.age += deltaTime;

    // Scheduled Konngara-style path twist mid-flight
    if (!this._turned && this.turnAfter > 0 && this.age >= this.turnAfter) {
      this._turned = true;
      const spd = Math.hypot(this.vx, this.vy) * (this.turnSpeedMult || 1);
      const nextAngle = Math.atan2(this.vy, this.vx) + this.turnAngle;
      this.vx = Math.cos(nextAngle) * spd;
      this.vy = Math.sin(nextAngle) * spd;
      if (this.turnColor !== null && this.turnColor !== undefined) {
        this.color = this.turnColor;
      }
    }

    if (this.expAccel !== 0) {
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > 0.001) {
        const nextSpd = this.maxSpeed > 0
          ? Math.min(this.maxSpeed, spd * Math.exp(this.expAccel * deltaTime))
          : Math.max(10, spd * Math.exp(this.expAccel * deltaTime));
        const factor = nextSpd / spd;
        this.vx *= factor;
        this.vy *= factor;
      }
    } else if (this.accel !== 0) {
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > 0.001) {
        const nextSpd = this.maxSpeed > 0
          ? Math.min(this.maxSpeed, spd + this.accel * deltaTime)
          : Math.max(10, spd + this.accel * deltaTime);
        const factor = nextSpd / spd;
        this.vx *= factor;
        this.vy *= factor;
      }
    }

    if (this.homeRate > 0 && this.homeTime > 0 && targetPos) {
      this.homeTime -= deltaTime;
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > 0.001) {
        const curAngle = Math.atan2(this.vy, this.vx);
        const aimAngle = Math.atan2(targetPos.y - this.y, targetPos.x - this.x);
        const diff = Math.atan2(Math.sin(aimAngle - curAngle), Math.cos(aimAngle - curAngle));
        const maxTurn = this.homeRate * deltaTime;
        const step = Math.max(-maxTurn, Math.min(maxTurn, diff));
        const nextAngle = curAngle + step;
        this.vx = Math.cos(nextAngle) * spd;
        this.vy = Math.sin(nextAngle) * spd;
      }
    }

    this.x   += this.vx * deltaTime;
    this.y   += this.vy * deltaTime;
    this.ttl -= deltaTime;
  }
}

// ── Object pool ───

const POOL_SIZE = 1400;
const _pool     = Array.from({ length: POOL_SIZE }, () => new Bullet());
let   _poolIdx  = 0;

/**
 * Acquire an inactive Bullet from the pool and initialise it.
 * Falls back to a fresh allocation if the pool is exhausted.
 */
function acquireBullet(ownerId, x, y, vx, vy, radius, ttl, type = 'normal', damage = 5, color = null, opts = null) {
  const start = _poolIdx;
  do {
    const b = _pool[_poolIdx];
    _poolIdx = (_poolIdx + 1) % POOL_SIZE;
    if (!b.active) return b.init(ownerId, x, y, vx, vy, radius, ttl, type, damage, color, opts);
  } while (_poolIdx !== start);

  return new Bullet().init(ownerId, x, y, vx, vy, radius, ttl, type, damage, color, opts);
}

function releaseBullet(bullet) {
  bullet.active = false;
}

module.exports = { Bullet, acquireBullet, releaseBullet };

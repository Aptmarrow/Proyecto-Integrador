'use strict';

const { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_RADIUS } = require('../physics');
const { releaseBullet } = require('../entities/Bullet');
const {
  ENABLE_NORMAL_OVERHAUL,
  updateSpecialEnemyTrajectory,
  fireSpecialEnemyPattern,
} = require('../campaign/normalCampaignOverhaul');

let _nextEnemyId = 0;

/**
 * Backend-authoritative enemy system for the 27-Level Space Campaign.
 * Supports space trajectories, geometric danmaku patterns, colored bullets, and 1–4 player HP scaling.
 */
class EnemySystem {
  constructor() {
    /** @type {Array<object>} */
    this.active = [];
  }

  spawn(config) {
    const hpVal = Math.max(6, Math.round(config.hp || 14));
    const enemy = {
      id: `enemy_${_nextEnemyId++}`,
      type: config.type || 'green_fairy',
      x: config.startX ?? WORLD_WIDTH + 40,
      y: config.startY ?? WORLD_HEIGHT / 2,
      vx: -(config.speed || 140),
      vy: 0,
      hp: hpVal,
      maxHp: hpVal,
      radius: config.radius || 16,
      scoreValue: config.scoreValue || 220,
      itemDrop: config.itemDrop || 'point',
      isDead: false,
      isMiniboss: Boolean(config.isMiniboss),
      minibossName: config.minibossName || null,
      sprite: config.sprite || null,
      trajectory: config.trajectory || 'straight',
      attackPattern: config.attackPattern || 'none',
      shootInterval: config.shootInterval || 1.6,
      shootTimer: -(config.shootDelay || 0.25),
      bulletColor: config.bulletColor ?? null,
      customParams: config.customParams ? { ...config.customParams } : {},
      spawnTime: 0,
      speed: config.speed || 140,
      startX: config.startX ?? WORLD_WIDTH + 40,
      startY: config.startY ?? WORLD_HEIGHT / 2,
      angle: Math.PI,
      _fuseProgress: null,
    };
    this.active.push(enemy);
    return enemy;
  }

  /**
   * Spawn a full wave of space enemy descriptors scaled by squad size.
   */
  spawnWaveDescriptors(descriptors, squadScale = 1.0) {
    if (!Array.isArray(descriptors)) return;
    for (const desc of descriptors) {
      this.spawn({
        ...desc,
        hp: Math.round((desc.hp || 16) * squadScale),
      });
    }
  }

  // Legacy wave fallbacks
  spawnDoubleHelixWave(countPerLine = 5) {
    for (let i = 0; i < countPerLine; i++) {
      this.spawn({
        type: 'green_fairy', trajectory: 'double_helix', attackPattern: 'aimed_single',
        startX: WORLD_WIDTH + 50 + i * 60, startY: 170, speed: 130, hp: 14,
        itemDrop: i % 2 === 0 ? 'power' : 'point',
        customParams: { freq: 3.2, amp: 70, phase: i * 0.4 },
      });
      this.spawn({
        type: 'yellow_fairy', trajectory: 'double_helix', attackPattern: 'helix_stream',
        startX: WORLD_WIDTH + 50 + i * 60, startY: 430, speed: 130, hp: 16,
        itemDrop: 'power',
        customParams: { freq: 3.2, amp: 70, phase: i * 0.4 + Math.PI },
      });
    }
  }

  spawnPincerWave(countPerSide = 3) {
    for (let i = 0; i < countPerSide; i++) {
      this.spawn({
        type: 'red_fairy', trajectory: 'hover_retreat', attackPattern: 'flower_burst',
        startX: WORLD_WIDTH + 50 + i * 70, startY: 100 + i * 20, speed: 150, hp: 28,
        itemDrop: 'power', shootInterval: 1.1,
        customParams: { hoverX: 580 - i * 30, hoverTime: 3.8 },
      });
      this.spawn({
        type: 'red_fairy', trajectory: 'hover_retreat', attackPattern: 'flower_burst',
        startX: WORLD_WIDTH + 50 + i * 70, startY: 500 - i * 20, speed: 150, hp: 28,
        itemDrop: 'point', shootInterval: 1.1,
        customParams: { hoverX: 580 - i * 30, hoverTime: 3.8 },
      });
    }
  }

  spawnCommanderWave(startX, startY) {
    startX = startX || WORLD_WIDTH + 50;
    startY = startY || WORLD_HEIGHT / 2;
    this.spawn({
      type: 'big_fairy', trajectory: 'hover_retreat', attackPattern: 'star_rings',
      startX, startY, speed: 60, hp: 130, radius: 30, scoreValue: 1200,
      itemDrop: 'life_frag', shootInterval: 0.85,
      customParams: { hoverX: 530, hoverTime: 7.5 },
    });
  }

  spawnPurpleAssaultWave() {
    for (const [i, sy] of [120, 220, 380, 480].entries()) {
      this.spawn({
        type: 'purple_fairy', trajectory: 'hover_retreat', attackPattern: 'ring_burst',
        startX: WORLD_WIDTH + 50 + i * 40, startY: sy, speed: 120, hp: 38,
        itemDrop: i % 2 === 0 ? 'power' : 'point',
        shootInterval: 1.0,
        customParams: { hoverX: 560 - (i % 2) * 40, hoverTime: 4.2 },
      });
    }
  }

  spawnCrossfireWave(count = 8) {
    for (let i = 0; i < count; i++) {
      const isTop = i % 2 === 0;
      this.spawn({
        type: 'green_fairy', trajectory: isTop ? 'cross_top' : 'cross_bottom',
        attackPattern: 'needle_stream',
        startX: WORLD_WIDTH + 40 + i * 50, startY: isTop ? 36 : WORLD_HEIGHT - 36,
        speed: 170, hp: 18,
        itemDrop: i % 3 === 0 ? 'power' : 'point',
        shootInterval: 0.9, shootDelay: 0.15 + i * 0.1,
      });
    }
  }

  runWavePattern(waveId) {
    switch (waveId) {
      case 1: this.spawnDoubleHelixWave(6); break;
      case 2: this.spawnPincerWave(3); break;
      case 3: this.spawnCommanderWave(); break;
      case 4: this.spawnPurpleAssaultWave(); break;
      case 5: this.spawnCrossfireWave(8); break;
    }
  }

  _findNearestPlayer(e, fallbackPos, players) {
    if (!players || players.size === 0) return fallbackPos;
    let best = fallbackPos;
    let bestD2 = Infinity;
    for (const [, p] of players) {
      if (!p.active || p.hp <= 0) continue;
      const pos = p.body.getPosition();
      const d2 = (pos.x - e.x) * (pos.x - e.x) + (pos.y - e.y) * (pos.y - e.y);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = pos;
      }
    }
    return best;
  }

  update(dt, bulletSystem, playerPos, context = {}) {
    const defeated = [];

    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (e.isDead) continue;

      e.spawnTime += dt;
      const nearestPlayerPos = this._findNearestPlayer(e, playerPos, context.players);
      this._moveEnemy(e, dt, playerPos, nearestPlayerPos);

      // Smoothly orient enemy toward nearest player when chasing or preparing to fire
      if (nearestPlayerPos && e.type !== 'mo_enemy2') {
        e.angle = Math.atan2(nearestPlayerPos.y - e.y, nearestPlayerPos.x - e.x);
      }

      // Kamikaze enemy (MOenemy2): proximity arms fuse countdown; explodes on contact OR armed countdown end
      if (e.type === 'mo_enemy2') {
        const fuseTime = e.customParams?.fuseTime || 1.75;
        const armed = Boolean(e.customParams?._fuseActive);
        const fuseElapsed = e.customParams?._fuseElapsed || 0;
        const dx = nearestPlayerPos.x - e.x;
        const dy = nearestPlayerPos.y - e.y;
        const touchDist = e.radius + PLAYER_RADIUS + 6;
        if (dx * dx + dy * dy <= touchDist * touchDist || (armed && fuseElapsed >= fuseTime)) {
          e.isDead = true;
          for (let k = 0; k < 8; k++) {
            const a = (Math.PI * 2 * k) / 8;
            bulletSystem.spawn('boss', e.x, e.y, a, 145, 4.5, 0.36, 'normal', 4, 0xfef08a, {
              spriteType: 'MObullet3png',
            });
          }
          context.onKamikazeExplode?.(e.x, e.y, 58, 16);
          this.active.splice(i, 1);
          continue;
        }
      }

      if (!e.isMiniboss && e.type !== 'mo_enemy2' && (e.x < -70 || (e.spawnTime > 6.0 && e.x > WORLD_WIDTH + 220) || e.y < -90 || e.y > WORLD_HEIGHT + 90)) {
        this.active.splice(i, 1);
        continue;
      }

      e.shootTimer += dt;
      if (e.x < WORLD_WIDTH - 8 && e.x > 40 && e.shootTimer >= e.shootInterval && e.attackPattern !== 'none') {
        e.shootTimer = 0;
        this._enemyShoot(e, bulletSystem, nearestPlayerPos || playerPos, dt);
      }
    }

    // Player bullet -> enemy collision
    for (let i = bulletSystem.active.length - 1; i >= 0; i--) {
      const b = bulletSystem.active[i];
      if (b.ownerId === 'boss') continue;

      for (let j = this.active.length - 1; j >= 0; j--) {
        const e = this.active[j];
        if (e.isDead) continue;

        const dx = b.x - e.x;
        const dy = b.y - e.y;
        if (dx * dx + dy * dy < (e.radius + b.radius) * (e.radius + b.radius)) {
          e.hp -= b.damage || 5;
          bulletSystem.hash.remove(b);
          releaseBullet(b);
          bulletSystem.active.splice(i, 1);

          if (e.hp <= 0) {
            e.isDead = true;
            defeated.push({
              x: e.x,
              y: e.y,
              score: e.scoreValue,
              itemDrop: e.itemDrop,
              isMiniboss: Boolean(e.isMiniboss),
              minibossName: e.minibossName || null,
            });
            this.active.splice(j, 1);
          }
          break;
        }
      }
    }

    return defeated;
  }

  _moveEnemy(e, dt, playerPos, nearestPlayerPos) {
    if (ENABLE_NORMAL_OVERHAUL && updateSpecialEnemyTrajectory(e, dt, playerPos, nearestPlayerPos)) {
      return;
    }

    const t = e.spawnTime;
    const p = e.customParams || {};

    switch (e.trajectory) {
      case 'v_formation':
        e.x -= e.speed * dt;
        e.y = e.startY + Math.sin(t * 1.8) * (p.driftY || 16);
        break;
      case 'perimeter_skimmer':
        e.x -= e.speed * dt;
        e.y = e.startY + Math.sin(t * 3.2) * (p.bobAmp || 12);
        break;
      case 'orbit_anchor': {
        const ax = p.anchorX || 545;
        const ay = p.anchorY || 300;
        const r = p.orbitR || 80;
        const ang = t * 2.1 + (p.phase || 0);
        if (t < 1.8) {
          const k = t / 1.8;
          const tx = ax + Math.cos(ang) * r * 0.65;
          const ty = ay + Math.sin(ang) * r;
          e.x = e.startX + (tx - e.startX) * k;
          e.y = e.startY + (ty - e.startY) * k;
        } else if (t < 7.4) {
          e.x = ax + Math.cos(ang) * r * 0.65;
          e.y = ay + Math.sin(ang) * r;
        } else {
          e.x -= e.speed * 1.15 * dt;
        }
        break;
      }
      case 'pendulum':
        e.x -= e.speed * 0.78 * dt;
        e.y = e.startY + Math.sin(t * (p.freq || 2.1) + (p.phase || 0)) * (p.ampY || 140);
        break;
      case 'swoop_arc': {
        const apexX = p.apexX || 510;
        const targetY = p.targetY || 300;
        if (t < 1.9) {
          const ease = 1 - Math.pow(1 - t / 1.9, 2);
          e.x = e.startX + (apexX - e.startX) * ease;
          e.y = e.startY + (targetY - e.startY) * ease;
        } else {
          e.x -= e.speed * 1.15 * dt;
          e.y += (e.startY < 300 ? 1 : -1) * e.speed * 0.35 * dt;
        }
        break;
      }
      case 'sine':
        e.x -= e.speed * dt;
        e.y = e.startY + (p.amp || 65) * Math.sin((p.freq || 2.8) * t + (p.phase || 0));
        break;
      case 'double_helix':
        e.x -= e.speed * dt;
        e.y = e.startY + (p.amp || 70) * Math.sin((p.freq || 3.1) * t + (p.phase || 0));
        break;
      case 'hover_retreat': {
        const hoverX = p.hoverX || 560;
        const hoverTime = p.hoverTime || 4.2;
        if (e.x > hoverX && t <= hoverTime) {
          e.x -= e.speed * 1.25 * dt;
        } else if (t > hoverTime) {
          e.x -= e.speed * 0.7 * dt;
        }
        e.y = e.startY + Math.sin(t * 2.4) * 16;
        break;
      }
      case 'spiral': {
        const phase = p.phase || 0;
        e.x -= e.speed * 0.68 * dt;
        e.y = e.startY + Math.sin(t * 2.9 + phase) * 68;
        break;
      }
      case 'cross_top':
        e.x -= e.speed * dt;
        e.y = e.startY + Math.abs(Math.sin(t * 1.7)) * 165;
        break;
      case 'cross_bottom':
        e.x -= e.speed * dt;
        e.y = e.startY - Math.abs(Math.sin(t * 1.7)) * 165;
        break;
      case 'zigzag':
        e.x -= e.speed * dt;
        e.y = Math.max(36, Math.min(WORLD_HEIGHT - 36, e.y + ((Math.floor(t * 1.8) % 2 === 0 ? 1 : -1) * e.speed * 0.55 * dt)));
        break;
      default:
        e.x += e.vx * dt;
        break;
    }
  }

  _defaultColorForEnemy(e) {
    if (typeof e.bulletColor === 'number') return e.bulletColor;
    if (e.type === 'big_fairy') return 0xffdd00;
    if (e.type === 'red_fairy') return 0xff2b5b;
    if (e.type === 'purple_fairy') return 0xa855f7;
    if (e.type === 'yellow_fairy') return 0xfacc15;
    return 0x00f2fe;
  }

  _enemyShoot(e, bulletSystem, playerPos, dt = 1 / 60) {
    e.angle = Math.atan2(playerPos.y - e.y, playerPos.x - e.x);
    if (ENABLE_NORMAL_OVERHAUL && fireSpecialEnemyPattern(e, bulletSystem, playerPos, dt)) {
      return;
    }

    const angle = Math.atan2(playerPos.y - e.y, playerPos.x - e.x);
    const col = this._defaultColorForEnemy(e);
    const ttl = 4.2;

    switch (e.attackPattern) {
      case 'aimed_single':
        bulletSystem.spawn('boss', e.x, e.y, angle, 188, 4, ttl, 'normal', 5, col);
        break;
      case 'aimed_spread':
        for (const off of [-0.26, 0, 0.26]) {
          bulletSystem.spawn('boss', e.x, e.y, angle + off, 185, 4, ttl, 'normal', 5, col);
        }
        break;
      case 'crescent_arc':
        for (const [idx, off] of [-0.36, -0.18, 0, 0.18, 0.36].entries()) {
          const spd = 195 - Math.abs(idx - 2) * 14;
          bulletSystem.spawn('boss', e.x, e.y, angle + off, spd, 4.5, ttl, 'normal', 5, col);
        }
        break;
      case 'prism_fan':
        bulletSystem.spawn('boss', e.x, e.y, angle - 0.22, 198, 4, ttl, 'normal', 5, col);
        bulletSystem.spawn('boss', e.x, e.y, angle + 0.22, 198, 4, ttl, 'normal', 5, col);
        bulletSystem.spawn('boss', e.x, e.y, angle, 152, 5, ttl, 'normal', 5, 0xffffff);
        break;
      case 'siege_curtain':
        // Horizontal corridor volley designed so Tank's Wall blocks the entire salvo
        bulletSystem.spawn('boss', e.x - 10, e.y - 10, Math.PI, 192, 4.5, ttl, 'normal', 5, col);
        bulletSystem.spawn('boss', e.x - 10, e.y + 10, Math.PI, 192, 4.5, ttl, 'normal', 5, col);
        break;
      case 'nova_mandala': {
        const petals = e.customParams?.petals || 5;
        const total = petals * 3;
        const rot = e.spawnTime * 1.1;
        for (let k = 0; k < total; k++) {
          const theta = (Math.PI * 2 * k) / total;
          const factor = 1 - 0.22 * Math.abs(Math.sin((petals * theta) * 0.5));
          bulletSystem.spawn('boss', e.x, e.y, rot + theta, 175 * factor, k % 3 === 0 ? 5 : 4, ttl, 'normal', 5, k % 3 === 0 ? 0xffffff : col);
        }
        break;
      }
      case 'pulsar_sweep': {
        const dir = e.customParams?.spinDir || 1;
        const base = e.spawnTime * 2.1 * dir;
        for (let b = 0; b < 3; b++) {
          const a = base + (Math.PI * 2 * b) / 3;
          bulletSystem.spawn('boss', e.x, e.y, a, 182, 4.5, ttl, 'normal', 5, col);
        }
        break;
      }
      case 'helix_stream':
        bulletSystem.spawn('boss', e.x, e.y, angle + 0.19, 196, 4, ttl, 'normal', 5, col);
        bulletSystem.spawn('boss', e.x, e.y, angle - 0.19, 196, 4, ttl, 'normal', 5, 0x00f2fe);
        break;
      case 'flower_burst': {
        const arms = 6;
        const base = e.spawnTime * 1.4;
        for (let k = 0; k < arms; k++) {
          const a = base + (Math.PI * 2 * k) / arms;
          bulletSystem.spawn('boss', e.x, e.y, a, 172, 4.5, ttl, 'normal', 5, col);
        }
        break;
      }
      case 'ring_burst': {
        const count = 10;
        const base = e.spawnTime * 0.8;
        for (let k = 0; k < count; k++) {
          const a = base + (Math.PI * 2 * k) / count;
          bulletSystem.spawn('boss', e.x, e.y, a, 158, 4, ttl, 'normal', 4, col);
        }
        break;
      }
      case 'star_rings': {
        const count = 12;
        const base = e.spawnTime * 1.7;
        for (let k = 0; k < count; k++) {
          const a = base + (Math.PI * 2 * k) / count;
          bulletSystem.spawn('boss', e.x, e.y, a, 154, 5, ttl, 'normal', 5, col);
        }
        break;
      }
      case 'cross_spread':
        for (const offset of [-0.32, 0, 0.32]) {
          bulletSystem.spawn('boss', e.x, e.y, angle + offset, 200, 4, ttl, 'normal', 5, col);
        }
        break;
      case 'needle_stream':
        bulletSystem.spawn('boss', e.x, e.y, angle, 228, 3.5, ttl, 'normal', 5, col);
        break;
      case 'spiral_barrage': {
        const rot = e.spawnTime * 3.4;
        for (let k = 0; k < 4; k++) {
          const a = rot + (Math.PI / 2) * k;
          bulletSystem.spawn('boss', e.x, e.y, a, 168, 4, ttl, 'normal', 5, col);
        }
        break;
      }
      default:
        break;
    }
  }

  clear() {
    this.active = [];
  }

  getState() {
    return this.active.map((e) => {
      const item = {
        id: e.id,
        type: e.type,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        radius: e.radius,
        angle: Number((e.angle ?? Math.PI).toFixed(3)),
      };
      if (e.isMiniboss) {
        item.isMiniboss = true;
        item.sprite = e.sprite;
        item.minibossName = e.minibossName;
      }
      if (typeof e._fuseProgress === 'number') {
        item.fuseProgress = e._fuseProgress;
      }
      return item;
    });
  }
}

module.exports = { EnemySystem };

'use strict';

const { createWorld, addPlayerBody, applyInput } = require('./physics');
const { BulletSystem } = require('./systems/BulletSystem');
const { LaserSystem } = require('./systems/LaserSystem');
const { WallSystem } = require('./systems/WallSystem');
const { BeamStruggleAuthority } = require('./systems/BeamStruggleAuthority');
const { EnemySystem } = require('./systems/EnemySystem');
const { TimelineManager } = require('./systems/TimelineManager');
const { RoomPhaseController } = require('./RoomPhaseController');
const { CampaignManager } = require('./campaign/CampaignManager');
const { BossController } = require('./entities/Boss');
const { spawnAutoAimBullet } = require('./autoAim');
const { releaseBullet } = require('./entities/Bullet');
const { DEFAULT_PLAYER_STATS, normalizeClassId, getCharacterStats } = require('./config/characterStats');
const { buildRoomSnapshot } = require('./serializers/roomSnapshot');

const SKILL_COOLDOWN    = 1.5;   // 1.5s skill cooldown
const STRUGGLE_BOSS_WIN_PLAYER_DAMAGE = 35;
const AUTO_ADVANCE_DURATION = 2.0; // 0.7s victory beat -> 0.9s fade-to-black -> 0.4s hold -> auto next level

const SPAWN_POSITIONS = [
  { x: 110, y: 240 },
  { x: 110, y: 360 },
  { x: 165, y: 180 },
  { x: 165, y: 420 },
];

class GameRoom {
  constructor(roomId, hostId, options = {}) {
    this.roomId        = roomId;
    this.hostId        = hostId;
    /** @type {'loading'|'ready'|'countdown'|'playing'} */
    this.players       = new Map();
    this.bulletSystem  = new BulletSystem();
    this.laserSystem   = new LaserSystem();
    this.wallSystem    = new WallSystem();
    this.enemySystem   = new EnemySystem();
    this.timeline      = new TimelineManager();
    this.campaign      = new CampaignManager(options.difficulty, options.world, options.stage);
    this.boss          = new BossController();
    this.world         = createWorld();
    this.tick          = 0;
    this.stageTime     = 0;
    this._countdownMs  = 0;
    this._autoAdvanceTimer = 0;
    this._phaseController = new RoomPhaseController({
      initialPhase: options.initialPhase || 'loading',
      expectedPlayerCount: options.expectedPlayerCount || 1,
    });
    this._beamStruggleController = new BeamStruggleAuthority();
    this._beamStruggle = this._beamStruggleController.state;

    // Setup boss callbacks
    this.boss.onPhaseChange = (_phase, _spellName, _isSpellCard) => {
      this.bulletSystem.clearByOwner('boss');
    };

    this.boss.onDefeated = () => {
      this.campaign.markStageCleared();
      this.bulletSystem.clearByOwner('boss');
      this.laserSystem.lasers = [];
      this.enemySystem.clear();
      if (this.campaign.hasNextStage()) {
        this._autoAdvanceTimer = AUTO_ADVANCE_DURATION;
      }
    };

    this._setupTimeline();
  }

  _getSquadHpScale() {
    let activeCount = 0;
    for (const [, p] of this.players) {
      if (p.active) activeCount++;
    }
    const n = Math.max(1, activeCount);
    return 1 + (n - 1) * 0.42;
  }

  _spawnEndMiniboss(minibossConfig) {
    if (!minibossConfig) return;
    if (this.enemySystem.active.some((e) => e.isMiniboss && !e.isDead)) return;
    this.enemySystem.spawn({
      ...minibossConfig,
      isMiniboss: true,
      hp: Math.round((minibossConfig.hp || 450) * this._getSquadHpScale()),
    });
  }

  _handleMinibossDefeated() {
    if (this.campaign.stageState === 'stage_clear') return;
    this.campaign.markStageCleared();
    this.bulletSystem.clearByOwner('boss');
    this.laserSystem.lasers = [];
    if (this.campaign.hasNextStage()) {
      this._autoAdvanceTimer = AUTO_ADVANCE_DURATION;
    }
  }

  spawnBossNow() {
    const config = this.campaign.getStageConfig();
    if (config.disableBoss) return;
    this.enemySystem.clear();
    this.bulletSystem.clearByOwner('boss');
    this.campaign.stageState = 'boss_battle';

    if (config.hasBoss === false && config.miniboss) {
      this._spawnEndMiniboss(config.miniboss);
    } else {
      this.boss.configure(config.bossProfile, this._getSquadHpScale());
      this.boss.spawn(685, 300);
      this.boss._introProgress = 1.0;
      if (this.boss.bossId !== 'mo') {
        this.boss.x = 685;
        this.boss.y = 300;
        this.boss.isRefilling = false;
        this.boss.isInvulnerable = false;
      }
    }

    for (const ev of this.timeline.events) {
      ev.executed = true;
    }
  }

  startBeamStruggleTest(playerId) {
    if (this.campaign.getStageConfig().disableBoss) return;
    if (!this.boss.isActive || this.boss.isDefeated) {
      this.spawnBossNow();
    }
    this.bulletSystem.clear();
    this.laserSystem.lasers = [];
    this._beamStruggleController.reset();

    const targetPlayer = (playerId && this.players.get(playerId)) || [...this.players.values()].find((p) => p.active);
    if (!targetPlayer) return;

    const targetId = (playerId && this.players.has(playerId)) ? playerId : [...this.players.keys()][0];
    targetPlayer.body.setPosition({ x: 130, y: 300 });
    targetPlayer.body.setLinearVelocity({ x: 0, y: 0 });
    this.boss.x = 670;
    this.boss.y = 300;
    this.boss.targetX = 670;
    this.boss.targetY = 300;
    this.boss.isLockedForBeam = true;

    this.laserSystem.spawnLaser(150, 300, 300, {
      ownerId: targetId,
      direction: 'right',
      chargeDuration: 0.25,
      fireDuration: 4.8,
      fadeDuration: 0.4,
      maxWidth: 68,
      color: 0x00f2fe,
      dps: 50,
    });
    this.laserSystem.spawnLaser(650, 300, 300, {
      ownerId: 'boss',
      direction: 'left',
      chargeDuration: 0.25,
      fireDuration: 4.8,
      fadeDuration: 0.4,
      maxWidth: 68,
      color: 0xff2b5b,
      dps: 50,
    });
  }

  _setupTimeline() {
    const config = this.campaign.getStageConfig();
    this._weaponsDisabled = Boolean(config.disableWeapons);
    if (!config.disableBoss && config.bossProfile) {
      this.boss.configure(config.bossProfile, this._getSquadHpScale());
    }
    this.timeline.loadFromStageConfig(config, this.campaign.bannerText, this.campaign.bannerSubtext);

    this.timeline
      .on('stage_banner', () => {
        this.campaign.stageState = 'waves';
      })
      .on('spawn_wave', (payload) => {
        if (Array.isArray(payload?.enemies)) {
          this.enemySystem.spawnWaveDescriptors(payload.enemies, this._getSquadHpScale());
        } else {
          this.enemySystem.runWavePattern(payload.wave);
        }
      })
      .on('boss_warning', () => {
        if (config.disableBoss) return;
        this.campaign.stageState = 'boss_warning';
      })
      .on('spawn_miniboss', (payload) => {
        if (config.disableBoss) return;
        this.campaign.stageState = 'boss_battle';
        this._spawnEndMiniboss(payload?.miniboss || config.miniboss);
      })
      .on('spawn_boss', () => {
        if (config.disableBoss) return;
        this.campaign.stageState = 'boss_battle';
        this.boss.configure(config.bossProfile, this._getSquadHpScale());
        this.boss.spawn(685, 300);
      });
  }

  // ── Player management ───────────────────────────────────────────────────────

  addPlayer(playerId, character = null) {
    if (this.players.has(playerId)) {
      this.players.get(playerId).active = true;
      return;
    }
    const resolvedCharacter = character || 'DPS';
    const stats = { ...getCharacterStats(resolvedCharacter) };
    const spawn = SPAWN_POSITIONS[this.players.size % SPAWN_POSITIONS.length];
    const body  = addPlayerBody(this.world, spawn.x, spawn.y);
    this.players.set(playerId, {
      body,
      input:         { dx: 0, dy: 0, action: null },
      angle:         0,
      shootCooldown: 0,
      skillCooldown: 0,
      active:        true,
      isReady:       false,
      isLoaded:      false,
      character:     resolvedCharacter,
      stats,
      hp:            stats.hpMax,
      sp:            stats.spMax,
      pendingSeq:    -1,
      lastProcessedSeq: -1,
    });
  }

  get phase() {
    return this._phaseController.phase;
  }

  set phase(nextPhase) {
    this._phaseController.phase = nextPhase;
    if (nextPhase === 'playing') {
      this._phaseController.countdownMs = 0;
      this._phaseController._loadingDeadlineMs = null;
      this._phaseController._readyDeadlineMs = null;
    }
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    this.world.destroyBody(player.body);
    this.players.delete(playerId);
  }

  setPlayerInactive(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      player.active  = false;
      player.isReady = false;
      player.isLoaded = false;
      player.input   = { dx: 0, dy: 0, action: null };
    }
  }

  setInput(playerId, input) {
    const player = this.players.get(playerId);
    if (player && player.active && this.phase === 'playing') {
      player.input = input;
      if (Number.isInteger(input?.seq) && input.seq > player.pendingSeq) {
        player.pendingSeq = input.seq;
      }
    }
  }

  setExpectedPlayerCount(count) {
    this._phaseController.setExpectedPlayerCount(count);
  }

  setPlayerLoaded(playerId) {
    const nextPhase = this._phaseController.setPlayerLoaded(playerId, this.players);
    this._syncPhaseState();
    return nextPhase;
  }

  startReadyCheck(requesterId) {
    const ok = this._phaseController.startReadyCheck(requesterId, this.hostId);
    this._syncPhaseState();
    return ok;
  }

  setPlayerReady(playerId) {
    const nextPhase = this._phaseController.setPlayerReady(playerId, this.players);
    this._syncPhaseState();
    return nextPhase;
  }

  getReadyStatus() {
    return [...this.players.entries()].map(([id, p]) => ({
      id,
      isReady: Boolean(p.isReady),
      isLoaded: Boolean(p.isLoaded),
      character: p.character,
    }));
  }

  cancelToLobby() {
    this._phaseController.cancelToLobby(this.players);
    this._syncPhaseState();
  }

  _syncPhaseState() {
    this._countdownMs = this._phaseController.countdownMs;
  }

  // ── Game loop ────────────────────────────────────────────────────────────────

  update(deltaTime) {
    const phaseChanged = this._phaseController.tick(deltaTime);
    this._syncPhaseState();

    let hits = [];
    if (this.phase === 'playing') {
      hits = this._runPlayingSimulation(deltaTime);
    }

    this.tick++;
    return { hits, phaseChanged };
  }

  _runPlayingSimulation(deltaTime) {
    this.stageTime += deltaTime;

    // 1. Process player inputs
    for (const [id, player] of this.players) {
      this._updatePlayerActor(id, player, deltaTime);
    }

    // 2. Update timeline (spawns waves, boss warning, boss)
    this.timeline.update(deltaTime);

    // 3. Update boss AI and patterns
    if (this.boss.isActive && !this.boss.isDefeated) {
      const playerPos = this._getAveragePlayerPos();
      this.boss.update(
        deltaTime,
        playerPos,
        this.bulletSystem,
        this.laserSystem,
        (bx, by, radius, damage, hitSet) => {
          const r2 = (radius + 10) * (radius + 10);
          for (const [pid, player] of this.players) {
            if (!player.active || player.hp <= 0 || hitSet.has(pid)) continue;
            const pos = player.body.getPosition();
            const dx = pos.x - bx;
            const dy = pos.y - by;
            if (dx * dx + dy * dy <= r2) {
              hitSet.add(pid);
              this.applyDamageToPlayer(player, damage);
            }
          }
        },
        (spec, maxActive = 12) => {
          const curKamikazes = this.enemySystem.active.filter((e) => e.type === spec.type && !e.isDead).length;
          if (curKamikazes >= maxActive) return;
          this.enemySystem.spawn({
            ...spec,
            hp: Math.round((spec.hp || 20) * this._getSquadHpScale()),
          });
        }
      );
    }

    // 4. Unlock boss beam if mega laser finished
    if (this.boss.isLockedForBeam) {
      const hasMega = this.laserSystem.lasers.some((l) => l.ownerId === 'boss' && (l.isMegaBeam || l.maxWidth >= 60));
      if (!hasMega) this.boss.isLockedForBeam = false;
    }

    // 5. Update enemy system
    const playerPos = this._getAveragePlayerPos();
    const enemyDefeats = this.enemySystem.update(deltaTime, this.bulletSystem, playerPos, {
      players: this.players,
      onKamikazeExplode: (ex, ey, radius, damage) => {
        const r2 = radius * radius;
        for (const [, p] of this.players) {
          if (!p.active || p.hp <= 0) continue;
          const pos = p.body.getPosition();
          const dx = pos.x - ex;
          const dy = pos.y - ey;
          if (dx * dx + dy * dy <= r2) {
            this.applyDamageToPlayer(p, damage);
          }
        }
      },
    });

    // 6. Grant squad SP from defeated enemies and check miniboss clear
    for (const defeat of enemyDefeats) {
      if (defeat.isMiniboss) {
        this._handleMinibossDefeated();
      }
      for (const [, p] of this.players) {
        if (p.active && p.hp > 0) {
          const stats = p.stats || DEFAULT_PLAYER_STATS;
          p.sp = Math.min(stats.spMax, p.sp + 65);
        }
      }
    }

    // 7. Physics step
    this.world.step(deltaTime);

    // 9. Bullet collision
    const bulletHits = this.bulletSystem.update(deltaTime, this.players);
    this._applyBulletHits(bulletHits);

    // 10. Laser updates (anchor player beams to their caster when not in beam struggle)
    if (!this._beamStruggleController.isSuppressingLaserDamage()) {
      for (const laser of this.laserSystem.lasers) {
        if (laser.ownerId && laser.ownerId !== 'boss') {
          const owner = this.players.get(laser.ownerId);
          if (owner && owner.active && owner.hp > 0) {
            const pPos = owner.body.getPosition();
            laser.sourceX = pPos.x + 18;
            laser.sourceY = pPos.y;
            laser.targetY = pPos.y;
          }
        }
      }
    }
    this.laserSystem.update(deltaTime);
    this.laserSystem.clearBulletsInPath(this.bulletSystem);

    // 11. Beam struggle
    this._beamStruggleController.update(deltaTime, {
      lasers: this.laserSystem.lasers,
      players: this.players,
      onPlayerWin: () => {
        this.boss.loseFullHealthBar();
      },
      onBossWin: () => {
        for (const [, p] of this.players) {
          if (!p.active || p.hp <= 0) continue;
          this.applyDamageToPlayer(p, STRUGGLE_BOSS_WIN_PLAYER_DAMAGE);
        }
      },
    });

    // 12. Walls
    this.laserSystem.strikeWalls(this.wallSystem, deltaTime);
    this.wallSystem.update(deltaTime);
    this.wallSystem.blockBullets(this.bulletSystem);

    // 13. Laser collisions
    let laserHits = [];
    if (!this._beamStruggleController.isSuppressingLaserDamage()) {
      laserHits = this.laserSystem.checkCollisions(this.players, deltaTime);
      for (const hit of laserHits) {
        const player = this.players.get(hit.playerId);
        if (!player || player.hp <= 0) continue;
        this.applyDamageToPlayer(player, hit.damage || 0);
      }
      for (const laser of this.laserSystem.lasers) {
        if (laser.ownerId === 'boss' || laser.state !== 'firing') continue;
        const beamHalfW = (laser.currentWidth || laser.maxWidth) / 2;
        if (this.boss.isActive && !this.boss.isDefeated) {
          if (this.boss.x >= laser.sourceX && Math.abs(this.boss.y - laser.sourceY) < beamHalfW + 40) {
            this.boss.takeDamage(deltaTime * 68);
          }
        }
        for (let i = this.enemySystem.active.length - 1; i >= 0; i--) {
          const e = this.enemySystem.active[i];
          if (e.isDead) continue;
          if (e.x >= laser.sourceX && Math.abs(e.y - laser.sourceY) < beamHalfW + e.radius) {
            e.hp -= deltaTime * 95;
            if (e.hp <= 0) {
              e.isDead = true;
              this.enemySystem.active.splice(i, 1);
              for (const [, p] of this.players) {
                if (p.active && p.hp > 0) {
                  const stats = p.stats || DEFAULT_PLAYER_STATS;
                  p.sp = Math.min(stats.spMax, p.sp + 65);
                }
              }
              if (e.isMiniboss) {
                this._handleMinibossDefeated();
              }
            }
          }
        }
      }
    }

    // 14. Player bullets vs boss
    this._resolvePlayerBulletsAgainstBoss();

    // 15. Automatic seamless stage-to-stage transition (fade-to-black -> auto-advance, no prompt!)
    if (this._autoAdvanceTimer > 0 && this.campaign.stageState === 'stage_clear') {
      this._autoAdvanceTimer = Math.max(0, this._autoAdvanceTimer - deltaTime);
      const elapsed = AUTO_ADVANCE_DURATION - this._autoAdvanceTimer;
      // 0..0.7s victory beat, 0.7..1.65s smooth fade to black, 1.65..2.0s dark hold before instant switch
      this.campaign.autoAdvancing = true;
      this.campaign.transitionBlackAlpha = Math.max(0, Math.min(1, (elapsed - 0.7) / 0.95));
      if (this._autoAdvanceTimer <= 0) {
        this.advanceStage();
      }
    }

    return [...bulletHits, ...laserHits];
  }

  _getAveragePlayerPos() {
    let totalX = 0, totalY = 0, count = 0;
    for (const [, player] of this.players) {
      if (!player.active || player.hp <= 0) continue;
      const pos = player.body.getPosition();
      totalX += pos.x;
      totalY += pos.y;
      count++;
    }
    if (count === 0) return { x: 100, y: 300 };
    return { x: totalX / count, y: totalY / count };
  }

  _getAutoAimTargets() {
    const targets = [];
    for (const e of this.enemySystem.active) {
      if (!e.isDead && e.hp > 0) {
        targets.push({ x: e.x, y: e.y, hp: e.hp });
      }
    }
    if (this.boss.isActive && !this.boss.isDefeated && this.boss.hp > 0) {
      targets.push({ x: this.boss.x, y: this.boss.y, hp: this.boss.hp });
    }
    if (targets.length === 0) {
      targets.push({ x: this.boss.x || 700, y: this.boss.y || 300, hp: 100 });
    }
    return targets;
  }

  _updatePlayerActor(id, player, deltaTime) {
    if (!(player.active && player.hp > 0)) {
      if (player.hp <= 0) player.input = { dx: 0, dy: 0, action: null, focus: false };
      player.body.setLinearVelocity({ x: 0, y: 0 });
      return;
    }

    const { dx, dy, action } = player.input;
    if (dx !== 0 || dy !== 0) player.angle = Math.atan2(dy, dx);

    if (player.shootCooldown > 0) player.shootCooldown = Math.max(0, player.shootCooldown - deltaTime);
    if (player.skillCooldown > 0) player.skillCooldown = Math.max(0, player.skillCooldown - deltaTime);

    const pos = player.body.getPosition();
    const stats = player.stats || DEFAULT_PLAYER_STATS;
    const normClass = normalizeClassId(player.character);
    const shootCooldown = 1 / Math.max(0.1, stats.shotsPerSecond || 5);

    // Passive SP regeneration so tactical 4-player skills stay responsive across waves & boss phases
    player.sp = Math.min(stats.spMax, player.sp + deltaTime * 50);

    if (this._weaponsDisabled) {
      applyInput(player.body, player.input);
      if (player.pendingSeq > player.lastProcessedSeq) {
        player.lastProcessedSeq = player.pendingSeq;
      }
      return;
    }

    if (action === 'shoot' && player.shootCooldown <= 0) {
      if (normClass === 'support' || normClass === 'healer') {
        const targets = this._getAutoAimTargets();
        spawnAutoAimBullet(this.bulletSystem, id, pos.x + 16, pos.y, targets, 780, 4, 2.6, stats.bulletDamage, 'autoaim');
      } else if (normClass === 'tank' || normClass === 'defense') {
        this.bulletSystem.spawnBullet(id, pos.x + 16, pos.y, 760, 0, 5, 2.5, 'normal', stats.bulletDamage, 0x00ff88);
      } else {
        this.bulletSystem.spawnBullet(id, pos.x + 16, pos.y - 6, 960, 0, 4, 2.5, 'normal', stats.bulletDamage, 0x00f2fe);
        this.bulletSystem.spawnBullet(id, pos.x + 16, pos.y + 6, 960, 0, 4, 2.5, 'normal', stats.bulletDamage, 0x00f2fe);
      }
      player.shootCooldown = shootCooldown;
    }

    const wallCost = Math.min(250, stats.spMax);
    const laserCost = Math.min(500, stats.spMax);
    const supportCost = Math.min(400, stats.spMax);
    const dpsCost = Math.min(350, stats.spMax);

    // Tank: Wide tactical energy shield wall (absorbs enemy bullets across a full lane)
    if ((action === 'wall' || ((normClass === 'tank' || normClass === 'defense') && action === 'special')) && player.skillCooldown <= 0 && player.sp >= wallCost) {
      this.wallSystem.spawnWall(id, pos.x + 26, pos.y, 38, 0, 16, 68, 25, 1.75);
      player.skillCooldown = SKILL_COOLDOWN;
      player.sp = Math.max(0, player.sp - wallCost);
    }

    // Special_Attack: Piercing Master Spark laser (clears enemy bullets + triggers Beam Struggle vs Boss Mega-Beams)
    if ((action === 'laser' || ((normClass === 'special_attack' || normClass === 'attack') && action === 'special')) && player.skillCooldown <= 0 && player.sp >= laserCost) {
      this.laserSystem.spawnLaser(pos.x + 18, pos.y, pos.y, {
        ownerId: id,
        direction: 'right',
        chargeDuration: 0.42,
        fireDuration: 1.35,
        fadeDuration: 0.30,
        maxWidth: 72,
        color: 0x00f2fe,
        dps: 85,
      });
      player.skillCooldown = SKILL_COOLDOWN * 2;
      player.sp = Math.max(0, player.sp - laserCost);
    }

    // Support: 6-bolt Homing Salvo + Squad Heal (+28 HP to all active players)
    if ((normClass === 'support' || normClass === 'healer') && action === 'special' && player.skillCooldown <= 0 && player.sp >= supportCost) {
      const targets = this._getAutoAimTargets();
      for (const offsetY of [-18, -10, -4, 4, 10, 18]) {
        spawnAutoAimBullet(this.bulletSystem, id, pos.x + 16, pos.y + offsetY, targets, 710, 5, 2.8, stats.bulletDamage * 1.6, 'autoaim');
      }
      for (const [, ally] of this.players) {
        if (ally.active && ally.hp > 0) {
          const allyStats = ally.stats || DEFAULT_PLAYER_STATS;
          ally.hp = Math.min(allyStats.hpMax, ally.hp + 28);
        }
      }
      player.skillCooldown = SKILL_COOLDOWN * 1.5;
      player.sp = Math.max(0, player.sp - supportCost);
    }

    // DPS: 8-way High-Velocity Shotgun Burst (cracks Dreadnought cores & Boss HP bars)
    if ((normClass === 'dps' || normClass === 'physical') && action === 'special' && player.skillCooldown <= 0 && player.sp >= dpsCost) {
      for (const angleOffset of [-0.21, -0.14, -0.07, -0.02, 0.02, 0.07, 0.14, 0.21]) {
        const vx = Math.cos(angleOffset) * 840;
        const vy = Math.sin(angleOffset) * 840;
        this.bulletSystem.spawnBullet(id, pos.x + 18, pos.y, vx, vy, 5, 2.5, 'normal', stats.bulletDamage * 2.2, 0x00f2fe);
      }
      player.skillCooldown = SKILL_COOLDOWN;
      player.sp = Math.max(0, player.sp - dpsCost);
    }

    applyInput(player.body, player.input);
    if (player.pendingSeq > player.lastProcessedSeq) {
      player.lastProcessedSeq = player.pendingSeq;
    }
  }

  _applyBulletHits(bulletHits) {
    for (const hit of bulletHits) {
      const player = this.players.get(hit.playerId);
      if (!player || player.hp <= 0) continue;
      this.applyDamageToPlayer(player, hit.damage || 5);
    }
  }

  _resolvePlayerBulletsAgainstBoss() {
    if (!this.boss.isActive || this.boss.isDefeated || this.boss.hp <= 0) return;

    for (let i = this.bulletSystem.active.length - 1; i >= 0; i--) {
      const b = this.bulletSystem.active[i];
      if (b.ownerId === 'boss') continue;

      const dx = b.x - this.boss.x;
      const dy = b.y - this.boss.y;
      if (dx * dx + dy * dy >= (42 + b.radius) * (42 + b.radius)) continue;

      const damage = b.damage || 5;
      const owner = this.players.get(b.ownerId);
      if (owner && owner.hp > 0) {
        const stats = owner.stats || DEFAULT_PLAYER_STATS;
        owner.sp = Math.min(stats.spMax, owner.sp + Math.max(8, stats.spChargePerHit || 0));
      }

      this.boss.takeDamage(damage * 0.14);
      this.bulletSystem.hash.remove(b);
      releaseBullet(b);
      this.bulletSystem.active.splice(i, 1);
    }
  }

  // ── Stage Management ────────────────────────────────────────────────────────

  advanceStage() {
    if (!this.campaign.hasNextStage()) return false;
    if (!this.campaign.advanceToNextStage()) return false;

    this._autoAdvanceTimer = 0;
    this._resetStageRuntime();
    // Reward squad with tactical inter-stage recharge when entering next sector
    for (const [, player] of this.players) {
      if (!player.active) continue;
      const stats = player.stats || DEFAULT_PLAYER_STATS;
      if (player.hp > 0) {
        player.hp = Math.min(stats.hpMax, player.hp + Math.round(stats.hpMax * 0.35));
      } else {
        player.hp = Math.round(stats.hpMax * 0.5);
      }
      player.sp = stats.spMax;
    }
    return true;
  }

  restartStage() {
    this._autoAdvanceTimer = 0;
    this.campaign.stageState = 'intro';
    this.campaign.autoAdvancing = false;
    this.campaign.transitionBlackAlpha = 0;
    this._resetStageRuntime();
    let idx = 0;
    for (const [, player] of this.players) {
      const stats = player.stats || DEFAULT_PLAYER_STATS;
      player.hp = stats.hpMax;
      player.sp = stats.spMax;
      player.shootCooldown = 0;
      player.skillCooldown = 0;
      const spawn = SPAWN_POSITIONS[idx % SPAWN_POSITIONS.length];
      player.body.setPosition({ x: spawn.x, y: spawn.y });
      player.body.setLinearVelocity({ x: 0, y: 0 });
      idx++;
    }
  }

  _resetStageRuntime() {
    this.bulletSystem = new BulletSystem();
    this.laserSystem = new LaserSystem();
    this.wallSystem = new WallSystem();
    this.enemySystem.clear();
    this.boss.reset();
    this.timeline.reset();
    this.stageTime = 0;
    this._setupTimeline();
  }

  getState() {
    return buildRoomSnapshot(this, { fallbackStats: DEFAULT_PLAYER_STATS });
  }

  applyDamageToPlayer(player, rawDamage) {
    const stats = player.stats || DEFAULT_PLAYER_STATS;
    const mitigation = Math.max(0, Math.min(1, (stats.defensePercent || 0) / 100));
    const appliedDamage = rawDamage * (1 - mitigation);
    player.hp = Math.max(0, Number((player.hp - appliedDamage).toFixed(3)));
  }
}

module.exports = GameRoom;

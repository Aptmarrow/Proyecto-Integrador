'use strict';

/**
 * Backend-authoritative Boss controller for all 27 Space Campaign Levels.
 * Manages 5 phases (multi-stock HP bars), unique Boss Profiles, movement choreographies,
 * showy colored danmaku patterns, pod lasers, and Mega-Beam clashes.
 */

const { computeBossMovement, fireBossPattern } = require('../campaign/spaceThemesAndWaves');
const { updateMechanicalOphanim } = require('../campaign/normalCampaignOverhaul');

const BOSS_PHASES = [
  { phase: 1, name: 'Fase 1 "Patrulla Lagrange"', isSpellCard: false, maxHp: 112, pattern: 'crescent_fan', shootInterval: 0.44, laserMode: 'targeted', laserInterval: 4.8, megaLaserInterval: 0 },
  { phase: 2, name: 'Sello Orbital "Escudo Perigeo"', isSpellCard: true, maxHp: 138, pattern: 'star_mandala', shootInterval: 0.88, laserMode: 'targeted', laserInterval: 4.4, megaLaserInterval: 7.2 },
  { phase: 3, name: 'Fase 3 "Vectores de Atraque"', isSpellCard: false, maxHp: 130, pattern: 'binary_helix', shootInterval: 0.24, laserMode: 'none', laserInterval: 5.0, megaLaserInterval: 0 },
  { phase: 4, name: 'Protocolo Aegis "Anillo Geosíncrono"', isSpellCard: true, maxHp: 152, pattern: 'counter_lotus', shootInterval: 0.42, laserMode: 'both', laserInterval: 3.8, megaLaserInterval: 6.6 },
  { phase: 5, name: 'Órbita Final "Lanza Cenital"', isSpellCard: true, maxHp: 175, pattern: 'supernova_symphony', shootInterval: 0.34, laserMode: 'both', laserInterval: 3.6, megaLaserInterval: 6.0 },
];

class BossController {
  constructor() {
    this.x = 700;
    this.y = 300;
    this.targetX = 685;
    this.targetY = 300;
    this._phases = BOSS_PHASES;
    this._palette = [0x00f2fe, 0xff2b5b, 0xffdd00];
    this._moveArchetype = 'orbital_lissajous';
    this._speedScale = 1.0;
    this._squadScale = 1.0;

    this.bossId = 'first_boss';
    this.fullBossName = 'FirstBoss';
    this.sprite = '/assets/sprites/FirstBoss.png';
    this.angle = Math.PI;
    this._introDuration = 0;
    this.moIntroActive = false;
    this.moIntroProgress = 0;
    this.moDashState = 'idle';
    this.moDashLines = [];
    this._moState = null;

    this.hp = this._phases[0].maxHp;
    this.maxHp = this._phases[0].maxHp;
    this.phase = 1;
    this.remainingStocks = 4;
    this.spellcardName = this._phases[0].name;
    this.isSpellCard = false;
    this.isActive = false;
    this.isDefeated = false;
    this.isInvulnerable = false;
    this.isRefilling = false;
    this.isLockedForBeam = false;
    this.refillTimer = 0;

    this._shootTimer = 0;
    this._shotIndex = 0;
    this._laserTimer = 0;
    this._megaLaserTimer = 0;
    this._animTimer = 0;
    this._introProgress = 0;

    /** @type {function|null} */
    this.onPhaseChange = null;
    /** @type {function|null} */
    this.onDefeated = null;
  }

  /**
   * Configure the boss with one of the 27 Space Boss Profiles and active squad HP scale.
   */
  configure(bossProfile, squadScale = 1.0) {
    this._squadScale = Math.max(1.0, squadScale || 1.0);
    if (bossProfile && Array.isArray(bossProfile.phases) && bossProfile.phases.length >= 5) {
      this._phases = bossProfile.phases;
      this._palette = bossProfile.palette || [0x00f2fe, 0xff2b5b, 0xffdd00];
      this._moveArchetype = bossProfile.moveArchetype || 'orbital_lissajous';
      this._speedScale = bossProfile.speedScale || 1.0;
      this.bossId = bossProfile.bossId || 'first_boss';
      this.fullBossName = bossProfile.fullBossName || bossProfile.bossName || 'FirstBoss';
      this.sprite = bossProfile.sprite || '/assets/sprites/FirstBoss.png';
      this._introDuration = bossProfile.introDuration || 0;
    } else {
      this._phases = BOSS_PHASES;
      this._palette = [0x00f2fe, 0xff2b5b, 0xffdd00];
      this._moveArchetype = 'orbital_lissajous';
      this._speedScale = 1.0;
      this.bossId = 'first_boss';
      this.fullBossName = 'FirstBoss';
      this.sprite = '/assets/sprites/FirstBoss.png';
      this._introDuration = 0;
    }
    const p0Hp = Math.round(this._phases[0].maxHp * this._squadScale);
    this.hp = p0Hp;
    this.maxHp = p0Hp;
    this.spellcardName = this._phases[0].name;
    this.isSpellCard = this._phases[0].isSpellCard;
  }

  spawn(targetX = 685, targetY = 300) {
    this.isActive = true;
    this.x = 820;
    this.y = targetY;
    this.targetX = targetX;
    this.targetY = targetY;
    this._introProgress = 0;
    this.phase = 1;
    this.remainingStocks = 4;
    const p0Hp = Math.round(this._phases[0].maxHp * this._squadScale);
    this.hp = p0Hp;
    this.maxHp = p0Hp;
    this.spellcardName = this._phases[0].name;
    this.isSpellCard = this._phases[0].isSpellCard;
    this.isDefeated = false;
    this.isInvulnerable = true;
    this.isRefilling = true;
    this.refillTimer = 1.25;
    this._shootTimer = 0;
    this._shotIndex = 0;
    this._laserTimer = 1.5;
    this._megaLaserTimer = 0;
    this.angle = Math.PI;
    this.moDashState = 'idle';
    this.moDashLines = [];

    if (this.bossId === 'mo') {
      this._introProgress = 1.0;
      this.x = 670;
      this.isRefilling = false;
      this.moIntroActive = true;
      this.moIntroProgress = 0;
      this._moState = {
        mode: 'intro',
        timer: 0,
        introDuration: this._introDuration || 3.8,
        lineIndex: 0,
        segIndex: 0,
        dashChain: [],
        dashHitPlayers: new Set(),
        sparkAccum: 0,
        restShotAccum: 0,
      };
    } else {
      this.moIntroActive = false;
      this.moIntroProgress = 0;
      this._moState = null;
    }
  }

  update(dt, playerPos, bulletSystem, laserSystem, onMoContactDamage = null) {
    if (!this.isActive || this.isDefeated) return;

    this._animTimer += dt;

    // 1. Refill transition (between phases 2..5)
    if (this.isRefilling) {
      this.refillTimer -= dt;
      if (this.bossId === 'mo') {
        this.x += (400 - this.x) * Math.min(1, dt * 6);
        this.y += (300 - this.y) * Math.min(1, dt * 6);
        this.angle = Math.PI;
      }
      if (this.refillTimer <= 0) {
        this.isRefilling = false;
        this.isInvulnerable = false;
      }
      return;
    }

    // 2. Special Mecanical Ophanim (M.O) state machine
    if (this.bossId === 'mo' && this._moState && !this.isLockedForBeam) {
      updateMechanicalOphanim(this, dt, playerPos, bulletSystem, onMoContactDamage);
      return;
    }

    // 3. Standard Intro animation
    if (this._introProgress < 1.0) {
      this._introProgress = Math.min(1.0, this._introProgress + dt * 0.9);
      const ease = 1 - Math.pow(1 - this._introProgress, 3);
      this.x = 820 + (this.targetX - 820) * ease;
      this.y = this.targetY;
      return;
    }

    // 3. Movement AI per boss archetype
    if (this.isLockedForBeam) {
      this.x = this.targetX;
      this.y = this.targetY;
      this._shootTimer = 0;
      this._laserTimer = 0;
      return;
    }

    const nextPos = computeBossMovement(this._moveArchetype, this.targetX, this.targetY, this._animTimer, this.phase);
    this.x = Math.max(540, Math.min(755, nextPos.x));
    this.y = Math.max(85, Math.min(515, nextPos.y));
    if (playerPos) {
      this.angle = Math.atan2(playerPos.y - this.y, playerPos.x - this.x);
    }

    // 4. Execute level-specific phase pattern
    const phaseDef = this._phases[this.phase - 1] || this._phases[0];
    this._shootTimer += dt;
    this._laserTimer += dt;

    const shootInterval = phaseDef.shootInterval || 0.36;
    if (this._shootTimer >= shootInterval) {
      this._shootTimer = 0;
      fireBossPattern(
        phaseDef.pattern || 'crescent_fan',
        {
          bossX: this.x,
          bossY: this.y,
          playerX: playerPos.x,
          playerY: playerPos.y,
          animTimer: this._animTimer,
          shotIndex: this._shotIndex++,
          palette: this._palette,
          speedScale: this._speedScale,
          phase: this.phase,
        },
        (bx, by, angle, speed, radius, color, damage, opts = null) => {
          bulletSystem.spawn('boss', bx, by, angle, speed, radius, 4.4, 'normal', damage || 5, color, opts);
        }
      );
    }

    if (phaseDef.laserMode && phaseDef.laserMode !== 'none' && this._laserTimer >= (phaseDef.laserInterval || 4.2)) {
      this._laserTimer = 0;
      this._triggerRhombusLasers(laserSystem, playerPos, phaseDef.laserMode);
    }

    if (phaseDef.megaLaserInterval && phaseDef.megaLaserInterval > 0) {
      this._megaLaserTimer += dt;
      if (this._megaLaserTimer >= phaseDef.megaLaserInterval) {
        this._megaLaserTimer = 0;
        this._triggerMegaLaser(laserSystem);
      }
    }
  }

  _triggerRhombusLasers(laserSystem, playerPos, pattern) {
    const topPodY = Math.max(90, this.y - 54);
    const bottomPodY = Math.min(510, this.y + 54);
    const podX = this.x - 22;
    const cLaser = this._palette[1] || 0xff2b5b;
    const cTarget = this._palette[0] || 0x00f2fe;

    if (pattern === 'both') {
      laserSystem.spawnLaser(podX, topPodY, topPodY, {
        ownerId: 'boss', direction: 'left',
        chargeDuration: 0.72, fireDuration: 1.0, fadeDuration: 0.3,
        maxWidth: 28, color: cLaser, podType: 'top',
      });
      laserSystem.spawnLaser(podX, bottomPodY, bottomPodY, {
        ownerId: 'boss', direction: 'left',
        chargeDuration: 0.72, fireDuration: 1.0, fadeDuration: 0.3,
        maxWidth: 28, color: cLaser, podType: 'bottom',
      });
    } else {
      const podY = playerPos.y < this.y ? topPodY : bottomPodY;
      laserSystem.spawnLaser(podX, podY, podY, {
        ownerId: 'boss', direction: 'left',
        chargeDuration: 0.65, fireDuration: 1.0, fadeDuration: 0.3,
        maxWidth: 32, color: cTarget,
        podType: playerPos.y < this.y ? 'top' : 'bottom',
      });
    }
  }

  _triggerMegaLaser(laserSystem) {
    this.isLockedForBeam = true;
    this.x = 730;
    this.targetX = 730;
    this.targetY = Math.max(150, Math.min(450, this.y));
    this.y = this.targetY;

    laserSystem.spawnLaser(this.x, this.y, this.y, {
      ownerId: 'boss', direction: 'left',
      chargeDuration: 1.25, fireDuration: 1.85, fadeDuration: 0.4,
      maxWidth: 76, color: this._palette[2] || 0xffdd00, isMegaBeam: true,
    });
  }

  takeDamage(amount) {
    if (!this.isActive || this.isDefeated || this.isInvulnerable || this.isRefilling) return;

    this.hp = Math.max(0, Number((this.hp - amount).toFixed(1)));

    if (this.hp <= 0) {
      if (this.phase < 5) {
        const nextDef = this._phases[this.phase];
        this.phase = nextDef.phase;
        this.remainingStocks = 5 - this.phase;
        this.spellcardName = nextDef.name;
        this.isSpellCard = nextDef.isSpellCard;
        const nextHp = Math.round(nextDef.maxHp * this._squadScale);
        this.hp = nextHp;
        this.maxHp = nextHp;
        this.isInvulnerable = true;
        this.isRefilling = true;
        this.refillTimer = 1.2;
        this._shootTimer = 0;
        this._laserTimer = 0;
        this._megaLaserTimer = 0;
        if (this._moState && this._moState.mode !== 'intro') {
          this._moState.mode = 'resting';
          this._moState.timer = 1.2;
          this.moDashLines = [];
        }

        if (this.onPhaseChange) {
          this.onPhaseChange(this.phase, this.spellcardName, this.isSpellCard);
        }
      } else if (!this.isDefeated) {
        this.isDefeated = true;
        this.isActive = false;
        if (this.onDefeated) {
          this.onDefeated();
        }
      }
    }
  }

  loseFullHealthBar() {
    if (!this.isActive || this.isDefeated) return;
    this.isInvulnerable = false;
    this.isRefilling = false;
    this.takeDamage(this.hp + 999);
  }

  reset() {
    this.phase = 1;
    this.remainingStocks = 4;
    const p0Hp = Math.round(this._phases[0].maxHp * this._squadScale);
    this.hp = p0Hp;
    this.maxHp = p0Hp;
    this.spellcardName = this._phases[0].name;
    this.isSpellCard = false;
    this.isActive = false;
    this.isDefeated = false;
    this.isInvulnerable = false;
    this.isRefilling = false;
    this.isLockedForBeam = false;
    this.angle = Math.PI;
    this.moIntroActive = false;
    this.moIntroProgress = 0;
    this.moDashState = 'idle';
    this.moDashLines = [];
    this._moState = null;
    this.x = 800;
    this.y = 300;
  }

  toSnapshot() {
    return {
      x: this.x,
      y: this.y,
      hp: this.hp,
      maxHp: this.maxHp,
      phase: this.phase,
      remainingStocks: this.remainingStocks,
      spellcardName: this.spellcardName,
      isSpellCard: this.isSpellCard,
      isActive: this.isActive,
      isDefeated: this.isDefeated,
      isRefilling: this.isRefilling,
      isLockedForBeam: this.isLockedForBeam,
      bossId: this.bossId,
      fullBossName: this.fullBossName,
      sprite: this.sprite,
      angle: Number((this.angle ?? Math.PI).toFixed(3)),
      moIntroActive: Boolean(this.moIntroActive),
      moIntroProgress: Number((this.moIntroProgress || 0).toFixed(3)),
      moDashState: this.moDashState || 'idle',
      moDashLines: this.moDashLines || [],
    };
  }
}

module.exports = { BossController, BOSS_PHASES };

/// <reference lib="webworker" />

import * as planck from 'planck';
import type {
  GameSnapshot,
  ServerBullet,
  ServerWall,
  ServerLaser,
  ServerEnemy,
  ServerItem,
  ServerBoss,
  ServerCampaign,
  ServerBeamStruggle,
} from '../network/wsClient';
import {
  getSpaceStageConfig,
  computeBossMovement,
  fireBossPattern,
  type SpaceStageConfig,
  type BossPhaseProfile,
} from '../campaign/spaceCampaignCatalog';

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const PLAYER_RADIUS = 10;
const PLAYER_SPEED = 380;
const TICK_RATE = 60;
const DT = 1 / TICK_RATE;
const SKILL_COOLDOWN = 1.5;

interface CharacterStats {
  spMax: number;
  hpMax: number;
  bulletDamage: number;
  shotsPerSecond: number;
  bombDamage: number;
  spChargePerHit: number;
  defensePercent: number;
}

const DEFAULT_STATS: CharacterStats = {
  spMax: 1000,
  hpMax: 100,
  bulletDamage: 5,
  shotsPerSecond: 5,
  bombDamage: 750,
  spChargePerHit: 10,
  defensePercent: 50,
};

function normalizeRoleKey(role: string): string {
  const v = String(role || '').toLowerCase();
  if (v === 'tank' || v === 'defense' || v === 'defence') return 'tank';
  if (v === 'support' || v === 'healer') return 'support';
  if (v === 'special_attack' || v === 'attack' || v === 'spatk') return 'special_attack';
  return 'dps';
}

function canonicalRoleName(role: string): string {
  const k = normalizeRoleKey(role);
  if (k === 'tank') return 'Tank';
  if (k === 'support') return 'Support';
  if (k === 'special_attack') return 'Special_Attack';
  return 'DPS';
}

function getCharacterStats(role: string): CharacterStats {
  const k = normalizeRoleKey(role);
  if (k === 'tank') {
    return { ...DEFAULT_STATS, hpMax: 140, defensePercent: 65, shotsPerSecond: 3, bulletDamage: 4, bombDamage: 500, spChargePerHit: 8 };
  }
  if (k === 'support') {
    return { ...DEFAULT_STATS, hpMax: 90, defensePercent: 40, shotsPerSecond: 4, bulletDamage: 4, bombDamage: 600, spChargePerHit: 12 };
  }
  return { ...DEFAULT_STATS };
}

interface SimPlayer {
  id: string;
  body: planck.Body;
  character: string;
  stats: CharacterStats;
  hp: number;
  sp: number;
  angle: number;
  shootCooldown: number;
  skillCooldown: number;
  isBot: boolean;
  input: {
    dx: number;
    dy: number;
    action: string | null;
    focus: boolean;
  };
}

interface SimBullet {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  ttl: number;
  type: 'normal' | 'autoaim' | 'laser';
  damage: number;
  color: number;
}

interface SimWall {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  ttl: number;
}

interface SimLaser {
  id: string;
  ownerId: string;
  direction: 'left' | 'right';
  sourceX: number;
  sourceY: number;
  targetY: number;
  state: 'charging' | 'firing' | 'fading';
  timer: number;
  chargeDuration: number;
  fireDuration: number;
  fadeDuration: number;
  maxWidth: number;
  currentWidth: number;
  dps: number;
  color: number;
  isMegaBeam: boolean;
}

interface SimEnemy {
  id: string;
  type: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  speed: number;
  hp: number;
  maxHp: number;
  radius: number;
  itemDrop: 'power' | 'point' | 'bomb_frag' | 'life_frag';
  trajectory: string;
  attackPattern: string;
  shootInterval: number;
  shootTimer: number;
  spawnTime: number;
  bulletColor: number;
  customParams: Record<string, any>;
}

interface SimItem {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: 'power' | 'point' | 'bomb_frag' | 'life_frag';
  magnetizedTo: string | null;
}

const TOTAL_STAGES_PER_DIFFICULTY = 9; // 3 worlds × 3 stages

const SPAWN_POSITIONS = [
  { x: 110, y: 240 },
  { x: 110, y: 360 },
  { x: 165, y: 180 },
  { x: 165, y: 420 },
];

class DanmakrewSimulationWorker {
  private world!: planck.World;
  private players = new Map<string, SimPlayer>();
  private bullets: SimBullet[] = [];
  private walls: SimWall[] = [];
  private lasers: SimLaser[] = [];
  private enemies: SimEnemy[] = [];
  private items: SimItem[] = [];

  private nextBulletId = 1;
  private nextEntityId = 1;
  private tick = 0;
  private stageTime = 0;
  private stageIndex = 0;
  private difficulty: string = 'normal';
  private customStageProfile: any = null;
  private stageState: 'intro' | 'waves' | 'boss_warning' | 'boss_battle' | 'stage_clear' = 'intro';
  private autoAdvanceTimer = 0;
  private readonly autoAdvanceDuration = 2.0;
  private triggeredEvents = new Set<string>();
  private myPlayerId = 'player-local-host';
  private loopTimer: ReturnType<typeof setInterval> | null = null;

  private boss = {
    x: 685,
    y: 300,
    targetX: 685,
    targetY: 300,
    hp: 112,
    maxHp: 112,
    phase: 1,
    remainingStocks: 4,
    spellcardName: 'Fase 1 "Patrulla Lagrange"',
    isSpellCard: false,
    isActive: false,
    isDefeated: false,
    isRefilling: false,
    refillTimer: 0,
    isLockedForBeam: false,
    shootTimer: 0,
    shotIndex: 0,
    laserTimer: 0,
    megaLaserTimer: 0,
    animTimer: 0,
  };

  private struggle: ServerBeamStruggle = {
    active: false,
    isAligning: false,
    winner: null,
    timer: 0,
    maxTimer: 4.5,
    balance: 50,
    resolutionTimer: 0,
    clashX: 400,
    clashY: 300,
  };

  private alignTimer = 0;

  private getCurrentSpaceConfig(): SpaceStageConfig {
    const clamped = Math.max(0, Math.min(TOTAL_STAGES_PER_DIFFICULTY - 1, this.stageIndex));
    const w = Math.floor(clamped / 3) + 1;
    const s = (clamped % 3) + 1;
    return getSpaceStageConfig(this.difficulty, w, s);
  }

  private getSquadHpScale(): number {
    let activeCount = 0;
    for (const [, p] of this.players) {
      if (p.hp > 0) activeCount++;
    }
    const n = Math.max(1, activeCount);
    return 1 + (n - 1) * 0.42;
  }

  private getStageMeta() {
    if (this.customStageProfile) {
      return {
        world: this.customStageProfile.world || 1,
        stage: this.customStageProfile.stage || 1,
        worldName: this.customStageProfile.worldName || 'Stage 1',
        stageTitle: this.customStageProfile.stageTitle || 'Stage 1',
        bannerText: this.customStageProfile.bannerText || 'STAGE 1-1',
        bannerSubtext: this.customStageProfile.bannerSubtext || '',
        clearTitle: this.customStageProfile.clearTitle || 'STAGE CLEARED!',
        clearSubtext: this.customStageProfile.clearSubtext || '',
        bossSpawnAt: this.customStageProfile.bossSpawnAt ?? 34.5,
        bossWarningAt: this.customStageProfile.bossWarningAt ?? 31.5,
        spaceTheme: undefined,
      };
    }

    const cfg = this.getCurrentSpaceConfig();
    const diffLabel =
      this.difficulty === 'no_mercy' ? 'NoMercy' : this.difficulty === 'difficult' ? 'Dificil' : 'Normal';
    const isFinal = this.stageIndex >= TOTAL_STAGES_PER_DIFFICULTY - 1;

    return {
      world: cfg.world,
      stage: cfg.stage,
      worldName: cfg.worldName,
      stageTitle: cfg.stageTitle,
      bannerText: `MUNDO ${cfg.world}-${cfg.stage} · ${cfg.worldName.toUpperCase()}`,
      bannerSubtext: `${diffLabel} — ${cfg.stageTitle}`,
      clearTitle: isFinal
        ? `¡EXPEDICIÓN ${diffLabel.toUpperCase()} COMPLETADA!`
        : `¡SECTOR ${cfg.world}-${cfg.stage} DESPEJADO!`,
      clearSubtext: isFinal
        ? '¡El escuadrón Danmakrew conquistó los 9 sectores espaciales!'
        : `${cfg.bossProfile.bossName} derrotado · Preparando siguiente sector...`,
      bossSpawnAt: cfg.bossSpawnAt,
      bossWarningAt: cfg.bossWarningAt,
      spaceTheme: cfg.spaceTheme,
    };
  }

  private getActiveBossPhases(): BossPhaseProfile[] {
    if (Array.isArray(this.customStageProfile?.bossPhases)) {
      const baseHp = (this.customStageProfile.bossBaseHp || 180) * (this.customStageProfile.difficultyMult || 1);
      return this.customStageProfile.bossPhases.map((p: any, idx: number) => ({
        phase: idx + 1,
        name: p.name,
        isSpellCard: Boolean(p.isSpellCard),
        maxHp: Math.round(baseHp),
        pattern: idx === 0 ? 'crescent_fan' : idx === 1 ? 'star_mandala' : idx === 2 ? 'binary_helix' : idx === 3 ? 'counter_lotus' : 'supernova_symphony',
        shootInterval: 0.42,
        laserMode: idx >= 3 ? 'both' : 'targeted',
        laserInterval: 4.2,
        megaLaserInterval: idx >= 1 ? 6.5 : 0,
      }));
    }
    return this.getCurrentSpaceConfig().bossProfile.phases;
  }

  public init(
    roomId: string,
    playerId: string,
    classId: string,
    difficulty: string,
    world: number = 1,
    stage: number = 1,
    stageProfile: any = null
  ): void {
    this.stop();
    this.myPlayerId = playerId || 'player-local-host';
    this.customStageProfile = stageProfile || null;
    this.difficulty = stageProfile
      ? String(difficulty || 'normal')
      : difficulty === 'difficult' || difficulty === 'no_mercy'
        ? difficulty
        : 'normal';
    const w = stageProfile ? 1 : Math.max(1, Math.min(3, Math.floor(Number(world) || 1)));
    const s = stageProfile ? 1 : Math.max(1, Math.min(3, Math.floor(Number(stage) || 1)));
    this.stageIndex = (w - 1) * 3 + (s - 1);
    this.createPhysicsWorld();
    this.players.clear();
    this.addPlayer(this.myPlayerId, classId, false);
    this.resetStageRuntime();

    self.postMessage({
      type: 'INIT_ACK',
      roomId,
      myPlayerId: this.myPlayerId,
    });

    this.loopTimer = setInterval(() => {
      this.step(DT);
      self.postMessage({
        type: 'SNAPSHOT',
        payload: this.buildSnapshot(),
      });
    }, 1000 / TICK_RATE);
  }

  public stop(): void {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  private createPhysicsWorld(): void {
    this.world = planck.World({ gravity: planck.Vec2(0, 0) });
    const bounds = this.world.createBody({ type: 'static' });
    const corners = [
      [planck.Vec2(0, 0), planck.Vec2(WORLD_WIDTH, 0)],
      [planck.Vec2(WORLD_WIDTH, 0), planck.Vec2(WORLD_WIDTH, WORLD_HEIGHT)],
      [planck.Vec2(WORLD_WIDTH, WORLD_HEIGHT), planck.Vec2(0, WORLD_HEIGHT)],
      [planck.Vec2(0, WORLD_HEIGHT), planck.Vec2(0, 0)],
    ];
    for (const [v1, v2] of corners) {
      bounds.createFixture({ shape: planck.Edge(v1, v2), friction: 0, restitution: 0 });
    }
  }

  public addPlayer(playerId: string, role: string, isBot: boolean = false): void {
    if (this.players.has(playerId)) {
      this.setPlayerRole(playerId, role);
      return;
    }
    const canonical = canonicalRoleName(role);
    const stats = getCharacterStats(canonical);
    const spawn = SPAWN_POSITIONS[this.players.size % SPAWN_POSITIONS.length];
    const body = this.world.createBody({
      type: 'dynamic',
      position: planck.Vec2(spawn.x, spawn.y),
      fixedRotation: true,
      linearDamping: 0,
    });
    body.createFixture({
      shape: planck.Circle(PLAYER_RADIUS),
      density: 1,
      friction: 0,
      restitution: 0,
    });

    this.players.set(playerId, {
      id: playerId,
      body,
      character: canonical,
      stats,
      hp: stats.hpMax,
      sp: stats.spMax,
      angle: 0,
      shootCooldown: 0,
      skillCooldown: 0,
      isBot,
      input: { dx: 0, dy: 0, action: null, focus: false },
    });
  }

  public setPlayerRole(playerId: string, role: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    const canonical = canonicalRoleName(role);
    const stats = getCharacterStats(canonical);
    p.character = canonical;
    p.stats = stats;
    p.hp = stats.hpMax;
    p.sp = stats.spMax;
  }

  public setPlayerInput(playerId: string, dx: number, dy: number, action: string | null, focus: boolean): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.input = {
      dx: Number.isFinite(dx) ? Math.max(-1, Math.min(1, dx)) : 0,
      dy: Number.isFinite(dy) ? Math.max(-1, Math.min(1, dy)) : 0,
      action,
      focus: Boolean(focus),
    };
  }

  public triggerSkill(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    const roleKey = normalizeRoleKey(p.character);
    const skillAction = roleKey === 'tank' ? 'wall' : roleKey === 'special_attack' ? 'laser' : 'special';
    this.executePlayerSkill(p, skillAction);
  }

  public pushStruggle(): void {
    if (this.struggle.active) {
      this.struggle.balance = Math.min(100, this.struggle.balance + 4.4);
    }
  }

  public spawnBossNow(): void {
    if (this.customStageProfile?.disableBoss) return;
    this.enemies = [];
    const cfg = this.getCurrentSpaceConfig();
    for (const w of cfg.waves) {
      this.triggeredEvents.add(w.key);
    }
    this.triggeredEvents.add('warn');
    this.triggeredEvents.add('boss');
    this.activateBoss();
  }

  public startBeamStruggleTest(): void {
    if (this.customStageProfile?.disableBoss) return;
    const me = this.players.get(this.myPlayerId);
    if (!me) return;
    this.setPlayerRole(this.myPlayerId, 'Special_Attack');
    if (!this.boss.isActive || this.boss.isDefeated) {
      this.spawnBossNow();
    }
    this.bullets = [];
    this.lasers = [];
    me.body.setPosition(planck.Vec2(140, 300));
    this.boss.x = 670;
    this.boss.y = 300;
    this.boss.targetX = 670;
    this.boss.targetY = 300;
    this.boss.isLockedForBeam = true;

    this.spawnLaser(me.id, 'right', 156, 300, 300, 0.25, 4.8, 0.25, 34, 0x00f0ff, false);
    this.spawnLaser('boss', 'left', 645, 300, 300, 0.25, 4.8, 0.25, 76, 0xffdd00, true);
  }

  public advanceStage(): boolean {
    if (this.customStageProfile) return false;
    if (this.stageIndex >= TOTAL_STAGES_PER_DIFFICULTY - 1) return false;
    this.stageIndex++;
    this.autoAdvanceTimer = 0;
    this.resetStageRuntime();
    for (const [, p] of this.players) {
      p.hp = p.hp > 0 ? Math.min(p.stats.hpMax, p.hp + Math.round(p.stats.hpMax * 0.35)) : Math.round(p.stats.hpMax * 0.5);
      p.sp = p.stats.spMax;
    }
    return true;
  }

  public restartStage(): void {
    this.autoAdvanceTimer = 0;
    this.resetStageRuntime();
    let idx = 0;
    for (const [, p] of this.players) {
      p.hp = p.stats.hpMax;
      p.sp = p.stats.spMax;
      p.shootCooldown = 0;
      p.skillCooldown = 0;
      const spawn = SPAWN_POSITIONS[idx % SPAWN_POSITIONS.length];
      p.body.setPosition(planck.Vec2(spawn.x, spawn.y));
      p.body.setLinearVelocity(planck.Vec2(0, 0));
      idx++;
    }
  }

  private resetStageRuntime(): void {
    this.bullets = [];
    this.walls = [];
    this.lasers = [];
    this.enemies = [];
    this.items = [];
    this.triggeredEvents.clear();
    this.stageTime = 0;
    this.stageState = 'intro';
    this.autoAdvanceTimer = 0;
    this.struggle = {
      active: false,
      isAligning: false,
      winner: null,
      timer: 0,
      maxTimer: 4.5,
      balance: 50,
      resolutionTimer: 0,
      clashX: 400,
      clashY: 300,
    };

    const phases = this.getActiveBossPhases();
    const hp = Math.round(phases[0].maxHp * this.getSquadHpScale());
    this.boss = {
      x: 685,
      y: 300,
      targetX: 685,
      targetY: 300,
      hp,
      maxHp: hp,
      phase: 1,
      remainingStocks: 4,
      spellcardName: phases[0].name,
      isSpellCard: false,
      isActive: false,
      isDefeated: false,
      isRefilling: false,
      refillTimer: 0,
      isLockedForBeam: false,
      shootTimer: 0,
      shotIndex: 0,
      laserTimer: 0,
      megaLaserTimer: 0,
      animTimer: 0,
    };
  }

  private activateBoss(): void {
    const phases = this.getActiveBossPhases();
    const hp = Math.round(phases[0].maxHp * this.getSquadHpScale());
    this.stageState = 'boss_battle';
    this.boss.isActive = true;
    this.boss.isDefeated = false;
    this.boss.phase = 1;
    this.boss.remainingStocks = 4;
    this.boss.hp = hp;
    this.boss.maxHp = hp;
    this.boss.spellcardName = phases[0].name;
    this.boss.isSpellCard = phases[0].isSpellCard;
    this.boss.shootTimer = 0;
    this.boss.shotIndex = 0;
    this.boss.laserTimer = 1.2;
    this.boss.megaLaserTimer = 0;
  }

  private step(dt: number): void {
    this.tick++;
    this.stageTime += dt;

    this.updateTimeline();
    this.updatePlayers(dt);
    this.world.step(dt);
    this.updateBoss(dt);
    this.updateEnemies(dt);
    this.updateItems(dt);
    this.updateBullets(dt);
    this.updateLasers(dt);
    this.updateBeamStruggle(dt);
    this.updateWalls(dt);

    if (this.autoAdvanceTimer > 0 && this.stageState === 'stage_clear') {
      this.autoAdvanceTimer = Math.max(0, this.autoAdvanceTimer - dt);
      if (this.autoAdvanceTimer <= 0) {
        this.advanceStage();
      }
    }
  }

  private updateTimeline(): void {
    const fireOnce = (key: string, at: number, fn: () => void) => {
      if (this.stageTime >= at && !this.triggeredEvents.has(key)) {
        this.triggeredEvents.add(key);
        fn();
      }
    };

    if (this.customStageProfile && Array.isArray(this.customStageProfile.waves)) {
      fireOnce('banner', 0.1, () => {
        this.stageState = 'waves';
      });
      for (const w of this.customStageProfile.waves) {
        fireOnce(w.key, w.at, () => {
          for (const spec of w.enemies || []) {
            this.enemies.push({
              id: `en_${this.nextEntityId++}`,
              type: spec.type || 'green_fairy',
              x: spec.startX ?? WORLD_WIDTH + 45,
              y: spec.startY ?? 300,
              startX: spec.startX ?? WORLD_WIDTH + 45,
              startY: spec.startY ?? 300,
              speed: spec.speed ?? 140,
              hp: spec.hp ?? 20,
              maxHp: spec.hp ?? 20,
              radius: spec.radius ?? 16,
              itemDrop: spec.itemDrop || 'power',
              trajectory: spec.trajectory || 'sine',
              attackPattern: spec.attackPattern || 'aimed_single',
              shootInterval: spec.shootInterval ?? 1.5,
              shootTimer: -(spec.shootDelay ?? 0.2),
              spawnTime: 0,
              bulletColor: spec.bulletColor ?? 0xff2b5b,
              customParams: spec.customParams || { freq: spec.freq, amp: spec.amp, phase: spec.phase, hoverX: spec.hoverX, hoverTime: spec.hoverTime },
            });
          }
        });
      }
      if (!this.customStageProfile.disableBoss) {
        fireOnce('warn', this.customStageProfile.bossWarningAt ?? 31.5, () => {
          if (!this.boss.isActive && !this.boss.isDefeated) {
            this.stageState = 'boss_warning';
          }
        });
        fireOnce('boss', this.customStageProfile.bossSpawnAt ?? 34.5, () => {
          if (!this.boss.isActive && !this.boss.isDefeated) {
            this.activateBoss();
          }
        });
      }
      return;
    }

    const cfg = this.getCurrentSpaceConfig();
    const squadScale = this.getSquadHpScale();

    fireOnce('banner', 0.1, () => {
      this.stageState = 'waves';
    });

    for (const w of cfg.waves) {
      fireOnce(w.key, w.at, () => {
        for (const spec of w.enemies) {
          const scaledHp = Math.max(8, Math.round(spec.hp * squadScale));
          this.enemies.push({
            id: `en_${this.nextEntityId++}`,
            type: spec.type,
            x: spec.startX,
            y: spec.startY,
            startX: spec.startX,
            startY: spec.startY,
            speed: spec.speed,
            hp: scaledHp,
            maxHp: scaledHp,
            radius: spec.radius,
            itemDrop: spec.itemDrop,
            trajectory: spec.trajectory,
            attackPattern: spec.attackPattern,
            shootInterval: spec.shootInterval,
            shootTimer: -(spec.shootDelay ?? 0.25),
            spawnTime: 0,
            bulletColor: spec.bulletColor,
            customParams: spec.customParams || {},
          });
        }
      });
    }

    fireOnce('warn', cfg.bossWarningAt, () => {
      if (!this.boss.isActive && !this.boss.isDefeated) {
        this.stageState = 'boss_warning';
      }
    });

    fireOnce('boss', cfg.bossSpawnAt, () => {
      if (!this.boss.isActive && !this.boss.isDefeated) {
        this.activateBoss();
      }
    });
  }

  private getAutoAimTargets(): Array<{ x: number; y: number }> {
    const targets: Array<{ x: number; y: number }> = [];
    for (const e of this.enemies) {
      if (e.hp > 0) targets.push({ x: e.x, y: e.y });
    }
    if (this.boss.isActive && !this.boss.isDefeated && this.boss.hp > 0) {
      targets.push({ x: this.boss.x, y: this.boss.y });
    }
    if (targets.length === 0) {
      targets.push({ x: 700, y: 300 });
    }
    return targets;
  }

  private spawnAutoAimShot(ownerId: string, x: number, y: number, speed: number, damage: number): void {
    const targets = this.getAutoAimTargets();
    let best = targets[0];
    let bestDistSq = Infinity;
    for (const t of targets) {
      const d = (t.x - x) * (t.x - x) + (t.y - y) * (t.y - y);
      if (d < bestDistSq) {
        bestDistSq = d;
        best = t;
      }
    }
    const angle = Math.atan2(best.y - y, best.x - x);
    this.bullets.push({
      id: this.nextBulletId++,
      ownerId,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 4,
      ttl: 2.6,
      type: 'autoaim',
      damage,
      color: 0xff00ff,
    });
  }

  private spawnLaser(
    ownerId: string,
    direction: 'left' | 'right',
    sourceX: number,
    sourceY: number,
    targetY: number,
    chargeDuration: number,
    fireDuration: number,
    fadeDuration: number,
    maxWidth: number,
    color: number,
    isMegaBeam: boolean
  ): void {
    this.lasers.push({
      id: `laser_${this.nextEntityId++}`,
      ownerId,
      direction,
      sourceX,
      sourceY,
      targetY,
      state: chargeDuration > 0 ? 'charging' : 'firing',
      timer: 0,
      chargeDuration,
      fireDuration,
      fadeDuration,
      maxWidth,
      currentWidth: chargeDuration > 0 ? 4 : maxWidth,
      dps: 50,
      color,
      isMegaBeam,
    });
  }

  private executePlayerSkill(p: SimPlayer, action: string): void {
    if (this.customStageProfile?.disableWeapons || p.skillCooldown > 0 || p.hp <= 0) return;
    const pos = p.body.getPosition();
    const roleKey = normalizeRoleKey(p.character);

    if ((action === 'wall' || (roleKey === 'tank' && action === 'special')) && p.sp >= 250) {
      this.walls.push({
        id: `wall_${this.nextEntityId++}`,
        ownerId: p.id,
        x: pos.x + 26,
        y: pos.y,
        vx: 38,
        vy: 0,
        width: 16,
        height: 68,
        hp: 25,
        maxHp: 25,
        ttl: 1.75,
      });
      p.skillCooldown = SKILL_COOLDOWN;
      p.sp = Math.max(0, p.sp - 250);
      return;
    }

    if ((action === 'laser' || (roleKey === 'special_attack' && action === 'special')) && p.sp >= 500) {
      this.spawnLaser(p.id, 'right', pos.x + 16, pos.y, pos.y, 0.28, 1.15, 0.22, 34, 0x00f0ff, false);
      p.skillCooldown = SKILL_COOLDOWN * 2;
      p.sp = Math.max(0, p.sp - 500);
      return;
    }

    if (roleKey === 'support' && action === 'special' && p.sp >= 400) {
      for (const offsetY of [-18, -10, -4, 4, 10, 18]) {
        this.spawnAutoAimShot(p.id, pos.x + 16, pos.y + offsetY, 710, p.stats.bulletDamage * 1.6);
      }
      for (const [, ally] of this.players) {
        if (ally.hp > 0) {
          ally.hp = Math.min(ally.stats.hpMax, ally.hp + 28);
        }
      }
      p.skillCooldown = SKILL_COOLDOWN * 1.5;
      p.sp = Math.max(0, p.sp - 400);
      return;
    }

    if (roleKey === 'dps' && action === 'special' && p.sp >= 350) {
      for (const a of [-0.21, -0.14, -0.07, -0.02, 0.02, 0.07, 0.14, 0.21]) {
        this.bullets.push({
          id: this.nextBulletId++,
          ownerId: p.id,
          x: pos.x + 18,
          y: pos.y,
          vx: Math.cos(a) * 840,
          vy: Math.sin(a) * 840,
          radius: 5,
          ttl: 2.5,
          type: 'normal',
          damage: p.stats.bulletDamage * 2.2,
          color: 0x00f2fe,
        });
      }
      p.skillCooldown = SKILL_COOLDOWN;
      p.sp = Math.max(0, p.sp - 350);
    }
  }

  private updatePlayers(dt: number): void {
    const locked = this.struggle.active || !!this.struggle.isAligning;

    for (const [, p] of this.players) {
      if (p.hp <= 0) {
        p.body.setLinearVelocity(planck.Vec2(0, 0));
        continue;
      }

      if (p.isBot) {
        const pos = p.body.getPosition();
        const desiredY = 300 + Math.sin(this.stageTime * 1.7 + pos.x * 0.02) * 145;
        p.input.dx = Math.cos(this.stageTime * 1.05) * 0.25;
        p.input.dy = Math.max(-1, Math.min(1, (desiredY - pos.y) / 80));
        if (this.customStageProfile?.disableWeapons) {
          p.input.action = null;
        } else if (this.struggle.active) {
          p.input.action = 'struggle_push';
        } else if (p.skillCooldown <= 0 && p.sp >= 520 && (this.enemies.length >= 4 || this.boss.isActive)) {
          const rk = normalizeRoleKey(p.character);
          p.input.action = rk === 'tank' ? 'wall' : rk === 'special_attack' ? 'laser' : 'special';
        } else {
          p.input.action = 'shoot';
        }
      }

      p.shootCooldown = Math.max(0, p.shootCooldown - dt);
      p.skillCooldown = Math.max(0, p.skillCooldown - dt);
      p.sp = Math.min(p.stats.spMax, p.sp + dt * 50);

      const { dx, dy, action, focus } = p.input;
      if (!locked) {
        const len = Math.hypot(dx, dy);
        const nx = len > 1 ? dx / len : dx;
        const ny = len > 1 ? dy / len : dy;
        const speed = focus ? PLAYER_SPEED * 0.45 : PLAYER_SPEED;
        p.body.setLinearVelocity(planck.Vec2(nx * speed, ny * speed));
        if (nx !== 0 || ny !== 0) p.angle = Math.atan2(ny, nx);
      } else {
        p.body.setLinearVelocity(planck.Vec2(0, 0));
      }

      if (action === 'struggle_push') {
        if (!p.isBot) this.pushStruggle();
      } else if (action === 'wall' || action === 'laser' || action === 'special') {
        this.executePlayerSkill(p, action);
      } else if (!this.customStageProfile?.disableWeapons && action === 'shoot' && p.shootCooldown <= 0 && !locked) {
        const pos = p.body.getPosition();
        const roleKey = normalizeRoleKey(p.character);
        if (roleKey === 'support') {
          this.spawnAutoAimShot(p.id, pos.x + 16, pos.y, 660, p.stats.bulletDamage);
        } else if (roleKey === 'tank') {
          this.bullets.push({
            id: this.nextBulletId++,
            ownerId: p.id,
            x: pos.x + 16,
            y: pos.y,
            vx: 620,
            vy: 0,
            radius: 5,
            ttl: 2.5,
            type: 'normal',
            damage: p.stats.bulletDamage,
            color: 0x00ff88,
          });
        } else {
          for (const offsetY of [-6, 6]) {
            this.bullets.push({
              id: this.nextBulletId++,
              ownerId: p.id,
              x: pos.x + 16,
              y: pos.y + offsetY,
              vx: 760,
              vy: 0,
              radius: 4,
              ttl: 2.5,
              type: 'normal',
              damage: p.stats.bulletDamage,
              color: 0x00f2fe,
            });
          }
        }
        p.shootCooldown = 1 / Math.max(0.1, p.stats.shotsPerSecond);
      }
    }
  }

  private getAveragePlayerPos(): { x: number; y: number } {
    let sx = 0;
    let sy = 0;
    let c = 0;
    for (const [, p] of this.players) {
      if (p.hp <= 0) continue;
      const pos = p.body.getPosition();
      sx += pos.x;
      sy += pos.y;
      c++;
    }
    return c > 0 ? { x: sx / c, y: sy / c } : { x: 120, y: 300 };
  }

  private updateEnemies(dt: number): void {
    const target = this.getAveragePlayerPos();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.spawnTime += dt;
      const t = e.spawnTime;
      const p = e.customParams || {};

      switch (e.trajectory) {
        case 'v_formation':
          e.x -= e.speed * dt;
          e.y = e.startY + Math.sin(t * 1.8) * (p.driftY ?? 16);
          break;
        case 'perimeter_skimmer':
          e.x -= e.speed * dt;
          e.y = e.startY + Math.sin(t * 3.2) * (p.bobAmp ?? 12);
          break;
        case 'orbit_anchor': {
          const ax = p.anchorX ?? 545;
          const ay = p.anchorY ?? 300;
          const r = p.orbitR ?? 80;
          const ang = t * 2.1 + (p.phase ?? 0);
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
          e.y = e.startY + Math.sin(t * (p.freq ?? 2.1) + (p.phase ?? 0)) * (p.ampY ?? 140);
          break;
        case 'swoop_arc': {
          const apexX = p.apexX ?? 510;
          const targetY = p.targetY ?? 300;
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
        case 'double_helix':
          e.x -= e.speed * dt;
          e.y = e.startY + (p.amp ?? 70) * Math.sin((p.freq ?? 3.0) * t + (p.phase ?? 0));
          break;
        case 'hover_retreat': {
          const hoverX = p.hoverX ?? 560;
          const hoverTime = p.hoverTime ?? 4.2;
          if (e.x > hoverX && t <= hoverTime) e.x -= e.speed * 1.25 * dt;
          else if (t > hoverTime) e.x -= e.speed * 0.7 * dt;
          e.y = e.startY + Math.sin(t * 2.4) * 16;
          break;
        }
        case 'spiral':
          e.x -= e.speed * 0.68 * dt;
          e.y = e.startY + Math.sin(t * 2.9 + (p.phase ?? 0)) * 68;
          break;
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
          e.y = Math.max(36, Math.min(WORLD_HEIGHT - 36, e.y + (Math.floor(t * 1.8) % 2 === 0 ? 1 : -1) * e.speed * 0.55 * dt));
          break;
        default:
          e.x -= e.speed * dt;
          break;
      }

      if (e.x < -70 || (e.spawnTime > 6.0 && e.x > WORLD_WIDTH + 220) || e.y < -90 || e.y > WORLD_HEIGHT + 90) {
        this.enemies.splice(i, 1);
        continue;
      }

      e.shootTimer += dt;
      if (e.x < WORLD_WIDTH - 8 && e.x > 40 && e.shootTimer >= e.shootInterval) {
        e.shootTimer = 0;
        this.fireEnemyPattern(e, target);
      }
    }
  }

  private fireEnemyPattern(e: SimEnemy, target: { x: number; y: number }): void {
    const aim = Math.atan2(target.y - e.y, target.x - e.x);
    const col = e.bulletColor || 0xff2b5b;
    const t = e.spawnTime;

    switch (e.attackPattern) {
      case 'aimed_single':
        this.spawnEnemyBullet(e.x, e.y, aim, 188, 4, col);
        break;
      case 'aimed_spread':
        for (const off of [-0.26, 0, 0.26]) {
          this.spawnEnemyBullet(e.x, e.y, aim + off, 185, 4, col);
        }
        break;
      case 'crescent_arc':
        [-0.36, -0.18, 0, 0.18, 0.36].forEach((off, idx) => {
          this.spawnEnemyBullet(e.x, e.y, aim + off, 195 - Math.abs(idx - 2) * 14, 4.5, col);
        });
        break;
      case 'prism_fan':
        this.spawnEnemyBullet(e.x, e.y, aim - 0.22, 198, 4, col);
        this.spawnEnemyBullet(e.x, e.y, aim + 0.22, 198, 4, col);
        this.spawnEnemyBullet(e.x, e.y, aim, 152, 5, 0xffffff);
        break;
      case 'siege_curtain':
        this.spawnEnemyBullet(e.x - 10, e.y - 10, Math.PI, 192, 4.5, col);
        this.spawnEnemyBullet(e.x - 10, e.y + 10, Math.PI, 192, 4.5, col);
        break;
      case 'nova_mandala': {
        const petals = e.customParams?.petals || 5;
        const total = petals * 3;
        const rot = t * 1.1;
        for (let k = 0; k < total; k++) {
          const theta = (Math.PI * 2 * k) / total;
          const factor = 1 - 0.22 * Math.abs(Math.sin(petals * theta * 0.5));
          this.spawnEnemyBullet(e.x, e.y, rot + theta, 175 * factor, k % 3 === 0 ? 5 : 4, k % 3 === 0 ? 0xffffff : col);
        }
        break;
      }
      case 'pulsar_sweep': {
        const dir = e.customParams?.spinDir || 1;
        const base = t * 2.1 * dir;
        for (let b = 0; b < 3; b++) {
          this.spawnEnemyBullet(e.x, e.y, base + (Math.PI * 2 * b) / 3, 182, 4.5, col);
        }
        break;
      }
      case 'helix_stream':
        this.spawnEnemyBullet(e.x, e.y, aim + 0.19, 196, 4, col);
        this.spawnEnemyBullet(e.x, e.y, aim - 0.19, 196, 4, 0x00f2fe);
        break;
      case 'flower_burst':
        for (let k = 0; k < 6; k++) {
          this.spawnEnemyBullet(e.x, e.y, t * 1.4 + (Math.PI * 2 * k) / 6, 172, 4.5, col);
        }
        break;
      case 'ring_burst':
        for (let k = 0; k < 10; k++) {
          this.spawnEnemyBullet(e.x, e.y, t * 0.8 + (Math.PI * 2 * k) / 10, 158, 4, col);
        }
        break;
      case 'star_rings':
        for (let k = 0; k < 12; k++) {
          this.spawnEnemyBullet(e.x, e.y, t * 1.7 + (Math.PI * 2 * k) / 12, 154, 5, col);
        }
        break;
      case 'cross_spread':
        for (const off of [-0.32, 0, 0.32]) {
          this.spawnEnemyBullet(e.x, e.y, aim + off, 200, 4, col);
        }
        break;
      case 'needle_stream':
        this.spawnEnemyBullet(e.x, e.y, aim, 228, 3.5, col);
        break;
      case 'spiral_barrage':
        for (let k = 0; k < 4; k++) {
          this.spawnEnemyBullet(e.x, e.y, t * 3.4 + (Math.PI / 2) * k, 168, 4, col);
        }
        break;
    }
  }

  private spawnEnemyBullet(x: number, y: number, angle: number, speed: number, radius: number, color: number, damage: number = 5): void {
    this.bullets.push({
      id: this.nextBulletId++,
      ownerId: 'boss',
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      ttl: 4.4,
      type: 'normal',
      damage,
      color,
    });
  }

  private updateBoss(dt: number): void {
    if (!this.boss.isActive || this.boss.isDefeated) return;

    this.boss.animTimer += dt;

    if (this.boss.isRefilling) {
      this.boss.refillTimer -= dt;
      this.boss.hp = Math.min(this.boss.maxHp, this.boss.hp + this.boss.maxHp * dt * 1.4);
      if (this.boss.refillTimer <= 0) {
        this.boss.isRefilling = false;
        this.boss.hp = this.boss.maxHp;
      }
      return;
    }

    const hasMega = this.lasers.some((l) => l.ownerId === 'boss' && l.isMegaBeam);
    if (this.boss.isLockedForBeam && !hasMega) {
      this.boss.isLockedForBeam = false;
    }

    if (this.struggle.active || this.struggle.isAligning) return;

    const cfg = this.getCurrentSpaceConfig();
    const profile = cfg.bossProfile;
    const phases = this.getActiveBossPhases();
    const phaseDef = phases[this.boss.phase - 1] || phases[0];

    if (!this.boss.isLockedForBeam) {
      const nextPos = computeBossMovement(
        profile.moveArchetype,
        this.boss.targetX,
        this.boss.targetY,
        this.boss.animTimer,
        this.boss.phase
      );
      this.boss.x = Math.max(540, Math.min(755, nextPos.x));
      this.boss.y = Math.max(85, Math.min(515, nextPos.y));
    } else {
      return;
    }

    const target = this.getAveragePlayerPos();
    this.boss.shootTimer += dt;
    this.boss.laserTimer += dt;

    if (this.boss.shootTimer >= (phaseDef.shootInterval || 0.38)) {
      this.boss.shootTimer = 0;
      fireBossPattern(
        phaseDef.pattern || 'crescent_fan',
        {
          bossX: this.boss.x,
          bossY: this.boss.y,
          playerX: target.x,
          playerY: target.y,
          animTimer: this.boss.animTimer,
          shotIndex: this.boss.shotIndex++,
          palette: profile.palette,
          speedScale: profile.speedScale,
          phase: this.boss.phase,
        },
        (bx, by, angle, speed, radius, color, damage) => {
          this.spawnEnemyBullet(bx, by, angle, speed, radius, color, damage);
        }
      );
    }

    if (phaseDef.laserMode !== 'none' && this.boss.laserTimer >= (phaseDef.laserInterval || 4.2)) {
      this.boss.laserTimer = 0;
      const topY = Math.max(90, this.boss.y - 54);
      const botY = Math.min(510, this.boss.y + 54);
      if (phaseDef.laserMode === 'both') {
        this.spawnLaser('boss', 'left', this.boss.x - 22, topY, topY, 0.72, 1.0, 0.3, 28, profile.palette[1], false);
        this.spawnLaser('boss', 'left', this.boss.x - 22, botY, botY, 0.72, 1.0, 0.3, 28, profile.palette[1], false);
      } else {
        const py = target.y < this.boss.y ? topY : botY;
        this.spawnLaser('boss', 'left', this.boss.x - 22, py, py, 0.65, 1.0, 0.3, 32, profile.palette[0], false);
      }
    }

    if (phaseDef.megaLaserInterval > 0) {
      this.boss.megaLaserTimer += dt;
      if (this.boss.megaLaserTimer >= phaseDef.megaLaserInterval) {
        this.boss.megaLaserTimer = 0;
        this.boss.isLockedForBeam = true;
        this.boss.x = 730;
        this.boss.targetX = 730;
        this.boss.y = Math.max(150, Math.min(450, this.boss.y));
        this.spawnLaser('boss', 'left', this.boss.x - 20, this.boss.y, this.boss.y, 1.25, 1.85, 0.35, 76, profile.palette[2], true);
      }
    }
  }

  private damageBoss(amount: number): void {
    if (!this.boss.isActive || this.boss.isDefeated || this.boss.isRefilling) return;
    this.boss.hp = Math.max(0, this.boss.hp - amount);
    if (this.boss.hp <= 0) {
      this.advanceBossPhaseOrDefeat();
    }
  }

  private advanceBossPhaseOrDefeat(): void {
    this.bullets = this.bullets.filter((b) => b.ownerId !== 'boss');
    if (this.boss.remainingStocks > 0) {
      this.boss.remainingStocks--;
      this.boss.phase = Math.min(5, this.boss.phase + 1);
      const phases = this.getActiveBossPhases();
      const spell = phases[this.boss.phase - 1] || phases[phases.length - 1];
      const nextHp = Math.round(spell.maxHp * this.getSquadHpScale());
      this.boss.maxHp = nextHp;
      this.boss.hp = 1;
      this.boss.spellcardName = spell.name;
      this.boss.isSpellCard = spell.isSpellCard;
      this.boss.isRefilling = true;
      this.boss.refillTimer = 0.9;
      this.boss.shootTimer = 0;
      this.boss.laserTimer = 0;
      this.boss.megaLaserTimer = 0;
      this.spawnItemFountain(this.boss.x, this.boss.y, 8);
    } else {
      this.boss.isDefeated = true;
      this.boss.isActive = false;
      this.stageState = 'stage_clear';
      this.lasers = [];
      this.spawnItemFountain(this.boss.x, this.boss.y, 18);
      if (!this.customStageProfile && this.stageIndex < TOTAL_STAGES_PER_DIFFICULTY - 1) {
        this.autoAdvanceTimer = this.autoAdvanceDuration;
      }
    }
  }

  private spawnItemFountain(x: number, y: number, count: number): void {
    const types: Array<'power' | 'point' | 'bomb_frag' | 'life_frag'> = ['power', 'point', 'bomb_frag', 'life_frag'];
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count;
      this.items.push({
        id: `item_${this.nextEntityId++}`,
        x: x + Math.cos(a) * 20,
        y: y + Math.sin(a) * 20,
        vx: -90 + Math.cos(a) * 40,
        vy: Math.sin(a) * 55,
        type: types[i % types.length],
        magnetizedTo: null,
      });
    }
  }

  private updateItems(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      let closestPlayer: SimPlayer | null = null;
      let closestDist = Infinity;
      for (const [, p] of this.players) {
        if (p.hp <= 0) continue;
        const pos = p.body.getPosition();
        const dist = Math.hypot(pos.x - item.x, pos.y - item.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestPlayer = p;
        }
        if (dist < 115 || pos.x > 520) {
          item.magnetizedTo = p.id;
        }
      }

      if (item.magnetizedTo) {
        const targetPlayer = this.players.get(item.magnetizedTo) || closestPlayer;
        if (targetPlayer && targetPlayer.hp > 0) {
          const pos = targetPlayer.body.getPosition();
          const a = Math.atan2(pos.y - item.y, pos.x - item.x);
          item.vx = Math.cos(a) * 480;
          item.vy = Math.sin(a) * 480;
        }
      } else {
        item.vx = Math.max(-140, item.vx - 80 * dt);
        item.vy *= 0.96;
      }

      item.x += item.vx * dt;
      item.y += item.vy * dt;

      if (closestPlayer && closestDist < 24) {
        if (item.type === 'power') closestPlayer.sp = Math.min(closestPlayer.stats.spMax, closestPlayer.sp + 50);
        else if (item.type === 'point') closestPlayer.sp = Math.min(closestPlayer.stats.spMax, closestPlayer.sp + 30);
        else if (item.type === 'bomb_frag') closestPlayer.sp = Math.min(closestPlayer.stats.spMax, closestPlayer.sp + 165);
        else if (item.type === 'life_frag') closestPlayer.hp = Math.min(closestPlayer.stats.hpMax, closestPlayer.hp + 28);
        this.items.splice(i, 1);
        continue;
      }

      if (item.x < -50 || item.x > WORLD_WIDTH + 80 || item.y < -60 || item.y > WORLD_HEIGHT + 60) {
        this.items.splice(i, 1);
      }
    }
  }

  private updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ttl -= dt;

      if (b.ttl <= 0 || b.x < -30 || b.x > WORLD_WIDTH + 30 || b.y < -30 || b.y > WORLD_HEIGHT + 30) {
        this.bullets.splice(i, 1);
        continue;
      }

      if (b.ownerId === 'boss') {
        let hitPlayer = false;
        for (const [, p] of this.players) {
          if (p.hp <= 0) continue;
          const pos = p.body.getPosition();
          const hitRadius = p.input.focus ? 5 : PLAYER_RADIUS;
          const dx = b.x - pos.x;
          const dy = b.y - pos.y;
          if (dx * dx + dy * dy <= (hitRadius + b.radius) * (hitRadius + b.radius)) {
            this.applyDamageToPlayer(p, b.damage);
            hitPlayer = true;
            break;
          }
        }
        if (hitPlayer) {
          this.bullets.splice(i, 1);
        }
      } else {
        let consumed = false;
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          const dx = b.x - e.x;
          const dy = b.y - e.y;
          if (dx * dx + dy * dy <= (e.radius + b.radius) * (e.radius + b.radius)) {
            e.hp -= b.damage;
            const owner = this.players.get(b.ownerId);
            if (owner) owner.sp = Math.min(owner.stats.spMax, owner.sp + owner.stats.spChargePerHit);
            if (e.hp <= 0) {
              this.items.push({
                id: `item_${this.nextEntityId++}`,
                x: e.x,
                y: e.y,
                vx: -60,
                vy: 0,
                type: e.itemDrop,
                magnetizedTo: null,
              });
              for (const [, p] of this.players) {
                if (p.hp > 0) p.sp = Math.min(p.stats.spMax, p.sp + 65);
              }
              this.enemies.splice(j, 1);
            }
            consumed = true;
            break;
          }
        }
        if (consumed) {
          this.bullets.splice(i, 1);
          continue;
        }

        if (this.boss.isActive && !this.boss.isDefeated) {
          const dx = b.x - this.boss.x;
          const dy = b.y - this.boss.y;
          if (dx * dx + dy * dy <= (42 + b.radius) * (42 + b.radius)) {
            const owner = this.players.get(b.ownerId);
            if (owner) owner.sp = Math.min(owner.stats.spMax, owner.sp + owner.stats.spChargePerHit);
            this.damageBoss(b.damage * 0.35);
            this.bullets.splice(i, 1);
          }
        }
      }
    }
  }

  private updateLasers(dt: number): void {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      l.timer += dt;

      if (l.state === 'charging' && l.timer >= l.chargeDuration) {
        l.state = 'firing';
        l.timer = 0;
        l.currentWidth = l.maxWidth;
      } else if (l.state === 'firing' && !this.struggle.active && l.timer >= l.fireDuration) {
        l.state = 'fading';
        l.timer = 0;
      } else if (l.state === 'fading') {
        l.currentWidth = Math.max(0, l.maxWidth * (1 - l.timer / Math.max(0.05, l.fadeDuration)));
        if (l.timer >= l.fadeDuration) {
          this.lasers.splice(i, 1);
          continue;
        }
      }

      if (l.state !== 'firing') continue;

      const halfW = l.currentWidth * 0.5;

      for (let bIdx = this.bullets.length - 1; bIdx >= 0; bIdx--) {
        const b = this.bullets[bIdx];
        if (b.type === 'laser') continue;
        const inX = l.direction === 'right' ? b.x >= l.sourceX : b.x <= l.sourceX;
        if (inX && Math.abs(b.y - l.sourceY) <= halfW + b.radius) {
          this.bullets.splice(bIdx, 1);
        }
      }

      if (l.ownerId === 'boss') {
        for (const w of this.walls) {
          if (w.x <= l.sourceX && Math.abs(w.y - l.sourceY) <= halfW + w.height * 0.5) {
            w.hp = Math.max(0, w.hp - l.dps * dt);
          }
        }
      }

      if (this.struggle.active || this.struggle.isAligning) continue;

      if (l.ownerId === 'boss') {
        for (const [, p] of this.players) {
          if (p.hp <= 0) continue;
          const pos = p.body.getPosition();
          if (pos.x <= l.sourceX && Math.abs(pos.y - l.sourceY) <= halfW + PLAYER_RADIUS) {
            this.applyDamageToPlayer(p, l.dps * dt);
          }
        }
      } else {
        for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
          const e = this.enemies[eIdx];
          if (e.x >= l.sourceX && Math.abs(e.y - l.sourceY) <= halfW + e.radius) {
            e.hp -= 95 * dt;
            if (e.hp <= 0) {
              this.items.push({
                id: `item_${this.nextEntityId++}`,
                x: e.x,
                y: e.y,
                vx: -60,
                vy: 0,
                type: e.itemDrop,
                magnetizedTo: null,
              });
              this.enemies.splice(eIdx, 1);
            }
          }
        }
        if (this.boss.isActive && !this.boss.isDefeated) {
          if (this.boss.x >= l.sourceX && Math.abs(this.boss.y - l.sourceY) <= halfW + 42) {
            this.damageBoss(65 * dt);
          }
        }
      }
    }
  }

  private updateBeamStruggle(dt: number): void {
    if ((this.struggle.resolutionTimer ?? 0) > 0) {
      this.struggle.resolutionTimer = Math.max(0, (this.struggle.resolutionTimer ?? 0) - dt);
      if (this.struggle.resolutionTimer === 0) {
        this.struggle.winner = null;
      }
    }

    const playerLaser = this.lasers.find((l) => l.ownerId !== 'boss' && (l.state === 'charging' || l.state === 'firing'));
    const bossMega = this.lasers.find(
      (l) => l.ownerId === 'boss' && (l.isMegaBeam || l.maxWidth >= 60) && (l.state === 'charging' || l.state === 'firing')
    );

    if (!this.struggle.active && !this.struggle.isAligning) {
      if (playerLaser && bossMega && Math.abs(playerLaser.sourceY - bossMega.sourceY) <= 95) {
        this.struggle.isAligning = true;
        this.alignTimer = 0.5;
        const midY = (playerLaser.sourceY + bossMega.sourceY) * 0.5;
        playerLaser.sourceY = midY;
        playerLaser.targetY = midY;
        bossMega.sourceY = midY;
        bossMega.targetY = midY;
        this.struggle.clashY = midY;
        this.struggle.clashX = (playerLaser.sourceX + bossMega.sourceX) * 0.5;
      }
      return;
    }

    if (this.struggle.isAligning) {
      this.alignTimer -= dt;
      if (this.alignTimer <= 0) {
        this.struggle.isAligning = false;
        this.struggle.active = true;
        this.struggle.balance = 50;
        this.struggle.timer = 4.5;
        this.struggle.maxTimer = 4.5;
        if (playerLaser) {
          playerLaser.state = 'firing';
          playerLaser.fireDuration = 8.0;
          playerLaser.timer = 0;
        }
        if (bossMega) {
          bossMega.state = 'firing';
          bossMega.fireDuration = 8.0;
          bossMega.timer = 0;
        }
      }
      return;
    }

    if (this.struggle.active) {
      if (!playerLaser || !bossMega) {
        this.struggle.active = false;
        return;
      }

      this.struggle.timer = Math.max(0, this.struggle.timer - dt);
      const bossPush = this.difficulty === 'no_mercy' ? 19 : this.difficulty === 'difficult' ? 16.5 : 14;
      let allyAssist = 0;
      for (const [, p] of this.players) {
        if (p.isBot && p.hp > 0) allyAssist += 4.5;
      }
      this.struggle.balance = Math.max(0, Math.min(100, this.struggle.balance + (allyAssist - bossPush) * dt));

      const minX = playerLaser.sourceX + 40;
      const maxX = bossMega.sourceX - 40;
      const clashX = minX + (maxX - minX) * (this.struggle.balance / 100);
      this.struggle.clashX = clashX;
      this.struggle.clashY = playerLaser.sourceY;
      this.struggle.playerTipX = clashX;
      this.struggle.bossTipX = clashX;
      this.struggle.vortexX = clashX;
      this.struggle.vortexY = playerLaser.sourceY;

      if (this.struggle.balance >= 96 || (this.struggle.timer <= 0 && this.struggle.balance >= 50)) {
        this.struggle.active = false;
        this.struggle.winner = 'player';
        this.struggle.resolutionTimer = 1.2;
        this.lasers = [];
        this.advanceBossPhaseOrDefeat();
      } else if (this.struggle.balance <= 4 || (this.struggle.timer <= 0 && this.struggle.balance < 50)) {
        this.struggle.active = false;
        this.struggle.winner = 'boss';
        this.struggle.resolutionTimer = 1.2;
        this.lasers = [];
        for (const [, p] of this.players) {
          if (p.hp > 0) this.applyDamageToPlayer(p, 35);
        }
      }
    }
  }

  private updateWalls(dt: number): void {
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.ttl -= dt;

      if (w.ttl <= 0 || w.hp <= 0) {
        this.walls.splice(i, 1);
        continue;
      }

      for (let bIdx = this.bullets.length - 1; bIdx >= 0; bIdx--) {
        const b = this.bullets[bIdx];
        if (b.ownerId !== 'boss') continue;
        const halfW = w.width * 0.5 + b.radius;
        const halfH = w.height * 0.5 + b.radius;
        if (Math.abs(b.x - w.x) <= halfW && Math.abs(b.y - w.y) <= halfH) {
          this.bullets.splice(bIdx, 1);
        }
      }
    }
  }

  private applyDamageToPlayer(p: SimPlayer, rawDamage: number): void {
    const mitigation = Math.max(0, Math.min(1, p.stats.defensePercent / 100));
    const finalDamage = rawDamage * (1 - mitigation);
    p.hp = Math.max(0, Number((p.hp - finalDamage).toFixed(2)));
  }

  private buildSnapshot(): GameSnapshot {
    const meta = this.getStageMeta();
    const players = [...this.players.values()].map((p) => {
      const pos = p.body.getPosition();
      return {
        id: p.id,
        x: pos.x,
        y: pos.y,
        angle: p.angle,
        isReady: true,
        character: p.character,
        focus: p.input.focus,
        hp: Number(p.hp.toFixed(2)),
        sp: Number(p.sp.toFixed(2)),
        maxHp: p.stats.hpMax,
        maxSp: p.stats.spMax,
        defensePercent: p.stats.defensePercent,
      };
    });

    const bullets: ServerBullet[] = this.bullets.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      radius: b.radius,
      ownerId: b.ownerId,
      type: b.type,
      color: b.color,
    }));

    const walls: ServerWall[] = this.walls.map((w) => ({
      id: w.id,
      ownerId: w.ownerId,
      x: w.x,
      y: w.y,
      width: w.width,
      height: w.height,
      hp: w.hp,
      maxHp: w.maxHp,
      ttl: w.ttl,
    }));

    const lasers: ServerLaser[] = this.lasers.map((l) => ({
      id: l.id,
      ownerId: l.ownerId,
      direction: l.direction,
      sourceX: l.sourceX,
      sourceY: l.sourceY,
      targetY: l.targetY,
      state: l.state,
      timer: l.timer,
      chargeDuration: l.chargeDuration,
      fireDuration: l.fireDuration,
      fadeDuration: l.fadeDuration,
      maxWidth: l.maxWidth,
      color: l.color,
      isMegaBeam: l.isMegaBeam,
    }));

    const enemies: ServerEnemy[] = this.enemies.map((e) => ({
      id: e.id,
      type: e.type,
      x: e.x,
      y: e.y,
      hp: e.hp,
      maxHp: e.maxHp,
      radius: e.radius,
    }));

    const items: ServerItem[] = this.items.map((item) => ({
      id: item.id,
      x: item.x,
      y: item.y,
      type: item.type,
    }));

    const boss: ServerBoss = {
      x: this.boss.x,
      y: this.boss.y,
      hp: this.boss.hp,
      maxHp: this.boss.maxHp,
      phase: this.boss.phase,
      remainingStocks: this.boss.remainingStocks,
      spellcardName: this.boss.spellcardName,
      isSpellCard: this.boss.isSpellCard,
      isActive: this.boss.isActive,
      isDefeated: this.boss.isDefeated,
      isRefilling: this.boss.isRefilling,
      isLockedForBeam: this.boss.isLockedForBeam,
    };

    const difficultyLabel =
      this.customStageProfile?.difficultyLabel ||
      (this.difficulty === 'no_mercy'
        ? 'No Mercy'
        : this.difficulty === 'difficult'
          ? 'Difficult'
          : 'Normal');

    const autoAdvancing = this.stageState === 'stage_clear' && this.autoAdvanceTimer > 0;
    const transitionElapsed = this.autoAdvanceDuration - this.autoAdvanceTimer;
    const transitionBlackAlpha = autoAdvancing
      ? Math.max(0, Math.min(1, (transitionElapsed - 0.7) / 0.95))
      : 0;

    const campaign: ServerCampaign = {
      difficulty: this.difficulty,
      difficultyLabel,
      world: meta.world,
      stage: meta.stage,
      worldName: meta.worldName,
      stageTitle: meta.stageTitle,
      bossSpawnAt: meta.bossSpawnAt,
      bossWarningAt: meta.bossWarningAt,
      spaceTheme: meta.spaceTheme,
      autoAdvancing,
      transitionBlackAlpha: Number(transitionBlackAlpha.toFixed(3)),
      stageState: this.stageState,
      campaignComplete:
        this.stageState === 'stage_clear' &&
        (Boolean(this.customStageProfile) || this.stageIndex >= TOTAL_STAGES_PER_DIFFICULTY - 1),
      bannerText: meta.bannerText,
      bannerSubtext: meta.bannerSubtext,
      clearTitle: meta.clearTitle,
      clearSubtext: meta.clearSubtext,
    };

    return {
      type: 'snapshot',
      tick: this.tick,
      phase: 'playing',
      stageTime: this.stageTime,
      players,
      bullets,
      walls,
      lasers,
      enemies,
      items,
      boss,
      campaign,
      struggle: { ...this.struggle },
    };
  }
}

const sim = new DanmakrewSimulationWorker();

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data || {};
  switch (type) {
    case 'INIT':
      sim.init(
        payload?.roomId || 'local-room',
        payload?.playerId || 'player-local-host',
        payload?.classId || 'DPS',
        payload?.difficulty || 'normal',
        payload?.world ?? 1,
        payload?.stage ?? 1,
        payload?.stageProfile || null
      );
      break;
    case 'PLAYER_INPUT':
      sim.setPlayerInput(
        payload?.playerId || 'player-local-host',
        payload?.dx ?? 0,
        payload?.dy ?? 0,
        payload?.action ?? null,
        Boolean(payload?.isFocus)
      );
      break;
    case 'ADD_PLAYER':
      if (payload?.playerId) {
        sim.addPlayer(payload.playerId, payload.character || 'DPS', payload.isBot !== false);
      }
      break;
    case 'SET_ROLE':
      if (payload?.playerId && payload?.role) {
        sim.setPlayerRole(payload.playerId, payload.role);
      }
      break;
    case 'TRIGGER_SKILL':
      sim.triggerSkill(payload?.playerId || 'player-local-host');
      break;
    case 'PUSH_STRUGGLE':
      sim.pushStruggle();
      break;
    case 'SPAWN_BOSS_NOW':
      sim.spawnBossNow();
      break;
    case 'START_BEAM_STRUGGLE_TEST':
      sim.startBeamStruggleTest();
      break;
    case 'ADVANCE_STAGE':
      sim.advanceStage();
      break;
    case 'RESTART_STAGE':
      sim.restartStage();
      break;
    case 'STOP':
      sim.stop();
      break;
  }
};

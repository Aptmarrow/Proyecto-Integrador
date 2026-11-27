/// <reference lib="webworker" />

import * as planck from 'planck';
import type {
  GameSnapshot,
  ServerBullet,
  ServerWall,
  ServerLaser,
  ServerEnemy,
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
import type { BulletSpawnOpts } from '../campaign/normalCampaignOverhaul';
import {
  MO_HOME_X,
  MO_HOME_Y,
  createInitialMoState,
  resetMoCycleForPhase,
  updateWorkerMechanicalOphanim,
  type MoBossRuntimeState,
} from '../campaign/moBossEngine';
import { TouhouAutoplayBot } from '../devtools/touhouAutoplayBot';
import { DEV_TOOLS_ENABLED } from '../../config/devTools';

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const PLAYER_RADIUS = 10;
const PLAYER_SPEED_X = 375;
const PLAYER_SPEED_Y = 500;
const FOCUS_SPEED_MULTIPLIER = 0.40;
const TICK_RATE = 60;

// Raise Planck/Box2D maxTranslation ceiling (default 2.0 caps 60Hz pixel worlds to 120 u/s)
(planck as any).Settings.maxTranslation = 100;
(planck as any).Settings.maxTranslationSquared = 100 * 100;
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
    return { ...DEFAULT_STATS, hpMax: 140, defensePercent: 65, shotsPerSecond: 5.8, bulletDamage: 3.0, bombDamage: 500, spChargePerHit: 8 };
  }
  if (k === 'support') {
    return { ...DEFAULT_STATS, hpMax: 90, defensePercent: 40, shotsPerSecond: 7.2, bulletDamage: 2.7, bombDamage: 600, spChargePerHit: 12 };
  }
  if (k === 'special_attack') {
    return { ...DEFAULT_STATS, shotsPerSecond: 8.2, bulletDamage: 3.4 };
  }
  return { ...DEFAULT_STATS, shotsPerSecond: 9.5, bulletDamage: 3.1 };
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
  pendingSeq: number;
  lastProcessedSeq: number;
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
  spriteType?: string;
  accel?: number;
  expAccel?: number;
  maxSpeed?: number;
  homeRate?: number;
  homeTime?: number;
  splitOnImpact?: boolean;
  splitCount?: number;
  age?: number;
  delay?: number;
  turnAfter?: number;
  turnAngle?: number;
  turnAbsAngle?: number | null;
  turnSpeedMult?: number;
  turnColor?: number;
  turned?: boolean;
  holdTag?: number | null;
  angularVel?: number;
  freezeAfter?: number;
  freezeDur?: number;
  snapToPlayer?: boolean;
  snapOffset?: number;
  snapSpeed?: number;
  freezePhase?: number;
  freezeTimer?: number;
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
  trajectory: string;
  attackPattern: string;
  shootInterval: number;
  shootTimer: number;
  spawnTime: number;
  bulletColor: number;
  isMiniboss?: boolean;
  minibossName?: string;
  sprite?: string;
  angle?: number;
  fuseProgress?: number;
  customParams: Record<string, any>;
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
  private activeEnemyStatScale = 1.0;

  // Boss Lab / Dev Tools state (local worker only, never runs on multiplayer server)
  private devGodMode = false;
  private devInfiniteSp = false;
  private devPaused = false;
  private devBotPlay = false;
  private devTimeScale = 1.0;
  private devHitsTaken = 0;
  private readonly autoplayBot = new TouhouAutoplayBot();

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
    bossId: 'first_boss',
    sprite: '/assets/sprites/FirstBoss.png',
    fullBossName: 'FirstBoss',
    statScale: 1.0,
    angle: Math.PI,
    isInvulnerable: false,
    moIntroActive: false,
    moIntroProgress: 0,
    moDashState: 'idle',
    moDashLines: [] as Array<{ x1: number; y1: number; x2: number; y2: number; progress: number; active: boolean; completed?: boolean; isReturn?: boolean }>,
    moState: createInitialMoState(3.8) as MoBossRuntimeState,
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
        ? 'CAMPAÑA COMPLETADA'
        : `SECTOR ${cfg.world}-${cfg.stage} COMPLETADO`,
      clearSubtext: isFinal
        ? `Completaste los 9 sectores en ${diffLabel}.`
        : `${cfg.bossProfile.bossName} derrotado.`,
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
    this.addPlayer(this.myPlayerId, classId);
    this.resetStageRuntime();

    self.postMessage({
      type: 'INIT_ACK',
      roomId,
      myPlayerId: this.myPlayerId,
    });

    const tickMs = 1000 / TICK_RATE;
    let lastTime = performance.now();
    let accumulator = 0;
    this.loopTimer = setInterval(() => {
      const now = performance.now();
      const elapsedMs = Math.max(0, now - lastTime);
      lastTime = now;

      if (this.devPaused) {
        accumulator = 0;
        return;
      }

      const scaledElapsed = elapsedMs * this.devTimeScale;
      const maxSteps = this.devTimeScale > 1.25 ? 6 : 3;
      accumulator = Math.min(accumulator + scaledElapsed, tickMs * (maxSteps + 1));

      let stepped = false;
      let steps = 0;
      while (accumulator >= tickMs && steps < maxSteps) {
        accumulator -= tickMs;
        steps++;
        stepped = true;
        this.step(DT);
      }

      if (stepped) {
        this.emitSnapshotNow();
      }
    }, 4);
  }

  private emitSnapshotNow(): void {
    self.postMessage({
      type: 'SNAPSHOT',
      payload: this.buildSnapshot(),
    });
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

  public addPlayer(playerId: string, role: string): void {
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
      pendingSeq: -1,
      lastProcessedSeq: -1,
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

  public setPlayerInput(playerId: string, dx: number, dy: number, action: string | null, focus: boolean, seq?: number): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.input = {
      dx: Number.isFinite(dx) ? Math.max(-1, Math.min(1, dx)) : 0,
      dy: Number.isFinite(dy) ? Math.max(-1, Math.min(1, dy)) : 0,
      action,
      focus: Boolean(focus),
    };
    if (typeof seq === 'number' && Number.isInteger(seq) && seq > p.pendingSeq) {
      p.pendingSeq = seq;
    }
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
    if (cfg.hasBoss === false && cfg.miniboss) {
      this.spawnEndMiniboss(cfg.miniboss);
    } else {
      this.activateBoss();
    }
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
    this.devHitsTaken = 0;
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
    this.emitSnapshotNow();
  }

  // ── Boss Lab Dev Commands (local sandbox worker only) ──────────────────────
  public devJumpLevel(
    difficulty: string = 'normal',
    world: number = 1,
    stage: number = 1,
    autoSpawnBoss: boolean = false
  ): void {
    const normDiff =
      difficulty === 'no_mercy' ? 'no_mercy' : difficulty === 'difficult' ? 'difficult' : 'normal';
    const w = Math.max(1, Math.min(3, Math.floor(Number(world) || 1)));
    const s = Math.max(1, Math.min(3, Math.floor(Number(stage) || 1)));
    this.customStageProfile = null;
    this.difficulty = normDiff;
    this.stageIndex = (w - 1) * 3 + (s - 1);
    this.restartStage();
    if (autoSpawnBoss) {
      this.spawnBossNow();
      this.emitSnapshotNow();
    }
  }

  public devJumpBossPhase(targetPhase: number): void {
    if (this.customStageProfile?.disableBoss) return;
    if (!this.boss.isActive || this.boss.isDefeated) {
      this.spawnBossNow();
    }
    const phases = this.getActiveBossPhases();
    const totalPhases = Math.max(1, phases.length);
    const clampedPhase = Math.max(1, Math.min(totalPhases, Math.floor(Number(targetPhase) || 1)));
    const spell = phases[clampedPhase - 1] || phases[0];
    const hp = Math.round(spell.maxHp * this.getSquadHpScale());

    this.bullets = this.bullets.filter((b) => b.ownerId !== 'boss');
    this.lasers = [];
    this.enemies = [];
    this.stageState = 'boss_battle';
    this.autoAdvanceTimer = 0;
    this.devHitsTaken = 0;

    this.boss.isActive = true;
    this.boss.isDefeated = false;
    this.boss.isRefilling = false;
    this.boss.refillTimer = 0;
    this.boss.isInvulnerable = false;
    this.boss.isLockedForBeam = false;
    this.boss.phase = clampedPhase;
    this.boss.remainingStocks = Math.max(0, totalPhases - clampedPhase);
    this.boss.hp = hp;
    this.boss.maxHp = hp;
    this.boss.spellcardName = spell.name;
    this.boss.isSpellCard = Boolean(spell.isSpellCard);
    this.boss.shootTimer = 0;
    this.boss.shotIndex = 0;
    this.boss.laserTimer = 0.8;
    this.boss.megaLaserTimer = 0;
    this.boss.x = 685;
    this.boss.y = 300;
    this.boss.targetX = 685;
    this.boss.targetY = 300;

    if (this.boss.bossId === 'mo') {
      this.boss.x = MO_HOME_X;
      this.boss.y = MO_HOME_Y;
      this.boss.moIntroActive = false;
      this.boss.moIntroProgress = 1;
      resetMoCycleForPhase(this.boss.moState, clampedPhase);
      this.boss.moDashLines = [];
      this.boss.moDashState = 'idle';
    }

    this.emitSnapshotNow();
  }

  public devDamageBoss(mode: 'percent' | 'one_hp' | 'kill', value: number = 25): void {
    // Also support active end-stage minibosses
    const mb = this.enemies.find((e) => e.isMiniboss);
    if (mb && !this.boss.isActive) {
      if (mode === 'kill') {
        mb.hp = 0;
        this.enemies = this.enemies.filter((e) => e !== mb);
        this.handleMinibossDefeated();
      } else if (mode === 'one_hp') {
        mb.hp = 1;
      } else {
        mb.hp = Math.max(0, mb.hp - Math.ceil(mb.maxHp * (value / 100)));
        if (mb.hp <= 0) {
          this.enemies = this.enemies.filter((e) => e !== mb);
          this.handleMinibossDefeated();
        }
      }
      this.emitSnapshotNow();
      return;
    }

    if (!this.boss.isActive || this.boss.isDefeated) return;
    this.boss.isRefilling = false;
    this.boss.isInvulnerable = false;

    if (mode === 'kill') {
      this.boss.remainingStocks = 0;
      this.boss.hp = 0;
      this.advanceBossPhaseOrDefeat();
    } else if (mode === 'one_hp') {
      this.boss.hp = 1;
    } else {
      const dmg = Math.max(1, Math.ceil(this.boss.maxHp * (Math.max(1, Math.min(100, value)) / 100)));
      this.boss.hp = Math.max(0, this.boss.hp - dmg);
      if (this.boss.hp <= 0) {
        this.advanceBossPhaseOrDefeat();
      }
    }
    this.emitSnapshotNow();
  }

  public devClearBullets(): void {
    this.bullets = [];
    this.lasers = [];
    this.emitSnapshotNow();
  }

  public devSetFlags(flags: {
    godMode?: boolean;
    infiniteSp?: boolean;
    paused?: boolean;
    botPlay?: boolean;
    timeScale?: number;
  }): void {
    if (typeof flags.godMode === 'boolean') this.devGodMode = flags.godMode;
    if (typeof flags.infiniteSp === 'boolean') {
      this.devInfiniteSp = flags.infiniteSp;
      if (this.devInfiniteSp) {
        for (const [, p] of this.players) {
          p.sp = p.stats.spMax;
          p.skillCooldown = 0;
        }
      }
    }
    if (typeof flags.paused === 'boolean') this.devPaused = flags.paused;
    if (typeof flags.botPlay === 'boolean' && DEV_TOOLS_ENABLED) {
      this.devBotPlay = flags.botPlay;
      this.autoplayBot.reset();
      if (!this.devBotPlay) {
        const localPlayer = this.players.get(this.myPlayerId);
        if (localPlayer) {
          localPlayer.input = { dx: 0, dy: 0, action: null, focus: false };
        }
      }
    }
    if (typeof flags.timeScale === 'number' && Number.isFinite(flags.timeScale)) {
      this.devTimeScale = Math.max(0.1, Math.min(4.0, flags.timeScale));
    }
    this.emitSnapshotNow();
  }

  public devStepFrame(frames: number = 1): void {
    const count = Math.max(1, Math.min(30, Math.floor(frames) || 1));
    this.devPaused = true;
    for (let i = 0; i < count; i++) {
      this.step(DT);
    }
    this.emitSnapshotNow();
  }

  public devResetHits(): void {
    this.devHitsTaken = 0;
    this.emitSnapshotNow();
  }

  public devHealPlayer(): void {
    for (const [, p] of this.players) {
      p.hp = p.stats.hpMax;
      p.sp = p.stats.spMax;
      p.skillCooldown = 0;
    }
    this.emitSnapshotNow();
  }

  private resetStageRuntime(): void {
    this.bullets = [];
    this.walls = [];
    this.lasers = [];
    this.enemies = [];
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

    const cfg = this.getCurrentSpaceConfig();
    const profile = cfg.bossProfile;
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
      bossId: profile.bossId || 'first_boss',
      sprite: profile.sprite || '/assets/sprites/FirstBoss.png',
      fullBossName: profile.fullBossName || profile.bossName,
      statScale: profile.statScale || 1.0,
      angle: Math.PI,
      isInvulnerable: false,
      moIntroActive: false,
      moIntroProgress: 0,
      moDashState: 'idle',
      moDashLines: [],
      moState: createInitialMoState(3.8),
    };
  }

  private spawnEndMiniboss(mb: NonNullable<SpaceStageConfig['miniboss']>): void {
    if (this.enemies.some((e) => e.isMiniboss)) return;
    const scaledHp = Math.max(20, Math.round(mb.hp * this.getSquadHpScale()));
    this.stageState = 'boss_battle';
    this.enemies.push({
      id: `mb_${this.nextEntityId++}`,
      type: mb.type,
      x: mb.startX,
      y: mb.startY,
      startX: mb.startX,
      startY: mb.startY,
      speed: mb.speed,
      hp: scaledHp,
      maxHp: scaledHp,
      radius: mb.radius,
      trajectory: mb.trajectory,
      attackPattern: mb.attackPattern,
      shootInterval: mb.shootInterval,
      shootTimer: -(mb.shootDelay ?? 0.35),
      spawnTime: 0,
      bulletColor: mb.bulletColor,
      isMiniboss: true,
      minibossName: mb.minibossName,
      sprite: mb.sprite,
      angle: Math.PI,
      customParams: { ...(mb.customParams || {}) },
    });
  }

  private handleMinibossDefeated(): void {
    if (this.stageState === 'stage_clear') return;
    this.stageState = 'stage_clear';
    this.bullets = this.bullets.filter((b) => b.ownerId !== 'boss');
    this.lasers = [];
    if (!this.customStageProfile && this.stageIndex < TOTAL_STAGES_PER_DIFFICULTY - 1) {
      this.autoAdvanceTimer = this.autoAdvanceDuration;
    }
  }

  private activateBoss(): void {
    const cfg = this.getCurrentSpaceConfig();
    const profile = cfg.bossProfile;
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
    this.boss.bossId = profile.bossId || 'first_boss';
    this.boss.sprite = profile.sprite || '/assets/sprites/FirstBoss.png';
    this.boss.fullBossName = profile.fullBossName || profile.bossName;
    this.boss.statScale = profile.statScale || 1.0;
    this.boss.moDashLines = [];
    this.boss.moDashState = 'idle';
    this.boss.angle = Math.PI;
    if (this.boss.bossId === 'mo') {
      this.boss.x = 760;
      this.boss.y = MO_HOME_Y;
      this.boss.isInvulnerable = true;
      this.boss.moIntroActive = true;
      this.boss.moIntroProgress = 0;
      this.boss.moState = createInitialMoState(profile.introDuration || 3.8);
    } else {
      this.boss.isInvulnerable = false;
      this.boss.moIntroActive = false;
      this.boss.moIntroProgress = 0;
    }
  }

  private step(dt: number): void {
    this.tick++;
    this.stageTime += dt;

    this.updateTimeline();
    if (this.devBotPlay) {
      this.applyBotPlayInput(dt);
    }
    this.updatePlayers(dt);
    this.world.step(dt);
    this.updateBoss(dt);
    this.updateEnemies(dt);
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

  private applyBotPlayInput(dt: number): void {
    const p = this.players.get(this.myPlayerId) || [...this.players.values()].find((pl) => pl.hp > 0);
    if (!p || p.hp <= 0) return;
    const pos = p.body.getPosition();
    const decision = this.autoplayBot.computeInput(
      pos.x,
      pos.y,
      this.bullets,
      this.enemies,
      this.lasers,
      this.boss,
      Boolean(this.struggle.active),
      dt
    );
    p.input = {
      dx: decision.dx,
      dy: decision.dy,
      action: decision.action,
      focus: decision.focus,
    };
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
              trajectory: spec.trajectory || 'sine',
              attackPattern: spec.attackPattern || 'aimed_single',
              shootInterval: spec.shootInterval ?? 1.5,
              shootTimer: -(spec.shootDelay ?? 0.2),
              spawnTime: 0,
              bulletColor: spec.bulletColor ?? 0xff2b5b,
              angle: Math.PI,
              customParams: spec.customParams ? { ...spec.customParams } : { freq: spec.freq, amp: spec.amp, phase: spec.phase, hoverX: spec.hoverX, hoverTime: spec.hoverTime },
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
            trajectory: spec.trajectory,
            attackPattern: spec.attackPattern,
            shootInterval: spec.shootInterval,
            shootTimer: -(spec.shootDelay ?? 0.25),
            spawnTime: 0,
            bulletColor: spec.bulletColor,
            angle: Math.PI,
            customParams: spec.customParams ? { ...spec.customParams } : {},
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
      if (cfg.hasBoss === false && cfg.miniboss) {
        this.spawnEndMiniboss(cfg.miniboss);
      } else if (!this.boss.isActive && !this.boss.isDefeated) {
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
      this.spawnLaser(p.id, 'right', pos.x + 18, pos.y, pos.y, 0.42, 1.35, 0.30, 72, 0x00f2fe, false);
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

      p.shootCooldown = Math.max(0, p.shootCooldown - dt);
      p.skillCooldown = this.devInfiniteSp ? 0 : Math.max(0, p.skillCooldown - dt);
      p.sp = this.devInfiniteSp ? p.stats.spMax : Math.min(p.stats.spMax, p.sp + dt * 50);

      const { dx, dy, action, focus } = p.input;
      if (!locked) {
        const len = Math.hypot(dx, dy);
        const nx = len > 0 ? dx / len : 0;
        const ny = len > 0 ? dy / len : 0;
        const mult = focus ? FOCUS_SPEED_MULTIPLIER : 1.0;
        p.body.setLinearVelocity(planck.Vec2(nx * PLAYER_SPEED_X * mult, ny * PLAYER_SPEED_Y * mult));
        if (nx !== 0 || ny !== 0) p.angle = Math.atan2(ny, nx);
      } else {
        p.body.setLinearVelocity(planck.Vec2(0, 0));
      }
      if (p.pendingSeq > p.lastProcessedSeq) {
        p.lastProcessedSeq = p.pendingSeq;
      }

      if (action === 'struggle_push') {
        this.pushStruggle();
      } else if (action === 'wall' || action === 'laser' || action === 'special') {
        this.executePlayerSkill(p, action);
      } else if (!this.customStageProfile?.disableWeapons && action === 'shoot' && p.shootCooldown <= 0 && !locked) {
        const pos = p.body.getPosition();
        const roleKey = normalizeRoleKey(p.character);
        if (roleKey === 'support') {
          this.spawnAutoAimShot(p.id, pos.x + 16, pos.y, 780, p.stats.bulletDamage);
        } else if (roleKey === 'tank') {
          this.bullets.push({
            id: this.nextBulletId++,
            ownerId: p.id,
            x: pos.x + 16,
            y: pos.y,
            vx: 760,
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
              vx: 960,
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

  private getNearestPlayerPos(ex: number, ey: number): { x: number; y: number } {
    let best = { x: 120, y: 300 };
    let bestD2 = Infinity;
    for (const [, p] of this.players) {
      if (p.hp <= 0) continue;
      const pos = p.body.getPosition();
      const d2 = (pos.x - ex) * (pos.x - ex) + (pos.y - ey) * (pos.y - ey);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = pos;
      }
    }
    return bestD2 < Infinity ? best : this.getAveragePlayerPos();
  }

  private updateEnemies(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.spawnTime += dt;
      const t = e.spawnTime;
      const p = e.customParams || {};
      const target = this.getNearestPlayerPos(e.x, e.y);

      switch (e.trajectory) {
        case 'miniboss_hover': {
          const hoverX = p.hoverX ?? 590;
          const ampY = p.ampY ?? 120;
          const freqY = p.freqY ?? 1.25;
          const style = p.moveStyle || 'vertical_sine';
          if (e.x > hoverX + 35 && t < 2.2) {
            e.x = Math.max(hoverX, e.x - e.speed * 1.45 * dt);
            e.y = 300 + Math.sin(t * freqY) * (ampY * 0.35);
          } else if (style === 'figure8') {
            e.x = hoverX + Math.sin(t * freqY) * 48;
            e.y = 300 + Math.sin(t * freqY * 2) * (ampY * 0.78);
          } else if (style === 'diamond_drift') {
            const ang = t * freqY;
            const sx = Math.cos(ang);
            const sy = Math.sin(ang);
            e.x = hoverX + Math.sign(sx) * Math.pow(Math.abs(sx), 0.75) * 56;
            e.y = 300 + Math.sign(sy) * Math.pow(Math.abs(sy), 0.75) * ampY;
          } else if (style === 'arc_sway') {
            e.x = hoverX - Math.abs(Math.cos(t * freqY)) * 62;
            e.y = 300 + Math.sin(t * freqY) * ampY;
          } else if (style === 'pendulum_guard') {
            e.x = hoverX + Math.sin(t * 0.75) * 52;
            e.y = 300 + Math.cos(t * freqY) * ampY;
          } else if (style === 'orbital_patrol') {
            e.x = hoverX + Math.cos(t * freqY) * 62;
            e.y = 300 + Math.sin(t * freqY + 0.65) * ampY;
          } else {
            e.x = hoverX + Math.cos(t * 0.9) * 24;
            e.y = 300 + Math.sin(t * freqY) * ampY;
          }
          e.x = Math.max(470, Math.min(720, e.x));
          e.y = Math.max(68, Math.min(WORLD_HEIGHT - 68, e.y));
          break;
        }
        case 'kamikaze_homing': {
          const triggerDist = p.triggerDist ?? 135;
          const fuseTime = p.fuseTime ?? 1.75;
          const dx = target.x - e.x;
          const dy = target.y - e.y;
          const dist = Math.hypot(dx, dy) || 1;
          e.angle = Math.atan2(dy, dx);

          if (!p._fuseActive && dist <= triggerDist) {
            p._fuseActive = true;
            p._fuseElapsed = 0;
          }

          let curSpeed = e.speed;
          let ratio = 0;
          if (p._fuseActive) {
            p._fuseElapsed = (p._fuseElapsed || 0) + dt;
            ratio = Math.min(1, p._fuseElapsed / fuseTime);
            curSpeed = Math.max(12, e.speed * (1 - Math.pow(ratio, 1.25) * 0.92));
          }

          e.x = Math.max(-75, Math.min(WORLD_WIDTH + 90, e.x + (dx / dist) * curSpeed * dt));
          e.y = Math.max(-75, Math.min(WORLD_HEIGHT + 75, e.y + (dy / dist) * curSpeed * dt));
          e.fuseProgress = Number(ratio.toFixed(2));
          break;
        }
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

      if (e.type !== 'mo_enemy2') {
        e.angle = Math.atan2(target.y - e.y, target.x - e.x);
      }

      if (e.type === 'mo_enemy2') {
        const fuseTime = p.fuseTime ?? 1.75;
        const armed = Boolean(p._fuseActive);
        const fuseElapsed = p._fuseElapsed || 0;
        let touched = false;
        for (const [, pl] of this.players) {
          if (pl.hp <= 0) continue;
          const pos = pl.body.getPosition();
          if (Math.hypot(pos.x - e.x, pos.y - e.y) <= e.radius + PLAYER_RADIUS + 6) {
            touched = true;
            break;
          }
        }
        if (touched || (armed && fuseElapsed >= fuseTime)) {
          for (let k = 0; k < 8; k++) {
            this.spawnEnemyBullet(e.x, e.y, (Math.PI * 2 * k) / 8, 145, 4.5, 0xfef08a, 4, { spriteType: 'MObullet3png', ttl: 0.36 });
          }
          for (const [, pl] of this.players) {
            if (pl.hp <= 0) continue;
            const pos = pl.body.getPosition();
            if (Math.hypot(pos.x - e.x, pos.y - e.y) <= 58) {
              this.applyDamageToPlayer(pl, 16);
            }
          }
          this.enemies.splice(i, 1);
          continue;
        }
      }

      if (!e.isMiniboss && e.type !== 'mo_enemy2' && (e.x < -70 || (e.spawnTime > 6.0 && e.x > WORLD_WIDTH + 220) || e.y < -90 || e.y > WORLD_HEIGHT + 90)) {
        this.enemies.splice(i, 1);
        continue;
      }

      e.shootTimer += dt;
      if (e.x < WORLD_WIDTH - 8 && e.x > 40 && e.shootTimer >= e.shootInterval && e.attackPattern !== 'none') {
        e.shootTimer = 0;
        const scale = Number(e.customParams?.statScale) > 0 ? Number(e.customParams.statScale) : 1.0;
        this.activeEnemyStatScale = scale;
        try {
          this.fireEnemyPattern(e, target, dt);
        } finally {
          this.activeEnemyStatScale = 1.0;
        }
      }
    }
  }

  private fireEnemyPattern(e: SimEnemy, target: { x: number; y: number }, dt: number = DT): void {
    const aim = Math.atan2(target.y - e.y, target.x - e.x);
    e.angle = aim;
    const mx = e.x + Math.cos(aim) * 16;
    const my = e.y + Math.sin(aim) * 16;
    const col = e.bulletColor || 0xff2b5b;
    const t = e.spawnTime;
    const cp = e.customParams || {};

    switch (e.attackPattern) {
      case 'w1_first_normal':
        this.spawnEnemyBullet(mx, my, aim, 200, 5, 0xef4444, 5, { spriteType: '1EnemyBulletpng' });
        break;
      case 'w1_second_homing':
        this.spawnEnemyBullet(mx, my, aim, 185, 5, 0xfacc15, 5, { spriteType: '2EnemyBulletpng', homeRate: 0.72, homeTime: 1.35 });
        break;
      case 'w1_third_slow':
        for (const off of [-0.22, 0, 0.22]) this.spawnEnemyBullet(mx, my, aim + off, 122, 6, 0x3b82f6, 6, { spriteType: '3EnemyBulletpng' });
        break;
      case 'fb_mini2_combo':
        cp._shotIdx = (cp._shotIdx || 0) + 1;
        if (cp._shotIdx % 2 === 0) {
          for (const off of [-0.42, -0.21, 0, 0.21, 0.42]) this.spawnEnemyBullet(e.x + Math.cos(aim) * 20, e.y + Math.sin(aim) * 20, aim + off, 132, 6, 0x3b82f6, 5, { spriteType: '3EnemyBulletpng' });
        } else {
          for (let k = 0; k < 10; k++) this.spawnEnemyBullet(e.x, e.y, t * 0.9 + (Math.PI * 2 * k) / 10, 142, 5, 0xef4444, 5, { spriteType: '1EnemyBulletpng' });
        }
        break;
      case 'fb_mini1_combo':
        cp._shotIdx = (cp._shotIdx || 0) + 1;
        if (cp._shotIdx % 3 === 0) {
          for (let k = 0; k < 16; k++) this.spawnEnemyBullet(e.x, e.y, (Math.PI * 2 * k) / 16, 162, 5, 0xfacc15, 5, { spriteType: '2EnemyBulletpng', homeRate: 2.15, homeTime: 1.45 });
        } else {
          for (const off of [-0.28, -0.1, 0.1, 0.28]) {
            const hm = Math.abs(off) > 0.2;
            this.spawnEnemyBullet(e.x + Math.cos(aim) * 20, e.y + Math.sin(aim) * 20, aim + off, 235, 5, hm ? 0xfacc15 : 0xef4444, 5, { spriteType: hm ? '2EnemyBulletpng' : '1EnemyBulletpng', homeRate: hm ? 1.15 : 0, homeTime: hm ? 1.2 : 0 });
          }
        }
        break;
      case 'w2_gfg1_fast':
        this.spawnEnemyBullet(mx, my, aim, 285, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
        break;
      case 'w2_gfg2_sniper022':
        if (!cp.burstLeft || cp.burstLeft <= 0) {
          if ((cp.burstCooldown || 0) > 0) { cp.burstCooldown -= Math.max(dt, e.shootInterval); break; }
          cp.burstLeft = 8;
          cp.burstAim = aim;
        }
        {
          const bAim = cp.burstAim ?? aim;
          e.angle = bAim;
          this.spawnEnemyBullet(e.x + Math.cos(bAim) * 20, e.y + Math.sin(bAim) * 20, bAim, 405, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet2png' });
        }
        cp.burstLeft -= 1;
        if (cp.burstLeft <= 0) cp.burstCooldown = 1.45;
        break;
      case 'w2_gfg3_linear_accel':
        this.spawnEnemyBullet(mx, my, aim, 55, 5.5, 0xf97316, 5, {
          spriteType: 'GFGbullet3png',
          expAccel: 1.35,
          maxSpeed: 420,
          homeRate: 0.72,
          homeTime: 1.35,
          ttl: 4.8,
        });
        break;
      case 'gfg_mini1_shotgun':
        for (let k = 0; k < 10; k++) {
          this.spawnEnemyBullet(e.x + Math.cos(aim) * 24, e.y + Math.sin(aim) * 24, aim + ((k / 9) - 0.5) * 0.62 + (Math.random() - 0.5) * 0.08, 265 + Math.random() * 110, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet4png' });
        }
        break;
      case 'gfg_mini2_burst':
        cp.cycleT = (cp.cycleT || 0) + Math.max(dt, e.shootInterval);
        if (cp.cycleT % 2.65 > 1.5) break;
        this.spawnEnemyBullet(e.x + Math.cos(aim) * 24, e.y + Math.sin(aim) * 24, aim + Math.sin(t * 7.5) * 0.22, 330, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet5png' });
        break;
      case 'w3_mo1_laser':
        if (!cp.laserBurstLeft || cp.laserBurstLeft <= 0) {
          if ((cp.laserCooldown || 0) > 0) { cp.laserCooldown -= Math.max(dt, e.shootInterval); break; }
          cp.laserBurstLeft = 3;
          cp.laserAim = aim;
        }
        {
          const lAim = cp.laserAim ?? aim;
          e.angle = lAim;
          this.spawnEnemyBullet(e.x + Math.cos(lAim) * 18, e.y + Math.sin(lAim) * 18, lAim, 345, 5, 0xef4444, 5, { spriteType: 'MObullet1png' });
        }
        cp.laserBurstLeft -= 1;
        if (cp.laserBurstLeft <= 0) cp.laserCooldown = 1.35;
        break;
      case 'w3_mo3_sparks':
        for (let k = 0; k < 2; k++) {
          this.spawnEnemyBullet(mx, my, aim + (Math.random() - 0.5) * 2.1, 135 + Math.random() * 105, 5, 0xfef08a, 4, { spriteType: 'MObullet3png', ttl: 0.92 });
        }
        break;
      case 'mo_mini1_rocks': {
        cp._shotIdx = (cp._shotIdx || 0) + 1;
        const offsets = cp._shotIdx % 2 === 0 ? [-46, 46] : [0];
        for (const oy of offsets) {
          const sx = e.x - 42;
          const sy = Math.max(40, Math.min(WORLD_HEIGHT - 40, e.y + oy));
          const a = Math.atan2(target.y - sy, target.x - sx);
          this.spawnEnemyBullet(sx, sy, a, 32, 12.5, 0x9ca3af, 7, { spriteType: 'MObullet4png', accel: 290, maxSpeed: 295, splitOnImpact: true, splitCount: 6, ttl: 6.0 });
        }
        break;
      }
      case 'mo_mini2_rocks':
        for (let k = 0; k < 2; k++) {
          const sx = e.x - 36 - Math.random() * 32;
          const sy = Math.max(40, Math.min(WORLD_HEIGHT - 40, e.y + (Math.random() - 0.5) * 150));
          this.spawnEnemyBullet(sx, sy, Math.PI + (Math.random() - 0.5) * 1.45, 45, 12.5, 0x9ca3af, 7, { spriteType: 'MObullet4png', accel: 240, maxSpeed: 280, splitOnImpact: true, splitCount: 6, ttl: 6.0 });
        }
        break;
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

  private spawnEnemyBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    radius: number,
    color: number,
    damage: number = 5,
    opts?: BulletSpawnOpts & { ttl?: number }
  ): void {
    const scale = this.activeEnemyStatScale || 1.0;
    const finalSpeed = speed * scale;
    const finalDamage = Math.max(1, Math.round(damage * scale));
    this.bullets.push({
      id: this.nextBulletId++,
      ownerId: 'boss',
      x,
      y,
      vx: Math.cos(angle) * finalSpeed,
      vy: Math.sin(angle) * finalSpeed,
      radius,
      ttl: opts?.ttl ?? 4.4,
      type: 'normal',
      damage: finalDamage,
      color,
      spriteType: opts?.spriteType,
      accel: opts?.accel ? opts.accel * scale : opts?.accel,
      expAccel: opts?.expAccel,
      maxSpeed: opts?.maxSpeed ? opts.maxSpeed * scale : opts?.maxSpeed,
      homeRate: opts?.homeRate,
      homeTime: opts?.homeTime,
      splitOnImpact: opts?.splitOnImpact,
      splitCount: opts?.splitCount,
      age: 0,
      delay: Math.max(0, Number(opts?.delay) || 0),
      turnAfter: Math.max(0, Number(opts?.turnAfter) || 0),
      turnAngle: Number(opts?.turnAngle) || 0,
      turnAbsAngle: opts?.turnAbsAngle !== undefined && opts?.turnAbsAngle !== null ? Number(opts.turnAbsAngle) : null,
      turnSpeedMult: Number(opts?.turnSpeedMult) || 1,
      turnColor: opts?.turnColor,
      turned: false,
      holdTag: opts?.holdTag ?? null,
      angularVel: Number(opts?.angularVel) || 0,
      freezeAfter: Math.max(0, Number(opts?.freezeAfter) || 0),
      freezeDur: Math.max(0, Number(opts?.freezeDur) || 0),
      snapToPlayer: Boolean(opts?.snapToPlayer),
      snapOffset: Number(opts?.snapOffset) || 0,
      snapSpeed: Number(opts?.snapSpeed) || 0,
      freezePhase: 0,
      freezeTimer: 0,
    });
  }

  private updateBoss(dt: number): void {
    if (!this.boss.isActive || this.boss.isDefeated) return;

    this.boss.animTimer += dt;

    if (this.boss.isRefilling) {
      this.boss.refillTimer -= dt;
      this.boss.hp = Math.min(this.boss.maxHp, this.boss.hp + this.boss.maxHp * dt * 1.4);
      if (this.boss.bossId === 'mo') {
        this.boss.x += (400 - this.boss.x) * Math.min(1, dt * 6);
        this.boss.y += (300 - this.boss.y) * Math.min(1, dt * 6);
        this.boss.angle = Math.PI;
      }
      if (this.boss.refillTimer <= 0) {
        this.boss.isRefilling = false;
        this.boss.isInvulnerable = false;
        this.boss.hp = this.boss.maxHp;
      }
      return;
    }

    const hasMega = this.lasers.some((l) => l.ownerId === 'boss' && l.isMegaBeam);
    if (this.boss.isLockedForBeam && !hasMega) {
      this.boss.isLockedForBeam = false;
    }

    if (this.struggle.active || this.struggle.isAligning) return;

    const target = this.getAveragePlayerPos();

    // Custom Mecanical Ophanim (M.O) state machine
    if (this.boss.bossId === 'mo' && !this.boss.isLockedForBeam) {
      this.updateWorkerMoBoss(dt, target);
      return;
    }

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
      this.boss.angle = Math.atan2(target.y - this.boss.y, target.x - this.boss.x);
    } else {
      return;
    }

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
          statScale: this.boss.statScale || 1.0,
          phase: this.boss.phase,
        },
        (bx, by, angle, speed, radius, color, damage, opts) => {
          this.spawnEnemyBullet(bx, by, angle, speed, radius, color, damage, opts);
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

  private spawnWorkerMoKamikaze(phase: number, maxActive: number, statScale: number = 1.0, target?: { x: number; y: number }): void {
    const activeCount = this.enemies.filter((e) => e.type === 'mo_enemy2').length;
    if (activeCount >= maxActive) return;

    const edge = Math.floor(Math.random() * 3);
    const pad = 42;
    const minFrontX = Math.min(WORLD_WIDTH - 40, Math.max(150, Math.round((target?.x ?? 120) + 95)));
    let startX: number;
    let startY: number;
    if (edge === 0) {
      startX = WORLD_WIDTH + pad;
      startY = Math.round(55 + Math.random() * (WORLD_HEIGHT - 110));
    } else if (edge === 1) {
      startX = Math.round(minFrontX + Math.random() * Math.max(20, WORLD_WIDTH - 20 - minFrontX));
      startY = -pad;
    } else {
      startX = Math.round(minFrontX + Math.random() * Math.max(20, WORLD_WIDTH - 20 - minFrontX));
      startY = WORLD_HEIGHT + pad;
    }

    const hp = Math.max(10, Math.round(20 * statScale * this.getSquadHpScale()));
    this.enemies.push({
      id: `en_${this.nextEntityId++}`,
      type: 'mo_enemy2',
      x: startX,
      y: startY,
      startX,
      startY,
      speed: Math.round((176 + phase * 8) * statScale),
      hp,
      maxHp: hp,
      radius: 18,
      trajectory: 'kamikaze_homing',
      attackPattern: 'none',
      shootInterval: 99,
      shootTimer: 0,
      spawnTime: 0,
      bulletColor: 0xfef08a,
      sprite: '/assets/sprites/MOenemy2png.png',
      angle: Math.PI,
      customParams: { fuseTime: 1.85, triggerDist: 130, statScale },
    });
  }

  private updateWorkerMoBoss(dt: number, target: { x: number; y: number }): void {
    const emitter = {
      spawn: (
        x: number,
        y: number,
        angle: number,
        speed: number,
        radius: number,
        ttl: number,
        damage: number,
        color: number,
        opts?: Record<string, any> | null
      ) => {
        this.spawnEnemyBullet(x, y, angle, speed, radius, color, damage, {
          ...(opts || {}),
          ttl,
        });
      },
      spawnVelocity: (
        x: number,
        y: number,
        vx: number,
        vy: number,
        radius: number,
        ttl: number,
        damage: number,
        color: number,
        opts?: Record<string, any> | null
      ) => {
        const speed = Math.hypot(vx, vy);
        const angle = Math.atan2(vy, vx);
        this.spawnEnemyBullet(x, y, angle, speed, radius, color, damage, {
          ...(opts || {}),
          ttl,
        });
      },
      releaseHeld: (holdTag: number, staggerSec: number = 0.012) => {
        let idx = 0;
        for (let i = 0; i < this.bullets.length; i++) {
          const b = this.bullets[i];
          if (b.holdTag === holdTag) {
            b.holdTag = null;
            b.delay = idx * staggerSec;
            idx++;
          }
        }
      },
    };

    const prevScale = this.activeEnemyStatScale;
    this.activeEnemyStatScale = 1.0; // moBossEngine already scales by boss.statScale
    try {
      updateWorkerMechanicalOphanim(
        this.boss,
        dt,
        target,
        emitter,
        (sx, sy, radius, damage, hitSet) => {
          for (const [pid, pl] of this.players) {
            if (pl.hp <= 0 || hitSet.has(pid)) continue;
            const pos = pl.body.getPosition();
            if (Math.hypot(pos.x - sx, pos.y - sy) <= radius + 8) {
              hitSet.add(pid);
              this.applyDamageToPlayer(pl, damage);
            }
          }
        },
        (phase, maxActive, statScale) => {
          this.spawnWorkerMoKamikaze(phase, maxActive, statScale, target);
        }
      );
    } finally {
      this.activeEnemyStatScale = prevScale;
    }
  }

  private damageBoss(amount: number): void {
    if (!this.boss.isActive || this.boss.isDefeated || this.boss.isRefilling || this.boss.isInvulnerable) return;
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
      if (this.boss.bossId === 'mo' && this.boss.moState.mode !== 'intro') {
        resetMoCycleForPhase(this.boss.moState, this.boss.phase);
        this.boss.moDashLines = [];
      }
    } else {
      this.boss.isDefeated = true;
      this.boss.isActive = false;
      this.stageState = 'stage_clear';
      this.lasers = [];
      this.enemies = [];
      if (!this.customStageProfile && this.stageIndex < TOTAL_STAGES_PER_DIFFICULTY - 1) {
        this.autoAdvanceTimer = this.autoAdvanceDuration;
      }
    }
  }

  private updateBullets(dt: number): void {
    const targetPos = this.getAveragePlayerPos();
    const toSplit: SimBullet[] = [];

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.delay && b.delay > 0) {
        b.delay = Math.max(0, b.delay - dt);
        continue;
      }

      // Sakuya/Byakuren Freeze -> Red Lock-On -> Snap directly at player's live position
      if (b.freezeAfter && b.freezeAfter > 0 && (b.freezePhase || 0) < 2) {
        if ((b.freezePhase || 0) === 0 && (b.age || 0) >= b.freezeAfter) {
          b.freezePhase = 1;
          b.freezeTimer = b.freezeDur || 0.30;
          if (b.turnColor !== undefined) b.color = b.turnColor;
          continue;
        }
        if (b.freezePhase === 1) {
          b.freezeTimer = (b.freezeTimer || 0) - dt;
          if (b.freezeTimer <= 0) {
            b.freezePhase = 2;
            b.turned = true;
            const baseSpd = b.snapSpeed && b.snapSpeed > 0
              ? b.snapSpeed
              : Math.hypot(b.vx, b.vy) * (b.turnSpeedMult || 1.55);
            const aim = b.snapToPlayer
              ? Math.atan2(targetPos.y - b.y, targetPos.x - b.x) + (b.snapOffset || 0)
              : b.turnAbsAngle !== null && b.turnAbsAngle !== undefined
                ? b.turnAbsAngle
                : Math.atan2(b.vy, b.vx) + (b.turnAngle || 0);
            b.vx = Math.cos(aim) * baseSpd;
            b.vy = Math.sin(aim) * baseSpd;
          } else {
            continue;
          }
        }
      }

      b.age = (b.age || 0) + dt;

      if (!b.turned && (!b.freezeAfter || b.freezeAfter <= 0) && b.turnAfter && b.turnAfter > 0 && b.age >= b.turnAfter) {
        b.turned = true;
        const spd = Math.hypot(b.vx, b.vy) * (b.turnSpeedMult || 1);
        const nextAngle = b.turnAbsAngle !== null && b.turnAbsAngle !== undefined
          ? b.turnAbsAngle
          : Math.atan2(b.vy, b.vx) + (b.turnAngle || 0);
        b.vx = Math.cos(nextAngle) * spd;
        b.vy = Math.sin(nextAngle) * spd;
        if (b.turnColor !== undefined) {
          b.color = b.turnColor;
        }
      }

      if (b.angularVel && b.angularVel !== 0) {
        const spd = Math.hypot(b.vx, b.vy);
        if (spd > 0.001) {
          const nextA = Math.atan2(b.vy, b.vx) + b.angularVel * dt;
          b.vx = Math.cos(nextA) * spd;
          b.vy = Math.sin(nextA) * spd;
        }
      }

      if (b.expAccel && b.expAccel !== 0) {
        const spd = Math.hypot(b.vx, b.vy);
        if (spd > 0.001) {
          const nextSpd = b.maxSpeed
            ? Math.min(b.maxSpeed, spd * Math.exp(b.expAccel * dt))
            : spd * Math.exp(b.expAccel * dt);
          const factor = nextSpd / spd;
          b.vx *= factor;
          b.vy *= factor;
        }
      } else if (b.accel && b.accel !== 0) {
        const spd = Math.hypot(b.vx, b.vy);
        if (spd > 0.001) {
          const nextSpd = b.maxSpeed ? Math.min(b.maxSpeed, spd + b.accel * dt) : spd + b.accel * dt;
          const factor = nextSpd / spd;
          b.vx *= factor;
          b.vy *= factor;
        }
      }

      if (b.homeRate && b.homeTime && b.homeTime > 0) {
        b.homeTime -= dt;
        const spd = Math.hypot(b.vx, b.vy);
        if (spd > 0.001) {
          const curA = Math.atan2(b.vy, b.vx);
          const aimA = Math.atan2(targetPos.y - b.y, targetPos.x - b.x);
          const diff = Math.atan2(Math.sin(aimA - curA), Math.cos(aimA - curA));
          const step = Math.max(-b.homeRate * dt, Math.min(b.homeRate * dt, diff));
          b.vx = Math.cos(curA + step) * spd;
          b.vy = Math.sin(curA + step) * spd;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ttl -= dt;

      const hitEdge =
        b.splitOnImpact &&
        (b.age || 0) > 0.14 &&
        (b.x <= 6 || b.y <= 6 || b.y >= WORLD_HEIGHT - 6 || (b.x >= WORLD_WIDTH - 6 && b.vx > 0));

      if (hitEdge) {
        toSplit.push(b);
        this.bullets.splice(i, 1);
        continue;
      }

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
            if (b.splitOnImpact) toSplit.push(b);
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
              for (const [, p] of this.players) {
                if (p.hp > 0) p.sp = Math.min(p.stats.spMax, p.sp + 65);
              }
              const wasMiniboss = Boolean(e.isMiniboss);
              this.enemies.splice(j, 1);
              if (wasMiniboss) this.handleMinibossDefeated();
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
            this.bullets.splice(i, 1);
            this.damageBoss(b.damage * 0.35);
            if (!this.boss.isActive || this.boss.isDefeated || this.boss.isRefilling) {
              break;
            }
          }
        }
      }
    }

    for (const b of toSplit) {
      const count = b.splitCount || 6;
      const sx = Math.max(12, Math.min(WORLD_WIDTH - 12, b.x));
      const sy = Math.max(12, Math.min(WORLD_HEIGHT - 12, b.y));
      const baseRot = Math.atan2(b.vy, b.vx);
      for (let k = 0; k < count; k++) {
        this.spawnEnemyBullet(sx, sy, baseRot + (Math.PI * 2 * k) / count, 165, 4.5, 0x9ca3af, 4, { spriteType: b.spriteType || 'MObullet4png', ttl: 3.4 });
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
              for (const [, p] of this.players) {
                if (p.hp > 0) p.sp = Math.min(p.stats.spMax, p.sp + 65);
              }
              const wasMb = Boolean(e.isMiniboss);
              this.enemies.splice(eIdx, 1);
              if (wasMb) this.handleMinibossDefeated();
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
      this.struggle.balance = Math.max(0, Math.min(100, this.struggle.balance - bossPush * dt));

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
    if (this.devGodMode) {
      this.devHitsTaken++;
      return;
    }
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
        lastProcessedSeq: p.lastProcessedSeq,
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
      spriteType: b.spriteType,
      angle: b.spriteType ? Number(Math.atan2(b.vy, b.vx).toFixed(2)) : undefined,
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
      angle: Number((e.angle ?? Math.PI).toFixed(3)),
      isMiniboss: e.isMiniboss,
      sprite: e.sprite,
      minibossName: e.minibossName,
      fuseProgress: e.fuseProgress,
    }));

    const activeMb = !this.boss.isActive && !this.boss.isDefeated ? this.enemies.find((e) => e.isMiniboss) : undefined;
    const boss: ServerBoss = activeMb
      ? {
          x: activeMb.x,
          y: activeMb.y,
          hp: activeMb.hp,
          maxHp: activeMb.maxHp,
          phase: 1,
          remainingStocks: 0,
          spellcardName: activeMb.minibossName || 'MINIBOSS',
          isSpellCard: false,
          isActive: false,
          renderHudOnly: true,
          isMiniboss: true,
          bossId: activeMb.type,
          sprite: activeMb.sprite,
          angle: Number((activeMb.angle ?? Math.PI).toFixed(3)),
          isDefeated: false,
          isRefilling: false,
          isLockedForBeam: false,
        }
      : {
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
          bossId: this.boss.bossId,
          fullBossName: this.boss.fullBossName,
          sprite: this.boss.sprite,
          angle: Number((this.boss.angle ?? Math.PI).toFixed(3)),
          moIntroActive: this.boss.moIntroActive,
          moIntroProgress: Number((this.boss.moIntroProgress || 0).toFixed(3)),
          moDashState: this.boss.moDashState,
          moDashLines: this.boss.moDashLines,
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

    const bossPhases = this.getActiveBossPhases();
    const devTelemetry = {
      godMode: this.devGodMode,
      infiniteSp: this.devInfiniteSp,
      paused: this.devPaused,
      botPlay: this.devBotPlay,
      timeScale: this.devTimeScale,
      hitsTaken: this.devHitsTaken,
      bulletCount: bullets.length,
      enemyCount: enemies.length,
      laserCount: lasers.length,
      bossPhaseCount: bossPhases.length,
      bossId: boss.bossId || 'first_boss',
      bossName: boss.fullBossName || boss.bossId || 'Boss',
      bossHp: Math.round(boss.hp || 0),
      bossMaxHp: Math.round(boss.maxHp || 1),
      bossPhase: boss.phase || 1,
      bossActive: Boolean(boss.isActive && !boss.isDefeated),
      bossSpellcard: boss.spellcardName || '',
      difficulty: this.difficulty,
      world: meta.world,
      stage: meta.stage,
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
      boss,
      campaign,
      struggle: { ...this.struggle },
      devTelemetry,
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
        Boolean(payload?.isFocus),
        typeof payload?.seq === 'number' ? payload.seq : undefined
      );
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
    case 'DEV_JUMP_LEVEL':
      sim.devJumpLevel(
        payload?.difficulty || 'normal',
        payload?.world ?? 1,
        payload?.stage ?? 1,
        Boolean(payload?.autoSpawnBoss)
      );
      break;
    case 'DEV_JUMP_BOSS_PHASE':
      sim.devJumpBossPhase(payload?.phase ?? 1);
      break;
    case 'DEV_DAMAGE_BOSS':
      sim.devDamageBoss(payload?.mode || 'percent', payload?.value ?? 25);
      break;
    case 'DEV_CLEAR_BULLETS':
      sim.devClearBullets();
      break;
    case 'DEV_SET_FLAGS':
      sim.devSetFlags(payload || {});
      break;
    case 'DEV_STEP_FRAME':
      sim.devStepFrame(payload?.frames ?? 1);
      break;
    case 'DEV_RESET_HITS':
      sim.devResetHits();
      break;
    case 'DEV_HEAL_PLAYER':
      sim.devHealPlayer();
      break;
    case 'STOP':
      sim.stop();
      break;
  }
};

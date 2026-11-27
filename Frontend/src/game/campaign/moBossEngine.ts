/**
 * Reworked Boss 3-3: M.O. (Mechanical Ophanim) — Konngara (Touhou 1) Right-Triangle Edition.
 * Mirrored 1:1 with Backend/src/game/campaign/moBossEngine.js for local sandbox/Boss Dev Lab.
 */

export const MO_HOME_X = 648;
export const MO_HOME_Y = 300;
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;

export interface MoDashLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  progress: number;
  active: boolean;
  completed?: boolean;
  isReturn?: boolean;
}

export interface MoBossRuntimeState {
  mode: 'intro' | 'triangle' | 'dash_telegraph' | 'dash_active' | 'resting';
  timer: number;
  introDuration: number;
  cycleIndex: number;
  flipY: 1 | -1;
  strokeStage: number;
  strokeTimer: number;
  railEmitAccum: number;
  railShotsLeft: number;
  twistShotsLeft: number;
  twistEmitAccum: number;
  corridorAngle: number;
  twistAngle: number;
  gapY: number;
  upperAnchor: { x: number; y: number; vx: number; vy: number } | null;
  lowerAnchor: { x: number; y: number; vx: number; vy: number } | null;
  twistUpperPivot: { x: number; y: number } | null;
  twistLowerPivot: { x: number; y: number } | null;
  triA: { x: number; y: number };
  triB: { x: number; y: number };
  triC: { x: number; y: number };
  dashChain: Array<{ x1: number; y1: number; x2: number; y2: number; isReturn?: boolean }>;
  segIndex: number;
  dashHitPlayers: Set<string>;
  sparkAccum: number;
  restDuration: number;
  restShotAccum: number;
  summonTimer: number;
  lastPhaseSeen: number;
}

export interface MoBossAdapter {
  x: number;
  y: number;
  angle: number;
  phase: number;
  statScale: number;
  animTimer: number;
  isInvulnerable: boolean;
  moIntroActive: boolean;
  moIntroProgress: number;
  moDashState: string;
  moDashLines: MoDashLine[];
  moState: MoBossRuntimeState;
}

export interface MoBulletEmitter {
  spawn(
    x: number,
    y: number,
    angle: number,
    speed: number,
    radius: number,
    ttl: number,
    damage: number,
    color: number,
    opts?: Record<string, any> | null
  ): void;
  spawnVelocity(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    ttl: number,
    damage: number,
    color: number,
    opts?: Record<string, any> | null
  ): void;
}

export const MO_PHASE_DEFS = [
  {
    name: 'Fase 1 "Cateto Axial"',
    pattern: 'mo_konngara_p1',
    shootInterval: 0.5,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Sello Konngara "Corredor del Triángulo Rectángulo"',
    pattern: 'mo_konngara_p2',
    shootInterval: 0.45,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Fase 3 "Sierra del Triángulo"',
    pattern: 'mo_konngara_p3',
    shootInterval: 0.4,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Protocolo Serafín "Doble Corredor Inverso"',
    pattern: 'mo_konngara_p4',
    shootInterval: 0.35,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 9.0,
  },
  {
    name: 'Protocolo Final "MECHANICAL OPHANIM · TRIÁNGULO ETERNO"',
    pattern: 'mo_konngara_p5',
    shootInterval: 0.3,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 8.0,
  },
];

export function createInitialMoState(introDuration = 3.8): MoBossRuntimeState {
  return {
    mode: 'intro',
    timer: 0,
    introDuration: introDuration || 3.8,
    cycleIndex: 0,
    flipY: 1,
    strokeStage: 0,
    strokeTimer: 0,
    railEmitAccum: 0,
    railShotsLeft: 0,
    twistShotsLeft: 0,
    twistEmitAccum: 0,
    corridorAngle: Math.PI + 0.4,
    twistAngle: Math.PI - 0.46,
    gapY: MO_HOME_Y,
    upperAnchor: null,
    lowerAnchor: null,
    twistUpperPivot: null,
    twistLowerPivot: null,
    triA: { x: MO_HOME_X - 42, y: MO_HOME_Y - 78 },
    triB: { x: MO_HOME_X - 42, y: MO_HOME_Y + 78 },
    triC: { x: MO_HOME_X - 188, y: MO_HOME_Y + 78 },
    dashChain: [],
    segIndex: 0,
    dashHitPlayers: new Set<string>(),
    sparkAccum: 0,
    restDuration: 1.6,
    restShotAccum: 0,
    summonTimer: 3.0,
    lastPhaseSeen: 1,
  };
}

export function resetMoCycleForPhase(state: MoBossRuntimeState, phase: number): void {
  state.mode = phase === 3 ? 'dash_telegraph' : 'triangle';
  state.timer = 0;
  state.strokeStage = 0;
  state.strokeTimer = 0;
  state.railEmitAccum = 0;
  state.railShotsLeft = 0;
  state.twistShotsLeft = 0;
  state.twistEmitAccum = 0;
  state.upperAnchor = null;
  state.lowerAnchor = null;
  state.twistUpperPivot = null;
  state.twistLowerPivot = null;
  state.dashChain = [];
  state.segIndex = 0;
  state.dashHitPlayers = new Set<string>();
  state.sparkAccum = 0;
  state.restShotAccum = 0;
  state.lastPhaseSeen = phase;
}

function computeRightTriangleVertices(bx: number, by: number, flipY: 1 | -1, scale = 1.0) {
  const halfH = 74 * scale;
  const legW = 148 * scale;
  const ax = Math.max(360, bx - 44);
  const ay = Math.max(46, Math.min(WORLD_HEIGHT - 46, by - flipY * halfH));
  const byCorner = Math.max(46, Math.min(WORLD_HEIGHT - 46, by + flipY * halfH));
  const cx = Math.max(180, ax - legW);
  return {
    triA: { x: Math.round(ax), y: Math.round(ay) },
    triB: { x: Math.round(ax), y: Math.round(byCorner) },
    triC: { x: Math.round(cx), y: Math.round(byCorner) },
  };
}

function buildPhysicalRightTriangleDash(flipY: 1 | -1, playerPos?: { x: number; y: number } | null) {
  const rightX = 650;
  const leftX = Math.max(210, Math.min(320, Math.round((playerPos?.x ?? 200) + 85)));
  const topY = 118;
  const botY = WORLD_HEIGHT - 118;
  const A = { x: rightX, y: flipY > 0 ? topY : botY };
  const B = { x: rightX, y: flipY > 0 ? botY : topY };
  const C = { x: leftX, y: B.y };
  return [
    { x1: A.x, y1: A.y, x2: B.x, y2: B.y, isReturn: false },
    { x1: B.x, y1: B.y, x2: C.x, y2: C.y, isReturn: false },
    { x1: C.x, y1: C.y, x2: A.x, y2: A.y, isReturn: false },
    { x1: A.x, y1: A.y, x2: MO_HOME_X, y2: MO_HOME_Y, isReturn: true },
  ];
}

function fireStroke1SplitWall(
  boss: MoBossAdapter,
  state: MoBossRuntimeState,
  playerPos: { x: number; y: number } | null,
  emitter: MoBulletEmitter,
  statScale: number,
  phase: number
): void {
  const dmg = Number((4.5 * statScale).toFixed(1));
  const rawPlayerY = playerPos?.y ?? MO_HOME_Y;
  const offset = state.flipY * (phase >= 4 ? 42 : 28);
  const gapY = Math.max(175, Math.min(WORLD_HEIGHT - 175, rawPlayerY + offset));
  state.gapY = gapY;

  const spawnX = Math.max(540, boss.x - 32);
  const initialHalfGap = phase >= 4 ? 32 : 38;
  const bulletsPerSide = phase >= 4 ? 9 : 7;
  const spacing = 24;
  const wallSpeedX = -(148 + phase * 8) * statScale;
  const gapExpandVy = (34 + phase * 3) * statScale;

  state.upperAnchor = { x: spawnX, y: gapY - initialHalfGap, vx: wallSpeedX, vy: -gapExpandVy };
  state.lowerAnchor = { x: spawnX, y: gapY + initialHalfGap, vx: wallSpeedX, vy: gapExpandVy };

  for (let k = 0; k < bulletsPerSide; k++) {
    const isEdge = k === 0;
    const uy = gapY - initialHalfGap - k * spacing;
    const ly = gapY + initialHalfGap + k * spacing;
    const radius = isEdge ? 7.2 : 5.2;
    const color = isEdge ? 0xfde047 : 0xfef9c3;

    if (uy >= 16 && uy <= WORLD_HEIGHT - 16) {
      emitter.spawnVelocity(spawnX, uy, wallSpeedX, -gapExpandVy, radius, 5.5, dmg, color);
    }
    if (ly >= 16 && ly <= WORLD_HEIGHT - 16) {
      emitter.spawnVelocity(spawnX, ly, wallSpeedX, gapExpandVy, radius, 5.5, dmg, color);
    }
  }

  if (phase >= 4 && playerPos) {
    const aim = Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x);
    for (const off of [-0.36, 0.36]) {
      emitter.spawn(boss.x - 20, boss.y, aim + off, 225 * statScale, 4.8, 4.0, dmg, 0xef4444, {
        spriteType: 'MObullet1png',
      });
    }
  }
}

function emitStroke2CorridorBead(
  state: MoBossRuntimeState,
  emitter: MoBulletEmitter,
  statScale: number,
  phase: number,
  isFirstBeat: boolean
): void {
  if (!state.upperAnchor || !state.lowerAnchor) return;
  const dmg = Number((4.5 * statScale).toFixed(1));
  const railSpeed = (242 + phase * 10) * statScale;
  const angle = state.corridorAngle;

  for (const anchor of [state.upperAnchor, state.lowerAnchor]) {
    if (anchor.x < 40 || anchor.x > WORLD_WIDTH - 20 || anchor.y < 14 || anchor.y > WORLD_HEIGHT - 14) {
      continue;
    }
    emitter.spawn(
      anchor.x,
      anchor.y,
      angle,
      railSpeed,
      isFirstBeat ? 7.5 : 5.0,
      4.2,
      dmg,
      isFirstBeat ? 0x38bdf8 : 0xe0f2fe
    );
  }
}

function emitStroke3TwistBead(
  state: MoBossRuntimeState,
  emitter: MoBulletEmitter,
  statScale: number,
  phase: number,
  isFirstBeat: boolean
): void {
  if (!state.twistUpperPivot || !state.twistLowerPivot) return;
  const dmg = Number((4.8 * statScale).toFixed(1));
  const twistSpeed = (268 + phase * 12) * statScale;
  const angle = state.twistAngle;

  for (const pivot of [state.twistUpperPivot, state.twistLowerPivot]) {
    if (pivot.x < 30 || pivot.x > WORLD_WIDTH - 20 || pivot.y < 14 || pivot.y > WORLD_HEIGHT - 14) {
      continue;
    }
    emitter.spawn(
      pivot.x,
      pivot.y,
      angle,
      twistSpeed,
      isFirstBeat ? 7.8 : 5.0,
      4.0,
      dmg,
      isFirstBeat ? 0xff2b5b : 0xfde047,
      isFirstBeat ? null : { spriteType: 'MObullet3png' }
    );
  }
}

function fireHypotenuseFlourish(
  boss: MoBossAdapter,
  state: MoBossRuntimeState,
  playerPos: { x: number; y: number } | null,
  emitter: MoBulletEmitter,
  statScale: number,
  phase: number
): void {
  const dmg = Number((5.0 * statScale).toFixed(1));
  const { triA, triC } = state;
  const hypoAngle = Math.atan2(triA.y - triC.y, triA.x - triC.x);

  if (phase === 1) {
    for (let k = 0; k < 5; k++) {
      const u = (k + 0.5) / 5;
      const sx = triC.x + (triA.x - triC.x) * u;
      const sy = triC.y + (triA.y - triC.y) * u;
      const aim = playerPos ? Math.atan2(playerPos.y - sy, playerPos.x - sx) : Math.PI;
      emitter.spawn(sx, sy, aim, 210 * statScale, 4.6, 4.2, dmg, 0xfef08a, {
        spriteType: 'MObullet3png',
      });
    }
    return;
  }

  if (state.twistUpperPivot && state.twistLowerPivot) {
    const midX = (state.twistUpperPivot.x + state.twistLowerPivot.x) * 0.5;
    const midY = (state.twistUpperPivot.y + state.twistLowerPivot.y) * 0.5;
    emitter.spawn(midX + 26, midY, state.corridorAngle, 205 * statScale, 5.0, 3.5, dmg, 0xef4444, {
      spriteType: 'MObullet1png',
    });
  }

  if (phase === 4) {
    const normal = hypoAngle + (state.flipY > 0 ? Math.PI / 2 : -Math.PI / 2);
    const dirToLeft = Math.cos(normal) <= 0 ? normal : normal + Math.PI;
    for (let k = 1; k <= 4; k++) {
      const u = k / 5;
      const sx = triC.x + (triA.x - triC.x) * u;
      const sy = triC.y + (triA.y - triC.y) * u;
      emitter.spawn(sx, sy, dirToLeft, 215 * statScale, 4.8, 4.2, dmg, 0xef4444, {
        spriteType: 'MObullet1png',
      });
    }
  }

  if (phase >= 5) {
    const ringCount = 12;
    const rot = boss.animTimer * 1.1;
    for (let k = 0; k < ringCount; k++) {
      const a = rot + (Math.PI * 2 * k) / ringCount;
      emitter.spawn(
        boss.x,
        boss.y,
        a,
        185 * statScale,
        4.8,
        4.2,
        dmg,
        k % 2 === 0 ? 0xef4444 : 0xfde047,
        { spriteType: k % 2 === 0 ? 'MObullet1png' : 'MObullet3png' }
      );
    }
    if (state.cycleIndex % 2 === 1 && playerPos) {
      const aim = Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x);
      emitter.spawn(
        boss.x - 24,
        boss.y,
        aim,
        175 * statScale,
        11.5,
        5.5,
        Number((7 * statScale).toFixed(1)),
        0x9ca3af,
        { spriteType: 'MObullet4png', splitOnImpact: true, splitCount: 6 }
      );
    }
  }
}

export function updateWorkerMechanicalOphanim(
  boss: MoBossAdapter,
  dt: number,
  playerPos: { x: number; y: number } | null,
  emitter: MoBulletEmitter,
  onContactDamage: (x: number, y: number, radius: number, damage: number, hitSet: Set<string>) => void,
  onSpawnKamikaze?: (phase: number, maxActive: number, statScale: number) => void
): void {
  const state = boss.moState;
  const phase = Math.max(1, Math.min(5, boss.phase || 1));
  const statScale = boss.statScale || 1.0;

  if (state.mode === 'intro') {
    state.timer += dt;
    boss.isInvulnerable = true;
    const dur = state.introDuration || 3.8;
    const progress = Math.min(1, state.timer / dur);
    boss.x = 760 + (MO_HOME_X - 760) * (1 - Math.pow(1 - progress, 2));
    boss.y = MO_HOME_Y;
    boss.angle = Math.PI;
    boss.moIntroActive = true;
    boss.moIntroProgress = progress;
    if (state.timer >= dur) {
      boss.isInvulnerable = false;
      boss.moIntroActive = false;
      boss.moIntroProgress = 1;
      boss.x = MO_HOME_X;
      boss.y = MO_HOME_Y;
      resetMoCycleForPhase(state, phase);
    }
    return;
  }

  boss.moIntroActive = false;
  boss.isInvulnerable = false;

  if (state.lastPhaseSeen !== phase) {
    resetMoCycleForPhase(state, phase);
  }

  const diffBonus = statScale >= 1.2 ? 2 : statScale >= 1.08 ? 1 : 0;
  const summonCount = phase >= 4 ? diffBonus : diffBonus >= 2 ? 1 : 0;
  if (onSpawnKamikaze && summonCount > 0) {
    state.summonTimer += dt;
    const summonInterval = Math.max(4.8, 7.2 - phase * 0.4);
    if (state.summonTimer >= summonInterval) {
      state.summonTimer = 0;
      const maxActive = Math.min(4, 1 + diffBonus);
      for (let k = 0; k < summonCount; k++) {
        onSpawnKamikaze(phase, maxActive, statScale);
      }
    }
  }

  // Phase 3 / periodic P5: Physical Right-Triangle Dash inside arena
  if (state.mode === 'dash_telegraph') {
    state.timer += dt;
    const duration = Math.max(0.75, 1.05 - phase * 0.04);
    if (state.dashChain.length === 0) {
      state.dashChain = buildPhysicalRightTriangleDash(state.flipY, playerPos);
    }
    const first = state.dashChain[0];
    boss.x += (first.x1 - boss.x) * Math.min(1, dt * 8);
    boss.y += (first.y1 - boss.y) * Math.min(1, dt * 8);
    boss.angle = Math.atan2(first.y2 - first.y1, first.x2 - first.x1);
    boss.moDashState = 'telegraph';

    const prog = Number(Math.min(1, state.timer / duration).toFixed(2));
    boss.moDashLines = state.dashChain.map((seg, idx) => ({
      x1: seg.x1,
      y1: seg.y1,
      x2: seg.x2,
      y2: seg.y2,
      progress: prog,
      active: idx === 0,
      completed: false,
      isReturn: Boolean(seg.isReturn),
    }));

    if (state.timer >= duration) {
      state.mode = 'dash_active';
      state.segIndex = 0;
      state.timer = 0;
      state.dashHitPlayers = new Set<string>();
      state.sparkAccum = 0;
    }
    return;
  }

  if (state.mode === 'dash_active') {
    const seg = state.dashChain[state.segIndex];
    if (!seg) {
      state.mode = 'resting';
      state.timer = 0;
      state.restDuration = phase >= 5 ? 1.0 : 1.7;
      state.restShotAccum = 0;
      boss.moDashLines = [];
      return;
    }

    const segLen = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) || 1;
    const speed = (seg.isReturn ? 950 : 980 + phase * 90) * statScale;
    const segDur = Math.max(0.24, Math.min(0.62, segLen / speed));
    const prevX = boss.x;
    const prevY = boss.y;

    state.timer += dt;
    const rawT = Math.min(1, state.timer / segDur);
    const ease = seg.isReturn
      ? 1 - Math.pow(1 - rawT, 3)
      : rawT < 0.5
        ? 2 * rawT * rawT
        : 1 - Math.pow(-2 * rawT + 2, 2) / 2;

    boss.x = seg.x1 + (seg.x2 - seg.x1) * ease;
    boss.y = seg.y1 + (seg.y2 - seg.y1) * ease;
    boss.angle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
    boss.moDashState = 'dashing';

    boss.moDashLines = state.dashChain
      .filter((_s, idx) => idx >= state.segIndex)
      .map((s, relIdx) => ({
        x1: s.x1,
        y1: s.y1,
        x2: s.x2,
        y2: s.y2,
        progress: relIdx === 0 ? Number(rawT.toFixed(2)) : 0,
        active: relIdx === 0,
        completed: false,
        isReturn: Boolean(s.isReturn),
      }));

    state.sparkAccum += dt;
    const wakeInterval = Math.max(0.055, 0.085 - phase * 0.005);
    if (!seg.isReturn && state.sparkAccum >= wakeInterval) {
      state.sparkAccum = 0;
      const perpSpeed = 128 * statScale;
      for (const sgn of [-1, 1]) {
        emitter.spawn(
          boss.x,
          boss.y,
          boss.angle + sgn * (Math.PI / 2),
          perpSpeed,
          4.4,
          4.2,
          Math.max(1, Math.round(4 * statScale)),
          0xfef08a,
          { spriteType: 'MObullet3png' }
        );
      }
    }

    if (!seg.isReturn || rawT < 0.7) {
      for (let s = 1; s <= 4; s++) {
        const st = s / 4;
        onContactDamage(
          prevX + (boss.x - prevX) * st,
          prevY + (boss.y - prevY) * st,
          34,
          14,
          state.dashHitPlayers
        );
      }
    }

    if (rawT >= 1) {
      boss.x = seg.x2;
      boss.y = seg.y2;
      state.segIndex += 1;
      state.timer = 0;
      state.dashHitPlayers = new Set<string>();
      state.sparkAccum = 0;
      if (state.segIndex >= state.dashChain.length) {
        state.mode = 'resting';
        state.restDuration = phase >= 5 ? 0.9 : 1.7;
        state.restShotAccum = 0;
        boss.moDashLines = [];
      }
    }
    return;
  }

  if (state.mode === 'resting') {
    state.timer += dt;
    boss.moDashState = 'resting';
    boss.moDashLines = [];

    const hoverY = MO_HOME_Y + Math.sin(state.timer * 2.2) * 55;
    boss.x += (MO_HOME_X - boss.x) * Math.min(1, dt * 5.0);
    boss.y += (hoverY - boss.y) * Math.min(1, dt * 5.0);
    if (playerPos) {
      boss.angle = Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x);
    }

    if (phase === 3) {
      state.restShotAccum += dt;
      if (state.restShotAccum >= 0.75) {
        state.restShotAccum = 0;
        const aim = playerPos ? Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x) : Math.PI;
        for (const off of [-0.24, 0.24]) {
          emitter.spawn(
            boss.x - 24,
            boss.y,
            aim + off,
            185 * statScale,
            11.0,
            5.5,
            Number((6.5 * statScale).toFixed(1)),
            0x9ca3af,
            { spriteType: 'MObullet4png', splitOnImpact: true, splitCount: 6 }
          );
        }
      }
    }

    if (state.timer >= (state.restDuration || 1.2)) {
      state.cycleIndex += 1;
      state.flipY = state.cycleIndex % 2 === 0 ? 1 : -1;
      state.timer = 0;
      if (phase === 3 || (phase === 5 && state.cycleIndex % 3 === 2)) {
        state.mode = 'dash_telegraph';
        state.dashChain = buildPhysicalRightTriangleDash(state.flipY, playerPos);
        state.segIndex = 0;
      } else {
        state.mode = 'triangle';
        state.strokeStage = 0;
        state.strokeTimer = 0;
        state.railShotsLeft = 0;
        state.twistShotsLeft = 0;
      }
    }
    return;
  }

  // Konngara Right-Triangle Corridor Cycle (`|` -> `_` -> `/`)
  const targetX = MO_HOME_X + Math.cos(boss.animTimer * 1.1) * 24;
  const targetY = MO_HOME_Y + Math.sin(boss.animTimer * 1.45) * 68;
  boss.x += (targetX - boss.x) * Math.min(1, dt * 3.8);
  boss.y += (targetY - boss.y) * Math.min(1, dt * 3.8);
  if (playerPos) {
    boss.angle = Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x);
  }

  if (state.upperAnchor) {
    state.upperAnchor.x += state.upperAnchor.vx * dt;
    state.upperAnchor.y += state.upperAnchor.vy * dt;
  }
  if (state.lowerAnchor) {
    state.lowerAnchor.x += state.lowerAnchor.vx * dt;
    state.lowerAnchor.y += state.lowerAnchor.vy * dt;
  }

  if (state.railShotsLeft > 0) {
    state.railEmitAccum += dt;
    const railStep = Math.max(0.036, 0.052 - phase * 0.002);
    while (state.railShotsLeft > 0 && state.railEmitAccum >= railStep) {
      state.railEmitAccum -= railStep;
      const isFirst = state.railShotsLeft === (phase >= 4 ? 10 : 8);
      emitStroke2CorridorBead(state, emitter, statScale, phase, isFirst);
      state.railShotsLeft -= 1;
    }
  }

  if (state.twistShotsLeft > 0) {
    state.twistEmitAccum += dt;
    const twistStep = Math.max(0.034, 0.048 - phase * 0.002);
    while (state.twistShotsLeft > 0 && state.twistEmitAccum >= twistStep) {
      state.twistEmitAccum -= twistStep;
      const isFirst = state.twistShotsLeft === (phase >= 4 ? 10 : 8);
      emitStroke3TwistBead(state, emitter, statScale, phase, isFirst);
      state.twistShotsLeft -= 1;
    }
  }

  const stroke1Dur = Math.max(0.42, 0.56 - phase * 0.02);
  const stroke2Dur = Math.max(0.56, 0.72 - phase * 0.025);
  const stroke3Dur = Math.max(0.52, 0.68 - phase * 0.025);
  const holdDur = Math.max(0.45, 0.75 - phase * 0.05);

  if (state.strokeStage === 0 && state.strokeTimer === 0) {
    const verts = computeRightTriangleVertices(boss.x, boss.y, state.flipY, phase >= 4 ? 1.1 : 1.0);
    state.triA = verts.triA;
    state.triB = verts.triB;
    state.triC = verts.triC;
    fireStroke1SplitWall(boss, state, playerPos, emitter, statScale, phase);
  }

  state.strokeTimer += dt;
  boss.moDashState = 'triangle';

  const { triA, triB, triC } = state;
  const drawTime = 0.24;

  if (state.strokeStage === 0) {
    const p0 = Math.min(1, state.strokeTimer / drawTime);
    boss.moDashLines = [
      { x1: triA.x, y1: triA.y, x2: triB.x, y2: triB.y, progress: Number(p0.toFixed(2)), active: true, completed: false, isReturn: false },
    ];
    if (state.strokeTimer >= stroke1Dur) {
      state.strokeStage = 1;
      state.strokeTimer = 0;
      const slant = phase >= 4 ? 0.44 : 0.36;
      state.corridorAngle = Math.PI + state.flipY * slant;
      state.railShotsLeft = phase >= 4 ? 10 : 8;
      state.railEmitAccum = 0.05;
    }
  } else if (state.strokeStage === 1) {
    const p1 = Math.min(1, state.strokeTimer / drawTime);
    boss.moDashLines = [
      { x1: triA.x, y1: triA.y, x2: triB.x, y2: triB.y, progress: 1, active: false, completed: false, isReturn: false },
      { x1: triB.x, y1: triB.y, x2: triC.x, y2: triC.y, progress: Number(p1.toFixed(2)), active: true, completed: false, isReturn: false },
    ];
    if (state.strokeTimer >= stroke2Dur) {
      state.strokeStage = 2;
      state.strokeTimer = 0;
      if (state.upperAnchor && state.lowerAnchor) {
        state.twistUpperPivot = { x: state.upperAnchor.x, y: state.upperAnchor.y };
        state.twistLowerPivot = { x: state.lowerAnchor.x, y: state.lowerAnchor.y };
      } else {
        state.twistUpperPivot = { x: 430, y: state.gapY - 58 };
        state.twistLowerPivot = { x: 430, y: state.gapY + 58 };
      }
      const twistSlant = phase >= 4 ? 0.50 : 0.44;
      state.twistAngle = Math.PI - state.flipY * twistSlant;
      if (phase >= 2) {
        state.twistShotsLeft = phase >= 4 ? 10 : 8;
        state.twistEmitAccum = 0.05;
      }
      fireHypotenuseFlourish(boss, state, playerPos, emitter, statScale, phase);
    }
  } else if (state.strokeStage === 2) {
    const p2 = Math.min(1, state.strokeTimer / drawTime);
    boss.moDashLines = [
      { x1: triA.x, y1: triA.y, x2: triB.x, y2: triB.y, progress: 1, active: false, completed: false, isReturn: false },
      { x1: triB.x, y1: triB.y, x2: triC.x, y2: triC.y, progress: 1, active: false, completed: false, isReturn: false },
      { x1: triC.x, y1: triC.y, x2: triA.x, y2: triA.y, progress: Number(p2.toFixed(2)), active: true, completed: false, isReturn: true },
    ];
    if (state.strokeTimer >= stroke3Dur) {
      state.strokeStage = 3;
      state.strokeTimer = 0;
    }
  } else {
    const fade = Math.max(0, 1 - state.strokeTimer / Math.max(0.2, holdDur * 0.6));
    boss.moDashLines =
      fade > 0.08
        ? [
            { x1: triA.x, y1: triA.y, x2: triB.x, y2: triB.y, progress: Number(fade.toFixed(2)), active: false, completed: false, isReturn: false },
            { x1: triB.x, y1: triB.y, x2: triC.x, y2: triC.y, progress: Number(fade.toFixed(2)), active: false, completed: false, isReturn: false },
            { x1: triC.x, y1: triC.y, x2: triA.x, y2: triA.y, progress: Number(fade.toFixed(2)), active: false, completed: false, isReturn: true },
          ]
        : [];

    if (state.strokeTimer >= holdDur) {
      state.cycleIndex += 1;
      state.flipY = state.cycleIndex % 2 === 0 ? 1 : -1;
      state.strokeStage = 0;
      state.strokeTimer = 0;
      if (phase === 5 && state.cycleIndex % 3 === 2) {
        state.mode = 'dash_telegraph';
        state.timer = 0;
        state.dashChain = buildPhysicalRightTriangleDash(state.flipY, playerPos);
        state.segIndex = 0;
      }
    }
  }
}

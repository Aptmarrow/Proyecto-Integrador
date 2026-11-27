/**
 * Boss 3-3: M.O. (Mechanical Ophanim) — Sacred-Geometry Tackle Rework (Konngara Aesthetic).
 * Mirrored 1:1 with Backend/src/game/campaign/moBossEngine.js for local sandbox / Boss Dev Lab.
 */

export const MO_HOME_X = 650;
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

interface TackleSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: string;
  speed: number;
  isReturn: boolean;
  edgeIndex?: number;
  totalArms?: number;
  centerX?: number;
  centerY?: number;
}

export interface MoBossRuntimeState {
  mode: 'intro' | 'telegraph' | 'dashing' | 'resting';
  timer: number;
  introDuration: number;
  cycleIndex: number;
  flipY: 1 | -1;
  shapeKind: string;
  dashChain: TackleSegment[];
  segIndex: number;
  segProgressLastEmit: number;
  dashHitPlayers: Set<string>;
  restDuration: number;
  restShotAccum: number;
  summonTimer: number;
  lastPhaseSeen: number;
  gapY: number;
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
    name: 'Fase 1 "Tacle: Triángulo Rectángulo"',
    pattern: 'mo_tackle_triangle',
    shootInterval: 0.5,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Sello Ophanim "Tacle: Reloj de Arena"',
    pattern: 'mo_tackle_hourglass',
    shootInterval: 0.45,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Fase 3 "Tacle: Estrella Pentagrama"',
    pattern: 'mo_tackle_star',
    shootInterval: 0.4,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Protocolo Serafín "Tacle: Relámpago Trenzado"',
    pattern: 'mo_tackle_lightning',
    shootInterval: 0.35,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 9.5,
  },
  {
    name: 'Protocolo Final "MECHANICAL OPHANIM · ESPIRAL ETERNA"',
    pattern: 'mo_tackle_spiral',
    shootInterval: 0.3,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 8.5,
  },
];

export function createInitialMoState(introDuration = 3.8): MoBossRuntimeState {
  return {
    mode: 'intro',
    timer: 0,
    introDuration: introDuration || 3.8,
    cycleIndex: 0,
    flipY: 1,
    shapeKind: 'triangle',
    dashChain: [],
    segIndex: 0,
    segProgressLastEmit: 0,
    dashHitPlayers: new Set<string>(),
    restDuration: 1.5,
    restShotAccum: 0,
    summonTimer: 3.0,
    lastPhaseSeen: 1,
    gapY: MO_HOME_Y,
  };
}

export function resetMoCycleForPhase(state: MoBossRuntimeState, phase: number): void {
  state.mode = 'telegraph';
  state.timer = 0;
  state.dashChain = [];
  state.segIndex = 0;
  state.segProgressLastEmit = 0;
  state.dashHitPlayers = new Set<string>();
  state.restShotAccum = 0;
  state.lastPhaseSeen = phase;
}

function buildPhaseTackleChain(
  phase: number,
  flipY: 1 | -1,
  playerPos: { x: number; y: number } | null,
  cycleIndex: number
): { shapeKind: string; gapY: number; chain: TackleSegment[] } {
  const f = flipY >= 0 ? 1 : -1;
  const px = Math.max(140, Math.min(340, Math.round(playerPos?.x ?? 200)));
  const py = Math.max(155, Math.min(WORLD_HEIGHT - 155, Math.round(playerPos?.y ?? MO_HOME_Y)));

  if (phase === 1) {
    const rightX = 640;
    const leftX = Math.max(255, px + 80);
    const yA = f > 0 ? 96 : WORLD_HEIGHT - 96;
    const yB = f > 0 ? WORLD_HEIGHT - 96 : 96;
    return {
      shapeKind: 'triangle',
      gapY: py,
      chain: [
        { x1: rightX, y1: yA, x2: rightX, y2: yB, kind: 'tri_vert', speed: 940, isReturn: false },
        { x1: rightX, y1: yB, x2: leftX, y2: yB, kind: 'tri_horiz', speed: 1020, isReturn: false },
        { x1: leftX, y1: yB, x2: rightX, y2: yA, kind: 'tri_hypo', speed: 1120, isReturn: false },
        { x1: rightX, y1: yA, x2: MO_HOME_X, y2: MO_HOME_Y, kind: 'return', speed: 920, isReturn: true },
      ],
    };
  }

  if (phase === 2) {
    const rX = 655;
    const lX = 265;
    const tY = f > 0 ? 102 : WORLD_HEIGHT - 102;
    const bY = f > 0 ? WORLD_HEIGHT - 102 : 102;
    return {
      shapeKind: 'hourglass',
      gapY: py,
      chain: [
        { x1: rX, y1: tY, x2: lX, y2: bY, kind: 'hg_diag1', speed: 1060, isReturn: false },
        { x1: lX, y1: bY, x2: lX, y2: tY, kind: 'hg_capL', speed: 1080, isReturn: false },
        { x1: lX, y1: tY, x2: rX, y2: bY, kind: 'hg_diag2', speed: 1120, isReturn: false },
        { x1: rX, y1: bY, x2: rX, y2: tY, kind: 'hg_capR', speed: 1040, isReturn: false },
        { x1: rX, y1: tY, x2: MO_HOME_X, y2: MO_HOME_Y, kind: 'return', speed: 960, isReturn: true },
      ],
    };
  }

  if (phase === 3) {
    const cx = 485;
    const cy = 300;
    const r = 212;
    const rotOffset = -Math.PI / 2 + (cycleIndex % 2) * (Math.PI / 5);
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 5; i++) {
      const a = rotOffset + (i * Math.PI * 2) / 5;
      pts.push({
        x: Math.round(cx + Math.cos(a) * r),
        y: Math.round(cy + Math.sin(a) * r),
      });
    }
    const order = [0, 2, 4, 1, 3, 0];
    const chain: TackleSegment[] = [];
    for (let i = 0; i < 5; i++) {
      const p0 = pts[order[i]];
      const p1 = pts[order[i + 1]];
      chain.push({
        x1: p0.x,
        y1: p0.y,
        x2: p1.x,
        y2: p1.y,
        kind: 'star_edge',
        edgeIndex: i,
        centerX: cx,
        centerY: cy,
        speed: 1160,
        isReturn: false,
      });
    }
    chain.push({
      x1: pts[0].x,
      y1: pts[0].y,
      x2: MO_HOME_X,
      y2: MO_HOME_Y,
      kind: 'return',
      speed: 980,
      isReturn: true,
    });
    return { shapeKind: 'star', gapY: py, chain };
  }

  if (phase === 4) {
    const topY = f > 0 ? 105 : WORLD_HEIGHT - 105;
    const botY = f > 0 ? WORLD_HEIGHT - 105 : 105;
    const verts = [
      { x: 685, y: topY },
      { x: 575, y: botY },
      { x: 465, y: topY },
      { x: 355, y: botY },
      { x: 245, y: topY },
    ];
    const chain: TackleSegment[] = [];
    for (let i = 0; i < verts.length - 1; i++) {
      chain.push({
        x1: verts[i].x,
        y1: verts[i].y,
        x2: verts[i + 1].x,
        y2: verts[i + 1].y,
        kind: i % 2 === 0 ? 'zig_down' : 'zig_up',
        edgeIndex: i,
        speed: 1220,
        isReturn: false,
      });
    }
    const last = verts[verts.length - 1];
    chain.push({
      x1: last.x,
      y1: last.y,
      x2: MO_HOME_X,
      y2: MO_HOME_Y,
      kind: 'zig_return',
      speed: 1180,
      isReturn: true,
    });
    return { shapeKind: 'lightning', gapY: py, chain };
  }

  // P5: Inward Mechanical Square Spiral
  const y1 = f > 0 ? 92 : WORLD_HEIGHT - 92;
  const y2 = f > 0 ? WORLD_HEIGHT - 92 : 92;
  const y3 = f > 0 ? 178 : WORLD_HEIGHT - 178;
  const y4 = f > 0 ? WORLD_HEIGHT - 178 : 178;
  const spiralPts = [
    { x: 685, y: y1 },
    { x: 255, y: y1 },
    { x: 255, y: y2 },
    { x: 615, y: y2 },
    { x: 615, y: y3 },
    { x: 335, y: y3 },
    { x: 335, y: y4 },
    { x: 525, y: y4 },
    { x: 465, y: 300 },
  ];
  const chain: TackleSegment[] = [];
  for (let i = 0; i < spiralPts.length - 1; i++) {
    chain.push({
      x1: spiralPts[i].x,
      y1: spiralPts[i].y,
      x2: spiralPts[i + 1].x,
      y2: spiralPts[i + 1].y,
      kind: 'spiral_arm',
      edgeIndex: i,
      totalArms: spiralPts.length - 1,
      centerX: 465,
      centerY: 300,
      speed: 1240 + i * 35,
      isReturn: false,
    });
  }
  chain.push({
    x1: 465,
    y1: 300,
    x2: MO_HOME_X,
    y2: MO_HOME_Y,
    kind: 'spiral_core_return',
    speed: 1040,
    isReturn: true,
  });
  return { shapeKind: 'spiral', gapY: py, chain };
}

function estimateRemainingChainTime(chain: TackleSegment[], fromIndex: number, statScale: number): number {
  let total = 0;
  for (let i = fromIndex; i < chain.length; i++) {
    const s = chain[i];
    if (s.isReturn) break;
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
    total += Math.max(0.18, Math.min(0.55, len / ((s.speed || 1050) * statScale)));
  }
  return total;
}

function emitTackleWakeNode(
  state: MoBossRuntimeState,
  seg: TackleSegment,
  u: number,
  emitter: MoBulletEmitter,
  statScale: number
): void {
  const dmg = Number((4.5 * statScale).toFixed(1));
  const x = seg.x1 + (seg.x2 - seg.x1) * u;
  const y = seg.y1 + (seg.y2 - seg.y1) * u;
  const segAngle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
  const f = state.flipY >= 0 ? 1 : -1;

  if (seg.kind === 'tri_vert') {
    const distFromGap = Math.abs(y - state.gapY);
    if (distFromGap < 44) return;
    const isEdge = distFromGap < 82;
    const sideSign = y < state.gapY ? -1 : 1;
    const vx = -168 * statScale;
    const vy = sideSign * 34 * statScale;
    emitter.spawnVelocity(x, y, vx, vy, isEdge ? 7.2 : 5.2, 5.2, dmg, isEdge ? 0xfde047 : 0xfef9c3, {
      delay: 0.32,
    });
    if (isEdge) {
      const corridorAngle = Math.PI + f * 0.36;
      const twistDelta = -f * 0.82;
      for (let b = 0; b < 4; b++) {
        emitter.spawn(x - b * 14, y, corridorAngle, 235 * statScale, 5.0, 4.8, dmg, 0x38bdf8, {
          delay: 0.42 + b * 0.055,
          turnAfter: 0.62,
          turnAngle: twistDelta,
          turnSpeedMult: 1.12,
          turnColor: 0xff2b5b,
        });
      }
    }
    return;
  }

  if (seg.kind === 'tri_horiz') {
    const launchAngle = Math.PI + f * 0.48;
    emitter.spawn(x, y, launchAngle, 215 * statScale, 4.8, 4.6, dmg, 0x38bdf8, {
      delay: 0.25 + (1 - u) * 0.14,
      turnAfter: 0.52,
      turnAngle: -f * 0.72,
      turnSpeedMult: 1.14,
      turnColor: 0xfde047,
    });
    return;
  }

  if (seg.kind === 'tri_hypo') {
    const perpLeft = segAngle + Math.PI / 2;
    const perpRight = segAngle - Math.PI / 2;
    const outward = Math.cos(perpLeft) <= 0 ? perpLeft : perpRight;
    emitter.spawn(x, y, outward, 195 * statScale, 4.6, 4.4, dmg, 0xfef08a, {
      spriteType: 'MObullet3png',
      delay: 0.16,
    });
    return;
  }

  if (seg.kind === 'hg_diag1' || seg.kind === 'hg_diag2') {
    const rem = estimateRemainingChainTime(state.dashChain, state.segIndex + 1, statScale);
    const isFirst = seg.kind === 'hg_diag1';
    const baseDelay = Math.max(0.18, rem + (isFirst ? 0.12 : 0.30));
    const sgn = isFirst ? 1 : -1;
    for (const dir of [-1, 1]) {
      emitter.spawn(
        x,
        y,
        segAngle + dir * (Math.PI / 2),
        175 * statScale,
        4.8,
        5.0,
        dmg,
        isFirst ? 0x38bdf8 : 0xfde047,
        {
          delay: baseDelay,
          turnAfter: 0.56,
          turnAngle: sgn * 0.44,
          turnSpeedMult: 1.15,
          turnColor: isFirst ? 0xff2b5b : 0xfef08a,
        }
      );
    }
    return;
  }

  if (seg.kind === 'hg_capL' || seg.kind === 'hg_capR') {
    if (Math.abs(u - 0.5) < 0.25) {
      emitter.spawn(x, y, Math.PI, 220 * statScale, 5.0, 4.2, dmg, 0xef4444, {
        spriteType: 'MObullet1png',
        delay: 0.2,
      });
    }
    return;
  }

  if (seg.kind === 'star_edge') {
    const rem = estimateRemainingChainTime(state.dashChain, state.segIndex + 1, statScale);
    const outwardAngle = Math.atan2(y - (seg.centerY ?? 300), x - (seg.centerX ?? 485));
    emitter.spawn(x, y, outwardAngle, 188 * statScale, 5.0, 5.0, dmg, 0xfde047, {
      delay: Math.max(0.18, rem + 0.22),
      turnAfter: 0.58,
      turnAngle: f * 0.32,
      turnSpeedMult: 1.12,
      turnColor: 0x38bdf8,
    });
    return;
  }

  if (seg.kind === 'zig_down' || seg.kind === 'zig_up') {
    const rem = estimateRemainingChainTime(state.dashChain, state.segIndex + 1, statScale);
    const isDown = seg.kind === 'zig_down';
    const latticeAngle = isDown ? Math.PI + 0.50 : Math.PI - 0.50;
    const snapDelta = isDown ? -0.52 : 0.52;
    emitter.spawn(x, y, latticeAngle, 205 * statScale, 4.8, 5.0, dmg, isDown ? 0x38bdf8 : 0xfde047, {
      delay: Math.max(0.16, rem + 0.14),
      turnAfter: 0.62,
      turnAngle: snapDelta,
      turnSpeedMult: 1.16,
      turnColor: 0xff2b5b,
    });
    return;
  }

  if (seg.kind === 'zig_return') {
    emitter.spawn(x, y, Math.PI + (u - 0.5) * 0.55, 230 * statScale, 4.6, 4.2, dmg, 0xfef08a, {
      spriteType: 'MObullet3png',
      delay: 0.1,
    });
    return;
  }

  if (seg.kind === 'spiral_arm') {
    if (u > 0.42 && u < 0.58) return;
    const rem = estimateRemainingChainTime(state.dashChain, state.segIndex + 1, statScale);
    const ringFromInside = Math.max(0, (seg.totalArms || 8) - 1 - (seg.edgeIndex || 0));
    const cascadeDelay = Math.max(0.18, rem + 0.16 + ringFromInside * 0.08);
    const outAngle = Math.atan2(y - (seg.centerY ?? 300), x - (seg.centerX ?? 465));
    emitter.spawn(
      x,
      y,
      outAngle,
      195 * statScale,
      5.0,
      5.2,
      dmg,
      (seg.edgeIndex || 0) % 2 === 0 ? 0xfde047 : 0x38bdf8,
      {
        delay: cascadeDelay,
        turnAfter: 0.52,
        turnAngle: f * 0.48,
        turnSpeedMult: 1.16,
        turnColor: 0xff2b5b,
      }
    );
  }
}

function emitTackleVertexBurst(
  state: MoBossRuntimeState,
  seg: TackleSegment,
  emitter: MoBulletEmitter,
  statScale: number
): void {
  const dmg = Number((4.8 * statScale).toFixed(1));
  const vx = seg.x2;
  const vy = seg.y2;

  if (seg.kind === 'star_edge') {
    const rem = estimateRemainingChainTime(state.dashChain, state.segIndex + 1, statScale);
    const petals = 6;
    const baseRot = (seg.edgeIndex || 0) * 0.42;
    for (let k = 0; k < petals; k++) {
      emitter.spawn(
        vx,
        vy,
        baseRot + (Math.PI * 2 * k) / petals,
        165 * statScale,
        4.8,
        4.8,
        dmg,
        0xef4444,
        { spriteType: 'MObullet1png', delay: Math.max(0.18, rem + 0.22) }
      );
    }
    return;
  }

  if (seg.kind === 'spiral_arm' && seg.edgeIndex === (seg.totalArms || 8) - 1) {
    for (const ang of [Math.PI - 0.35, Math.PI + 0.35]) {
      emitter.spawn(
        vx,
        vy,
        ang,
        185 * statScale,
        11.2,
        5.5,
        Number((6.5 * statScale).toFixed(1)),
        0x9ca3af,
        { spriteType: 'MObullet4png', splitOnImpact: true, splitCount: 6 }
      );
    }
    return;
  }

  if (seg.kind === 'tri_vert' || seg.kind === 'tri_horiz') {
    for (const off of [-0.3, 0, 0.3]) {
      emitter.spawn(vx, vy, Math.PI + off, 190 * statScale, 4.4, 3.8, dmg, 0xfef08a, {
        spriteType: 'MObullet3png',
        delay: 0.14,
      });
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
    const summonInterval = Math.max(5.0, 7.5 - phase * 0.4);
    if (state.summonTimer >= summonInterval) {
      state.summonTimer = 0;
      const maxActive = Math.min(4, 1 + diffBonus);
      for (let k = 0; k < summonCount; k++) {
        onSpawnKamikaze(phase, maxActive, statScale);
      }
    }
  }

  if (state.mode === 'telegraph') {
    state.timer += dt;
    const duration = Math.max(0.75, 1.05 - phase * 0.04);
    if (state.dashChain.length === 0) {
      const built = buildPhaseTackleChain(phase, state.flipY, playerPos, state.cycleIndex);
      state.shapeKind = built.shapeKind;
      state.gapY = built.gapY;
      state.dashChain = built.chain;
    }
    const first = state.dashChain[0];
    boss.x += (first.x1 - boss.x) * Math.min(1, dt * 9);
    boss.y += (first.y1 - boss.y) * Math.min(1, dt * 9);
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
      state.mode = 'dashing';
      state.segIndex = 0;
      state.timer = 0;
      state.segProgressLastEmit = 0;
      state.dashHitPlayers = new Set<string>();
    }
    return;
  }

  if (state.mode === 'dashing') {
    const seg = state.dashChain[state.segIndex];
    if (!seg) {
      state.mode = 'resting';
      state.timer = 0;
      state.restDuration = Math.max(1.25, 1.9 - phase * 0.1);
      state.restShotAccum = 0;
      boss.moDashLines = [];
      return;
    }

    const segLen = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) || 1;
    const speed = (seg.speed || 1050) * statScale;
    const segDur = Math.max(0.18, Math.min(0.56, segLen / speed));
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

    const nodesPerSeg =
      seg.kind === 'tri_vert'
        ? 11
        : seg.kind === 'star_edge'
          ? 7
          : seg.kind === 'spiral_arm'
            ? Math.max(4, Math.round(segLen / 46))
            : Math.max(5, Math.round(segLen / 52));
    const stepU = 1 / (nodesPerSeg + 1);
    while (state.segProgressLastEmit + stepU <= ease && state.segProgressLastEmit + stepU < 0.98) {
      state.segProgressLastEmit += stepU;
      emitTackleWakeNode(state, seg, state.segProgressLastEmit, emitter, statScale);
    }

    if (!seg.isReturn || rawT < 0.72) {
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
      if (!seg.isReturn) {
        emitTackleVertexBurst(state, seg, emitter, statScale);
      }
      state.segIndex += 1;
      state.timer = 0;
      state.segProgressLastEmit = 0;
      state.dashHitPlayers = new Set<string>();

      if (state.segIndex >= state.dashChain.length) {
        state.mode = 'resting';
        state.restDuration = Math.max(1.25, 1.9 - phase * 0.1);
        state.restShotAccum = 0;
        boss.moDashLines = [];
      }
    }
    return;
  }

  // Vulnerable recovery hover
  state.timer += dt;
  boss.moDashState = 'resting';
  boss.moDashLines = [];

  const hoverX = MO_HOME_X + Math.cos(state.timer * 1.6) * 26;
  const hoverY = MO_HOME_Y + Math.sin(state.timer * 2.4) * 58;
  boss.x += (hoverX - boss.x) * Math.min(1, dt * 5.0);
  boss.y += (hoverY - boss.y) * Math.min(1, dt * 5.0);
  if (playerPos) {
    boss.angle = Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x);
  }

  state.restShotAccum += dt;
  if (state.restShotAccum >= Math.max(0.75, 1.15 - phase * 0.06)) {
    state.restShotAccum = 0;
    const aim = playerPos ? Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x) : Math.PI;
    const spread = phase >= 4 ? [-0.28, 0, 0.28] : [-0.22, 0.22];
    for (const off of spread) {
      emitter.spawn(boss.x - 20, boss.y, aim + off, 205 * statScale, 4.6, 3.8, Number((4.5 * statScale).toFixed(1)), 0xef4444, {
        spriteType: 'MObullet1png',
      });
    }
  }

  if (state.timer >= (state.restDuration || 1.5)) {
    state.cycleIndex += 1;
    state.flipY = state.cycleIndex % 2 === 0 ? 1 : -1;
    state.mode = 'telegraph';
    state.timer = 0;
    state.dashChain = [];
    state.segIndex = 0;
  }
}

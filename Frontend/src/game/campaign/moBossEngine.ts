/**
 * Boss 3-3: M.O. (Mechanical Ophanim) — 5-Shape Geometric Predator Tackle Engine.
 * Mirrored 1:1 with Backend/src/game/campaign/moBossEngine.js for local sandbox / Boss Dev Lab.
 */

export const MO_HOME_X = 640;
export const MO_HOME_Y = 300;
export const MO_INTRO_DURATION = 9.6;
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const ARENA_PAD_X = 64;
const ARENA_PAD_Y = 62;

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
  isCurve: boolean;
}

export interface MoBossRuntimeState {
  mode: 'intro' | 'telegraph' | 'dashing' | 'resting';
  timer: number;
  battleTime: number;
  introDuration: number;
  dropTriggered: boolean;
  tempoSection: string;
  volleyIndex: number;
  burstIndex: number;
  totalBursts: number;
  flipY: 1 | -1;
  shapeKind: string;
  waveCounter: number;
  activeWaveTag: number;
  heldWaveTag: number | null;
  dashChain: TackleSegment[];
  segIndex: number;
  wakeDistAccum: number;
  wakeNodeIndex: number;
  dashHitPlayers: Set<string>;
  restDuration: number;
  restShotAccum: number;
  summonTimer: number;
  lastPhaseSeen: number;
  targetSnapX: number;
  targetSnapY: number;
  shapeCenterX: number;
  shapeCenterY: number;
  shapeFaceLeft: boolean;
  shapeSpin: number;
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
  releaseHeld?(holdTag: number, staggerSec?: number): void;
}

export const MO_PHASE_DEFS = [
  {
    name: 'Fase 1 "Guadaña Lunar"',
    pattern: 'mo_hunt_p1',
    shootInterval: 0.5,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Sello Ophanim "Serpiente Sinusoidal"',
    pattern: 'mo_hunt_p2',
    shootInterval: 0.45,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Fase 3 "Pinball Cazador"',
    pattern: 'mo_hunt_p3',
    shootInterval: 0.4,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Protocolo Serafín "Lemniscata Infinita"',
    pattern: 'mo_hunt_p4',
    shootInterval: 0.35,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 9.5,
  },
  {
    name: 'Protocolo Final "MECHANICAL OPHANIM · OJO DEL TRONO"',
    pattern: 'mo_hunt_p5',
    shootInterval: 0.3,
    laserMode: 'none' as const,
    laserInterval: 99,
    megaLaserInterval: 8.5,
  },
];

export function getMoTempoProfile(battleTime: number): {
  tempoScale: number;
  bulletTempo: number;
  section: string;
} {
  const t = Math.max(0, Number(battleTime) || 0);
  if (t < 69.5) {
    return { tempoScale: 1.0, bulletTempo: 1.0, section: 'steady' };
  }
  if (t < 72.5) {
    const u = (t - 69.5) / 3.0;
    const ease = u * u * (3 - 2 * u);
    const s = 1.0 - 0.46 * ease;
    return { tempoScale: s, bulletTempo: 0.68 + 0.32 * s, section: 'ritardando' };
  }
  if (t < 74.2) {
    return { tempoScale: 0.54, bulletTempo: 0.82, section: 'ritardando_trough' };
  }
  if (t < 75.8) {
    const u = (t - 74.2) / 1.6;
    const s = 0.54 + 0.38 * u;
    return { tempoScale: s, bulletTempo: 0.72 + 0.28 * s, section: 'recovery' };
  }
  if (t < 82.0) {
    const u = (t - 75.8) / 6.2;
    const s = 1.14 + 0.14 * u;
    return { tempoScale: s, bulletTempo: 0.96 + 0.14 * u, section: 'accelerando' };
  }
  if (t < 89.5) {
    return { tempoScale: 1.32, bulletTempo: 1.14, section: 'climax' };
  }
  if (t < 93.5) {
    const u = (t - 89.5) / 4.0;
    const ease = u * u * (3 - 2 * u);
    const s = 1.32 - 0.32 * ease;
    return { tempoScale: s, bulletTempo: 1.14 - 0.14 * ease, section: 'normalize' };
  }
  return { tempoScale: 1.0, bulletTempo: 1.0, section: 'steady' };
}

function clampX(x: number): number {
  return Math.round(Math.max(ARENA_PAD_X, Math.min(WORLD_WIDTH - ARENA_PAD_X, x)));
}

function clampY(y: number): number {
  return Math.round(Math.max(ARENA_PAD_Y, Math.min(WORLD_HEIGHT - ARENA_PAD_Y, y)));
}

function extendThroughTarget(sx: number, sy: number, tx: number, ty: number, minTravel = 320) {
  let dx = tx - sx;
  let dy = ty - sy;
  let dist = Math.hypot(dx, dy);
  if (dist < 25) {
    dx = sx > WORLD_WIDTH * 0.5 ? -1 : 1;
    dy = sy > WORLD_HEIGHT * 0.5 ? -0.45 : 0.45;
    dist = Math.hypot(dx, dy);
  }
  const ux = dx / dist;
  const uy = dy / dist;

  let bestT = Infinity;
  const tryT = (t: number) => {
    if (t > 45 && t < bestT) bestT = t;
  };
  if (Math.abs(ux) > 1e-4) {
    tryT((ARENA_PAD_X - sx) / ux);
    tryT((WORLD_WIDTH - ARENA_PAD_X - sx) / ux);
  }
  if (Math.abs(uy) > 1e-4) {
    tryT((ARENA_PAD_Y - sy) / uy);
    tryT((WORLD_HEIGHT - ARENA_PAD_Y - sy) / uy);
  }
  const travel = Number.isFinite(bestT) ? Math.max(minTravel, bestT) : minTravel;
  const ex = clampX(sx + ux * travel);
  const ey = clampY(sy + uy * travel);

  if (Math.hypot(ex - sx, ey - sy) < 240) {
    const farX = sx < WORLD_WIDTH * 0.5 ? WORLD_WIDTH - ARENA_PAD_X : ARENA_PAD_X;
    const farY = clampY(ty + (sy < MO_HOME_Y ? 120 : -120));
    return { x: farX, y: farY };
  }
  return { x: ex, y: ey };
}

function pointsToChain(
  points: Array<{ x: number; y: number }>,
  kind: string,
  speed: number,
  isCurve = true
): TackleSegment[] {
  const chain: TackleSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 4) continue;
    chain.push({
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      kind,
      speed,
      isReturn: false,
      isCurve,
    });
  }
  return chain;
}

function getTotalBurstsForPhase(phase: number): number {
  if (phase >= 3) return 4;
  return 3;
}

export function createInitialMoState(introDuration = MO_INTRO_DURATION): MoBossRuntimeState {
  return {
    mode: 'intro',
    timer: 0,
    battleTime: 0,
    introDuration: introDuration || MO_INTRO_DURATION,
    dropTriggered: false,
    tempoSection: 'steady',
    volleyIndex: 0,
    burstIndex: 0,
    totalBursts: 3,
    flipY: 1,
    shapeKind: 'crescent_arc',
    waveCounter: 1,
    activeWaveTag: 1,
    heldWaveTag: null,
    dashChain: [],
    segIndex: 0,
    wakeDistAccum: 0,
    wakeNodeIndex: 0,
    dashHitPlayers: new Set<string>(),
    restDuration: 1.5,
    restShotAccum: 0,
    summonTimer: 3.5,
    lastPhaseSeen: 1,
    targetSnapX: 180,
    targetSnapY: MO_HOME_Y,
    shapeCenterX: 400,
    shapeCenterY: MO_HOME_Y,
    shapeFaceLeft: true,
    shapeSpin: 1,
  };
}

export function resetMoCycleForPhase(
  state: MoBossRuntimeState,
  phase: number,
  jumpClockToPhase: boolean = false
): void {
  state.mode = 'telegraph';
  state.timer = 0;
  state.burstIndex = 0;
  state.totalBursts = getTotalBurstsForPhase(phase);
  state.dashChain = [];
  state.segIndex = 0;
  state.wakeDistAccum = 0;
  state.wakeNodeIndex = 0;
  state.dashHitPlayers = new Set<string>();
  state.restShotAccum = 0;
  state.heldWaveTag = null;
  state.lastPhaseSeen = phase;
  if (jumpClockToPhase) {
    const phaseNominalSec = [10.0, 26.0, 42.0, 58.0, 71.0];
    state.battleTime = phaseNominalSec[Math.max(0, Math.min(4, phase - 1))] || 10.0;
    state.dropTriggered = state.battleTime >= 75.8;
  }
}

function buildDynamicBurst(
  boss: MoBossAdapter,
  state: MoBossRuntimeState,
  phase: number,
  playerPos: { x: number; y: number } | null
): { shapeKind: string; chain: TackleSegment[] } {
  const sx = clampX(boss.x);
  const sy = clampY(boss.y);
  const px = clampX(playerPos?.x ?? 180);
  const py = clampY(playerPos?.y ?? MO_HOME_Y);
  const bIdx = state.burstIndex;
  const f: 1 | -1 = (bIdx + state.volleyIndex) % 2 === 0 ? 1 : -1;
  state.flipY = f;
  state.targetSnapX = px;
  state.targetSnapY = py;

  if (phase === 1) {
    const faceLeft = px < WORLD_WIDTH * 0.62;
    state.shapeFaceLeft = faceLeft;
    const ex = faceLeft ? clampX(615 + (bIdx % 2) * 45) : clampX(135 + (bIdx % 2) * 35);
    const ey = sy < MO_HOME_Y ? WORLD_HEIGHT - 82 : 82;

    const rawCx = 2 * px - 0.5 * (sx + ex);
    const rawCy = 2 * py - 0.5 * (sy + ey);
    const ctrlX = Math.max(-280, Math.min(WORLD_WIDTH + 280, rawCx));
    const ctrlY = Math.max(-120, Math.min(WORLD_HEIGHT + 120, rawCy));

    const steps = 10;
    const pts: Array<{ x: number; y: number }> = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const omt = 1 - t;
      const x = omt * omt * sx + 2 * omt * t * ctrlX + t * t * ex;
      const y = omt * omt * sy + 2 * omt * t * ctrlY + t * t * ey;
      pts.push({ x: clampX(x), y: clampY(y) });
    }
    state.shapeCenterX = ex;
    state.shapeCenterY = py;
    return {
      shapeKind: 'crescent_arc',
      chain: pointsToChain(pts, 'crescent_blade', 760, true),
    };
  }

  if (phase === 2) {
    const goingLeft = sx >= WORLD_WIDTH * 0.5;
    state.shapeFaceLeft = goingLeft;
    const endX = goingLeft ? ARENA_PAD_X + 14 : WORLD_WIDTH - ARENA_PAD_X - 14;
    const spanX = endX - sx || (goingLeft ? -560 : 560);
    const tPlayer = Math.max(0.22, Math.min(0.78, (px - sx) / spanX));
    const halfWaves = Math.max(2, Math.round(tPlayer * 3));
    const omega = Math.max(2.3 * Math.PI, Math.min(3.5 * Math.PI, (halfWaves * Math.PI) / tPlayer));
    const amp = 124;

    const steps = 12;
    const pts: Array<{ x: number; y: number }> = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = sx + spanX * t;
      const baseBlend = Math.min(1, t * 2.2);
      const baseY = sy + (py - sy) * baseBlend;
      const y = baseY + Math.sin(t * omega) * amp * f;
      pts.push({ x: clampX(x), y: clampY(y) });
    }
    state.shapeCenterX = WORLD_WIDTH * 0.5;
    state.shapeCenterY = py;
    return {
      shapeKind: 'sine_serpent',
      chain: pointsToChain(pts, 'sine_ribbon', 820, true),
    };
  }

  if (phase === 3) {
    const exit = extendThroughTarget(sx, sy, px, py, 360);
    return {
      shapeKind: 'pinball_snipe',
      chain: [
        {
          x1: sx,
          y1: sy,
          x2: exit.x,
          y2: exit.y,
          kind: 'pinball_dash',
          speed: 920,
          isReturn: false,
          isCurve: false,
        },
      ],
    };
  }

  if (phase === 4) {
    const cx = 400;
    const cy = clampY(Math.max(195, Math.min(405, py)));
    const startLeft = px <= cx;
    const isLeftLobe = bIdx % 2 === 0 ? startLeft : !startLeft;
    const loopDir = isLeftLobe ? -1 : 1;
    const spin = state.volleyIndex % 2 === 0 ? 1 : -1;
    state.shapeSpin = spin * loopDir;
    state.shapeCenterX = cx;
    state.shapeCenterY = cy;

    const rx = isLeftLobe
      ? Math.max(185, Math.min(315, cx - Math.max(ARENA_PAD_X + 12, px - 12)))
      : Math.max(185, Math.min(310, Math.max(WORLD_WIDTH - ARENA_PAD_X - 20, px + 12) - cx));
    const maxRy = Math.min(cy - ARENA_PAD_Y - 10, WORLD_HEIGHT - ARENA_PAD_Y - 10 - cy);
    const ry = Math.max(125, Math.min(185, maxRy));

    const steps = 12;
    const pts: Array<{ x: number; y: number }> = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const theta = t * Math.PI;
      const idealX = cx + loopDir * rx * Math.sin(theta);
      const idealY = cy + spin * ry * Math.sin(2 * theta);
      const startBlend = Math.pow(Math.max(0, 1 - t * 2.6), 2);
      const x = idealX + (sx - cx) * startBlend;
      const y = idealY + (sy - cy) * startBlend;
      pts.push({ x: clampX(x), y: clampY(y) });
    }
    return {
      shapeKind: 'infinity_loop',
      chain: pointsToChain(pts, 'infinity_lobe', 880, true),
    };
  }

  if (bIdx % 2 === 0) {
    const cx = clampX(Math.max(210, Math.min(545, px + (px < 400 ? 35 : -35))));
    const cy = clampY(Math.max(195, Math.min(405, py)));
    const radius = 148;
    const spin = f;
    state.shapeCenterX = cx;
    state.shapeCenterY = cy;
    state.shapeSpin = spin;

    const entryAngle = Math.atan2(sy - cy, sx - cx);
    const entryX = clampX(cx + Math.cos(entryAngle) * radius);
    const entryY = clampY(cy + Math.sin(entryAngle) * radius);

    const chain: TackleSegment[] = [];
    if (Math.hypot(entryX - sx, entryY - sy) > 20) {
      const entryPts: Array<{ x: number; y: number }> = [];
      for (let k = 0; k <= 3; k++) {
        const t = k / 3;
        entryPts.push({
          x: clampX(sx + (entryX - sx) * t),
          y: clampY(sy + (entryY - sy) * t),
        });
      }
      chain.push(...pointsToChain(entryPts, 'halo_entry', 960, true));
    }

    const ringSteps = 12;
    const ringPts: Array<{ x: number; y: number }> = [];
    for (let k = 0; k <= ringSteps; k++) {
      const a = entryAngle + (Math.PI * 2 * k * spin) / ringSteps;
      ringPts.push({
        x: clampX(cx + Math.cos(a) * radius),
        y: clampY(cy + Math.sin(a) * radius),
      });
    }
    chain.push(...pointsToChain(ringPts, 'halo_ring', 900, true));
    return {
      shapeKind: 'ophanim_halo',
      chain,
    };
  }

  const exit1 = extendThroughTarget(sx, sy, px, py, 360);
  const exit2X = exit1.x < WORLD_WIDTH * 0.5 ? WORLD_WIDTH - ARENA_PAD_X - 16 : ARENA_PAD_X + 16;
  const exit2Y = exit1.y < MO_HOME_Y ? WORLD_HEIGHT - ARENA_PAD_Y - 16 : ARENA_PAD_Y + 16;
  return {
    shapeKind: 'ophanim_halo',
    chain: [
      {
        x1: sx,
        y1: sy,
        x2: exit1.x,
        y2: exit1.y,
        kind: 'cross_pierce',
        speed: 980,
        isReturn: false,
        isCurve: false,
      },
      {
        x1: exit1.x,
        y1: exit1.y,
        x2: exit2X,
        y2: exit2Y,
        kind: 'cross_slash',
        speed: 960,
        isReturn: false,
        isCurve: false,
      },
    ],
  };
}

function emitHeldWakeNode(
  state: MoBossRuntimeState,
  seg: TackleSegment,
  x: number,
  y: number,
  segAngle: number,
  emitter: MoBulletEmitter,
  statScale: number,
  bulletTempo: number
): void {
  const dmg = Number((4.5 * statScale).toFixed(1));
  const spdScale = statScale * bulletTempo;
  const nodeIdx = state.wakeNodeIndex;
  const holdOpts = { holdTag: state.activeWaveTag, delay: 8.5 };

  const toPlayer = Math.atan2(state.targetSnapY - y, state.targetSnapX - x);
  const perpA = segAngle + Math.PI / 2;
  const perpB = segAngle - Math.PI / 2;
  const dotA = Math.cos(perpA - toPlayer);
  const towardPerp = dotA >= 0 ? perpA : perpB;
  const awayPerp = dotA >= 0 ? perpB : perpA;

  if (seg.kind === 'crescent_blade') {
    const faceAngle = state.shapeFaceLeft ? Math.PI : 0;
    const isUpper = y < state.targetSnapY;
    const jawAngle = state.shapeFaceLeft
      ? (isUpper ? Math.PI - 0.34 : Math.PI + 0.34)
      : (isUpper ? 0.34 : -0.34);

    emitter.spawn(x, y, towardPerp, 125 * spdScale, 5.0, 5.4, dmg, 0x38bdf8, {
      ...holdOpts,
      turnAfter: 0.44 / Math.max(0.65, bulletTempo),
      turnAbsAngle: jawAngle,
      turnSpeedMult: 1.44,
      turnColor: 0xff2b5b,
    });
    if (nodeIdx % 3 === 0) {
      emitter.spawn(x, y, faceAngle, 155 * spdScale, 4.2, 4.8, dmg, 0xfef08a, {
        ...holdOpts,
        spriteType: 'MObullet3png',
      });
    }
    return;
  }

  if (seg.kind === 'sine_ribbon') {
    const vertAngle = nodeIdx % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
    const horizAngle = x >= state.targetSnapX - 35 ? Math.PI : 0;
    emitter.spawn(x, y, vertAngle, 138 * spdScale, 5.0, 5.6, dmg, 0x38bdf8, {
      ...holdOpts,
      turnAfter: 0.44 / Math.max(0.65, bulletTempo),
      turnAbsAngle: horizAngle,
      turnSpeedMult: 1.42,
      turnColor: 0xff2b5b,
    });
    if (nodeIdx % 3 === 0) {
      emitter.spawn(x, y, towardPerp, 180 * spdScale, 4.3, 4.8, dmg, 0xfef08a, {
        ...holdOpts,
        spriteType: 'MObullet3png',
      });
    }
    return;
  }

  if (seg.kind === 'pinball_dash') {
    const spreadAng = nodeIdx % 2 === 0 ? towardPerp : awayPerp;
    const snapOffset = ((nodeIdx % 3) - 1) * 0.11;
    emitter.spawn(x, y, spreadAng, 132 * spdScale, 5.0, 5.8, dmg, 0x38bdf8, {
      ...holdOpts,
      freezeAfter: 0.28,
      freezeDur: 0.46 / Math.max(0.7, bulletTempo),
      turnColor: 0xff2b5b,
      snapToPlayer: true,
      snapOffset,
      snapSpeed: 248 * spdScale,
    });
    if (nodeIdx % 2 === 0) {
      emitter.spawn(x, y, towardPerp, 195 * spdScale, 4.2, 4.6, dmg, 0xfef08a, {
        ...holdOpts,
        spriteType: 'MObullet3png',
      });
    }
    return;
  }

  if (seg.kind === 'infinity_lobe') {
    const spinDir = state.shapeSpin >= 0 ? 1 : -1;
    emitter.spawn(x, y, towardPerp, 152 * spdScale, 4.8, 5.6, dmg, 0xfde047, {
      ...holdOpts,
      angularVel: spinDir * 0.88 * bulletTempo,
    });
    if (nodeIdx % 2 === 0) {
      emitter.spawn(x, y, awayPerp, 138 * spdScale, 4.6, 5.6, dmg, 0x38bdf8, {
        ...holdOpts,
        angularVel: -spinDir * 0.78 * bulletTempo,
      });
    }
    return;
  }

  if (seg.kind === 'halo_entry') {
    return;
  }

  if (seg.kind === 'halo_ring') {
    const spinDir = state.shapeSpin >= 0 ? 1 : -1;
    const toCenter = Math.atan2(state.shapeCenterY - y, state.shapeCenterX - x);
    emitter.spawn(x, y, toCenter + spinDir * 0.65, 146 * spdScale, 5.0, 5.8, dmg, 0xfde047, {
      ...holdOpts,
      angularVel: spinDir * 0.82 * bulletTempo,
    });
    if (nodeIdx % 4 === 0) {
      emitter.spawn(x, y, toCenter + Math.PI, 120 * spdScale, 5.0, 5.8, dmg, 0x38bdf8, {
        ...holdOpts,
        freezeAfter: 0.26,
        freezeDur: 0.42 / Math.max(0.7, bulletTempo),
        turnColor: 0xff2b5b,
        snapToPlayer: true,
        snapOffset: 0,
        snapSpeed: 262 * spdScale,
      });
    }
    return;
  }

  const horizFold = x >= state.targetSnapX - 30 ? Math.PI : 0;
  emitter.spawn(x, y, towardPerp, 158 * spdScale, 4.8, 5.4, dmg, 0x38bdf8, {
    ...holdOpts,
    turnAfter: 0.38 / Math.max(0.65, bulletTempo),
    turnAbsAngle: horizFold,
    turnSpeedMult: 1.38,
    turnColor: 0xff2b5b,
  });
  if (nodeIdx % 2 === 0) {
    emitter.spawn(x, y, awayPerp, 190 * spdScale, 4.3, 4.6, dmg, 0xfef08a, {
      ...holdOpts,
      spriteType: 'MObullet3png',
    });
  }
}

function emitCornerAimedBurst(
  seg: TackleSegment,
  playerPos: { x: number; y: number } | null,
  emitter: MoBulletEmitter,
  statScale: number,
  phase: number,
  bulletTempo: number
): void {
  const vx = seg.x2;
  const vy = seg.y2;
  const dmg = Number((4.8 * statScale).toFixed(1));
  const aim = playerPos ? Math.atan2(playerPos.y - vy, playerPos.x - vx) : Math.PI;

  const fanHalf = phase >= 4 ? 2 : 1;
  const stepRad = phase >= 4 ? 0.24 : 0.26;
  const spd = (195 + phase * 10) * statScale * bulletTempo;

  for (let k = -fanHalf; k <= fanHalf; k++) {
    emitter.spawn(vx, vy, aim + k * stepRad, spd - Math.abs(k) * 12, 4.8, 4.4, dmg, 0xef4444, {
      spriteType: 'MObullet1png',
    });
  }

  if (phase >= 4 && (seg.kind === 'infinity_lobe' || seg.kind === 'cross_slash')) {
    emitter.spawn(
      vx,
      vy,
      aim + 0.14,
      175 * statScale * bulletTempo,
      10.5,
      5.5,
      Number((6.0 * statScale).toFixed(1)),
      0x9ca3af,
      { spriteType: 'MObullet4png', splitOnImpact: true, splitCount: phase >= 5 ? 6 : 5 }
    );
  }
}

function emitClimaxDropRing(boss: MoBossAdapter, emitter: MoBulletEmitter, statScale: number): void {
  const count = 16;
  const dmg = Number((4.8 * statScale).toFixed(1));
  for (let k = 0; k < count; k++) {
    const a = (Math.PI * 2 * k) / count;
    emitter.spawn(
      boss.x,
      boss.y,
      a,
      165 * statScale,
      5.2,
      5.0,
      dmg,
      k % 2 === 0 ? 0xfde047 : 0xff2b5b,
      { angularVel: k % 2 === 0 ? 0.55 : -0.55 }
    );
  }
}

function releasePreviousWave(state: MoBossRuntimeState, emitter: MoBulletEmitter, stagger = 0.016): void {
  if (state.heldWaveTag !== null && emitter.releaseHeld) {
    emitter.releaseHeld(state.heldWaveTag, stagger);
  }
  state.heldWaveTag = null;
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

  state.battleTime = (state.battleTime || 0) + dt;

  if (state.mode === 'intro') {
    state.timer += dt;
    boss.isInvulnerable = true;
    const dur = state.introDuration || MO_INTRO_DURATION;
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
      resetMoCycleForPhase(state, phase, false);
    }
    return;
  }

  boss.moIntroActive = false;
  boss.isInvulnerable = false;

  if (state.lastPhaseSeen !== phase) {
    releasePreviousWave(state, emitter, 0.01);
    resetMoCycleForPhase(state, phase, false);
  }

  const tempo = getMoTempoProfile(state.battleTime);
  state.tempoSection = tempo.section;
  const scaledDt = dt * tempo.tempoScale;
  const bulletTempo = tempo.bulletTempo;

  if (!state.dropTriggered && state.battleTime >= 75.8) {
    state.dropTriggered = true;
    releasePreviousWave(state, emitter, 0.008);
    emitClimaxDropRing(boss, emitter, statScale);
  }

  const diffBonus = statScale >= 1.2 ? 2 : statScale >= 1.08 ? 1 : 0;
  const summonCount = phase >= 5 ? 1 + (diffBonus > 0 ? 1 : 0) : phase >= 4 ? diffBonus : diffBonus >= 2 ? 1 : 0;
  if (onSpawnKamikaze && summonCount > 0) {
    state.summonTimer += scaledDt;
    const summonInterval = Math.max(5.8, 8.2 - phase * 0.4);
    if (state.summonTimer >= summonInterval) {
      state.summonTimer = 0;
      const maxActive = Math.min(3, 1 + diffBonus);
      for (let k = 0; k < summonCount; k++) {
        onSpawnKamikaze(phase, maxActive, statScale);
      }
    }
  }

  if (state.mode === 'telegraph') {
    state.timer += scaledDt;
    const telegraphDur = Math.max(0.50, (0.76 - phase * 0.045) / Math.sqrt(statScale));

    if (state.dashChain.length === 0) {
      const built = buildDynamicBurst(boss, state, phase, playerPos);
      state.shapeKind = built.shapeKind;
      state.dashChain = built.chain;
    }

    const first = state.dashChain[0];
    boss.angle = Math.atan2(first.y2 - first.y1, first.x2 - first.x1);
    boss.moDashState = 'telegraph';

    const prog = Number(Math.min(1, state.timer / telegraphDur).toFixed(2));
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

    if (state.timer >= telegraphDur) {
      releasePreviousWave(state, emitter, Math.max(0.01, (0.02 - phase * 0.0015) / Math.max(0.6, tempo.tempoScale)));
      state.waveCounter += 1;
      state.activeWaveTag = state.waveCounter;
      state.mode = 'dashing';
      state.segIndex = 0;
      state.timer = 0;
      state.wakeDistAccum = 0;
      state.wakeNodeIndex = 0;
      state.dashHitPlayers = new Set<string>();
    }
    return;
  }

  if (state.mode === 'dashing') {
    const seg = state.dashChain[state.segIndex];
    if (!seg) {
      state.heldWaveTag = state.activeWaveTag;
      state.mode = 'telegraph';
      state.timer = 0;
      state.dashChain = [];
      return;
    }

    const segLen = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) || 1;
    const speed = (seg.speed || 860) * statScale;
    const segDur = seg.isCurve
      ? Math.max(0.025, Math.min(0.28, segLen / speed))
      : Math.max(0.20, Math.min(0.56, segLen / speed));
    const prevX = boss.x;
    const prevY = boss.y;

    state.timer += scaledDt;
    const rawT = Math.min(1, state.timer / segDur);
    const ease = seg.isCurve
      ? rawT
      : rawT < 0.5
        ? 2 * rawT * rawT
        : 1 - Math.pow(-2 * rawT + 2, 2) / 2;

    boss.x = seg.x1 + (seg.x2 - seg.x1) * ease;
    boss.y = seg.y1 + (seg.y2 - seg.y1) * ease;
    const segAngle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
    boss.angle = segAngle;
    boss.moDashState = 'dashing';

    boss.moDashLines = state.dashChain
      .filter((_s, idx) => idx >= state.segIndex)
      .map((s, relIdx) => ({
        x1: relIdx === 0 ? Math.round(boss.x) : s.x1,
        y1: relIdx === 0 ? Math.round(boss.y) : s.y1,
        x2: s.x2,
        y2: s.y2,
        progress: relIdx === 0 ? Number(rawT.toFixed(2)) : 0,
        active: relIdx === 0,
        completed: false,
        isReturn: Boolean(s.isReturn),
      }));

    if (!seg.isReturn) {
      const spacingPx = seg.kind === 'halo_ring' ? 62 : Math.max(54, 66 - phase * 2);
      const deltaDist = Math.hypot(boss.x - prevX, boss.y - prevY);
      state.wakeDistAccum += deltaDist;
      while (state.wakeDistAccum >= spacingPx && deltaDist > 0.01) {
        const backDist = state.wakeDistAccum - spacingPx;
        const u = Math.max(0, Math.min(1, 1 - backDist / deltaDist));
        const wx = prevX + (boss.x - prevX) * u;
        const wy = prevY + (boss.y - prevY) * u;
        state.wakeNodeIndex += 1;
        emitHeldWakeNode(state, seg, wx, wy, segAngle, emitter, statScale, bulletTempo);
        state.wakeDistAccum -= spacingPx;
      }
    }

    if (!seg.isReturn || rawT < 0.7) {
      for (let s = 1; s <= 5; s++) {
        const st = s / 5;
        onContactDamage(
          prevX + (boss.x - prevX) * st,
          prevY + (boss.y - prevY) * st,
          30,
          14,
          state.dashHitPlayers
        );
      }
    }

    if (rawT >= 1) {
      const overshoot = seg.isCurve ? Math.min(scaledDt * 0.9, Math.max(0, state.timer - segDur)) : 0;
      boss.x = seg.x2;
      boss.y = seg.y2;
      const isFinalSegment = state.segIndex >= state.dashChain.length - 1;
      if (!seg.isReturn && (!seg.isCurve || isFinalSegment)) {
        emitCornerAimedBurst(seg, playerPos, emitter, statScale, phase, bulletTempo);
      }
      state.segIndex += 1;
      state.timer = overshoot;
      if (!seg.isCurve) {
        state.dashHitPlayers = new Set<string>();
      }

      if (state.segIndex >= state.dashChain.length) {
        state.heldWaveTag = state.activeWaveTag;
        state.burstIndex += 1;
        state.dashChain = [];
        state.timer = 0;

        if (state.burstIndex < state.totalBursts) {
          state.mode = 'telegraph';
        } else {
          releasePreviousWave(state, emitter, 0.015);
          state.mode = 'resting';
          state.restDuration = Math.max(1.2, 1.75 - phase * 0.10);
          state.restShotAccum = 0;
          boss.moDashLines = [];
        }
      }
    }
    return;
  }

  state.timer += scaledDt;
  boss.moDashState = 'resting';
  boss.moDashLines = [];

  const targetHoverX = MO_HOME_X;
  const targetHoverY = clampY((playerPos?.y ?? MO_HOME_Y) * 0.45 + MO_HOME_Y * 0.55);
  boss.x += (targetHoverX - boss.x) * Math.min(1, scaledDt * 4.2);
  boss.y += (targetHoverY - boss.y) * Math.min(1, scaledDt * 4.2);
  if (playerPos) {
    boss.angle = Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x);
  }

  state.restShotAccum += scaledDt;
  const restShotInterval = Math.max(0.56, 0.82 - phase * 0.045);
  if (state.restShotAccum >= restShotInterval) {
    state.restShotAccum = 0;
    const aim = playerPos ? Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x) : Math.PI;
    const count = 5 + phase;
    const speed = (175 + phase * 10) * statScale * bulletTempo;
    for (let k = 0; k < count; k++) {
      const a = aim + (Math.PI * 2 * k) / count;
      emitter.spawn(
        boss.x,
        boss.y,
        a,
        speed,
        4.6,
        4.2,
        Number((4.5 * statScale).toFixed(1)),
        k === 0 ? 0xff2b5b : 0xef4444,
        { spriteType: k % 2 === 0 ? 'MObullet1png' : 'MObullet3png' }
      );
    }
  }

  if (state.timer >= (state.restDuration || 1.4)) {
    state.volleyIndex += 1;
    state.burstIndex = 0;
    state.totalBursts = getTotalBurstsForPhase(phase);
    state.mode = 'telegraph';
    state.timer = 0;
    state.dashChain = [];
    state.segIndex = 0;
  }
}

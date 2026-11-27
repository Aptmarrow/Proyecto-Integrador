'use strict';

/**
 * Boss 3-3: M.O. (Mechanical Ophanim) — 5-Shape Geometric Predator Tackle Engine.
 *
 * Each phase owns an unmistakable geometric tackle silhouette + purpose-built bullet behavior:
 *  - P1 "Guadaña Lunar" (crescent_arc): Giant curved Crescent Arc (☾) sweeping through player ->
 *    wake expands in cyan then snaps shut like Converging Scythe Jaws (`turnAbsAngle`, crimson).
 *  - P2 "Serpiente Sinusoidal" (sine_serpent): Full-arena Sinusoidal S-Wave (∿) centered on player ->
 *    wake erupts vertically as cyan pillars then snaps EXACT 90° (`turnAbsAngle`) into crimson horizontal lanes.
 *  - P3 "Pinball Cazador" (pinball_snipe): Lightning single-line 4-wall ricochet piercing player ->
 *    wake orbs FREEZE DEAD in mid-air pulsing red (`freezeAfter`/`freezeDur`) then SNAP-SNIPE live player (`snapToPlayer`).
 *  - P4 "Lemniscata Infinita" (infinity_loop): True C1-continuous Figure-8 Infinity Loop (∞) ->
 *    wake blooms into smooth counter-rotating curved galaxy spiral arms (`angularVel`).
 *  - P5 "Ojo del Trono" (ophanim_halo): Alternates full 360° Circular Ophanim Halo (◎) encircling player
 *    with straight Cross Execution Lunges (✚) -> swirling spiral vortex (`angularVel`) + Freeze->Red Lock-On Sniper Eyes!
 */

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const MO_HOME_X = 640;
const MO_HOME_Y = 300;
const ARENA_PAD_X = 64;
const ARENA_PAD_Y = 62;

const MO_PHASE_DEFS = [
  {
    name: 'Fase 1 "Guadaña Lunar"',
    pattern: 'mo_hunt_p1',
    shootInterval: 0.5,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Sello Ophanim "Serpiente Sinusoidal"',
    pattern: 'mo_hunt_p2',
    shootInterval: 0.45,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Fase 3 "Pinball Cazador"',
    pattern: 'mo_hunt_p3',
    shootInterval: 0.4,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Protocolo Serafín "Lemniscata Infinita"',
    pattern: 'mo_hunt_p4',
    shootInterval: 0.35,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 9.5,
  },
  {
    name: 'Protocolo Final "MECHANICAL OPHANIM · OJO DEL TRONO"',
    pattern: 'mo_hunt_p5',
    shootInterval: 0.3,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 8.5,
  },
];

function clampX(x) {
  return Math.round(Math.max(ARENA_PAD_X, Math.min(WORLD_WIDTH - ARENA_PAD_X, x)));
}

function clampY(y) {
  return Math.round(Math.max(ARENA_PAD_Y, Math.min(WORLD_HEIGHT - ARENA_PAD_Y, y)));
}

/**
 * Project a ray from (sx, sy) passing straight through (tx, ty) until it slams into the inner arena wall.
 */
function extendThroughTarget(sx, sy, tx, ty, minTravel = 320) {
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
  const tryT = (t) => {
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

  // If the target sat pinned against the exact same wall M.O. started on, force a dramatic cross-arena lunge
  if (Math.hypot(ex - sx, ey - sy) < 240) {
    const farX = sx < WORLD_WIDTH * 0.5 ? WORLD_WIDTH - ARENA_PAD_X : ARENA_PAD_X;
    const farY = clampY(ty + (sy < MO_HOME_Y ? 120 : -120));
    return { x: farX, y: farY };
  }
  return { x: ex, y: ey };
}

/**
 * Convert an array of 2D polyline points into chained micro-segments.
 */
function pointsToChain(points, kind, speed, isCurve = true, extra = null) {
  const chain = [];
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
      ...(extra || {}),
    });
  }
  return chain;
}

function createInitialMoState(introDuration = 3.8) {
  return {
    mode: 'intro', // 'intro' | 'telegraph' | 'dashing' | 'resting'
    timer: 0,
    introDuration: introDuration || 3.8,
    volleyIndex: 0,
    burstIndex: 0,
    totalBursts: 4,
    flipY: 1,
    shapeKind: 'crescent_arc',
    waveCounter: 1,
    activeWaveTag: 1,
    heldWaveTag: null,
    dashChain: [],
    segIndex: 0,
    wakeDistAccum: 0,
    wakeNodeIndex: 0,
    dashHitPlayers: new Set(),
    restDuration: 1.0,
    restShotAccum: 0,
    summonTimer: 3.0,
    lastPhaseSeen: 1,
    targetSnapX: 180,
    targetSnapY: MO_HOME_Y,
    shapeCenterX: 400,
    shapeCenterY: MO_HOME_Y,
    shapeFaceLeft: true,
    shapeSpin: 1,
  };
}

function getTotalBurstsForPhase(phase) {
  if (phase === 3) return 6; // Pinball rapid 6-bounce frenzy
  if (phase >= 5) return 6; // 3x (360° Halo + Cross Execution)
  if (phase === 4) return 5; // 5 lobes of ∞
  return 4;
}

function resetMoCycleForPhase(state, phase) {
  state.mode = 'telegraph';
  state.timer = 0;
  state.burstIndex = 0;
  state.totalBursts = getTotalBurstsForPhase(phase);
  state.dashChain = [];
  state.segIndex = 0;
  state.wakeDistAccum = 0;
  state.wakeNodeIndex = 0;
  state.dashHitPlayers = new Set();
  state.restShotAccum = 0;
  state.heldWaveTag = null;
  state.lastPhaseSeen = phase;
}

function buildMoKamikazeSpec(phase, statScale = 1.0, playerPos = null) {
  const edge = Math.floor(Math.random() * 3);
  const pad = 42;
  const minFrontX = Math.min(WORLD_WIDTH - 40, Math.max(150, Math.round((playerPos?.x ?? 120) + 95)));
  let startX;
  let startY;
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
  return {
    type: 'mo_enemy2',
    sprite: '/assets/sprites/MOenemy2png.png',
    trajectory: 'kamikaze_homing',
    attackPattern: 'none',
    startX,
    startY,
    speed: Math.round((184 + phase * 8) * statScale),
    hp: Math.round(20 * statScale),
    radius: 18,
    scoreValue: 260,
    customParams: { fuseTime: 1.75, triggerDist: 130, statScale },
  };
}

/**
 * Dynamically project ONLY the next geometric tackle silhouette from M.O.'s LIVE position
 * directly engaging the player's LIVE `(px, py)` (Byakuren chained cadence).
 */
function buildDynamicBurst(boss, state, phase, playerPos) {
  const sx = clampX(boss.x);
  const sy = clampY(boss.y);
  const px = clampX(playerPos?.x ?? 180);
  const py = clampY(playerPos?.y ?? MO_HOME_Y);
  const bIdx = state.burstIndex;
  const f = (bIdx + state.volleyIndex) % 2 === 0 ? 1 : -1;
  state.flipY = f;
  state.targetSnapX = px;
  state.targetSnapY = py;

  // ── P1: GUADAÑA LUNAR (☾) — Giant Quadratic Bézier Crescent Arc sweeping straight through (px, py)! ──
  if (phase === 1) {
    const faceLeft = px < WORLD_WIDTH * 0.62;
    state.shapeFaceLeft = faceLeft;
    const ex = faceLeft ? clampX(615 + (bIdx % 2) * 45) : clampX(135 + (bIdx % 2) * 35);
    // Always arc cleanly across the full vertical span (top <-> bottom)
    const ey = sy < MO_HOME_Y ? WORLD_HEIGHT - 80 : 80;

    // Solve Bézier control point P1 so B(0.5) passes EXACTLY through (px, py)!
    const rawCx = 2 * px - 0.5 * (sx + ex);
    const rawCy = 2 * py - 0.5 * (sy + ey);
    const ctrlX = Math.max(-280, Math.min(WORLD_WIDTH + 280, rawCx));
    const ctrlY = Math.max(-120, Math.min(WORLD_HEIGHT + 120, rawCy));

    const steps = 10;
    const pts = [];
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
      chain: pointsToChain(pts, 'crescent_blade', 1120, true),
    };
  }

  // ── P2: SERPIENTE SINUSOIDAL (∿) — Full-Arena Sine Wave crossing straight through (px, py)! ──
  if (phase === 2) {
    const goingLeft = sx >= WORLD_WIDTH * 0.5;
    state.shapeFaceLeft = goingLeft;
    const endX = goingLeft ? ARENA_PAD_X + 12 : WORLD_WIDTH - ARENA_PAD_X - 12;
    const spanX = endX - sx || (goingLeft ? -560 : 560);
    const tPlayer = Math.max(0.22, Math.min(0.78, (px - sx) / spanX));
    // Tune wave frequency slightly around 1.5 cycles (3π) so a zero-crossing hits (px, py) directly!
    const halfWaves = Math.max(2, Math.round(tPlayer * 3));
    const omega = Math.max(2.3 * Math.PI, Math.min(3.5 * Math.PI, (halfWaves * Math.PI) / tPlayer));
    const amp = 128;

    const steps = 12;
    const pts = [];
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
      chain: pointsToChain(pts, 'sine_ribbon', 1240, true),
    };
  }

  // ── P3: PINBALL CAZADOR (⚡) — Blazing Single-Line Wall-Bounce Railgun piercing (px, py)! ──
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
          speed: 1380,
          isReturn: false,
          isCurve: false,
        },
      ],
    };
  }

  // ── P4: LEMNISCATA INFINITA (∞) — True C1-Continuous Figure-8 Infinity Loop (one full lobe per burst!) ──
  if (phase === 4) {
    const cx = 400;
    const cy = clampY(Math.max(195, Math.min(405, py)));
    // Start with the lobe containing the player on burst 0, then strictly alternate Left <-> Right lobes
    const startLeft = px <= cx;
    const isLeftLobe = bIdx % 2 === 0 ? startLeft : !startLeft;
    const loopDir = isLeftLobe ? -1 : 1;
    // Keep same spin sign across all bursts in a volley so Left -> Right -> Left is mathematically C1-smooth!
    const spin = state.volleyIndex % 2 === 0 ? 1 : -1;
    state.shapeSpin = spin * loopDir;
    state.shapeCenterX = cx;
    state.shapeCenterY = cy;

    const rx = isLeftLobe
      ? Math.max(185, Math.min(320, cx - Math.max(ARENA_PAD_X + 10, px - 12)))
      : Math.max(185, Math.min(315, Math.max(WORLD_WIDTH - ARENA_PAD_X - 20, px + 12) - cx));
    const maxRy = Math.min(cy - ARENA_PAD_Y - 8, WORLD_HEIGHT - ARENA_PAD_Y - 8 - cy);
    const ry = Math.max(125, Math.min(190, maxRy));

    const steps = 12;
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const theta = t * Math.PI;
      const idealX = cx + loopDir * rx * Math.sin(theta);
      const idealY = cy + spin * ry * Math.sin(2 * theta);
      // Smoothly blend initial start offset to 0 by t = 0.38 so far tip (t = 0.5) sweeps DEAD-ON through player!
      const startBlend = Math.pow(Math.max(0, 1 - t * 2.6), 2);
      const x = idealX + (sx - cx) * startBlend;
      const y = idealY + (sy - cy) * startBlend;
      pts.push({ x: clampX(x), y: clampY(y) });
    }
    return {
      shapeKind: 'infinity_loop',
      chain: pointsToChain(pts, 'infinity_lobe', 1320, true),
    };
  }

  // ── P5: OJO DEL TRONO (◎ + ✚) — Alternates Full 360° Ophanim Halo Circle & Cross Execution Kill-Lunge! ──
  if (bIdx % 2 === 0) {
    const cx = clampX(Math.max(210, Math.min(545, px + (px < 400 ? 35 : -35))));
    const cy = clampY(Math.max(195, Math.min(405, py)));
    const radius = 142;
    const spin = f;
    state.shapeCenterX = cx;
    state.shapeCenterY = cy;
    state.shapeSpin = spin;

    const entryAngle = Math.atan2(sy - cy, sx - cx);
    const entryX = clampX(cx + Math.cos(entryAngle) * radius);
    const entryY = clampY(cy + Math.sin(entryAngle) * radius);

    // 3 smooth entry micro-segments into the perimeter + 12 full 360° circular ring segments!
    const chain = [];
    if (Math.hypot(entryX - sx, entryY - sy) > 20) {
      const entryPts = [];
      for (let k = 0; k <= 3; k++) {
        const t = k / 3;
        entryPts.push({
          x: clampX(sx + (entryX - sx) * t),
          y: clampY(sy + (entryY - sy) * t),
        });
      }
      chain.push(...pointsToChain(entryPts, 'halo_entry', 1420, true));
    }

    const ringSteps = 12;
    const ringPts = [];
    for (let k = 0; k <= ringSteps; k++) {
      const a = entryAngle + (Math.PI * 2 * k * spin) / ringSteps;
      ringPts.push({
        x: clampX(cx + Math.cos(a) * radius),
        y: clampY(cy + Math.sin(a) * radius),
      });
    }
    chain.push(...pointsToChain(ringPts, 'halo_ring', 1360, true));
    return {
      shapeKind: 'ophanim_halo',
      chain,
    };
  }

  // Odd P5 bursts: ✚ Sharp Cross Execution Lunge piercing straight through (px, py) and waking the 360° Halo!
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
        speed: 1480,
        isReturn: false,
        isCurve: false,
      },
      {
        x1: exit1.x,
        y1: exit1.y,
        x2: exit2X,
        y2: exit2Y,
        kind: 'cross_slash',
        speed: 1460,
        isReturn: false,
        isCurve: false,
      },
    ],
  };
}

/**
 * Emit uniformly spaced suspended wake bullets (`holdTag: state.activeWaveTag`) along M.O.'s physical path.
 * Every phase uses a distinct, super-legible bullet mechanic (never random self-cancelling bends!).
 */
function emitHeldWakeNode(state, seg, x, y, segAngle, bulletSystem, statScale) {
  const dmg = Number((4.8 * statScale).toFixed(1));
  const nodeIdx = state.wakeNodeIndex;
  const tag = state.activeWaveTag;
  const holdOpts = { holdTag: tag, delay: 7.0 };

  const toPlayer = Math.atan2(state.targetSnapY - y, state.targetSnapX - x);
  const perpA = segAngle + Math.PI / 2;
  const perpB = segAngle - Math.PI / 2;
  const dotA = Math.cos(perpA - toPlayer);
  const towardPerp = dotA >= 0 ? perpA : perpB;
  const awayPerp = dotA >= 0 ? perpB : perpA;

  // ── P1 (☾ Crescent): Cyan expanding crescent -> Converging Crimson Scythe Jaws (`turnAbsAngle`)! ──
  if (seg.kind === 'crescent_blade') {
    const faceAngle = state.shapeFaceLeft ? Math.PI : 0;
    const isUpper = y < state.targetSnapY;
    // Upper jaw slams DOWN toward player's lane; lower jaw slams UP toward player's lane!
    const jawAngle = state.shapeFaceLeft
      ? (isUpper ? Math.PI - 0.36 : Math.PI + 0.36)
      : (isUpper ? 0.36 : -0.36);

    bulletSystem.spawn('boss', x, y, towardPerp, 155 * statScale, 5.2, 5.2, 'normal', dmg, 0x38bdf8, {
      ...holdOpts,
      turnAfter: 0.36,
      turnAbsAngle: jawAngle,
      turnSpeedMult: 1.52,
      turnColor: 0xff2b5b,
    });
    if (nodeIdx % 2 === 0) {
      bulletSystem.spawn('boss', x, y, faceAngle, 185 * statScale, 4.4, 4.8, 'normal', dmg, 0xfef08a, {
        ...holdOpts,
        spriteType: 'MObullet3png',
      });
    }
    return;
  }

  // ── P2 (∿ Sine Serpent): Pure Vertical Cyan Pillars -> EXACT 90° Fold into Crimson Horizontal Lanes! ──
  if (seg.kind === 'sine_ribbon') {
    const vertAngle = nodeIdx % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
    // Snap horizontally straight toward the player's X column!
    const horizAngle = x >= state.targetSnapX - 35 ? Math.PI : 0;
    bulletSystem.spawn('boss', x, y, vertAngle, 175 * statScale, 5.2, 5.4, 'normal', dmg, 0x38bdf8, {
      ...holdOpts,
      turnAfter: 0.38,
      turnAbsAngle: horizAngle,
      turnSpeedMult: 1.48,
      turnColor: 0xff2b5b,
    });
    if (nodeIdx % 2 === 0) {
      bulletSystem.spawn('boss', x, y, towardPerp, 225 * statScale, 4.5, 4.8, 'normal', dmg, 0xfef08a, {
        ...holdOpts,
        spriteType: 'MObullet3png',
      });
    }
    return;
  }

  // ── P3 (⚡ Pinball): Sakuya/Byakuren FREEZE DEAD IN MID-AIR pulsing Crimson -> SNAP-FIRE AT LIVE PLAYER! ──
  if (seg.kind === 'pinball_dash') {
    const spreadAng = nodeIdx % 2 === 0 ? towardPerp : awayPerp;
    const snapOffset = ((nodeIdx % 3) - 1) * 0.085;
    bulletSystem.spawn('boss', x, y, spreadAng, 165 * statScale, 5.2, 5.6, 'normal', dmg, 0x38bdf8, {
      ...holdOpts,
      freezeAfter: 0.24,
      freezeDur: 0.34,
      turnColor: 0xff2b5b,
      snapToPlayer: true,
      snapOffset,
      snapSpeed: 335 * statScale,
    });
    bulletSystem.spawn('boss', x, y, towardPerp, 245 * statScale, 4.4, 4.6, 'normal', dmg, 0xfef08a, {
      ...holdOpts,
      spriteType: 'MObullet3png',
    });
    return;
  }

  // ── P4 (∞ Figure-8): True Smooth Counter-Rotating Curved Galaxy Spiral Arms (`angularVel`)! ──
  if (seg.kind === 'infinity_lobe') {
    const spinDir = state.shapeSpin >= 0 ? 1 : -1;
    bulletSystem.spawn('boss', x, y, towardPerp, 195 * statScale, 5.0, 5.4, 'normal', dmg, 0xfde047, {
      ...holdOpts,
      angularVel: spinDir * 1.08,
    });
    bulletSystem.spawn('boss', x, y, awayPerp, 175 * statScale, 4.8, 5.4, 'normal', dmg, 0x38bdf8, {
      ...holdOpts,
      angularVel: -spinDir * 0.94,
    });
    return;
  }

  // ── P5 (◎ 360° Ophanim Halo): Swirling Golden Spiral Vortex + Every 3rd Eye is a Freeze->Red Lock-On Sniper! ──
  if (seg.kind === 'halo_entry') {
    return; // Only leave the pure, iconic 360° ring suspended around the player
  }
  if (seg.kind === 'halo_ring') {
    const spinDir = state.shapeSpin >= 0 ? 1 : -1;
    const toCenter = Math.atan2(state.shapeCenterY - y, state.shapeCenterX - x);
    // Golden vortex orbs contract & swirl inward like an Ophanim wheel!
    bulletSystem.spawn('boss', x, y, toCenter + spinDir * 0.62, 185 * statScale, 5.2, 5.6, 'normal', dmg, 0xfde047, {
      ...holdOpts,
      angularVel: spinDir * 0.96,
    });
    // Every 3rd Eye freezes crimson in space and snipes the player's live position!
    if (nodeIdx % 3 === 0) {
      bulletSystem.spawn('boss', x, y, toCenter + Math.PI, 145 * statScale, 5.2, 5.8, 'normal', dmg, 0x38bdf8, {
        ...holdOpts,
        freezeAfter: 0.22,
        freezeDur: 0.30,
        turnColor: 0xff2b5b,
        snapToPlayer: true,
        snapOffset: 0,
        snapSpeed: 345 * statScale,
      });
    }
    return;
  }

  // ── P5 (✚ Cross Execution Lunge): Exact 90° Grid-Fold Crimson Bars + Golden Needles! ──
  const horizFold = x >= state.targetSnapX - 30 ? Math.PI : 0;
  bulletSystem.spawn('boss', x, y, towardPerp, 210 * statScale, 5.0, 5.2, 'normal', dmg, 0x38bdf8, {
    ...holdOpts,
    turnAfter: 0.34,
    turnAbsAngle: horizFold,
    turnSpeedMult: 1.42,
    turnColor: 0xff2b5b,
  });
  bulletSystem.spawn('boss', x, y, awayPerp, 240 * statScale, 4.5, 4.6, 'normal', dmg, 0xfef08a, {
    ...holdOpts,
    spriteType: 'MObullet3png',
  });
}

/**
 * Odd-way aimed anti-safespot vertex burst (center bullet ALWAYS dead-center on player!).
 * Fires ONLY on sharp corners or burst endpoints (never spammed on intermediate curve micro-segments).
 */
function emitCornerAimedBurst(seg, playerPos, bulletSystem, statScale, phase) {
  const vx = seg.x2;
  const vy = seg.y2;
  const dmg = Number((5.0 * statScale).toFixed(1));
  const aim = playerPos ? Math.atan2(playerPos.y - vy, playerPos.x - vx) : Math.PI;

  const fanHalf = phase >= 5 ? 3 : phase >= 2 ? 2 : 1; // 3-way (P1), 5-way (P2-P4), 7-way (P5)
  const stepRad = phase >= 5 ? 0.18 : 0.21;
  const spd = (255 + phase * 12) * statScale;

  for (let k = -fanHalf; k <= fanHalf; k++) {
    bulletSystem.spawn(
      'boss',
      vx,
      vy,
      aim + k * stepRad,
      spd - Math.abs(k) * 14,
      5.0,
      4.2,
      'normal',
      dmg,
      0xef4444,
      { spriteType: 'MObullet1png' }
    );
  }

  // P4 (at center crossing of ∞) & P5 (at Cross Execution endpoints): throw a splitting MObullet4png boulder!
  if (phase >= 4 && (seg.kind === 'infinity_lobe' || seg.kind === 'cross_slash')) {
    bulletSystem.spawn(
      'boss',
      vx,
      vy,
      aim + (phase >= 5 ? 0 : 0.12),
      215 * statScale,
      11.0,
      5.5,
      'normal',
      Number((6.5 * statScale).toFixed(1)),
      0x9ca3af,
      { spriteType: 'MObullet4png', splitOnImpact: true, splitCount: phase >= 5 ? 8 : 6 }
    );
  }
}

function releasePreviousWave(state, bulletSystem, stagger = 0.012) {
  if (state.heldWaveTag !== null && typeof bulletSystem.releaseHeldBullets === 'function') {
    bulletSystem.releaseHeldBullets(state.heldWaveTag, stagger);
  }
  state.heldWaveTag = null;
}

/**
 * Main state machine tick for Boss 3-3: M.O. (Mechanical Ophanim).
 */
function updateMechanicalOphanim(
  boss,
  dt,
  playerPos,
  bulletSystem,
  emitPlayerContactDamage,
  emitSpawnEnemy = null
) {
  if (!boss._moState) {
    boss._moState = createInitialMoState(boss._introDuration || 3.8);
  }
  const state = boss._moState;
  const phase = Math.max(1, Math.min(5, boss.phase || 1));
  const statScale = boss._statScale || boss.statScale || 1.0;

  // 1. Intro sequence ("MECHANICAL OPHANIM" -> "M.O.")
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
    releasePreviousWave(state, bulletSystem, 0.008);
    resetMoCycleForPhase(state, phase);
  }

  // Tactical MOenemy2 kamikaze summons on Difficult / No Mercy (or P5)
  const diffBonus = statScale >= 1.2 ? 2 : statScale >= 1.08 ? 1 : 0;
  const summonCount = phase >= 5 ? 1 + diffBonus : phase >= 4 ? diffBonus : diffBonus >= 2 ? 1 : 0;
  if (typeof emitSpawnEnemy === 'function' && summonCount > 0) {
    state.summonTimer = (state.summonTimer ?? 2.8) + dt;
    const summonInterval = Math.max(4.6, 7.0 - phase * 0.4);
    if (state.summonTimer >= summonInterval) {
      state.summonTimer = 0;
      const maxActive = Math.min(4, 1 + diffBonus);
      for (let k = 0; k < summonCount; k++) {
        emitSpawnEnemy(buildMoKamikazeSpec(phase, statScale, playerPos), maxActive);
      }
    }
  }

  // 2. SNAPPY TELEGRAPH OF ONLY THE NEXT GEOMETRIC SHAPE (Byakuren cadence!)
  if (state.mode === 'telegraph') {
    state.timer += dt;
    const telegraphDur = Math.max(0.30, (0.48 - phase * 0.03) / Math.sqrt(statScale));

    if (!Array.isArray(state.dashChain) || state.dashChain.length === 0) {
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
      // BYAKUREN MAGIC: Launching Burst K releases Burst K-1's frozen wake in domino cascade!
      releasePreviousWave(state, bulletSystem, Math.max(0.008, 0.015 - phase * 0.001));

      state.waveCounter += 1;
      state.activeWaveTag = state.waveCounter;
      state.mode = 'dashing';
      state.segIndex = 0;
      state.timer = 0;
      state.wakeDistAccum = 0;
      state.wakeNodeIndex = 0;
      state.dashHitPlayers = new Set();
    }
    return;
  }

  // 3. HIGH-SPEED GEOMETRIC TACKLE (physically runs over player if they don't dodge!)
  if (state.mode === 'dashing') {
    const chain = state.dashChain || [];
    const seg = chain[state.segIndex];
    if (!seg) {
      state.heldWaveTag = state.activeWaveTag;
      state.mode = 'telegraph';
      state.timer = 0;
      state.dashChain = [];
      return;
    }

    const segLen = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) || 1;
    const speed = (seg.speed || 1240) * statScale;
    const segDur = seg.isCurve
      ? Math.max(0.02, Math.min(0.24, segLen / speed))
      : Math.max(0.15, Math.min(0.46, segLen / speed));
    const prevX = boss.x;
    const prevY = boss.y;

    state.timer += dt;
    const rawT = Math.min(1, state.timer / segDur);
    // Curved polylines glide at constant supersonic velocity; straight slashes snap with ease-in-out!
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

    // Dynamically unzip the glowing trail right behind M.O.'s wheels!
    boss.moDashLines = chain
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

    // Uniform arc-length suspended wake emission along BOTH smooth curves and straight slashes!
    if (!seg.isReturn) {
      const spacingPx = seg.kind === 'halo_ring' ? 48 : 45;
      const deltaDist = Math.hypot(boss.x - prevX, boss.y - prevY);
      state.wakeDistAccum += deltaDist;
      while (state.wakeDistAccum >= spacingPx && deltaDist > 0.01) {
        const backDist = state.wakeDistAccum - spacingPx;
        const u = Math.max(0, Math.min(1, 1 - backDist / deltaDist));
        const wx = prevX + (boss.x - prevX) * u;
        const wy = prevY + (boss.y - prevY) * u;
        state.wakeNodeIndex += 1;
        emitHeldWakeNode(state, seg, wx, wy, segAngle, bulletSystem, statScale);
        state.wakeDistAccum -= spacingPx;
      }
    }

    // Sub-sampled contact damage (large spiked roller body WILL crush stationary players!)
    if (typeof emitPlayerContactDamage === 'function' && (!seg.isReturn || rawT < 0.7)) {
      for (let s = 1; s <= 5; s++) {
        const st = s / 5;
        emitPlayerContactDamage(
          prevX + (boss.x - prevX) * st,
          prevY + (boss.y - prevY) * st,
          38,
          16,
          state.dashHitPlayers
        );
      }
    }

    if (rawT >= 1) {
      const overshoot = seg.isCurve ? Math.min(dt * 0.9, Math.max(0, state.timer - segDur)) : 0;
      boss.x = seg.x2;
      boss.y = seg.y2;

      const isFinalSegment = state.segIndex >= chain.length - 1;
      if (!seg.isReturn && (!seg.isCurve || isFinalSegment)) {
        emitCornerAimedBurst(seg, playerPos, bulletSystem, statScale, phase);
      }
      state.segIndex += 1;
      state.timer = overshoot;
      if (!seg.isCurve) {
        state.dashHitPlayers = new Set();
      }

      if (state.segIndex >= chain.length) {
        state.heldWaveTag = state.activeWaveTag;
        state.burstIndex += 1;
        state.dashChain = [];
        state.timer = 0;

        if (state.burstIndex < state.totalBursts) {
          state.mode = 'telegraph';
        } else {
          releasePreviousWave(state, bulletSystem, 0.012);
          state.mode = 'resting';
          state.restDuration = Math.max(0.85, 1.3 - phase * 0.08);
          state.restShotAccum = 0;
          boss.moDashLines = [];
        }
      }
    }
    return;
  }

  // 4. BRIEF ACTIVE RECOVERY HOVER (glides back right while firing odd-way aimed anti-safespot rings!)
  state.timer += dt;
  boss.moDashState = 'resting';
  boss.moDashLines = [];

  const targetHoverX = MO_HOME_X;
  const targetHoverY = clampY((playerPos?.y ?? MO_HOME_Y) * 0.45 + MO_HOME_Y * 0.55);
  boss.x += (targetHoverX - boss.x) * Math.min(1, dt * 4.8);
  boss.y += (targetHoverY - boss.y) * Math.min(1, dt * 4.8);
  if (playerPos) {
    boss.angle = Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x);
  }

  state.restShotAccum += dt;
  const restShotInterval = Math.max(0.38, 0.62 - phase * 0.04);
  if (state.restShotAccum >= restShotInterval) {
    state.restShotAccum = 0;
    const aim = playerPos ? Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x) : Math.PI;
    const count = 5 + phase * 2; // Odd count (7..15) aimed dead-center on player!
    const speed = (220 + phase * 12) * statScale;
    for (let k = 0; k < count; k++) {
      const a = aim + (Math.PI * 2 * k) / count;
      bulletSystem.spawn(
        'boss',
        boss.x,
        boss.y,
        a,
        speed,
        4.8,
        4.0,
        'normal',
        Number((4.8 * statScale).toFixed(1)),
        k === 0 ? 0xff2b5b : 0xef4444,
        { spriteType: k % 2 === 0 ? 'MObullet1png' : 'MObullet3png' }
      );
    }
  }

  if (state.timer >= (state.restDuration || 1.0)) {
    state.volleyIndex += 1;
    state.burstIndex = 0;
    state.totalBursts = getTotalBurstsForPhase(phase);
    state.mode = 'telegraph';
    state.timer = 0;
    state.dashChain = [];
    state.segIndex = 0;
  }
}

module.exports = {
  MO_HOME_X,
  MO_HOME_Y,
  MO_PHASE_DEFS,
  createInitialMoState,
  resetMoCycleForPhase,
  buildMoKamikazeSpec,
  updateMechanicalOphanim,
};

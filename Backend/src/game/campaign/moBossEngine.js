'use strict';

/**
 * Boss 3-3: M.O. (Mechanical Ophanim) — 5-Shape Geometric Predator Tackle Engine.
 *
 * Rhythm & Fairness Design:
 *  - Encounter clock (`battleTime`) drives a dynamic tempo envelope:
 *      0.0s ..  9.6s : Cinematic intro reveal ("MECHANICAL OPHANIM" -> "M.O.", lock-in at ~6.7s)
 *      9.6s .. 69.5s : Steady combat tempo (1.00x)
 *     69.5s .. 75.8s : Dramatic Ritardando slowdown (dips to 0.54x around 72.5s..74.2s)
 *     75.8s .. 82.0s : Heavy Drop shockwave + Accelerando (1.14x -> 1.28x)
 *     82.0s .. 89.5s : Peak Climax Rush (1.32x)
 *     89.5s .. 93.5s : Smooth Normalization back to 1.00x
 *  - Fair human-readable telegraph windows (0.54s..0.72s), crisp wake spacing, and readable bullet speeds
 *    across 5 unmistakable geometric silhouettes (☾, ∿, ⚡ Pinball, ∞, ◎ + ✚).
 */

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const MO_HOME_X = 640;
const MO_HOME_Y = 300;
const MO_INTRO_DURATION = 9.6;
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

/**
 * Dynamic tempo envelope driven by live encounter clock `battleTime` (in seconds).
 */
function getMoTempoProfile(battleTime) {
  const t = Math.max(0, Number(battleTime) || 0);
  if (t < 69.5) {
    return { tempoScale: 1.0, bulletTempo: 1.0, section: 'steady' };
  }
  // 1:09.5 -> 1:12.5: Dramatic ritardando slowdown (1.00x -> 0.54x)
  if (t < 72.5) {
    const u = (t - 69.5) / 3.0;
    const ease = u * u * (3 - 2 * u);
    const s = 1.0 - 0.46 * ease;
    return { tempoScale: s, bulletTempo: 0.68 + 0.32 * s, section: 'ritardando' };
  }
  // 1:12.5 -> 1:14.2: Heavy slow trough (~0.54x suspended tension)
  if (t < 74.2) {
    return { tempoScale: 0.54, bulletTempo: 0.82, section: 'ritardando_trough' };
  }
  // 1:14.2 -> 1:15.8: Recovery swell building back into the heavy drop
  if (t < 75.8) {
    const u = (t - 74.2) / 1.6;
    const s = 0.54 + 0.38 * u;
    return { tempoScale: s, bulletTempo: 0.72 + 0.28 * s, section: 'recovery' };
  }
  // 1:15.8 -> 1:22.0: Heavy drop + accelerando surge (1.14x -> 1.28x)
  if (t < 82.0) {
    const u = (t - 75.8) / 6.2;
    const s = 1.14 + 0.14 * u;
    return { tempoScale: s, bulletTempo: 0.96 + 0.14 * u, section: 'accelerando' };
  }
  // 1:22.0 -> 1:29.5: Peak climax rush (1.32x maximum energy)
  if (t < 89.5) {
    return { tempoScale: 1.32, bulletTempo: 1.14, section: 'climax' };
  }
  // 1:29.5 -> 1:33.5: Smooth normalization back to steady rhythm (1.32x -> 1.00x)
  if (t < 93.5) {
    const u = (t - 89.5) / 4.0;
    const ease = u * u * (3 - 2 * u);
    const s = 1.32 - 0.32 * ease;
    return { tempoScale: s, bulletTempo: 1.14 - 0.14 * ease, section: 'normalize' };
  }
  return { tempoScale: 1.0, bulletTempo: 1.0, section: 'steady' };
}

function clampX(x) {
  return Math.round(Math.max(ARENA_PAD_X, Math.min(WORLD_WIDTH - ARENA_PAD_X, x)));
}

function clampY(y) {
  return Math.round(Math.max(ARENA_PAD_Y, Math.min(WORLD_HEIGHT - ARENA_PAD_Y, y)));
}

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

  if (Math.hypot(ex - sx, ey - sy) < 240) {
    const farX = sx < WORLD_WIDTH * 0.5 ? WORLD_WIDTH - ARENA_PAD_X : ARENA_PAD_X;
    const farY = clampY(ty + (sy < MO_HOME_Y ? 120 : -120));
    return { x: farX, y: farY };
  }
  return { x: ex, y: ey };
}

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

function getTotalBurstsForPhase(phase) {
  if (phase >= 3) return 4; // P3: 4 crisp pinballs, P4: 2 full ∞ cycles, P5: 2x (◎ + ✚)
  return 3; // P1 & P2: 3 sweeping curves before recovery window
}

function createInitialMoState(introDuration = MO_INTRO_DURATION) {
  return {
    mode: 'intro', // 'intro' | 'telegraph' | 'dashing' | 'resting'
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
    dashHitPlayers: new Set(),
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

function resetMoCycleForPhase(state, phase, jumpClockToPhase = false) {
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
  if (jumpClockToPhase) {
    const phaseNominalSec = [10.0, 26.0, 42.0, 58.0, 71.0];
    state.battleTime = phaseNominalSec[Math.max(0, Math.min(4, phase - 1))] || 10.0;
    state.dropTriggered = state.battleTime >= 75.8;
  }
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
    speed: Math.round((165 + phase * 6) * statScale),
    hp: Math.round(18 * statScale),
    radius: 18,
    scoreValue: 260,
    customParams: { fuseTime: 1.9, triggerDist: 125, statScale },
  };
}

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

  // ── P1: GUADAÑA LUNAR (☾) — Giant Quadratic Bézier Crescent Arc sweeping through (px, py) ──
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
      chain: pointsToChain(pts, 'crescent_blade', 760, true),
    };
  }

  // ── P2: SERPIENTE SINUSOIDAL (∿) — Full-Arena Sine Wave centered on player Y ──
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
      chain: pointsToChain(pts, 'sine_ribbon', 820, true),
    };
  }

  // ── P3: PINBALL CAZADOR (⚡) — Single-Line Wall-Bounce Railgun piercing (px, py) ──
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

  // ── P4: LEMNISCATA INFINITA (∞) — True C1-Continuous Figure-8 Infinity Loop ──
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
    const pts = [];
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

  // ── P5: OJO DEL TRONO (◎ + ✚) — Alternates Full 360° Circular Halo & Cross Execution Lunge ──
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
      chain.push(...pointsToChain(entryPts, 'halo_entry', 960, true));
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

function emitHeldWakeNode(state, seg, x, y, segAngle, bulletSystem, statScale, bulletTempo) {
  const dmg = Number((4.5 * statScale).toFixed(1));
  const spdScale = statScale * bulletTempo;
  const nodeIdx = state.wakeNodeIndex;
  const tag = state.activeWaveTag;
  const holdOpts = { holdTag: tag, delay: 8.5 };

  const toPlayer = Math.atan2(state.targetSnapY - y, state.targetSnapX - x);
  const perpA = segAngle + Math.PI / 2;
  const perpB = segAngle - Math.PI / 2;
  const dotA = Math.cos(perpA - toPlayer);
  const towardPerp = dotA >= 0 ? perpA : perpB;
  const awayPerp = dotA >= 0 ? perpB : perpA;

  // ── P1 (☾ Crescent): Cyan expanding crescent -> Converging Crimson Scythe Jaws ──
  if (seg.kind === 'crescent_blade') {
    const faceAngle = state.shapeFaceLeft ? Math.PI : 0;
    const isUpper = y < state.targetSnapY;
    const jawAngle = state.shapeFaceLeft
      ? (isUpper ? Math.PI - 0.34 : Math.PI + 0.34)
      : (isUpper ? 0.34 : -0.34);

    bulletSystem.spawn('boss', x, y, towardPerp, 125 * spdScale, 5.0, 5.4, 'normal', dmg, 0x38bdf8, {
      ...holdOpts,
      turnAfter: 0.44 / Math.max(0.65, bulletTempo),
      turnAbsAngle: jawAngle,
      turnSpeedMult: 1.44,
      turnColor: 0xff2b5b,
    });
    if (nodeIdx % 3 === 0) {
      bulletSystem.spawn('boss', x, y, faceAngle, 155 * spdScale, 4.2, 4.8, 'normal', dmg, 0xfef08a, {
        ...holdOpts,
        spriteType: 'MObullet3png',
      });
    }
    return;
  }

  // ── P2 (∿ Sine Serpent): Pure Vertical Cyan Pillars -> EXACT 90° Fold into Crimson Horizontal Lanes ──
  if (seg.kind === 'sine_ribbon') {
    const vertAngle = nodeIdx % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
    const horizAngle = x >= state.targetSnapX - 35 ? Math.PI : 0;
    bulletSystem.spawn('boss', x, y, vertAngle, 138 * spdScale, 5.0, 5.6, 'normal', dmg, 0x38bdf8, {
      ...holdOpts,
      turnAfter: 0.44 / Math.max(0.65, bulletTempo),
      turnAbsAngle: horizAngle,
      turnSpeedMult: 1.42,
      turnColor: 0xff2b5b,
    });
    if (nodeIdx % 3 === 0) {
      bulletSystem.spawn('boss', x, y, towardPerp, 180 * spdScale, 4.3, 4.8, 'normal', dmg, 0xfef08a, {
        ...holdOpts,
        spriteType: 'MObullet3png',
      });
    }
    return;
  }

  // ── P3 (⚡ Pinball): Clear FREEZE DEAD IN MID-AIR pulsing Crimson (0.46s) -> SNAP-FIRE AT PLAYER ──
  if (seg.kind === 'pinball_dash') {
    const spreadAng = nodeIdx % 2 === 0 ? towardPerp : awayPerp;
    const snapOffset = ((nodeIdx % 3) - 1) * 0.11;
    bulletSystem.spawn('boss', x, y, spreadAng, 132 * spdScale, 5.0, 5.8, 'normal', dmg, 0x38bdf8, {
      ...holdOpts,
      freezeAfter: 0.28,
      freezeDur: 0.46 / Math.max(0.7, bulletTempo),
      turnColor: 0xff2b5b,
      snapToPlayer: true,
      snapOffset,
      snapSpeed: 248 * spdScale,
    });
    if (nodeIdx % 2 === 0) {
      bulletSystem.spawn('boss', x, y, towardPerp, 195 * spdScale, 4.2, 4.6, 'normal', dmg, 0xfef08a, {
        ...holdOpts,
        spriteType: 'MObullet3png',
      });
    }
    return;
  }

  // ── P4 (∞ Figure-8): Smooth Counter-Rotating Curved Galaxy Spiral Arms ──
  if (seg.kind === 'infinity_lobe') {
    const spinDir = state.shapeSpin >= 0 ? 1 : -1;
    bulletSystem.spawn('boss', x, y, towardPerp, 152 * spdScale, 4.8, 5.6, 'normal', dmg, 0xfde047, {
      ...holdOpts,
      angularVel: spinDir * 0.88 * bulletTempo,
    });
    if (nodeIdx % 2 === 0) {
      bulletSystem.spawn('boss', x, y, awayPerp, 138 * spdScale, 4.6, 5.6, 'normal', dmg, 0x38bdf8, {
        ...holdOpts,
        angularVel: -spinDir * 0.78 * bulletTempo,
      });
    }
    return;
  }

  // ── P5 (◎ 360° Ophanim Halo): Golden Spiral Vortex + Every 4th Eye is a Freeze->Lock-On Sniper ──
  if (seg.kind === 'halo_entry') {
    return;
  }
  if (seg.kind === 'halo_ring') {
    const spinDir = state.shapeSpin >= 0 ? 1 : -1;
    const toCenter = Math.atan2(state.shapeCenterY - y, state.shapeCenterX - x);
    bulletSystem.spawn('boss', x, y, toCenter + spinDir * 0.65, 146 * spdScale, 5.0, 5.8, 'normal', dmg, 0xfde047, {
      ...holdOpts,
      angularVel: spinDir * 0.82 * bulletTempo,
    });
    if (nodeIdx % 4 === 0) {
      bulletSystem.spawn('boss', x, y, toCenter + Math.PI, 120 * spdScale, 5.0, 5.8, 'normal', dmg, 0x38bdf8, {
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

  // ── P5 (✚ Cross Execution Lunge): Exact 90° Grid-Fold Crimson Bars + Golden Needles ──
  const horizFold = x >= state.targetSnapX - 30 ? Math.PI : 0;
  bulletSystem.spawn('boss', x, y, towardPerp, 158 * spdScale, 4.8, 5.4, 'normal', dmg, 0x38bdf8, {
    ...holdOpts,
    turnAfter: 0.38 / Math.max(0.65, bulletTempo),
    turnAbsAngle: horizFold,
    turnSpeedMult: 1.38,
    turnColor: 0xff2b5b,
  });
  if (nodeIdx % 2 === 0) {
    bulletSystem.spawn('boss', x, y, awayPerp, 190 * spdScale, 4.3, 4.6, 'normal', dmg, 0xfef08a, {
      ...holdOpts,
      spriteType: 'MObullet3png',
    });
  }
}

function emitCornerAimedBurst(seg, playerPos, bulletSystem, statScale, phase, bulletTempo) {
  const vx = seg.x2;
  const vy = seg.y2;
  const dmg = Number((4.8 * statScale).toFixed(1));
  const aim = playerPos ? Math.atan2(playerPos.y - vy, playerPos.x - vx) : Math.PI;

  const fanHalf = phase >= 4 ? 2 : 1; // 3-way (P1-P3), 5-way (P4-P5) — readable & zero safespot!
  const stepRad = phase >= 4 ? 0.24 : 0.26;
  const spd = (195 + phase * 10) * statScale * bulletTempo;

  for (let k = -fanHalf; k <= fanHalf; k++) {
    bulletSystem.spawn(
      'boss',
      vx,
      vy,
      aim + k * stepRad,
      spd - Math.abs(k) * 12,
      4.8,
      4.4,
      'normal',
      dmg,
      0xef4444,
      { spriteType: 'MObullet1png' }
    );
  }

  if (phase >= 4 && (seg.kind === 'infinity_lobe' || seg.kind === 'cross_slash')) {
    bulletSystem.spawn(
      'boss',
      vx,
      vy,
      aim + 0.14,
      175 * statScale * bulletTempo,
      10.5,
      5.5,
      'normal',
      Number((6.0 * statScale).toFixed(1)),
      0x9ca3af,
      { spriteType: 'MObullet4png', splitOnImpact: true, splitCount: phase >= 5 ? 6 : 5 }
    );
  }
}

function emitClimaxDropRing(boss, bulletSystem, statScale) {
  const count = 16;
  const dmg = Number((4.8 * statScale).toFixed(1));
  for (let k = 0; k < count; k++) {
    const a = (Math.PI * 2 * k) / count;
    bulletSystem.spawn(
      'boss',
      boss.x,
      boss.y,
      a,
      165 * statScale,
      5.2,
      5.0,
      'normal',
      dmg,
      k % 2 === 0 ? 0xfde047 : 0xff2b5b,
      { angularVel: k % 2 === 0 ? 0.55 : -0.55 }
    );
  }
}

function releasePreviousWave(state, bulletSystem, stagger = 0.016) {
  if (state.heldWaveTag !== null && typeof bulletSystem.releaseHeldBullets === 'function') {
    bulletSystem.releaseHeldBullets(state.heldWaveTag, stagger);
  }
  state.heldWaveTag = null;
}

function updateMechanicalOphanim(
  boss,
  dt,
  playerPos,
  bulletSystem,
  emitPlayerContactDamage,
  emitSpawnEnemy = null
) {
  if (!boss._moState) {
    boss._moState = createInitialMoState(boss._introDuration || MO_INTRO_DURATION);
  }
  const state = boss._moState;
  const phase = Math.max(1, Math.min(5, boss.phase || 1));
  const statScale = boss._statScale || boss.statScale || 1.0;

  // Encounter master clock ALWAYS advances in real time to stay locked to the musical timeline!
  state.battleTime = (state.battleTime || 0) + dt;

  // 1. Intro sequence (~9.6s: "MECHANICAL OPHANIM" -> lock-in "M.O." at ~6.7s -> battle drop at 9.6s!)
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
    releasePreviousWave(state, bulletSystem, 0.01);
    resetMoCycleForPhase(state, phase, false);
  }

  // Evaluate live musical tempo curve (steady -> 1:10 ritardando -> 1:16 drop/accelerando -> 1:22 climax -> 1:30 normalize)
  const tempo = getMoTempoProfile(state.battleTime);
  state.tempoSection = tempo.section;
  const scaledDt = dt * tempo.tempoScale;
  const bulletTempo = tempo.bulletTempo;

  // One-shot musical drop burst right at t = 75.8s (1:15.8) when the heavy climax kicks in!
  if (!state.dropTriggered && state.battleTime >= 75.8) {
    state.dropTriggered = true;
    releasePreviousWave(state, bulletSystem, 0.008);
    emitClimaxDropRing(boss, bulletSystem, statScale);
  }

  // Tactical MOenemy2 kamikaze summons (Difficult / No Mercy, or sparing single drone on P5)
  const diffBonus = statScale >= 1.2 ? 2 : statScale >= 1.08 ? 1 : 0;
  const summonCount = phase >= 5 ? 1 + (diffBonus > 0 ? 1 : 0) : phase >= 4 ? diffBonus : diffBonus >= 2 ? 1 : 0;
  if (typeof emitSpawnEnemy === 'function' && summonCount > 0) {
    state.summonTimer = (state.summonTimer ?? 3.5) + scaledDt;
    const summonInterval = Math.max(5.8, 8.2 - phase * 0.4);
    if (state.summonTimer >= summonInterval) {
      state.summonTimer = 0;
      const maxActive = Math.min(3, 1 + diffBonus);
      for (let k = 0; k < summonCount; k++) {
        emitSpawnEnemy(buildMoKamikazeSpec(phase, statScale, playerPos), maxActive);
      }
    }
  }

  // 2. READABLE TELEGRAPH OF NEXT GEOMETRIC SHAPE (expands in ritardando, tightens in climax!)
  if (state.mode === 'telegraph') {
    state.timer += scaledDt;
    const telegraphDur = Math.max(0.50, (0.76 - phase * 0.045) / Math.sqrt(statScale));

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
      releasePreviousWave(state, bulletSystem, Math.max(0.01, (0.02 - phase * 0.0015) / Math.max(0.6, tempo.tempoScale)));

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

  // 3. GEOMETRIC TACKLE (speed smoothly follows tempoScale: slow & dramatic at 1:10, blazing at 1:22!)
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
        emitHeldWakeNode(state, seg, wx, wy, segAngle, bulletSystem, statScale, bulletTempo);
        state.wakeDistAccum -= spacingPx;
      }
    }

    // Fair physical contact hitbox (30px core radius — matches M.O. body cleanly without phantom clips!)
    if (typeof emitPlayerContactDamage === 'function' && (!seg.isReturn || rawT < 0.7)) {
      for (let s = 1; s <= 5; s++) {
        const st = s / 5;
        emitPlayerContactDamage(
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

      const isFinalSegment = state.segIndex >= chain.length - 1;
      if (!seg.isReturn && (!seg.isCurve || isFinalSegment)) {
        emitCornerAimedBurst(seg, playerPos, bulletSystem, statScale, phase, bulletTempo);
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
          releasePreviousWave(state, bulletSystem, 0.015);
          state.mode = 'resting';
          state.restDuration = Math.max(1.2, 1.75 - phase * 0.10);
          state.restShotAccum = 0;
          boss.moDashLines = [];
        }
      }
    }
    return;
  }

  // 4. CLEAN ACTIVE RECOVERY HOVER (gives human players a real DPS window while staying alert!)
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
    const count = 5 + phase; // 6..10 bullets (center bullet always aimed on player!)
    const speed = (175 + phase * 10) * statScale * bulletTempo;
    for (let k = 0; k < count; k++) {
      const a = aim + (Math.PI * 2 * k) / count;
      bulletSystem.spawn(
        'boss',
        boss.x,
        boss.y,
        a,
        speed,
        4.6,
        4.2,
        'normal',
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

module.exports = {
  MO_HOME_X,
  MO_HOME_Y,
  MO_INTRO_DURATION,
  MO_PHASE_DEFS,
  getMoTempoProfile,
  createInitialMoState,
  resetMoCycleForPhase,
  buildMoKamikazeSpec,
  updateMechanicalOphanim,
};

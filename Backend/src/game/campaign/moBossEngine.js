'use strict';

/**
 * Boss 3-3: M.O. (Mechanical Ophanim) — Chained Predator Tackle Engine (Byakuren × Konngara).
 *
 * Design pillars:
 *  1. Real physical threat: every combo directly hunts `(player.x, player.y)` all the way across the arena.
 *  2. Chained dynamic telegraph (Byakuren style): M.O. ONLY telegraphs the next 1-2 slash lines at a time.
 *     When M.O. launches Burst K, all frozen suspended wake bullets from Burst K-1 ripple awake in cascade
 *     and snap-bend mid-flight (`turnAfter`) while M.O.'s spiked body hurtles at the player's new position.
 *  3. Overwhelming, multi-layered danmaku density with zero safespots (odd-way aimed spears + live tracking).
 */

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const MO_HOME_X = 640;
const MO_HOME_Y = 300;
const ARENA_PAD_X = 64;
const ARENA_PAD_Y = 62;

const MO_PHASE_DEFS = [
  {
    name: 'Fase 1 "Escuadra Cazadora"',
    pattern: 'mo_hunt_p1',
    shootInterval: 0.5,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Sello Ophanim "Zig-Zag de Byakuren"',
    pattern: 'mo_hunt_p2',
    shootInterval: 0.45,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Fase 3 "Estrella Depredadora"',
    pattern: 'mo_hunt_p3',
    shootInterval: 0.4,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Protocolo Serafín "Tijera y Guillotina"',
    pattern: 'mo_hunt_p4',
    shootInterval: 0.35,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 9.5,
  },
  {
    name: 'Protocolo Final "MECHANICAL OPHANIM · TORMENTA GEOMÉTRICA"',
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
 * Project a ray from (sx, sy) passing directly through (tx, ty) until it hits the inner arena perimeter
 * so M.O. physically pierces straight through the player's position without getting stuck on top of them.
 */
function extendThroughTarget(sx, sy, tx, ty, minTravel = 260) {
  let dx = tx - sx;
  let dy = ty - sy;
  let dist = Math.hypot(dx, dy);
  if (dist < 25) {
    dx = sx > WORLD_WIDTH * 0.5 ? -1 : 1;
    dy = sy > WORLD_HEIGHT * 0.5 ? -0.35 : 0.35;
    dist = Math.hypot(dx, dy);
  }
  const ux = dx / dist;
  const uy = dy / dist;

  let bestT = Infinity;
  const tryT = (t) => {
    if (t > 40 && t < bestT) bestT = t;
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
  return {
    x: clampX(sx + ux * travel),
    y: clampY(sy + uy * travel),
  };
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
    shapeKind: 'l_hook',
    waveCounter: 1,
    activeWaveTag: 1,
    heldWaveTag: null,
    dashChain: [],
    segIndex: 0,
    segProgressLastEmit: 0,
    dashHitPlayers: new Set(),
    restDuration: 1.0,
    restShotAccum: 0,
    summonTimer: 3.0,
    lastPhaseSeen: 1,
    targetSnapX: 180,
    targetSnapY: MO_HOME_Y,
  };
}

function resetMoCycleForPhase(state, phase) {
  state.mode = 'telegraph';
  state.timer = 0;
  state.burstIndex = 0;
  state.totalBursts = phase >= 5 ? 6 : phase >= 2 ? 5 : 4;
  state.dashChain = [];
  state.segIndex = 0;
  state.segProgressLastEmit = 0;
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
 * Dynamically project ONLY the next 1 or 2 lethal slash segments from M.O.'s LIVE position
 * straight through or pinching the player's LIVE `(px, py)` (Byakuren-style chained hunting!).
 */
function buildDynamicBurst(boss, state, phase, playerPos) {
  const sx = clampX(boss.x);
  const sy = clampY(boss.y);
  const px = clampX(playerPos?.x ?? 180);
  const py = clampY(playerPos?.y ?? MO_HOME_Y);
  const bIdx = state.burstIndex;
  const f = ((bIdx + state.volleyIndex) % 2 === 0 ? 1 : -1);
  state.flipY = f;
  state.targetSnapX = px;
  state.targetSnapY = py;

  // ── P1: RIGHT-ANGLE `L`-HOOKS (aligns to player Y/X -> 90° snap STRAIGHT THROUGH player!) ──
  if (phase === 1) {
    const cornerX = sx > WORLD_WIDTH * 0.5 ? clampX(sx - 25) : clampX(WORLD_WIDTH - 130);
    const cornerY = clampY(py);
    const throughX = sx > px ? ARENA_PAD_X : WORLD_WIDTH - ARENA_PAD_X;
    // If M.O. is already near left side, hook vertically through player then slash back right!
    if (sx < WORLD_WIDTH * 0.42) {
      const midX = clampX(px);
      const midY = py > MO_HOME_Y ? ARENA_PAD_Y + 20 : WORLD_HEIGHT - ARENA_PAD_Y - 20;
      return {
        shapeKind: 'l_hook',
        chain: [
          { x1: sx, y1: sy, x2: midX, y2: py, kind: 'hook_hunt', speed: 1080, isReturn: false },
          { x1: midX, y1: py, x2: WORLD_WIDTH - 120, y2: midY, kind: 'hook_slash', speed: 1120, isReturn: false },
        ],
      };
    }
    return {
      shapeKind: 'l_hook',
      chain: [
        { x1: sx, y1: sy, x2: cornerX, y2: cornerY, kind: 'hook_wall', speed: 1020, isReturn: false },
        { x1: cornerX, y1: cornerY, x2: throughX, y2: cornerY, kind: 'hook_hunt', speed: 1180, isReturn: false },
      ],
    };
  }

  // ── P2: BYAKUREN AIMED `V` / ZIG-ZAG (pierces straight through player -> ricochets sharply!) ──
  if (phase === 2) {
    const end1 = extendThroughTarget(sx, sy, px, py, 300);
    // Ricochet sharply back into opposite vertical half so M.O. carves a lethal V-zigzag across the player!
    const bounceX = end1.x < WORLD_WIDTH * 0.5
      ? clampX(Math.max(460, px + 340))
      : clampX(Math.min(260, px - 60));
    const bounceY = end1.y < MO_HOME_Y
      ? clampY(WORLD_HEIGHT - 95 - (bIdx % 2) * 70)
      : clampY(95 + (bIdx % 2) * 70);
    return {
      shapeKind: 'byakuren_zigzag',
      chain: [
        { x1: sx, y1: sy, x2: end1.x, y2: end1.y, kind: 'zig_pierce', speed: 1220, isReturn: false },
        { x1: end1.x, y1: end1.y, x2: bounceX, y2: bounceY, kind: 'zig_ricochet', speed: 1260, isReturn: false },
      ],
    };
  }

  // ── P3: PREDATOR STAR CHORDS (1 blazing line at a time! Odd = direct through player, Even = boxing chord) ──
  if (phase === 3) {
    if (bIdx % 2 === 0) {
      const exit = extendThroughTarget(sx, sy, px, py, 340);
      return {
        shapeKind: 'predator_star',
        chain: [
          { x1: sx, y1: sy, x2: exit.x, y2: exit.y, kind: 'star_pierce', speed: 1320, isReturn: false },
        ],
      };
    }
    // Box the player with a steep star chord passing just ahead/above/below them
    const offsetY = py > MO_HOME_Y ? -120 : 120;
    const tx = clampX(sx < WORLD_WIDTH * 0.5 ? WORLD_WIDTH - 110 : px + 40);
    const ty = clampY(py + offsetY);
    const exit = extendThroughTarget(sx, sy, tx, ty, 320);
    return {
      shapeKind: 'predator_star',
      chain: [
        { x1: sx, y1: sy, x2: exit.x, y2: exit.y, kind: 'star_chord', speed: 1280, isReturn: false },
      ],
    };
  }

  // ── P4: GUILLOTINE & CROSS-SCISSOR (alternates steep diagonal X through player + horizontal guillotine!) ──
  if (phase === 4) {
    if (bIdx % 2 === 0) {
      // Steep diagonal X-scissor piercing right through player + counter-hook
      const exit1 = extendThroughTarget(sx, sy, px, py, 340);
      const exit2X = exit1.x < WORLD_WIDTH * 0.5 ? WORLD_WIDTH - 110 : ARENA_PAD_X + 20;
      const exit2Y = exit1.y < MO_HOME_Y ? WORLD_HEIGHT - 85 : 85;
      return {
        shapeKind: 'guillotine_scissor',
        chain: [
          { x1: sx, y1: sy, x2: exit1.x, y2: exit1.y, kind: 'scissor_pierce', speed: 1340, isReturn: false },
          { x1: exit1.x, y1: exit1.y, x2: exit2X, y2: exit2Y, kind: 'scissor_cut', speed: 1300, isReturn: false },
        ],
      };
    }
    // Horizontal Guillotine sweep locked dead-on player's Y!
    const destX = sx > px ? ARENA_PAD_X : WORLD_WIDTH - 110;
    return {
      shapeKind: 'guillotine_scissor',
      chain: [
        { x1: sx, y1: sy, x2: sx, y2: py, kind: 'guillotine_align', speed: 1260, isReturn: false },
        { x1: sx, y1: py, x2: destX, y2: py, kind: 'guillotine_sweep', speed: 1420, isReturn: false },
      ],
    };
  }

  // ── P5: FINAL STORM — Cycles Byakuren V-Zigzag, Direct Predator Pierce, and 90° Boxing Cage! ──
  const patternSlot = bIdx % 3;
  if (patternSlot === 0) {
    const exit1 = extendThroughTarget(sx, sy, px, py, 340);
    const bounceX = exit1.x < WORLD_WIDTH * 0.5 ? WORLD_WIDTH - 105 : ARENA_PAD_X + 20;
    const bounceY = exit1.y < MO_HOME_Y ? WORLD_HEIGHT - 85 : 85;
    return {
      shapeKind: 'final_storm',
      chain: [
        { x1: sx, y1: sy, x2: exit1.x, y2: exit1.y, kind: 'final_zig1', speed: 1420, isReturn: false },
        { x1: exit1.x, y1: exit1.y, x2: bounceX, y2: bounceY, kind: 'final_zig2', speed: 1440, isReturn: false },
      ],
    };
  }
  if (patternSlot === 1) {
    const exit = extendThroughTarget(sx, sy, px, py, 360);
    return {
      shapeKind: 'final_storm',
      chain: [
        { x1: sx, y1: sy, x2: exit.x, y2: exit.y, kind: 'final_lunge', speed: 1480, isReturn: false },
      ],
    };
  }
  // Tight 90° boxing hook trapping the player's side!
  const targetX = sx > px ? ARENA_PAD_X + 10 : WORLD_WIDTH - 110;
  return {
    shapeKind: 'final_storm',
    chain: [
      { x1: sx, y1: sy, x2: sx, y2: py, kind: 'final_cage1', speed: 1360, isReturn: false },
      { x1: sx, y1: py, x2: targetX, y2: py, kind: 'final_cage2', speed: 1460, isReturn: false },
    ],
  };
}

/**
 * Emit dense, multi-layered suspended wake bullets (`holdTag: state.activeWaveTag`) along M.O.'s physical tackle.
 * They hang frozen glowing along the exact slash scar until the NEXT tackle launches and wakes them in cascade!
 */
function emitHeldWakeNode(state, seg, u, bulletSystem, statScale, phase) {
  const dmg = Number((4.8 * statScale).toFixed(1));
  const x = seg.x1 + (seg.x2 - seg.x1) * u;
  const y = seg.y1 + (seg.y2 - seg.y1) * u;
  const segAngle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
  const f = state.flipY >= 0 ? 1 : -1;
  const tag = state.activeWaveTag;
  const holdOpts = { holdTag: tag, delay: 7.0 };

  // Direction biased toward player's snapped quadrant (never wasting bullets into empty right wall!)
  const toPlayer = Math.atan2(state.targetSnapY - y, state.targetSnapX - x);
  const perpA = segAngle + Math.PI / 2;
  const perpB = segAngle - Math.PI / 2;
  const dotA = Math.cos(perpA - toPlayer);
  const towardPerp = dotA >= 0 ? perpA : perpB;
  const awayPerp = dotA >= 0 ? perpB : perpA;

  // ── P1: L-Hook Konngara Wall + Bending Corridor ──
  if (seg.kind === 'hook_wall') {
    const distFromPlayerY = Math.abs(y - state.targetSnapY);
    // Narrow offset gap so player MUST sidestep into it rather than standing still
    const gapCenter = clampY(state.targetSnapY + f * 58);
    if (Math.abs(y - gapCenter) < 34) return;
    const isEdge = Math.abs(y - gapCenter) < 66;
    const sideSign = y < gapCenter ? -1 : 1;
    bulletSystem.spawnBullet(
      'boss',
      x,
      y,
      -210 * statScale,
      sideSign * 38 * statScale,
      isEdge ? 6.8 : 5.0,
      5.2,
      'normal',
      dmg,
      isEdge ? 0xfde047 : 0xfef9c3,
      { ...holdOpts, turnAfter: isEdge ? 0.45 : 0, turnAngle: f * 0.48, turnSpeedMult: 1.15, turnColor: 0xff2b5b }
    );
    if (distFromPlayerY < 32) {
      // Anti-safespot dart aimed right at where player stood!
      bulletSystem.spawn('boss', x, y, toPlayer, 255 * statScale, 5.0, 4.4, 'normal', dmg, 0xef4444, {
        ...holdOpts,
        spriteType: 'MObullet1png',
      });
    }
    return;
  }

  if (seg.kind === 'hook_hunt' || seg.kind === 'hook_slash') {
    // Double-layered cyan/gold curtain sweeping BOTH sides of M.O.'s slash and bending mid-flight!
    bulletSystem.spawn('boss', x, y, towardPerp, 215 * statScale, 5.0, 5.0, 'normal', dmg, 0x38bdf8, {
      ...holdOpts,
      turnAfter: 0.48,
      turnAngle: f * 0.56,
      turnSpeedMult: 1.16,
      turnColor: 0xff2b5b,
    });
    bulletSystem.spawn('boss', x, y, awayPerp, 170 * statScale, 4.5, 4.8, 'normal', dmg, 0xfef08a, {
      ...holdOpts,
      spriteType: 'MObullet3png',
    });
    return;
  }

  // ── P2: Byakuren Double-Layer Zig-Zag Scissors ──
  if (seg.kind === 'zig_pierce' || seg.kind === 'zig_ricochet') {
    const isPierce = seg.kind === 'zig_pierce';
    const twist = (isPierce ? 1 : -1) * f * 0.62;
    // Fast razor layer aimed across player side -> twists sharply!
    bulletSystem.spawn('boss', x, y, towardPerp + f * 0.18, 245 * statScale, 5.0, 5.0, 'normal', dmg, isPierce ? 0x38bdf8 : 0xfde047, {
      ...holdOpts,
      turnAfter: 0.42,
      turnAngle: twist,
      turnSpeedMult: 1.18,
      turnColor: 0xff2b5b,
    });
    // Counter-angled crossing layer weaving a dense diamond net!
    bulletSystem.spawn('boss', x, y, towardPerp - f * 0.34, 185 * statScale, 4.6, 5.0, 'normal', dmg, isPierce ? 0xfef9c3 : 0x38bdf8, {
      ...holdOpts,
      turnAfter: 0.52,
      turnAngle: -twist * 0.75,
      turnSpeedMult: 1.12,
      turnColor: 0xfde047,
    });
    return;
  }

  // ── P3: Predator Star Twin-Speed Expanding Curtain ──
  if (seg.kind === 'star_pierce' || seg.kind === 'star_chord') {
    // Fast piercing MObullet3 needle + slower curving golden orb on BOTH sides!
    bulletSystem.spawn('boss', x, y, towardPerp, 265 * statScale, 4.6, 4.8, 'normal', dmg, 0xfef08a, {
      ...holdOpts,
      spriteType: 'MObullet3png',
    });
    bulletSystem.spawn('boss', x, y, towardPerp + f * 0.24, 185 * statScale, 5.0, 5.2, 'normal', dmg, 0xfde047, {
      ...holdOpts,
      turnAfter: 0.46,
      turnAngle: -f * 0.58,
      turnSpeedMult: 1.18,
      turnColor: 0x38bdf8,
    });
    bulletSystem.spawn('boss', x, y, awayPerp, 195 * statScale, 4.6, 4.8, 'normal', dmg, 0x38bdf8, {
      ...holdOpts,
      turnAfter: 0.5,
      turnAngle: f * 0.45,
      turnSpeedMult: 1.12,
      turnColor: 0xff2b5b,
    });
    return;
  }

  // ── P4: Guillotine & Scissor Triple-Threat Wake ──
  if (seg.kind === 'scissor_pierce' || seg.kind === 'scissor_cut' || seg.kind === 'guillotine_align' || seg.kind === 'guillotine_sweep') {
    const isSweep = seg.kind === 'guillotine_sweep' || seg.kind === 'scissor_pierce';
    bulletSystem.spawn('boss', x, y, towardPerp, (isSweep ? 255 : 220) * statScale, 5.0, 5.0, 'normal', dmg, 0x38bdf8, {
      ...holdOpts,
      turnAfter: 0.4,
      turnAngle: f * 0.65,
      turnSpeedMult: 1.2,
      turnColor: 0xff2b5b,
    });
    bulletSystem.spawn('boss', x, y, awayPerp, 215 * statScale, 4.8, 5.0, 'normal', dmg, 0xfde047, {
      ...holdOpts,
      turnAfter: 0.44,
      turnAngle: -f * 0.58,
      turnSpeedMult: 1.15,
      turnColor: 0xef4444,
    });
    if (isSweep) {
      bulletSystem.spawn('boss', x, y, toPlayer, 260 * statScale, 4.5, 4.5, 'normal', dmg, 0xfef08a, {
        ...holdOpts,
        spriteType: 'MObullet3png',
      });
    }
    return;
  }

  // ── P5: FINAL GEOMETRIC STORM — Maximum Multi-Layer Ophanim Pressure! ──
  const twistAngle = f * 0.68;
  bulletSystem.spawn('boss', x, y, towardPerp + f * 0.16, 265 * statScale, 5.0, 5.2, 'normal', dmg, 0xfde047, {
    ...holdOpts,
    turnAfter: 0.38,
    turnAngle: twistAngle,
    turnSpeedMult: 1.22,
    turnColor: 0xff2b5b,
  });
  bulletSystem.spawn('boss', x, y, towardPerp - f * 0.24, 200 * statScale, 4.8, 5.2, 'normal', dmg, 0x38bdf8, {
    ...holdOpts,
    turnAfter: 0.46,
    turnAngle: -twistAngle,
    turnSpeedMult: 1.18,
    turnColor: 0xfef08a,
  });
  bulletSystem.spawn('boss', x, y, awayPerp, 225 * statScale, 4.6, 4.8, 'normal', dmg, 0xfef08a, {
    ...holdOpts,
    spriteType: 'MObullet3png',
  });
}

/**
 * Odd-way aimed anti-safespot vertex burst (center bullet ALWAYS dead-center on player!).
 * Fires immediately on corner impact so standing still guarantees getting clipped.
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

  // P4 & P5: throw a spinning MObullet4png splitting boulder on major bounce corners so wall-camping gets shattered!
  if (phase >= 4 && (seg.kind === 'scissor_cut' || seg.kind === 'guillotine_sweep' || seg.kind === 'final_zig2' || seg.kind === 'final_cage2')) {
    bulletSystem.spawn(
      'boss',
      vx,
      vy,
      aim + (phase >= 5 ? 0 : 0.14),
      210 * statScale,
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

  // 2. SNAPPY TELEGRAPH OF ONLY THE NEXT 1-2 LETHAL LINES (Byakuren cadence!)
  if (state.mode === 'telegraph') {
    state.timer += dt;
    const telegraphDur = Math.max(0.28, (0.46 - phase * 0.032) / Math.sqrt(statScale));

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
      // BYAKUREN MAGIC: The EXACT instant M.O. launches the new tackle,
      // the entire previous frozen wake erupts in a synchronized domino cascade!
      releasePreviousWave(state, bulletSystem, Math.max(0.008, 0.015 - phase * 0.001));

      state.waveCounter += 1;
      state.activeWaveTag = state.waveCounter;
      state.mode = 'dashing';
      state.segIndex = 0;
      state.timer = 0;
      state.segProgressLastEmit = 0;
      state.dashHitPlayers = new Set();
    }
    return;
  }

  // 3. HIGH-SPEED PREDATOR TACKLE (physically runs over player if they don't dodge!)
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
    const speed = (seg.speed || 1200) * statScale;
    const segDur = Math.max(0.15, Math.min(0.46, segLen / speed));
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

    boss.moDashLines = chain
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

    // Dense suspended wake beads right along M.O.'s physical path!
    if (!seg.isReturn) {
      const spacingPx = Math.max(32, 48 - phase * 3);
      const nodesPerSeg = Math.max(6, Math.min(16, Math.round(segLen / spacingPx)));
      const stepU = 1 / (nodesPerSeg + 1);
      while (state.segProgressLastEmit + stepU <= ease && state.segProgressLastEmit + stepU < 0.98) {
        state.segProgressLastEmit += stepU;
        emitHeldWakeNode(state, seg, state.segProgressLastEmit, bulletSystem, statScale, phase);
      }
    }

    // Sub-sampled contact damage (large spiked roller body WILL crush players who stand still!)
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
      boss.x = seg.x2;
      boss.y = seg.y2;
      if (!seg.isReturn) {
        emitCornerAimedBurst(seg, playerPos, bulletSystem, statScale, phase);
      }
      state.segIndex += 1;
      state.timer = 0;
      state.segProgressLastEmit = 0;
      state.dashHitPlayers = new Set();

      if (state.segIndex >= chain.length) {
        // Hold the bullets we just laid down so they erupt on the NEXT burst launch!
        state.heldWaveTag = state.activeWaveTag;
        state.burstIndex += 1;
        state.dashChain = [];

        if (state.burstIndex < state.totalBursts) {
          // Immediately telegraph the NEXT chained slash aimed at player's NEW live position!
          state.mode = 'telegraph';
        } else {
          // End of volley: release the last frozen wake + brief active recovery hover
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
    // Odd count aimed straight at player so staying motionless hits dead-center!
    const count = 5 + phase * 2; // 7 (P1) .. 15 (P5)
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
    state.totalBursts = phase >= 5 ? 6 : phase >= 2 ? 5 : 4;
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
  updateMechanicalOphanim,
};

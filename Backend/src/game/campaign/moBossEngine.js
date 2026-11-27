'use strict';

/**
 * Reworked Boss 3-3: M.O. (Mechanical Ophanim) — Konngara (Touhou 1) Right-Triangle Edition.
 *
 * Signature choreography across all 5 phases:
 *   Stroke 1 (Vertical leg `|`)     -> Spawns split barrier with a widening central gap.
 *   Stroke 2 (Horizontal leg `_`)   -> Forms 90° corner; twin parallel diagonal bullet rails
 *                                      sprout directly from the gap's edge bullets, carving a corridor.
 *   Stroke 3 (Hypotenuse `/`)       -> Closes the right triangle with a crimson-gold flash,
 *                                      twisting/redirecting the corridor angle at the last moment.
 */

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const MO_HOME_X = 648;
const MO_HOME_Y = 300;

const MO_PHASE_DEFS = [
  {
    name: 'Fase 1 "Cateto Axial"',
    pattern: 'mo_konngara_p1',
    shootInterval: 0.5,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Sello Konngara "Corredor del Triángulo Rectángulo"',
    pattern: 'mo_konngara_p2',
    shootInterval: 0.45,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Fase 3 "Sierra del Triángulo"',
    pattern: 'mo_konngara_p3',
    shootInterval: 0.4,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 0,
  },
  {
    name: 'Protocolo Serafín "Doble Corredor Inverso"',
    pattern: 'mo_konngara_p4',
    shootInterval: 0.35,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 9.0,
  },
  {
    name: 'Protocolo Final "MECHANICAL OPHANIM · TRIÁNGULO ETERNO"',
    pattern: 'mo_konngara_p5',
    shootInterval: 0.3,
    laserMode: 'none',
    laserInterval: 99,
    megaLaserInterval: 8.0,
  },
];

function createInitialMoState(introDuration = 3.8) {
  return {
    mode: 'intro', // 'intro' | 'triangle' | 'dash_telegraph' | 'dash_active' | 'resting'
    timer: 0,
    introDuration: introDuration || 3.8,
    cycleIndex: 0,
    flipY: 1,
    strokeStage: 0, // 0: vertical |, 1: horizontal _, 2: hypotenuse /, 3: hold/fade
    strokeTimer: 0,
    railEmitAccum: 0,
    railShotsLeft: 0,
    twistShotsLeft: 0,
    twistEmitAccum: 0,
    corridorAngle: Math.PI + 0.4,
    twistAngle: Math.PI - 0.46,
    gapY: MO_HOME_Y,
    upperAnchor: null, // { x, y, vx, vy }
    lowerAnchor: null, // { x, y, vx, vy }
    twistUpperPivot: null, // { x, y }
    twistLowerPivot: null, // { x, y }
    triA: { x: MO_HOME_X - 42, y: MO_HOME_Y - 78 },
    triB: { x: MO_HOME_X - 42, y: MO_HOME_Y + 78 },
    triC: { x: MO_HOME_X - 188, y: MO_HOME_Y + 78 },
    // Phase 3 physical Right-Triangle dash state
    dashChain: [],
    segIndex: 0,
    dashHitPlayers: new Set(),
    sparkAccum: 0,
    restDuration: 1.6,
    restShotAccum: 0,
    summonTimer: 3.0,
    lastPhaseSeen: 1,
  };
}

function resetMoCycleForPhase(state, phase) {
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
  state.dashHitPlayers = new Set();
  state.sparkAccum = 0;
  state.restShotAccum = 0;
  state.lastPhaseSeen = phase;
}

function buildMoKamikazeSpec(phase, statScale = 1.0, playerPos = null) {
  const edge = Math.floor(Math.random() * 3); // 0: right, 1: top, 2: bottom
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
    speed: Math.round((176 + phase * 8) * statScale),
    hp: Math.round(20 * statScale),
    radius: 18,
    scoreValue: 260,
    customParams: { fuseTime: 1.85, triggerDist: 130, statScale },
  };
}

/**
 * Compute M.O.'s glowing Right-Triangle vertices right in front of the boss.
 * Line 0 (A -> B): Vertical leg `|`
 * Line 1 (B -> C): Horizontal leg `_` (90° corner at B)
 * Line 2 (C -> A): Diagonal hypotenuse `/`
 */
function computeRightTriangleVertices(bx, by, flipY, scale = 1.0) {
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

/**
 * Phase 3 Physical Right-Triangle Dash Chain (strictly INSIDE the arena so M.O. stays shootable!).
 * Side 0 (`|`): Vertical cut on the right side
 * Side 1 (`_`): Horizontal slash across the arena (top or bottom based on flipY)
 * Side 2 (`/`): Diagonal hypotenuse slash returning back to the top/bottom right!
 */
function buildPhysicalRightTriangleDash(flipY, playerPos) {
  const rightX = 650;
  const leftX = Math.max(210, Math.min(320, Math.round((playerPos?.x ?? 200) + 85)));
  const topY = 118;
  const botY = WORLD_HEIGHT - 118;
  const A = { x: rightX, y: flipY > 0 ? topY : botY };
  const B = { x: rightX, y: flipY > 0 ? botY : topY };
  const C = { x: leftX, y: B.y };
  return [
    { x1: A.x, y1: A.y, x2: B.x, y2: B.y, isReturn: false }, // Vertical `|`
    { x1: B.x, y1: B.y, x2: C.x, y2: C.y, isReturn: false }, // Horizontal `_`
    { x1: C.x, y1: C.y, x2: A.x, y2: A.y, isReturn: false }, // Hypotenuse `/`
    { x1: A.x, y1: A.y, x2: MO_HOME_X, y2: MO_HOME_Y, isReturn: true }, // Glide to rest
  ];
}

/**
 * Stroke 1 (`|`): Spawn a split vertical wall near the right side with a widening central gap.
 * Mirrors Konngara's vertical-cut opening wall with two drifting sections.
 */
function fireStroke1SplitWall(boss, state, playerPos, bulletSystem, statScale, phase) {
  const dmg = Number((4.5 * statScale).toFixed(1));
  const rawPlayerY = playerPos?.y ?? MO_HOME_Y;
  // Bias gap near the player with slight alternating offset so player must read & move
  const offset = state.flipY * (phase >= 4 ? 42 : 28);
  const gapY = Math.max(175, Math.min(WORLD_HEIGHT - 175, rawPlayerY + offset));
  state.gapY = gapY;

  const spawnX = Math.max(540, boss.x - 32);
  const initialHalfGap = phase >= 4 ? 32 : 38;
  const bulletsPerSide = phase >= 4 ? 9 : 7;
  const spacing = 24;
  const wallSpeedX = -(148 + phase * 8) * statScale;
  const gapExpandVy = (34 + phase * 3) * statScale;

  // Store live motion of the two inner edge bullets (the exact "last bullets" of each section!)
  state.upperAnchor = {
    x: spawnX,
    y: gapY - initialHalfGap,
    vx: wallSpeedX,
    vy: -gapExpandVy,
  };
  state.lowerAnchor = {
    x: spawnX,
    y: gapY + initialHalfGap,
    vx: wallSpeedX,
    vy: gapExpandVy,
  };

  for (let k = 0; k < bulletsPerSide; k++) {
    const isEdge = k === 0;
    const uy = gapY - initialHalfGap - k * spacing;
    const ly = gapY + initialHalfGap + k * spacing;
    const radius = isEdge ? 7.2 : 5.2;
    const color = isEdge ? 0xfde047 : 0xfef9c3;

    if (uy >= 16 && uy <= WORLD_HEIGHT - 16) {
      bulletSystem.spawnBullet(
        'boss',
        spawnX,
        uy,
        wallSpeedX,
        -gapExpandVy,
        radius,
        5.5,
        'normal',
        dmg,
        color
      );
    }
    if (ly >= 16 && ly <= WORLD_HEIGHT - 16) {
      bulletSystem.spawnBullet(
        'boss',
        spawnX,
        ly,
        wallSpeedX,
        gapExpandVy,
        radius,
        5.5,
        'normal',
        dmg,
        color
      );
    }
  }

  // Phase 4 & 5: subtle flanking red darts from M.O.'s thrusters
  if (phase >= 4 && playerPos) {
    const aim = Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x);
    for (const off of [-0.36, 0.36]) {
      bulletSystem.spawn(
        'boss',
        boss.x - 20,
        boss.y,
        aim + off,
        225 * statScale,
        4.8,
        4.0,
        'normal',
        dmg,
        0xef4444,
        { spriteType: 'MObullet1png' }
      );
    }
  }
}

/**
 * Stroke 2 (`_`): Emit a bead pair from the live upper & lower gap-edge anchors
 * along parallel diagonal trajectories, forming Konngara's signature twin-rail corridor!
 */
function emitStroke2CorridorBead(state, bulletSystem, statScale, phase, isFirstBeat) {
  if (!state.upperAnchor || !state.lowerAnchor) return;
  const dmg = Number((4.5 * statScale).toFixed(1));
  const railSpeed = (242 + phase * 10) * statScale;
  const angle = state.corridorAngle;

  for (const anchor of [state.upperAnchor, state.lowerAnchor]) {
    if (anchor.x < 40 || anchor.x > WORLD_WIDTH - 20 || anchor.y < 14 || anchor.y > WORLD_HEIGHT - 14) {
      continue;
    }
    // First beat spawns a bright glowing white-cyan flash node at the exact edge bullet
    bulletSystem.spawn(
      'boss',
      anchor.x,
      anchor.y,
      angle,
      railSpeed,
      isFirstBeat ? 7.5 : 5.0,
      4.2,
      'normal',
      dmg,
      isFirstBeat ? 0x38bdf8 : 0xe0f2fe
    );
  }
}

/**
 * Stroke 3 (`/`): Hypotenuse closure!
 * Redirects / bends the corridor at the last moment from the live rail frontier pivots
 * onto the opposite diagonal hypotenuse slope, plus phase-specific flourishes.
 */
function emitStroke3TwistBead(state, bulletSystem, statScale, phase, isFirstBeat) {
  if (!state.twistUpperPivot || !state.twistLowerPivot) return;
  const dmg = Number((4.8 * statScale).toFixed(1));
  const twistSpeed = (268 + phase * 12) * statScale;
  const angle = state.twistAngle;

  for (const pivot of [state.twistUpperPivot, state.twistLowerPivot]) {
    if (pivot.x < 30 || pivot.x > WORLD_WIDTH - 20 || pivot.y < 14 || pivot.y > WORLD_HEIGHT - 14) {
      continue;
    }
    bulletSystem.spawn(
      'boss',
      pivot.x,
      pivot.y,
      angle,
      twistSpeed,
      isFirstBeat ? 7.8 : 5.0,
      4.0,
      'normal',
      dmg,
      isFirstBeat ? 0xff2b5b : 0xfde047,
      isFirstBeat ? null : { spriteType: 'MObullet3png' }
    );
  }
}

function fireHypotenuseFlourish(boss, state, playerPos, bulletSystem, statScale, phase) {
  const dmg = Number((5.0 * statScale).toFixed(1));
  const { triA, triC } = state;
  const hypoAngle = Math.atan2(triA.y - triC.y, triA.x - triC.x);

  // Phase 1: Clean diagonal sweep of MObullet3 sparks + aimed red triple shot (teaches the triangle)
  if (phase === 1) {
    for (let k = 0; k < 5; k++) {
      const u = (k + 0.5) / 5;
      const sx = triC.x + (triA.x - triC.x) * u;
      const sy = triC.y + (triA.y - triC.y) * u;
      const aim = playerPos ? Math.atan2(playerPos.y - sy, playerPos.x - sx) : Math.PI;
      bulletSystem.spawn(
        'boss',
        sx,
        sy,
        aim,
        210 * statScale,
        4.6,
        4.2,
        'normal',
        dmg,
        0xfef08a,
        { spriteType: 'MObullet3png' }
      );
    }
    return;
  }

  // Phase 2+: Seal the old Beat-2 exit gently behind the bend with crimson MObullet1 darts
  if (state.twistUpperPivot && state.twistLowerPivot) {
    const midX = (state.twistUpperPivot.x + state.twistLowerPivot.x) * 0.5;
    const midY = (state.twistUpperPivot.y + state.twistLowerPivot.y) * 0.5;
    // Slight lag dart along old corridor direction so straight-line camping gets nudged into the bent path
    bulletSystem.spawn(
      'boss',
      midX + 26,
      midY,
      state.corridorAngle,
      205 * statScale,
      5.0,
      3.5,
      'normal',
      dmg,
      0xef4444,
      { spriteType: 'MObullet1png' }
    );
  }

  // Phase 4: Extra hypotenuse blade wave perpendicular to the triangle hypotenuse
  if (phase === 4) {
    const normal = hypoAngle + (state.flipY > 0 ? Math.PI / 2 : -Math.PI / 2);
    const dirToLeft = Math.cos(normal) <= 0 ? normal : normal + Math.PI;
    for (let k = 1; k <= 4; k++) {
      const u = k / 5;
      const sx = triC.x + (triA.x - triC.x) * u;
      const sy = triC.y + (triA.y - triC.y) * u;
      bulletSystem.spawn(
        'boss',
        sx,
        sy,
        dirToLeft,
        215 * statScale,
        4.8,
        4.2,
        'normal',
        dmg,
        0xef4444,
        { spriteType: 'MObullet1png' }
      );
    }
  }

  // Phase 5: Mechanical Ophanim rotating gear ring + periodic splitting MObullet4 boulder!
  if (phase >= 5) {
    const ringCount = 12;
    const rot = (boss._animTimer || boss.animTimer || 0) * 1.1;
    for (let k = 0; k < ringCount; k++) {
      const a = rot + (Math.PI * 2 * k) / ringCount;
      bulletSystem.spawn(
        'boss',
        boss.x,
        boss.y,
        a,
        185 * statScale,
        4.8,
        4.2,
        'normal',
        dmg,
        k % 2 === 0 ? 0xef4444 : 0xfde047,
        { spriteType: k % 2 === 0 ? 'MObullet1png' : 'MObullet3png' }
      );
    }
    if (state.cycleIndex % 2 === 1 && playerPos) {
      const aim = Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x);
      bulletSystem.spawn(
        'boss',
        boss.x - 24,
        boss.y,
        aim,
        175 * statScale,
        11.5,
        5.5,
        'normal',
        Number((7 * statScale).toFixed(1)),
        0x9ca3af,
        { spriteType: 'MObullet4png', splitOnImpact: true, splitCount: 6 }
      );
    }
  }
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

  // 1. Intro sequence ("MECHANICAL OPHANIM" -> "M.O."), gliding smoothly to right-center arena
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

  // Detect phase transition cleanly (including Dev Lab instant phase jumps!)
  if (state.lastPhaseSeen !== phase) {
    resetMoCycleForPhase(state, phase);
  }

  // Light tactical MOenemy2 kamikaze summons only on higher difficulties or P4/P5
  const diffBonus = statScale >= 1.2 ? 2 : statScale >= 1.08 ? 1 : 0;
  const summonCount = phase >= 4 ? diffBonus : diffBonus >= 2 ? 1 : 0;
  if (typeof emitSpawnEnemy === 'function' && summonCount > 0) {
    state.summonTimer = (state.summonTimer ?? 2.5) + dt;
    const summonInterval = Math.max(4.8, 7.2 - phase * 0.4);
    if (state.summonTimer >= summonInterval) {
      state.summonTimer = 0;
      const maxActive = Math.min(4, 1 + diffBonus);
      for (let k = 0; k < summonCount; k++) {
        emitSpawnEnemy(buildMoKamikazeSpec(phase, statScale, playerPos), maxActive);
      }
    }
  }

  // ── PHASE 3 (and periodic P5): PHYSICAL RIGHT-TRIANGLE DASH INSIDE ARENA ──
  if (state.mode === 'dash_telegraph') {
    state.timer += dt;
    const duration = Math.max(0.75, 1.05 - phase * 0.04);
    if (!Array.isArray(state.dashChain) || state.dashChain.length === 0) {
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
      state.dashHitPlayers = new Set();
      state.sparkAccum = 0;
    }
    return;
  }

  if (state.mode === 'dash_active') {
    const chain = state.dashChain || [];
    const seg = chain[state.segIndex];
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

    // Leave crisp MObullet3png perpendicular wake sparks along the triangle sides
    state.sparkAccum += dt;
    const wakeInterval = Math.max(0.055, 0.085 - phase * 0.005);
    if (!seg.isReturn && state.sparkAccum >= wakeInterval) {
      state.sparkAccum = 0;
      const perpSpeed = 128 * statScale;
      for (const sgn of [-1, 1]) {
        bulletSystem.spawn(
          'boss',
          boss.x,
          boss.y,
          boss.angle + sgn * (Math.PI / 2),
          perpSpeed,
          4.4,
          4.2,
          'normal',
          Math.max(1, Math.round(4 * statScale)),
          0xfef08a,
          { spriteType: 'MObullet3png' }
        );
      }
    }

    // Sub-sampled contact damage
    if (typeof emitPlayerContactDamage === 'function' && (!seg.isReturn || rawT < 0.7)) {
      for (let s = 1; s <= 4; s++) {
        const st = s / 4;
        emitPlayerContactDamage(
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
      state.dashHitPlayers = new Set();
      state.sparkAccum = 0;
      if (state.segIndex >= chain.length) {
        state.mode = 'resting';
        state.restDuration = phase >= 5 ? 0.9 : 1.7;
        state.restShotAccum = 0;
        boss.moDashLines = [];
      }
    }
    return;
  }

  // ── BRIEF REST / REPOSITION BETWEEN CYCLES ────────────────────────────────
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

    // Phase 3 rest throws 2 spinning MObullet4png boulders that shatter on wall impact!
    if (phase === 3) {
      state.restShotAccum += dt;
      if (state.restShotAccum >= 0.75) {
        state.restShotAccum = 0;
        const aim = playerPos ? Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x) : Math.PI;
        for (const off of [-0.24, 0.24]) {
          bulletSystem.spawn(
            'boss',
            boss.x - 24,
            boss.y,
            aim + off,
            185 * statScale,
            11.0,
            5.5,
            'normal',
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

  // ── KONNGARA RIGHT-TRIANGLE CORRIDOR CYCLE (`|` -> `_` -> `/`) ────────────
  // Gentle figure-8 hover on the right side so M.O. is always visible and shootable
  const animT = boss._animTimer || boss.animTimer || 0;
  const targetX = MO_HOME_X + Math.cos(animT * 1.1) * 24;
  const targetY = MO_HOME_Y + Math.sin(animT * 1.45) * 68;
  boss.x += (targetX - boss.x) * Math.min(1, dt * 3.8);
  boss.y += (targetY - boss.y) * Math.min(1, dt * 3.8);
  if (playerPos) {
    boss.angle = Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x);
  }

  // Advance live gap-edge bullet anchors every frame
  if (state.upperAnchor) {
    state.upperAnchor.x += state.upperAnchor.vx * dt;
    state.upperAnchor.y += state.upperAnchor.vy * dt;
  }
  if (state.lowerAnchor) {
    state.lowerAnchor.x += state.lowerAnchor.vx * dt;
    state.lowerAnchor.y += state.lowerAnchor.vy * dt;
  }

  // Emit Beat-2 diagonal corridor rail stream from the live gap-edge anchors
  if (state.railShotsLeft > 0) {
    state.railEmitAccum += dt;
    const railStep = Math.max(0.036, 0.052 - phase * 0.002);
    while (state.railShotsLeft > 0 && state.railEmitAccum >= railStep) {
      state.railEmitAccum -= railStep;
      const isFirst = state.railShotsLeft === (phase >= 4 ? 10 : 8);
      emitStroke2CorridorBead(state, bulletSystem, statScale, phase, isFirst);
      state.railShotsLeft -= 1;
    }
  }

  // Emit Beat-3 last-moment twisted diagonal corridor from the mid-arena pivot nodes
  if (state.twistShotsLeft > 0) {
    state.twistEmitAccum += dt;
    const twistStep = Math.max(0.034, 0.048 - phase * 0.002);
    while (state.twistShotsLeft > 0 && state.twistEmitAccum >= twistStep) {
      state.twistEmitAccum -= twistStep;
      const isFirst = state.twistShotsLeft === (phase >= 4 ? 10 : 8);
      emitStroke3TwistBead(state, bulletSystem, statScale, phase, isFirst);
      state.twistShotsLeft -= 1;
    }
  }

  // Timing of the 3 Right-Triangle strokes (snappy Konngara rhythm)
  const stroke1Dur = Math.max(0.42, 0.56 - phase * 0.02); // Vertical `|`
  const stroke2Dur = Math.max(0.56, 0.72 - phase * 0.025); // Horizontal `_`
  const stroke3Dur = Math.max(0.52, 0.68 - phase * 0.025); // Hypotenuse `/`
  const holdDur = Math.max(0.45, 0.75 - phase * 0.05);

  if (state.strokeStage === 0 && state.strokeTimer === 0) {
    const verts = computeRightTriangleVertices(boss.x, boss.y, state.flipY, phase >= 4 ? 1.1 : 1.0);
    state.triA = verts.triA;
    state.triB = verts.triB;
    state.triC = verts.triC;
    fireStroke1SplitWall(boss, state, playerPos, bulletSystem, statScale, phase);
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
      // Compute parallel diagonal corridor angle slanting UP-LEFT or DOWN-LEFT
      const slant = phase >= 4 ? 0.44 : 0.36;
      state.corridorAngle = Math.PI + state.flipY * slant;
      state.railShotsLeft = phase >= 4 ? 10 : 8;
      state.railEmitAccum = 0.05; // Fire Beat 2 first bead immediately on Horizontal Cut!
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

      // Capture pivot nodes at the live gap-edge positions (now mid-arena!) for the last-moment twist!
      if (state.upperAnchor && state.lowerAnchor) {
        state.twistUpperPivot = { x: state.upperAnchor.x, y: state.upperAnchor.y };
        state.twistLowerPivot = { x: state.lowerAnchor.x, y: state.lowerAnchor.y };
      } else {
        state.twistUpperPivot = { x: 430, y: state.gapY - 58 };
        state.twistLowerPivot = { x: 430, y: state.gapY + 58 };
      }

      // Opposite diagonal hypotenuse twist!
      const twistSlant = phase >= 4 ? 0.50 : 0.44;
      state.twistAngle = Math.PI - state.flipY * twistSlant;
      if (phase >= 2) {
        state.twistShotsLeft = phase >= 4 ? 10 : 8;
        state.twistEmitAccum = 0.05; // Trigger immediate twist rail on Hypotenuse Cut!
      }
      fireHypotenuseFlourish(boss, state, playerPos, bulletSystem, statScale, phase);
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
    // Brief hold with faded triangle lines before starting next alternating right-triangle cycle
    const fade = Math.max(0, 1 - state.strokeTimer / Math.max(0.2, holdDur * 0.6));
    boss.moDashLines = fade > 0.08
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

module.exports = {
  MO_HOME_X,
  MO_HOME_Y,
  MO_PHASE_DEFS,
  createInitialMoState,
  resetMoCycleForPhase,
  updateMechanicalOphanim,
};

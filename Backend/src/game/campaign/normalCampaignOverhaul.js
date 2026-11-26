'use strict';

/**
 * Modular Normal-Difficulty Campaign Overhaul (Worlds 1, 2, 3).
 * Set ENABLE_NORMAL_OVERHAUL = false to revert Normal mode instantly to original behavior.
 */

const ENABLE_NORMAL_OVERHAUL = true;

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;

function getDifficultyStatScale(difficulty = 'normal') {
  if (difficulty === 'no_mercy') return 1.25;
  if (difficulty === 'difficult') return 1.1;
  return 1.0;
}

function getScaledMinibossDef(world, stage, difficulty = 'normal') {
  const base = MINIBOSS_DEFS[`${world}-${stage}`];
  if (!base) return null;
  const scale = getDifficultyStatScale(difficulty);
  return {
    ...base,
    hp: Math.round(base.hp * scale),
    speed: Math.round(base.speed * scale),
    shootInterval: Number((base.shootInterval / scale).toFixed(3)),
    customParams: { ...(base.customParams || {}), statScale: scale },
  };
}

const MINIBOSS_DEFS = {
  '1-1': {
    type: 'fb_mini2',
    sprite: '/assets/sprites/FBmini2png.png',
    minibossName: 'FBmini-02 · Bastión Lento',
    trajectory: 'miniboss_hover',
    attackPattern: 'fb_mini2_combo',
    startX: WORLD_WIDTH + 60,
    startY: 300,
    speed: 95,
    hp: 460,
    radius: 34,
    scoreValue: 5000,
    itemDrop: 'life_frag',
    shootInterval: 1.05,
    shootDelay: 0.4,
    bulletColor: 0x3b82f6,
    customParams: { hoverX: 590, ampY: 115, freqY: 1.1, moveStyle: 'vertical_sine' },
  },
  '1-2': {
    type: 'fb_mini1',
    sprite: '/assets/sprites/FBmini1png.png',
    minibossName: 'FBmini-01 · Rastreador #92',
    trajectory: 'miniboss_hover',
    attackPattern: 'fb_mini1_combo',
    startX: WORLD_WIDTH + 60,
    startY: 300,
    speed: 120,
    hp: 540,
    radius: 34,
    scoreValue: 6000,
    itemDrop: 'life_frag',
    shootInterval: 0.92,
    shootDelay: 0.35,
    bulletColor: 0xfacc15,
    customParams: { hoverX: 585, ampY: 135, freqY: 1.35, moveStyle: 'figure8' },
  },
  '2-1': {
    type: 'gfg_mini1',
    sprite: '/assets/sprites/GFGMini1png.png',
    minibossName: 'GFG Mini-01 · Cañón Escopeta',
    trajectory: 'miniboss_hover',
    attackPattern: 'gfg_mini1_shotgun',
    startX: WORLD_WIDTH + 60,
    startY: 300,
    speed: 110,
    hp: 620,
    radius: 34,
    scoreValue: 7000,
    itemDrop: 'life_frag',
    shootInterval: 1.05,
    shootDelay: 0.4,
    bulletColor: 0xff3b30,
    customParams: { hoverX: 595, ampY: 140, freqY: 1.25, moveStyle: 'diamond_drift' },
  },
  '2-2': {
    type: 'gfg_mini2',
    sprite: '/assets/sprites/GFGMini2png.png',
    minibossName: 'GFG Mini-02 · Ráfaga Táctica',
    trajectory: 'miniboss_hover',
    attackPattern: 'gfg_mini2_burst',
    startX: WORLD_WIDTH + 60,
    startY: 300,
    speed: 115,
    hp: 700,
    radius: 34,
    scoreValue: 8000,
    itemDrop: 'life_frag',
    shootInterval: 0.1,
    shootDelay: 0.4,
    bulletColor: 0xef4444,
    customParams: { hoverX: 605, ampY: 150, freqY: 1.4, moveStyle: 'arc_sway' },
  },
  '3-1': {
    type: 'mo_mini1',
    sprite: '/assets/sprites/MOmini1png.png',
    minibossName: 'MO Mini-01 · Titán Lítico',
    trajectory: 'miniboss_hover',
    attackPattern: 'mo_mini1_rocks',
    startX: WORLD_WIDTH + 60,
    startY: 300,
    speed: 95,
    hp: 780,
    radius: 36,
    scoreValue: 9000,
    itemDrop: 'life_frag',
    shootInterval: 1.45,
    shootDelay: 0.5,
    bulletColor: 0x9ca3af,
    customParams: { hoverX: 590, ampY: 115, freqY: 1.05, moveStyle: 'pendulum_guard' },
  },
  '3-2': {
    type: 'mo_mini2',
    sprite: '/assets/sprites/MOmini2png.png',
    minibossName: 'MO Mini-02 · Satélite Tectónico',
    trajectory: 'miniboss_hover',
    attackPattern: 'mo_mini2_rocks',
    startX: WORLD_WIDTH + 60,
    startY: 300,
    speed: 105,
    hp: 860,
    radius: 36,
    scoreValue: 10000,
    itemDrop: 'life_frag',
    shootInterval: 1.25,
    shootDelay: 0.45,
    bulletColor: 0x818cf8,
    customParams: { hoverX: 585, ampY: 130, freqY: 1.2, moveStyle: 'orbital_patrol' },
  },
};

function makeWaveEnemySpec(overrides) {
  return {
    type: overrides.type,
    trajectory: overrides.trajectory || 'sine',
    attackPattern: overrides.attackPattern || 'aimed_single',
    startX: overrides.startX ?? WORLD_WIDTH + 45,
    startY: overrides.startY ?? 300,
    speed: overrides.speed ?? 130,
    hp: overrides.hp ?? 18,
    radius: overrides.radius ?? 18,
    scoreValue: overrides.scoreValue ?? 240,
    itemDrop: overrides.itemDrop || 'point',
    shootInterval: overrides.shootInterval ?? 1.5,
    shootDelay: overrides.shootDelay ?? 0.3,
    bulletColor: overrides.bulletColor ?? 0x00f2fe,
    customParams: overrides.customParams || {},
  };
}

/**
 * Build Normal-mode waves mixing light variations of existing space formations
 * with World 1, World 2, and World 3 custom enemy archetypes.
 */
function buildNormalWorldWaves(world, stage, bossSpawnAt, baseWaves, meta = {}) {
  const palette = meta.palette || [0x00f2fe, 0xff2b5b, 0xffdd00];
  const seed = meta.levelSeed || 1;
  const statScale = getDifficultyStatScale(meta.difficulty || 'normal');
  const firstWaveAt = 0.6;
  const lastWaveAt = Math.max(24, bossSpawnAt - 9.5);
  const count = Array.isArray(baseWaves) && baseWaves.length > 0 ? baseWaves.length : 10;
  const step = count > 1 ? (lastWaveAt - firstWaveAt) / (count - 1) : 7.4;

  const waves = [];
  for (let i = 0; i < count; i++) {
    const at = Number((firstWaveAt + i * step).toFixed(2));
    const v = i + seed;
    const baseWave = baseWaves?.[i];

    // Keep roughly 30% slightly varied classic formations (mapped cleanly to the world's enemies)
    // and 70% bespoke waves for each world's specific enemy trio.
    let enemies = [];
    if (world === 1) {
      enemies = buildWorld1NormalWave(i, v, stage, palette, baseWave);
    } else if (world === 2) {
      enemies = buildWorld2NormalWave(i, v, stage, palette, baseWave);
    } else {
      enemies = buildWorld3NormalWave(i, v, stage, palette, baseWave);
    }

    const scaledEnemies = enemies.map((e) => ({
      ...e,
      hp: Math.max(8, Math.round((e.hp || 18) * statScale)),
      speed: Math.round((e.speed || 130) * statScale),
      shootInterval: Number(((e.shootInterval || 1.5) / statScale).toFixed(3)),
      customParams: { ...(e.customParams || {}), statScale },
    }));

    waves.push({
      key: `w_${i + 1}`,
      at,
      archetype: baseWave?.archetype || `normal_w${world}_v${i % 4}`,
      enemies: scaledEnemies,
    });
  }

  return waves;
}

function buildWorld1NormalWave(idx, variant, stage, palette, baseWave) {
  const mode = idx % 4;
  // Slightly keep & vary existing wave trajectories every 4th wave so nothing feels completely wiped
  if (mode === 3 && Array.isArray(baseWave?.enemies) && baseWave.enemies.length > 0) {
    return baseWave.enemies.map((e, k) => {
      const mappedType = e.type === 'big_fairy' || e.type === 'purple_fairy'
        ? 'third_enemy'
        : (k % 2 === 0 ? 'first_enemy' : 'second_enemy');
      const mappedPattern = mappedType === 'third_enemy'
        ? 'w1_third_slow'
        : mappedType === 'second_enemy'
          ? 'w1_second_homing'
          : 'w1_first_normal';
      return {
        ...e,
        type: mappedType,
        attackPattern: mappedPattern,
        hp: mappedType === 'third_enemy' ? Math.max(40, Math.round((e.hp || 20) * 1.45)) : e.hp,
        shootInterval: mappedType === 'third_enemy' ? 1.8 : Math.max(1.25, e.shootInterval || 1.5),
      };
    });
  }

  const out = [];
  if (mode === 0) {
    // Stage 1-1: v_formation | Stage 1-2: swoop_arc | Stage 1-3: cross_top / cross_bottom
    const baseY = variant % 2 === 0 ? 180 : 300;
    for (let i = 0; i < 5; i++) {
      const isTop = i % 2 === 0;
      const trajectory = stage === 2 ? 'swoop_arc' : (stage === 3 ? (isTop ? 'cross_top' : 'cross_bottom') : 'v_formation');
      const startY = stage === 3
        ? (isTop ? 52 : WORLD_HEIGHT - 52)
        : Math.max(70, Math.min(530, baseY + (i - 2) * 58));
      out.push(makeWaveEnemySpec({
        type: 'first_enemy',
        trajectory,
        attackPattern: 'w1_first_normal',
        startX: WORLD_WIDTH + 45 + i * 48,
        startY,
        speed: stage === 3 ? 148 : 136,
        hp: 16,
        itemDrop: i === 2 ? 'power' : 'point',
        shootInterval: 1.45,
        shootDelay: 0.3 + i * 0.16,
        bulletColor: palette[0],
        customParams: stage === 2
          ? { apexX: 525 - i * 18, targetY: Math.max(95, Math.min(505, 140 + i * 78)) }
          : { driftY: (variant % 2 === 0 ? 1 : -1) * 18 },
      }));
    }
  } else if (mode === 1) {
    // Stage 1-1: sine | Stage 1-2: pendulum | Stage 1-3: spiral
    const trajectory = stage === 2 ? 'pendulum' : (stage === 3 ? 'spiral' : 'sine');
    for (let i = 0; i < 4; i++) {
      const isTop = i % 2 === 0;
      out.push(makeWaveEnemySpec({
        type: 'second_enemy',
        trajectory,
        attackPattern: 'w1_second_homing',
        startX: WORLD_WIDTH + 50 + i * 62,
        startY: stage === 2 ? 300 : (isTop ? 155 : 445),
        speed: 126,
        hp: 20,
        itemDrop: i % 2 === 0 ? 'power' : 'point',
        shootInterval: 1.7,
        shootDelay: 0.35 + i * 0.22,
        bulletColor: 0xfacc15,
        customParams: stage === 2
          ? { freq: 1.9, ampY: 155, phase: i * 0.85 }
          : { amp: 60, freq: 2.6, phase: i * 0.5 },
      }));
    }
  } else {
    // Stage 1-1: hover_retreat + double_helix | Stage 1-2: orbit_anchor + perimeter_skimmer | Stage 1-3: hover_retreat + zigzag
    for (const [ti, sy] of [190, 410].entries()) {
      const useOrbit = stage === 2;
      out.push(makeWaveEnemySpec({
        type: 'third_enemy',
        trajectory: useOrbit ? 'orbit_anchor' : 'hover_retreat',
        attackPattern: 'w1_third_slow',
        startX: WORLD_WIDTH + 55,
        startY: sy,
        speed: 98,
        hp: 48,
        radius: 22,
        scoreValue: 450,
        itemDrop: sy < 300 ? 'bomb_frag' : 'power',
        shootInterval: 1.75,
        shootDelay: 0.45,
        bulletColor: 0x3b82f6,
        customParams: useOrbit
          ? { anchorX: 560, anchorY: sy, orbitR: 62, phase: ti * Math.PI }
          : { hoverX: stage === 3 ? 545 + ti * 50 : 585, hoverTime: 5.0 },
      }));
    }
    for (let k = 0; k < 2; k++) {
      const escortTraj = stage === 2 ? 'perimeter_skimmer' : (stage === 3 ? 'zigzag' : 'double_helix');
      out.push(makeWaveEnemySpec({
        type: 'first_enemy',
        trajectory: escortTraj,
        attackPattern: 'w1_first_normal',
        startX: WORLD_WIDTH + 110 + k * 56,
        startY: stage === 2 ? (k === 0 ? 78 : 522) : (stage === 3 ? (k === 0 ? 150 : 450) : 300),
        speed: 132,
        hp: 16,
        itemDrop: 'point',
        shootInterval: 1.55,
        shootDelay: 0.4 + k * 0.25,
        customParams: stage === 2
          ? { bobAmp: 16 }
          : { amp: 70, freq: 3.0, phase: k * Math.PI },
      }));
    }
  }
  return out;
}

function buildWorld2NormalWave(idx, variant, stage, _palette, baseWave) {
  const mode = idx % 4;
  if (mode === 3 && Array.isArray(baseWave?.enemies) && baseWave.enemies.length > 0) {
    return baseWave.enemies.map((e, k) => {
      const m = k % 3;
      const type = m === 0 ? 'gfg_enemy1' : (m === 1 ? 'gfg_enemy2' : 'gfg_enemy3');
      const attackPattern = m === 0 ? 'w2_gfg1_fast' : (m === 1 ? 'w2_gfg2_sniper022' : 'w2_gfg3_linear_accel');
      return {
        ...e,
        type,
        attackPattern,
        hp: Math.max(18, Math.round((e.hp || 20) * 1.1)),
        shootInterval: m === 1 ? 0.055 : (m === 0 ? 0.56 : 1.55),
      };
    });
  }

  const out = [];
  if (mode === 0) {
    // Stage 2-1: perimeter_skimmer | Stage 2-2: zigzag | Stage 2-3: double_helix
    const trajectory = stage === 2 ? 'zigzag' : (stage === 3 ? 'double_helix' : 'perimeter_skimmer');
    for (let i = 0; i < 5; i++) {
      out.push(makeWaveEnemySpec({
        type: 'gfg_enemy1',
        trajectory,
        attackPattern: 'w2_gfg1_fast',
        startX: WORLD_WIDTH + 45 + i * 54,
        startY: stage === 3 ? (i % 2 === 0 ? 200 : 400) : 110 + i * 95,
        speed: 142,
        hp: 22,
        itemDrop: i % 2 === 0 ? 'power' : 'point',
        shootInterval: 0.56,
        shootDelay: 0.25 + i * 0.14,
        bulletColor: 0xef4444,
        customParams: stage === 3
          ? { amp: 65, freq: 2.9, phase: i * 0.9 }
          : { bobAmp: 18, amp: 32, freq: 2.5, phase: i * 0.6 },
      }));
    }
  } else if (mode === 1) {
    // Stage 2-1: hover_retreat + v_formation | Stage 2-2: orbit_anchor + sine | Stage 2-3: swoop_arc + cross_top/bottom
    for (const [k, sy] of [115, 485].entries()) {
      const sniperTraj = stage === 2 ? 'orbit_anchor' : (stage === 3 ? 'swoop_arc' : 'hover_retreat');
      out.push(makeWaveEnemySpec({
        type: 'gfg_enemy2',
        trajectory: sniperTraj,
        attackPattern: 'w2_gfg2_sniper022',
        startX: WORLD_WIDTH + 50 + k * 45,
        startY: sy,
        speed: 130,
        hp: 30,
        radius: 20,
        scoreValue: 400,
        itemDrop: k === 0 ? 'bomb_frag' : 'power',
        shootInterval: 0.055,
        shootDelay: 0.5 + k * 0.3,
        bulletColor: 0xff2b5b,
        customParams: stage === 2
          ? { anchorX: 600, anchorY: sy < 300 ? 155 : 445, orbitR: 48, phase: k * Math.PI, burstLeft: 0, burstCooldown: 0.4 + k * 0.45 }
          : stage === 3
            ? { apexX: 565, targetY: sy < 300 ? 140 : 460, burstLeft: 0, burstCooldown: 0.4 + k * 0.45 }
            : { hoverX: 615, hoverTime: 5.5, burstLeft: 0, burstCooldown: 0.4 + k * 0.45 },
      }));
    }
    for (let j = 0; j < 3; j++) {
      const escortTraj = stage === 2 ? 'sine' : (stage === 3 ? (j % 2 === 0 ? 'cross_top' : 'cross_bottom') : 'v_formation');
      out.push(makeWaveEnemySpec({
        type: 'gfg_enemy1',
        trajectory: escortTraj,
        attackPattern: 'w2_gfg1_fast',
        startX: WORLD_WIDTH + 90 + j * 45,
        startY: stage === 3 ? (j % 2 === 0 ? 50 : WORLD_HEIGHT - 50) : 240 + j * 60,
        speed: 145,
        hp: 20,
        itemDrop: 'point',
        shootInterval: 0.62,
        shootDelay: 0.35 + j * 0.2,
        customParams: { amp: 48, freq: 2.6, phase: j * 0.7 },
      }));
    }
  } else {
    // Stage 2-1: swoop_arc | Stage 2-2: pendulum | Stage 2-3: orbit_anchor
    const ys = variant % 2 === 0 ? [150, 300, 450] : [180, 300, 420];
    const traj = stage === 2 ? 'pendulum' : (stage === 3 ? 'orbit_anchor' : 'swoop_arc');
    ys.forEach((sy, idxY) => {
      out.push(makeWaveEnemySpec({
        type: 'gfg_enemy3',
        trajectory: traj,
        attackPattern: 'w2_gfg3_linear_accel',
        startX: WORLD_WIDTH + 48 + idxY * 36,
        startY: stage === 2 ? 300 : sy,
        speed: 120,
        hp: 32,
        radius: 20,
        itemDrop: idxY === 1 ? 'life_frag' : 'power',
        shootInterval: 1.4,
        shootDelay: 0.3 + idxY * 0.2,
        bulletColor: 0xf97316,
        customParams: stage === 2
          ? { freq: 1.85, ampY: 145, phase: idxY * 1.1 }
          : stage === 3
            ? { anchorX: 560, anchorY: sy, orbitR: 54, phase: idxY * 2.1 }
            : { apexX: 540 - idxY * 24, targetY: sy },
      }));
    });
  }
  return out;
}

function buildWorld3NormalWave(idx, variant, stage, _palette, baseWave) {
  const mode = idx % 4;
  if (mode === 3 && Array.isArray(baseWave?.enemies) && baseWave.enemies.length > 0) {
    return baseWave.enemies.map((e, k) => {
      const type = k % 2 === 0 ? 'mo_enemy1' : 'mo_enemy3';
      return {
        ...e,
        type,
        attackPattern: type === 'mo_enemy1' ? 'w3_mo1_laser' : 'w3_mo3_sparks',
        hp: Math.max(22, Math.round((e.hp || 24) * 1.15)),
        shootInterval: type === 'mo_enemy1' ? 0.08 : 0.22,
      };
    });
  }

  const out = [];
  if (mode === 0) {
    // Stage 3-1: hover_retreat | Stage 3-2: swoop_arc | Stage 3-3: perimeter_skimmer
    const traj = stage === 2 ? 'swoop_arc' : (stage === 3 ? 'perimeter_skimmer' : 'hover_retreat');
    for (let i = 0; i < 4; i++) {
      const sy = stage === 3 ? (i % 2 === 0 ? 85 + i * 22 : 515 - i * 22) : 105 + i * 125;
      out.push(makeWaveEnemySpec({
        type: 'mo_enemy1',
        trajectory: traj,
        attackPattern: 'w3_mo1_laser',
        startX: WORLD_WIDTH + 45 + i * 38,
        startY: sy,
        speed: 138,
        hp: 26,
        itemDrop: i % 2 === 0 ? 'power' : 'point',
        shootInterval: 0.08,
        shootDelay: 0.4 + i * 0.2,
        bulletColor: 0xff2b5b,
        customParams: stage === 2
          ? { apexX: 550 - (i % 2) * 35, targetY: sy, laserBurstLeft: 0, laserCooldown: 0.4 + i * 0.25 }
          : stage === 3
            ? { bobAmp: 20, laserBurstLeft: 0, laserCooldown: 0.4 + i * 0.25 }
            : { hoverX: 605 - (i % 2) * 35, hoverTime: 4.5, laserBurstLeft: 0, laserCooldown: 0.4 + i * 0.25 },
      }));
    }
  } else if (mode === 1) {
    // MOenemy2 Kamikaze chasers + MOenemy1 backup (3-1: sine | 3-2: zigzag | 3-3: double_helix)
    for (let i = 0; i < 4; i++) {
      out.push(makeWaveEnemySpec({
        type: 'mo_enemy2',
        trajectory: 'kamikaze_homing',
        attackPattern: 'none',
        startX: WORLD_WIDTH + 45 + i * 65,
        startY: 110 + i * 125,
        speed: 195,
        hp: 24,
        radius: 18,
        scoreValue: 320,
        itemDrop: i === 3 ? 'bomb_frag' : 'power',
        customParams: { fuseTime: 1.75, triggerDist: 135 },
      }));
    }
    const backupTraj = stage === 2 ? 'zigzag' : (stage === 3 ? 'double_helix' : 'sine');
    for (const [k, sy] of [170, 430].entries()) {
      out.push(makeWaveEnemySpec({
        type: 'mo_enemy1',
        trajectory: backupTraj,
        attackPattern: 'w3_mo1_laser',
        startX: WORLD_WIDTH + 120,
        startY: stage === 3 ? 300 : sy,
        speed: 130,
        hp: 24,
        itemDrop: 'point',
        shootInterval: 0.08,
        shootDelay: 0.5,
        customParams: { amp: 65, freq: 2.6, phase: k * Math.PI, laserBurstLeft: 0, laserCooldown: 0.7 },
      }));
    }
  } else {
    // MOenemy3 erratic short-range sparks (3-1: orbit_anchor | 3-2: pendulum | 3-3: spiral) + kamikaze pair
    const sparkTraj = stage === 2 ? 'pendulum' : (stage === 3 ? 'spiral' : 'orbit_anchor');
    for (let i = 0; i < 3; i++) {
      const sy = 140 + i * 160;
      out.push(makeWaveEnemySpec({
        type: 'mo_enemy3',
        trajectory: sparkTraj,
        attackPattern: 'w3_mo3_sparks',
        startX: WORLD_WIDTH + 50 + i * 48,
        startY: stage === 2 ? 300 : sy,
        speed: 128,
        hp: 30,
        radius: 20,
        itemDrop: i === 1 ? 'life_frag' : 'power',
        shootInterval: 0.22,
        shootDelay: 0.35 + i * 0.15,
        bulletColor: 0xfef08a,
        customParams: stage === 2
          ? { freq: 1.9, ampY: 150, phase: i * 1.1 }
          : stage === 3
            ? { phase: i * 1.2 }
            : { anchorX: 520 + (variant % 2) * 30, anchorY: sy, orbitR: 52, phase: i * 2.1 },
      }));
    }
    for (const sy of [80, 520]) {
      out.push(makeWaveEnemySpec({
        type: 'mo_enemy2',
        trajectory: 'kamikaze_homing',
        attackPattern: 'none',
        startX: WORLD_WIDTH + 85,
        startY: sy,
        speed: 188,
        hp: 22,
        radius: 18,
        itemDrop: 'point',
        customParams: { fuseTime: 1.75, triggerDist: 135 },
      }));
    }
  }
  return out;
}

/**
 * Custom movement handling for minibosses and kamikaze chasers.
 * Returns true if trajectory was handled.
 */
function updateSpecialEnemyTrajectory(e, dt, _playerPos, nearestPlayerPos) {
  const t = e.spawnTime;
  const p = e.customParams || {};

  if (e.trajectory === 'miniboss_hover') {
    const hoverX = p.hoverX || 590;
    const ampY = p.ampY || 120;
    const freqY = p.freqY || 1.25;
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
    return true;
  }

  if (e.trajectory === 'kamikaze_homing') {
    const triggerDist = p.triggerDist || 135;
    const fuseTime = p.fuseTime || 1.75;
    const target = nearestPlayerPos || _playerPos || { x: 120, y: 300 };

    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    e.angle = Math.atan2(dy, dx);

    if (!p._fuseActive && dist <= triggerDist) {
      p._fuseActive = true;
      p._fuseElapsed = 0;
    }

    let currentSpeed = e.speed;
    let ratio = 0;
    if (p._fuseActive) {
      p._fuseElapsed = (p._fuseElapsed || 0) + dt;
      ratio = Math.min(1, p._fuseElapsed / fuseTime);
      // Progressive slowdown while countdown ticks down to detonation
      currentSpeed = Math.max(12, e.speed * (1 - Math.pow(ratio, 1.25) * 0.92));
    }

    e.x += (dx / dist) * currentSpeed * dt;
    e.y += (dy / dist) * currentSpeed * dt;
    e.x = Math.max(-75, Math.min(WORLD_WIDTH + 90, e.x));
    e.y = Math.max(-75, Math.min(WORLD_HEIGHT + 75, e.y));
    e._fuseProgress = Number(ratio.toFixed(2));
    return true;
  }

  return false;
}

/**
 * Execute Normal-mode bespoke enemy & miniboss shoot patterns.
 * Returns true if pattern was handled.
 */
function fireSpecialEnemyPattern(e, rawBulletSystem, targetPos, dt = 1 / 60) {
  const p = e.customParams || {};
  const statScale = p.statScale || 1.0;
  const bulletSystem = statScale === 1.0
    ? rawBulletSystem
    : {
        spawn: (owner, x, y, ang, spd, rad, ttl, type, dmg, col, opts) =>
          rawBulletSystem.spawn(
            owner,
            x,
            y,
            ang,
            spd * statScale,
            rad,
            ttl,
            type,
            Number(((dmg || 5) * statScale).toFixed(1)),
            col,
            opts
              ? {
                  ...opts,
                  accel: opts.accel ? opts.accel * statScale : opts.accel,
                  maxSpeed: opts.maxSpeed ? opts.maxSpeed * statScale : opts.maxSpeed,
                }
              : opts
          ),
      };
  const aim = Math.atan2(targetPos.y - e.y, targetPos.x - e.x);
  e.angle = aim;
  const mx = e.x + Math.cos(aim) * 16;
  const my = e.y + Math.sin(aim) * 16;

  switch (e.attackPattern) {
    // ── WORLD 1 ──
    case 'w1_first_normal': {
      bulletSystem.spawn('boss', mx, my, aim, 200, 5, 4.2, 'normal', 5, 0xef4444, {
        spriteType: '1EnemyBulletpng',
      });
      return true;
    }

    case 'w1_second_homing': {
      // Gently curves toward the player (~0.7 rad/s for 1.35s)
      bulletSystem.spawn('boss', mx, my, aim, 185, 5, 4.4, 'normal', 5, 0xfacc15, {
        spriteType: '2EnemyBulletpng',
        homeRate: 0.72,
        homeTime: 1.35,
      });
      return true;
    }

    case 'w1_third_slow': {
      // Higher HP unit shooting slower triple burst
      for (const off of [-0.22, 0, 0.22]) {
        bulletSystem.spawn('boss', mx, my, aim + off, 122, 6, 5.2, 'normal', 6, 0x3b82f6, {
          spriteType: '3EnemyBulletpng',
        });
      }
      return true;
    }

    case 'fb_mini2_combo': {
      // Miniboss 1-1: Slow bullets combining 1EnemyBullet and 3EnemyBullet
      p._shotIdx = (p._shotIdx || 0) + 1;
      if (p._shotIdx % 2 === 0) {
        for (const off of [-0.42, -0.21, 0, 0.21, 0.42]) {
          bulletSystem.spawn('boss', e.x + Math.cos(aim) * 20, e.y + Math.sin(aim) * 20, aim + off, 132, 6, 5.2, 'normal', 5, 0x3b82f6, {
            spriteType: '3EnemyBulletpng',
          });
        }
      } else {
        const count = 10;
        const rot = e.spawnTime * 0.9;
        for (let k = 0; k < count; k++) {
          bulletSystem.spawn('boss', e.x, e.y, rot + (Math.PI * 2 * k) / count, 142, 5, 4.8, 'normal', 5, 0xef4444, {
            spriteType: '1EnemyBulletpng',
          });
        }
      }
      return true;
    }

    case 'fb_mini1_combo': {
      // Miniboss 1-2: Faster homing + #92 ring (16 homing bullets, turn 2.1 rad/s), bullets 1 & 2
      p._shotIdx = (p._shotIdx || 0) + 1;
      if (p._shotIdx % 3 === 0) {
        // Pattern #92 inspired: 16-way homing ring turning smoothly toward players
        const count = 16;
        for (let k = 0; k < count; k++) {
          const a = (Math.PI * 2 * k) / count;
          bulletSystem.spawn('boss', e.x, e.y, a, 162, 5, 4.6, 'normal', 5, 0xfacc15, {
            spriteType: '2EnemyBulletpng',
            homeRate: 2.15,
            homeTime: 1.45,
          });
        }
      } else {
        for (const off of [-0.28, -0.1, 0.1, 0.28]) {
          const useHoming = Math.abs(off) > 0.2;
          bulletSystem.spawn('boss', e.x + Math.cos(aim) * 20, e.y + Math.sin(aim) * 20, aim + off, 235, 5, 4.2, 'normal', 5, useHoming ? 0xfacc15 : 0xef4444, {
            spriteType: useHoming ? '2EnemyBulletpng' : '1EnemyBulletpng',
            homeRate: useHoming ? 1.15 : 0,
            homeTime: useHoming ? 1.2 : 0,
          });
        }
      }
      return true;
    }

    // ── WORLD 2 ──
    case 'w2_gfg1_fast': {
      bulletSystem.spawn('boss', mx, my, aim, 285, 5, 3.8, 'normal', 5, 0xef4444, {
        spriteType: 'GFGbullet1png',
      });
      return true;
    }

    case 'w2_gfg2_sniper022': {
      // Exact #022 sniper burst: 8 rapid shots every burst cycle, velocity ~405 px/s
      if (!p.burstLeft || p.burstLeft <= 0) {
        if ((p.burstCooldown || 0) > 0) {
          p.burstCooldown -= Math.max(dt, e.shootInterval);
          return true;
        }
        p.burstLeft = 8;
        p.burstAim = aim;
      }
      const bAim = p.burstAim ?? aim;
      e.angle = bAim;
      bulletSystem.spawn('boss', e.x + Math.cos(bAim) * 20, e.y + Math.sin(bAim) * 20, bAim, 405, 5.5, 3.2, 'normal', 5, 0xf87171, {
        spriteType: 'GFGbullet2png',
      });
      p.burstLeft -= 1;
      if (p.burstLeft <= 0) {
        p.burstCooldown = 1.45;
      }
      return true;
    }

    case 'w2_gfg3_linear_accel': {
      // Single GFGbullet3png that accelerates exponentially and curves slightly toward player before passing by if dodged
      bulletSystem.spawn('boss', mx, my, aim, 55, 5.5, 4.8, 'normal', 5, 0xf97316, {
        spriteType: 'GFGbullet3png',
        expAccel: 1.35,
        maxSpeed: 420,
        homeRate: 0.72,
        homeTime: 1.35,
      });
      return true;
    }

    case 'gfg_mini1_shotgun': {
      // Miniboss 2-1: Shotgun cones using GFGbullet4png
      p._shotIdx = (p._shotIdx || 0) + 1;
      const pellets = 10;
      for (let k = 0; k < pellets; k++) {
        const spread = ((k / (pellets - 1)) - 0.5) * 0.62 + (Math.random() - 0.5) * 0.08;
        const speed = 265 + Math.random() * 110;
        bulletSystem.spawn('boss', e.x + Math.cos(aim) * 24, e.y + Math.sin(aim) * 24, aim + spread, speed, 5.5, 3.8, 'normal', 5, 0xef4444, {
          spriteType: 'GFGbullet4png',
        });
      }
      return true;
    }

    case 'gfg_mini2_burst': {
      // Miniboss 2-2: Rapid fire stream with brief rest periods using GFGbullet5png
      p.cycleT = (p.cycleT || 0) + Math.max(dt, e.shootInterval);
      const cycle = p.cycleT % 2.65;
      if (cycle > 1.5) return true; // Rest phase (1.15s pause!)
      const sweep = Math.sin(e.spawnTime * 7.5) * 0.22;
      bulletSystem.spawn('boss', e.x + Math.cos(aim) * 24, e.y + Math.sin(aim) * 24, aim + sweep, 330, 5.5, 3.6, 'normal', 5, 0xf87171, {
        spriteType: 'GFGbullet5png',
      });
      return true;
    }

    // ── WORLD 3 ──
    case 'w3_mo1_laser': {
      // Fires tight linear 3-bolt mini-laser stream with MObullet1png
      if (!p.laserBurstLeft || p.laserBurstLeft <= 0) {
        if ((p.laserCooldown || 0) > 0) {
          p.laserCooldown -= Math.max(dt, e.shootInterval);
          return true;
        }
        p.laserBurstLeft = 3;
        p.laserAim = aim;
      }
      const lAim = p.laserAim ?? aim;
      e.angle = lAim;
      bulletSystem.spawn('boss', e.x + Math.cos(lAim) * 18, e.y + Math.sin(lAim) * 18, lAim, 345, 5, 3.4, 'normal', 5, 0xef4444, {
        spriteType: 'MObullet1png',
      });
      p.laserBurstLeft -= 1;
      if (p.laserBurstLeft <= 0) {
        p.laserCooldown = 1.35;
      }
      return true;
    }

    case 'w3_mo3_sparks': {
      // Short-range erratic spark rain (#99 inspired, fewer bullets & short TTL)
      const count = 2;
      for (let k = 0; k < count; k++) {
        const a = aim + (Math.random() - 0.5) * 2.1;
        const speed = 135 + Math.random() * 105;
        bulletSystem.spawn('boss', mx, my, a, speed, 5, 0.92, 'normal', 4, 0xfef08a, {
          spriteType: 'MObullet3png',
        });
      }
      return true;
    }

    case 'mo_mini1_rocks': {
      // Spawns rocks near self that launch aimed toward players and split into 6 shards on hit/edge!
      p._shotIdx = (p._shotIdx || 0) + 1;
      const offsets = p._shotIdx % 2 === 0 ? [-46, 46] : [0];
      for (const oy of offsets) {
        const sx = e.x - 42;
        const sy = Math.max(40, Math.min(WORLD_HEIGHT - 40, e.y + oy));
        const a = Math.atan2(targetPos.y - sy, targetPos.x - sx);
        bulletSystem.spawn('boss', sx, sy, a, 32, 12.5, 6.0, 'normal', 7, 0x9ca3af, {
          spriteType: 'MObullet4png',
          accel: 290,
          maxSpeed: 295,
          splitOnImpact: true,
          splitCount: 6,
        });
      }
      return true;
    }

    case 'mo_mini2_rocks': {
      // Throws same boulders at randomized spawn points/angles!
      const count = 2;
      for (let k = 0; k < count; k++) {
        const oy = (Math.random() - 0.5) * 150;
        const sx = e.x - 36 - Math.random() * 32;
        const sy = Math.max(40, Math.min(WORLD_HEIGHT - 40, e.y + oy));
        const a = Math.PI + (Math.random() - 0.5) * 1.45;
        bulletSystem.spawn('boss', sx, sy, a, 45, 12.5, 6.0, 'normal', 7, 0x9ca3af, {
          spriteType: 'MObullet4png',
          accel: 240,
          maxSpeed: 280,
          splitOnImpact: true,
          splitCount: 6,
        });
      }
      return true;
    }

    default:
      return false;
  }
}

/**
 * Custom Normal Boss Profiles for X-3:
 *  - 1-3: FirstBoss.png
 *  - 2-3: GunsForGunsCube.png
 *  - 3-3: M.O.png (Mecanical Ophanim)
 */
function getNormalWorldBossConfig(world, difficulty = 'normal') {
  const scale = getDifficultyStatScale(difficulty);
  const scalePhases = (list) =>
    list.map((ph) => ({
      ...ph,
      shootInterval: Number((ph.shootInterval / scale).toFixed(3)),
    }));

  if (world === 1) {
    return {
      bossId: 'first_boss',
      bossName: 'FirstBoss · Centinela Tri-Protocolo',
      sprite: '/assets/sprites/FirstBoss.png',
      moveArchetype: 'orbital_lissajous',
      baseHp: Math.round(118 * scale),
      speedScale: Number((0.94 * scale).toFixed(3)),
      statScale: scale,
      phases: scalePhases([
        { name: 'Fase 1 "Salva Estándar & Lenta"', pattern: 'fb_boss_mix_fan', shootInterval: 0.55, laserMode: 'targeted', laserInterval: 5.0, megaLaserInterval: 0 },
        { name: 'Sello I "Enjambre Teledirigido"', pattern: 'fb_boss_homing_salvo', shootInterval: 0.95, laserMode: 'targeted', laserInterval: 4.5, megaLaserInterval: 7.5 },
        { name: 'Fase 3 "Cadencia Alterna"', pattern: 'fb_boss_slow_fast_swap', shootInterval: 0.45, laserMode: 'none', laserInterval: 5.0, megaLaserInterval: 0 },
        { name: 'Protocolo #92 "Tormenta Buscadora"', pattern: 'fb_boss_homing_92', shootInterval: 1.05, laserMode: 'both', laserInterval: 4.2, megaLaserInterval: 6.8 },
        { name: 'Protocolo Final "Trinidad Orbital"', pattern: 'fb_boss_tri_symphony', shootInterval: 0.42, laserMode: 'both', laserInterval: 3.8, megaLaserInterval: 6.2 },
      ]),
    };
  }

  if (world === 2) {
    return {
      bossId: 'guns_for_guns_cube',
      bossName: 'GunsForGunsCube',
      sprite: '/assets/sprites/GunsForGunsCube.png',
      moveArchetype: 'diamond_tactical',
      baseHp: Math.round(145 * scale),
      speedScale: Number((1.0 * scale).toFixed(3)),
      statScale: scale,
      phases: scalePhases([
        { name: 'Fase 1 "Arsenal Cinético"', pattern: 'gfg_boss_p1_mix', shootInterval: 0.48, laserMode: 'targeted', laserInterval: 4.6, megaLaserInterval: 0 },
        { name: 'Sello Balístico "Francotirador #022"', pattern: 'gfg_boss_p2_sniper', shootInterval: 0.06, laserMode: 'targeted', laserInterval: 4.4, megaLaserInterval: 7.2 },
        { name: 'Fase 3 "Cortina Acelerada"', pattern: 'gfg_boss_p3_accel', shootInterval: 0.55, laserMode: 'none', laserInterval: 4.8, megaLaserInterval: 0 },
        { name: 'Protocolo Cubo "Fuego y Perdigones"', pattern: 'gfg_boss_p4_shotgun_rapid', shootInterval: 0.12, laserMode: 'both', laserInterval: 3.8, megaLaserInterval: 6.5 },
        { name: 'Sobrecarga Total "Guns For Guns"', pattern: 'gfg_boss_p5_all_bullets', shootInterval: 0.36, laserMode: 'both', laserInterval: 3.6, megaLaserInterval: 6.0 },
      ]),
    };
  }

  // World 3-3: M.O (Mecanical Ophanim)
  return {
    bossId: 'mo',
    bossName: 'M.O',
    fullBossName: 'Mecanical Ophanim',
    sprite: '/assets/sprites/M.O.png',
    moveArchetype: 'mo_ophanim_dash',
    baseHp: Math.round(175 * scale),
    speedScale: Number((1.06 * scale).toFixed(3)),
    statScale: scale,
    introDuration: 3.8,
    phases: scalePhases([
      { name: 'Fase 1 "Vectores Rectos"', pattern: 'mo_dash_pattern', shootInterval: 0.5, laserMode: 'none', laserInterval: 99, megaLaserInterval: 0 },
      { name: 'Sello Ophanim "Trazos del Trono"', pattern: 'mo_dash_pattern', shootInterval: 0.45, laserMode: 'none', laserInterval: 99, megaLaserInterval: 8.5 },
      { name: 'Fase 3 "Aceleración Axial"', pattern: 'mo_dash_pattern', shootInterval: 0.4, laserMode: 'none', laserInterval: 99, megaLaserInterval: 0 },
      { name: 'Protocolo Serafín "Cruce Mecánico"', pattern: 'mo_dash_pattern', shootInterval: 0.35, laserMode: 'none', laserInterval: 99, megaLaserInterval: 7.5 },
      { name: 'Protocolo Final "MECANICAL OPHANIM"', pattern: 'mo_dash_pattern', shootInterval: 0.3, laserMode: 'none', laserInterval: 99, megaLaserInterval: 6.8 },
    ]),
  };
}

/**
 * Fire Normal Boss patterns for 1-3 (FirstBoss) and 2-3 (GunsForGunsCube).
 * Returns true if handled.
 */
function fireNormalBossPattern(patternId, ctx, rawEmitBullet) {
  const { bossX, bossY, playerX, playerY, animTimer, shotIndex, phase = 1, statScale = 1.0 } = ctx;
  const emitBullet = statScale === 1.0
    ? rawEmitBullet
    : (bx, by, angle, speed, radius, color, damage, opts = null) =>
        rawEmitBullet(
          bx,
          by,
          angle,
          speed * statScale,
          radius,
          color,
          Number(((damage || 5) * statScale).toFixed(1)),
          opts
            ? {
                ...opts,
                accel: opts.accel ? opts.accel * statScale : opts.accel,
                maxSpeed: opts.maxSpeed ? opts.maxSpeed * statScale : opts.maxSpeed,
              }
            : opts
        );
  const aim = Math.atan2(playerY - bossY, playerX - bossX);

  switch (patternId) {
    // ── WORLD 1 BOSS (FirstBoss): mix 1EnemyBullet, 2EnemyBullet (homing), 3EnemyBullet (slow) ──
    case 'fb_boss_mix_fan': {
      if (shotIndex % 2 === 0) {
        for (const off of [-0.36, -0.18, 0, 0.18, 0.36]) {
          emitBullet(bossX - 28, bossY, aim + off, 235, 5, 0xef4444, 5, { spriteType: '1EnemyBulletpng' });
        }
      } else {
        for (const off of [-0.28, 0, 0.28]) {
          emitBullet(bossX - 28, bossY, aim + off, 125, 6, 0x3b82f6, 5, { spriteType: '3EnemyBulletpng' });
        }
      }
      return true;
    }

    case 'fb_boss_homing_salvo': {
      for (const off of [-0.55, -0.25, 0.25, 0.55]) {
        emitBullet(bossX - 24, bossY, aim + off, 185, 5, 0xfacc15, 5, {
          spriteType: '2EnemyBulletpng',
          homeRate: 1.25,
          homeTime: 1.4,
        });
      }
      const rot = animTimer * 1.2;
      for (let k = 0; k < 8; k++) {
        emitBullet(bossX, bossY, rot + (Math.PI * 2 * k) / 8, 165, 5, 0xef4444, 5, { spriteType: '1EnemyBulletpng' });
      }
      return true;
    }

    case 'fb_boss_slow_fast_swap': {
      const isSlow = shotIndex % 3 === 0;
      if (isSlow) {
        const count = 12;
        const rot = animTimer * 0.8;
        for (let k = 0; k < count; k++) {
          emitBullet(bossX, bossY, rot + (Math.PI * 2 * k) / count, 118, 6, 0x3b82f6, 5, { spriteType: '3EnemyBulletpng' });
        }
      } else {
        for (const off of [-0.14, 0, 0.14]) {
          emitBullet(bossX - 28, bossY, aim + off, 280, 5, 0xef4444, 5, { spriteType: '1EnemyBulletpng' });
        }
      }
      return true;
    }

    case 'fb_boss_homing_92': {
      const count = 16;
      for (let k = 0; k < count; k++) {
        emitBullet(bossX, bossY, (Math.PI * 2 * k) / count, 168, 5, 0xfacc15, 5, {
          spriteType: '2EnemyBulletpng',
          homeRate: 2.1,
          homeTime: 1.5,
        });
      }
      for (const off of [-0.25, 0.25]) {
        emitBullet(bossX - 28, bossY, aim + off, 130, 6, 0x3b82f6, 5, { spriteType: '3EnemyBulletpng' });
      }
      return true;
    }

    case 'fb_boss_tri_symphony': {
      const arms = 6;
      const rot = animTimer * 1.9;
      const mod = shotIndex % 3;
      if (mod === 0) {
        for (let k = 0; k < arms; k++) {
          emitBullet(bossX, bossY, rot + (Math.PI * 2 * k) / arms, 250, 5, 0xef4444, 5, { spriteType: '1EnemyBulletpng' });
        }
      } else if (mod === 1) {
        for (let k = 0; k < arms; k++) {
          emitBullet(bossX, bossY, -rot + (Math.PI * 2 * k) / arms, 132, 6, 0x3b82f6, 5, { spriteType: '3EnemyBulletpng' });
        }
      } else {
        for (const off of [-0.4, 0, 0.4]) {
          emitBullet(bossX - 24, bossY, aim + off, 195, 5, 0xfacc15, 5, {
            spriteType: '2EnemyBulletpng',
            homeRate: 1.35,
            homeTime: 1.25,
          });
        }
      }
      return true;
    }

    // ── WORLD 2 BOSS (GunsForGunsCube): rotates across GFGbullet1..GFGbullet5 ──
    case 'gfg_boss_p1_mix': {
      if (shotIndex % 2 === 0) {
        for (const off of [-0.28, -0.1, 0.1, 0.28]) {
          emitBullet(bossX - 28, bossY, aim + off, 275, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
        }
      } else {
        for (let k = 0; k < 8; k++) {
          const sp = ((k / 7) - 0.5) * 0.58;
          emitBullet(bossX - 26, bossY, aim + sp, 260 + (k % 3) * 35, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet4png' });
        }
      }
      return true;
    }

    case 'gfg_boss_p2_sniper': {
      // Sniper #022 bursts (GFGbullet2png) with brief pause + accelerating ring (GFGbullet3png)
      const cycle = shotIndex % 26;
      if (cycle < 8) {
        emitBullet(bossX - 28, bossY, aim + Math.sin(cycle) * 0.04, 395, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet2png' });
      } else if (cycle === 14) {
        for (let k = 0; k < 12; k++) {
          emitBullet(bossX, bossY, (Math.PI * 2 * k) / 12 + animTimer * 0.4, 42, 5, 0xf97316, 5, {
            spriteType: 'GFGbullet3png',
            expAccel: 1.65,
            maxSpeed: 510,
          });
        }
      }
      return true;
    }

    case 'gfg_boss_p3_accel': {
      const shift = Math.sin(animTimer * 2.2) * 0.3;
      for (const off of [-0.48, -0.24, 0, 0.24, 0.48]) {
        emitBullet(bossX - 26, bossY, Math.PI + off + shift, 42, 5, 0xf97316, 5, {
          spriteType: 'GFGbullet3png',
          expAccel: 1.65,
          maxSpeed: 510,
        });
      }
      if (shotIndex % 2 === 0) {
        emitBullet(bossX - 28, bossY, aim, 285, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
      }
      return true;
    }

    case 'gfg_boss_p4_shotgun_rapid': {
      const cyc = shotIndex % 22;
      if (cyc < 10) {
        const sweep = Math.sin(animTimer * 6.5) * 0.26;
        emitBullet(bossX - 28, bossY, aim + sweep, 330, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet5png' });
      } else if (cyc === 15) {
        for (let k = 0; k < 11; k++) {
          const sp = ((k / 10) - 0.5) * 0.72;
          emitBullet(bossX - 28, bossY, aim + sp, 265 + (k % 4) * 32, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet4png' });
        }
      }
      return true;
    }

    case 'gfg_boss_p5_all_bullets': {
      const m = shotIndex % 5;
      if (m === 0) {
        for (const off of [-0.3, 0, 0.3]) {
          emitBullet(bossX - 28, bossY, aim + off, 290, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
        }
      } else if (m === 1) {
        emitBullet(bossX - 28, bossY, aim, 410, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet2png' });
      } else if (m === 2) {
        for (let k = 0; k < 10; k++) {
          emitBullet(bossX, bossY, (Math.PI * 2 * k) / 10 + animTimer, 42, 5, 0xf97316, 5, {
            spriteType: 'GFGbullet3png',
            expAccel: 1.7,
            maxSpeed: 520,
          });
        }
      } else if (m === 3) {
        for (let k = 0; k < 9; k++) {
          const sp = ((k / 8) - 0.5) * 0.65;
          emitBullet(bossX - 28, bossY, aim + sp, 260 + (k % 3) * 35, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet4png' });
        }
      } else {
        for (const off of [-0.18, 0.18]) {
          emitBullet(bossX - 28, bossY, aim + off, 335, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet5png' });
        }
      }
      return true;
    }

    default:
      return false;
  }
}

const MO_CENTER_X = WORLD_WIDTH / 2; // 400
const MO_CENTER_Y = WORLD_HEIGHT / 2; // 300
const MO_OUTER_PAD = 125; // strictly outside visible screen [0..800] x [0..600]

function clipRayToOuterBounds(x0, y0, tx, ty) {
  const minX = -MO_OUTER_PAD;
  const maxX = WORLD_WIDTH + MO_OUTER_PAD;
  const minY = -MO_OUTER_PAD;
  const maxY = WORLD_HEIGHT + MO_OUTER_PAD;

  let dx = tx - x0;
  let dy = ty - y0;
  if (Math.hypot(dx, dy) < 35) {
    dx = 180 - x0;
    dy = 300 - y0;
  }

  let bestS = Infinity;
  let exitX = maxX;
  let exitY = MO_CENTER_Y;

  const tryEdge = (s) => {
    if (!(s > 0.05) || s >= bestS) return;
    const hx = x0 + s * dx;
    const hy = y0 + s * dy;
    if (hx >= minX - 2 && hx <= maxX + 2 && hy >= minY - 2 && hy <= maxY + 2) {
      bestS = s;
      exitX = Math.max(minX, Math.min(maxX, hx));
      exitY = Math.max(minY, Math.min(maxY, hy));
    }
  };

  if (Math.abs(dx) > 1e-5) {
    tryEdge((minX - x0) / dx);
    tryEdge((maxX - x0) / dx);
  }
  if (Math.abs(dy) > 1e-5) {
    tryEdge((minY - y0) / dy);
    tryEdge((maxY - y0) / dy);
  }

  return { x: Math.round(exitX), y: Math.round(exitY) };
}

function pickRandomOuterPoint() {
  const edge = Math.floor(Math.random() * 4);
  if (edge === 0) return { x: -MO_OUTER_PAD, y: Math.round(70 + Math.random() * (WORLD_HEIGHT - 140)) };
  if (edge === 1) return { x: WORLD_WIDTH + MO_OUTER_PAD, y: Math.round(70 + Math.random() * (WORLD_HEIGHT - 140)) };
  if (edge === 2) return { x: Math.round(90 + Math.random() * (WORLD_WIDTH - 180)), y: -MO_OUTER_PAD };
  return { x: Math.round(90 + Math.random() * (WORLD_WIDTH - 180)), y: WORLD_HEIGHT + MO_OUTER_PAD };
}

/**
 * Generates M.O's full dash sequence across the map:
 * - Line 0 always launches from M.O toward the player's direction and exits strictly OFFSCREEN.
 * - Subsequent lines start from any random offscreen edge outside the map and slash across any part of the map to a far offscreen exit.
 * - After the final offscreen attack line, a return line directs M.O back to the center area to rest.
 */
function buildMoDashChain(startX, startY, phase, playerPos) {
  const dashes = 4 + Math.max(1, phase || 1);
  const px = Math.max(90, Math.min(WORLD_WIDTH - 90, playerPos?.x || 200));
  const py = Math.max(70, Math.min(WORLD_HEIGHT - 70, playerPos?.y || MO_CENTER_Y));

  const chain = [];
  let lastEndX = startX;
  let lastEndY = startY;

  for (let k = 0; k < dashes; k++) {
    let sx;
    let sy;
    let tx;
    let ty;

    if (k === 0) {
      sx = startX;
      sy = startY;
      tx = px;
      ty = py;
      if (Math.hypot(tx - sx, ty - sy) < 60) {
        tx = 180;
        ty = py > MO_CENTER_Y ? 190 : 410;
      }
    } else {
      const entry = pickRandomOuterPoint();
      sx = entry.x;
      sy = entry.y;
      tx = Math.round(130 + Math.random() * (WORLD_WIDTH - 260));
      ty = Math.round(95 + Math.random() * (WORLD_HEIGHT - 190));
    }

    const exitPt = clipRayToOuterBounds(sx, sy, tx, ty);
    chain.push({
      x1: sx,
      y1: sy,
      x2: exitPt.x,
      y2: exitPt.y,
      isReturn: false,
    });
    lastEndX = exitPt.x;
    lastEndY = exitPt.y;
  }

  // Final segment directs M.O back from the last offscreen endpoint into the center area to rest
  chain.push({
    x1: lastEndX,
    y1: lastEndY,
    x2: MO_CENTER_X,
    y2: MO_CENTER_Y,
    isReturn: true,
  });

  return chain;
}

function buildMoKamikazeSpec(phase, statScale = 1.0, playerPos = null) {
  // Never spawn behind the player (no left edge, and top/bottom spawns stay strictly ahead of player X)
  const edge = Math.floor(Math.random() * 3); // 0: right, 1: top, 2: bottom
  const pad = 42;
  const minFrontX = Math.min(WORLD_WIDTH - 40, Math.max(120, Math.round((playerPos?.x ?? 120) + 70)));
  let startX;
  let startY;
  if (edge === 0) {
    startX = WORLD_WIDTH + pad;
    startY = Math.round(45 + Math.random() * (WORLD_HEIGHT - 90));
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
    speed: Math.round((184 + phase * 9) * statScale),
    hp: Math.round(20 * statScale),
    radius: 18,
    scoreValue: 260,
    itemDrop: 'point',
    customParams: { fuseTime: 1.75, triggerDist: 135, statScale },
  };
}

/**
 * State machine update for Boss 3-3: M.O (Mecanical Ophanim).
 */
function updateMechanicalOphanim(boss, dt, playerPos, bulletSystem, emitPlayerContactDamage, emitSpawnEnemy = null) {
  const state = boss._moState;
  if (!state) return;

  // 1. Intro sequence ("Mecanical Ophanim" -> "M.O"), gliding smoothly to arena center
  if (state.mode === 'intro') {
    state.timer += dt;
    boss.isInvulnerable = true;
    const progress = Math.min(1, state.timer / (state.introDuration || 3.8));
    boss.x = 670 + (MO_CENTER_X - 670) * (1 - Math.pow(1 - progress, 2));
    boss.y = MO_CENTER_Y;
    boss.angle = Math.PI;
    boss.moIntroActive = true;
    boss.moIntroProgress = progress;
    if (state.timer >= (state.introDuration || 3.8)) {
      boss.isInvulnerable = false;
      boss.moIntroActive = false;
      boss.moIntroProgress = 1;
      boss.x = MO_CENTER_X;
      boss.y = MO_CENTER_Y;
      state.mode = 'telegraph';
      state.timer = 0;
      state.segIndex = 0;
      state.dashSpeedScale = 1.0;
      state.summonTimer = 2.6;
      state.dashChain = buildMoDashChain(boss.x, boss.y, boss.phase, playerPos, state.lineIndex++);
      state.dashHitPlayers = new Set();
    }
    return;
  }

  boss.moIntroActive = false;
  boss.isInvulnerable = false;

  // Continuous offscreen MOenemy2 summons:
  // Normal: P1=0, P2-3=1, P4-5=2 | Difficult: P1=1, P2-3=2, P4-5=3 | No Mercy: P1=2, P2-3=3, P4-5=4
  const statScale = boss._statScale || 1.0;
  const phase = boss.phase || 1;
  const diffBonus = statScale >= 1.2 ? 2 : statScale >= 1.08 ? 1 : 0;
  const phaseStep = phase >= 4 ? 2 : phase >= 2 ? 1 : 0;
  const summonCount = phaseStep + diffBonus;
  if (typeof emitSpawnEnemy === 'function' && summonCount > 0) {
    state.summonTimer = (state.summonTimer ?? 2.0) + dt;
    const summonInterval = Math.max(3.8, 6.0 - phase * 0.45);
    if (state.summonTimer >= summonInterval) {
      state.summonTimer = 0;
      const maxActive = Math.min(5 + diffBonus * 2, phase + diffBonus);
      for (let k = 0; k < summonCount; k++) {
        emitSpawnEnemy(buildMoKamikazeSpec(phase, statScale, playerPos), maxActive);
      }
    }
  }

  // 2. Full-map line telegraph BEFORE dashing
  if (state.mode === 'telegraph') {
    state.timer += dt;
    const duration = Math.max(0.85, 1.25 - boss.phase * 0.05);
    if (!Array.isArray(state.dashChain) || state.dashChain.length === 0) {
      state.dashChain = buildMoDashChain(boss.x, boss.y, boss.phase, playerPos, state.lineIndex++);
    }
    const chain = state.dashChain;
    const first = chain[0];
    boss.x += (first.x1 - boss.x) * Math.min(1, dt * 14);
    boss.y += (first.y1 - boss.y) * Math.min(1, dt * 14);
    boss.angle = Math.atan2(first.y2 - first.y1, first.x2 - first.x1);

    const prog = Number(Math.min(1, state.timer / duration).toFixed(2));
    boss.moDashState = 'telegraph';
    boss.moDashLines = chain.map((seg, idx) => ({
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
      state.dashSpeedScale = 1.0;
      state.timer = 0;
      state.dashHitPlayers = new Set();
      state.sparkAccum = 0;
    }
    return;
  }

  // 3. Continuous dashing along lines with escalating speed per line -> return to center -> rest
  if (state.mode === 'dashing') {
    const chain = state.dashChain || [];
    const seg = chain[state.segIndex];
    if (!seg) {
      state.mode = 'resting';
      state.dashSpeedScale = 1.0;
      state.timer = 0;
      boss.moDashLines = [];
      return;
    }

    const segLen = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) || 1;
    const baseDashSpeed = (1350 + boss.phase * 120) * statScale;
    const speedScale = state.dashSpeedScale || 1.0;
    const segDur = seg.isReturn
      ? Math.max(0.32, Math.min(0.55, segLen / (1650 * statScale)))
      : Math.max(0.16, Math.min(0.65, segLen / (baseDashSpeed * speedScale)));

    const prevX = boss.x;
    const prevY = boss.y;
    state.timer += dt;
    const rawT = Math.min(1, state.timer / segDur);
    const p = seg.isReturn
      ? 1 - Math.pow(1 - rawT, 3)
      : (rawT < 0.5 ? 2 * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 2) / 2);

    boss.x = seg.x1 + (seg.x2 - seg.x1) * p;
    boss.y = seg.y1 + (seg.y2 - seg.y1) * p;
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

    // Emit wake sparks while dashing across the screen (density & pairs scale up with boss.phase)
    state.sparkAccum = (state.sparkAccum || 0) + dt;
    const wakeInterval = Math.max(0.032, 0.068 - (boss.phase || 1) * 0.007);
    if (!seg.isReturn && state.sparkAccum >= wakeInterval && boss.x > -20 && boss.x < WORLD_WIDTH + 20 && boss.y > -20 && boss.y < WORLD_HEIGHT + 20) {
      state.sparkAccum = 0;
      const pairsPerSide = Math.ceil((boss.phase || 1) / 2);
      for (const sgn of [-1, 1]) {
        const perp = boss.angle + sgn * (Math.PI / 2);
        for (let sp = 0; sp < pairsPerSide; sp++) {
          const jitter = (Math.random() - 0.5) * 0.42;
          const spd = (110 + sp * 28 + Math.random() * 25) * statScale;
          bulletSystem.spawn('boss', boss.x, boss.y, perp + jitter, spd, 4.5, 12.0, 'normal', Math.max(1, Math.round(4 * statScale)), 0xfef08a, {
            spriteType: 'MObullet3png',
          });
        }
      }
    }

    // Sub-sampled contact check along dash segment so ultra-fast dashes never tunnel past players
    if (typeof emitPlayerContactDamage === 'function' && (!seg.isReturn || rawT < 0.72)) {
      for (let s = 1; s <= 4; s++) {
        const st = s / 4;
        emitPlayerContactDamage(
          prevX + (boss.x - prevX) * st,
          prevY + (boss.y - prevY) * st,
          36,
          14,
          state.dashHitPlayers
        );
      }
    }

    if (rawT >= 1) {
      boss.x = seg.x2;
      boss.y = seg.y2;
      if (!seg.isReturn) {
        // After traversing a line, erupt trailing MObullet3png sparks along the line scaled by phase
        const lineNodes = 2 + Math.max(1, boss.phase || 1);
        const sparksPerSide = Math.ceil((boss.phase || 1) / 2);
        const lineAngle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
        for (let n = 1; n <= lineNodes; n++) {
          const u = n / (lineNodes + 1);
          const nx = seg.x1 + (seg.x2 - seg.x1) * u;
          const ny = seg.y1 + (seg.y2 - seg.y1) * u;
          if (nx < 10 || nx > WORLD_WIDTH - 10 || ny < 10 || ny > WORLD_HEIGHT - 10) continue;
          for (const sgn of [-1, 1]) {
            const perp = lineAngle + sgn * (Math.PI / 2);
            for (let sp = 0; sp < sparksPerSide; sp++) {
              const spread = (Math.random() - 0.5) * 0.48;
              const spd = (100 + sp * 30 + Math.random() * 30) * statScale;
              bulletSystem.spawn('boss', nx, ny, perp + spread, spd, 4.5, 12.0, 'normal', Math.max(1, Math.round(4 * statScale)), 0xfef08a, {
                spriteType: 'MObullet3png',
              });
            }
          }
        }
        state.dashSpeedScale = (state.dashSpeedScale || 1.0) + 0.28;
      }
      state.segIndex += 1;
      if (state.segIndex < chain.length) {
        const nextSeg = chain[state.segIndex];
        // Reposition seamlessly while offscreen to the next line's start so prevX/prevY never sweep across the arena
        boss.x = nextSeg.x1;
        boss.y = nextSeg.y1;
        boss.angle = Math.atan2(nextSeg.y2 - nextSeg.y1, nextSeg.x2 - nextSeg.x1);
        state.timer = 0;
        state.dashHitPlayers = new Set();
        state.sparkAccum = 0;
      } else {
        boss.x = MO_CENTER_X;
        boss.y = MO_CENTER_Y;
        state.mode = 'resting';
        state.dashSpeedScale = 1.0; // Reset line speed on rest!
        state.timer = 0;
        state.restDuration = Math.max(2.3, 3.2 - boss.phase * 0.15);
        state.restShotAccum = 0;
        boss.moDashLines = [];
      }
    }
    return;
  }

  // 4. Resting around center with active figure-8 hover movement, shooting pure MObullet1png rings
  state.timer += dt;
  state.dashSpeedScale = 1.0;
  boss.moDashState = 'resting';
  boss.moDashLines = [];
  const restHoverX = MO_CENTER_X + Math.cos(state.timer * 1.45) * 52;
  const restHoverY = MO_CENTER_Y + Math.sin(state.timer * 2.2) * 62;
  boss.x += (restHoverX - boss.x) * Math.min(1, dt * 4.5);
  boss.y += (restHoverY - boss.y) * Math.min(1, dt * 4.5);
  if (playerPos) {
    boss.angle = Math.atan2(playerPos.y - boss.y, playerPos.x - boss.x);
  }

  state.restShotAccum = (state.restShotAccum || 0) + dt;
  const restShotInterval = Math.max(0.6, (1.05 - boss.phase * 0.06) / statScale);
  if (state.restShotAccum >= restShotInterval) {
    state.restShotAccum = 0;
    const count = 8 + boss.phase * 2;
    const rot = boss._animTimer * 0.75;
    for (let k = 0; k < count; k++) {
      bulletSystem.spawn('boss', boss.x, boss.y, rot + (Math.PI * 2 * k) / count, 175 * statScale, 5, 3.4, 'normal', Number((5 * statScale).toFixed(1)), 0xef4444, {
        spriteType: 'MObullet1png',
      });
    }
  }

  if (state.timer >= (state.restDuration || 3.0)) {
    state.mode = 'telegraph';
    state.timer = 0;
    state.segIndex = 0;
    state.dashSpeedScale = 1.0;
    state.dashChain = buildMoDashChain(boss.x, boss.y, boss.phase, playerPos, state.lineIndex++);
  }
}

module.exports = {
  ENABLE_NORMAL_OVERHAUL,
  MINIBOSS_DEFS,
  getDifficultyStatScale,
  getScaledMinibossDef,
  buildNormalWorldWaves,
  updateSpecialEnemyTrajectory,
  fireSpecialEnemyPattern,
  getNormalWorldBossConfig,
  fireNormalBossPattern,
  updateMechanicalOphanim,
};

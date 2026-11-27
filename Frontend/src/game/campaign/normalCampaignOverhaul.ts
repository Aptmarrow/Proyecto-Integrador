import type { BossPhaseProfile, SpaceBossProfile, SpaceWaveEvent, WaveEnemySpec } from './spaceCampaignCatalog';
import { MO_PHASE_DEFS } from './moBossEngine';

export const ENABLE_NORMAL_OVERHAUL = true;

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;

export function getDifficultyStatScale(difficulty?: string): number {
  if (difficulty === 'difficult') return 1.1;
  if (difficulty === 'no_mercy') return 1.25;
  return 1.0;
}

export interface NormalMinibossDef extends WaveEnemySpec {
  isMiniboss: true;
  sprite: string;
  minibossName: string;
}

export const MINIBOSS_DEFS: Record<string, NormalMinibossDef> = {
  '1-1': {
    type: 'fb_mini2',
    isMiniboss: true,
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
    shootInterval: 1.05,
    shootDelay: 0.4,
    bulletColor: 0x3b82f6,
    customParams: { hoverX: 590, ampY: 115, freqY: 1.1, moveStyle: 'vertical_sine' },
  },
  '1-2': {
    type: 'fb_mini1',
    isMiniboss: true,
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
    shootInterval: 0.92,
    shootDelay: 0.35,
    bulletColor: 0xfacc15,
    customParams: { hoverX: 585, ampY: 135, freqY: 1.35, moveStyle: 'figure8' },
  },
  '2-1': {
    type: 'gfg_mini1',
    isMiniboss: true,
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
    shootInterval: 1.05,
    shootDelay: 0.4,
    bulletColor: 0xff3b30,
    customParams: { hoverX: 595, ampY: 140, freqY: 1.25, moveStyle: 'diamond_drift' },
  },
  '2-2': {
    type: 'gfg_mini2',
    isMiniboss: true,
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
    shootInterval: 0.1,
    shootDelay: 0.4,
    bulletColor: 0xef4444,
    customParams: { hoverX: 605, ampY: 150, freqY: 1.4, moveStyle: 'arc_sway' },
  },
  '3-1': {
    type: 'mo_mini1',
    isMiniboss: true,
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
    shootInterval: 1.45,
    shootDelay: 0.5,
    bulletColor: 0x9ca3af,
    customParams: { hoverX: 590, ampY: 115, freqY: 1.05, moveStyle: 'pendulum_guard' },
  },
  '3-2': {
    type: 'mo_mini2',
    isMiniboss: true,
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
    shootInterval: 1.25,
    shootDelay: 0.45,
    bulletColor: 0x818cf8,
    customParams: { hoverX: 585, ampY: 130, freqY: 1.2, moveStyle: 'orbital_patrol' },
  },
};

export function getScaledMinibossDef(world: number, stage: number, difficulty: string = 'normal'): NormalMinibossDef | null {
  const base = MINIBOSS_DEFS[`${world}-${stage}`];
  if (!base) return null;
  const scale = getDifficultyStatScale(difficulty);
  return {
    ...base,
    hp: Math.round(base.hp * scale),
    speed: Math.round(base.speed * scale),
    shootInterval: Number(Math.max(0.045, base.shootInterval / scale).toFixed(3)),
    customParams: { ...(base.customParams || {}), statScale: scale },
  };
}

function makeWaveEnemySpec(overrides: Partial<WaveEnemySpec> & { type: string }): WaveEnemySpec {
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
    shootInterval: overrides.shootInterval ?? 1.5,
    shootDelay: overrides.shootDelay ?? 0.3,
    bulletColor: overrides.bulletColor ?? 0x00f2fe,
    customParams: overrides.customParams || {},
  };
}

function buildWorld1NormalWave(
  idx: number,
  variant: number,
  stage: number,
  palette: [number, number, number],
  baseWave?: SpaceWaveEvent
): WaveEnemySpec[] {
  const mode = idx % 4;
  if (mode === 3 && Array.isArray(baseWave?.enemies) && baseWave.enemies.length > 0) {
    return baseWave.enemies.map((e, k) => {
      const mappedType =
        e.type === 'big_fairy' || e.type === 'purple_fairy'
          ? 'third_enemy'
          : k % 2 === 0
            ? 'first_enemy'
            : 'second_enemy';
      const mappedPattern =
        mappedType === 'third_enemy'
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

  const out: WaveEnemySpec[] = [];
  if (mode === 0) {
    const baseY = variant % 2 === 0 ? 180 : 300;
    for (let i = 0; i < 5; i++) {
      const isTop = i % 2 === 0;
      const trajectory = stage === 2 ? 'swoop_arc' : stage === 3 ? (isTop ? 'cross_top' : 'cross_bottom') : 'v_formation';
      const startY = stage === 3 ? (isTop ? 52 : WORLD_HEIGHT - 52) : Math.max(70, Math.min(530, baseY + (i - 2) * 58));
      out.push(
        makeWaveEnemySpec({
          type: 'first_enemy',
          trajectory,
          attackPattern: 'w1_first_normal',
          startX: WORLD_WIDTH + 45 + i * 48,
          startY,
          speed: stage === 3 ? 148 : 136,
          hp: 16,
          shootInterval: 1.45,
          shootDelay: 0.3 + i * 0.16,
          bulletColor: palette[0],
          customParams:
            stage === 2
              ? { apexX: 525 - i * 18, targetY: Math.max(95, Math.min(505, 140 + i * 78)) }
              : { driftY: (variant % 2 === 0 ? 1 : -1) * 18 },
        })
      );
    }
  } else if (mode === 1) {
    const trajectory = stage === 2 ? 'pendulum' : stage === 3 ? 'spiral' : 'sine';
    for (let i = 0; i < 4; i++) {
      const isTop = i % 2 === 0;
      out.push(
        makeWaveEnemySpec({
          type: 'second_enemy',
          trajectory,
          attackPattern: 'w1_second_homing',
          startX: WORLD_WIDTH + 50 + i * 62,
          startY: stage === 2 ? 300 : isTop ? 155 : 445,
          speed: 126,
          hp: 20,
          shootInterval: 1.7,
          shootDelay: 0.35 + i * 0.22,
          bulletColor: 0xfacc15,
          customParams:
            stage === 2
              ? { freq: 1.9, ampY: 155, phase: i * 0.85 }
              : { amp: 60, freq: 2.6, phase: i * 0.5 },
        })
      );
    }
  } else {
    [190, 410].forEach((sy, ti) => {
      const useOrbit = stage === 2;
      out.push(
        makeWaveEnemySpec({
          type: 'third_enemy',
          trajectory: useOrbit ? 'orbit_anchor' : 'hover_retreat',
          attackPattern: 'w1_third_slow',
          startX: WORLD_WIDTH + 55,
          startY: sy,
          speed: 98,
          hp: 48,
          radius: 22,
          scoreValue: 450,
          shootInterval: 1.75,
          shootDelay: 0.45,
          bulletColor: 0x3b82f6,
          customParams: useOrbit
            ? { anchorX: 560, anchorY: sy, orbitR: 62, phase: ti * Math.PI }
            : { hoverX: stage === 3 ? 545 + ti * 50 : 585, hoverTime: 5.0 },
        })
      );
    });
    for (let k = 0; k < 2; k++) {
      const escortTraj = stage === 2 ? 'perimeter_skimmer' : stage === 3 ? 'zigzag' : 'double_helix';
      out.push(
        makeWaveEnemySpec({
          type: 'first_enemy',
          trajectory: escortTraj,
          attackPattern: 'w1_first_normal',
          startX: WORLD_WIDTH + 110 + k * 56,
          startY: stage === 2 ? (k === 0 ? 78 : 522) : stage === 3 ? (k === 0 ? 150 : 450) : 300,
          speed: 132,
          hp: 16,
          shootInterval: 1.55,
          shootDelay: 0.4 + k * 0.25,
          customParams: stage === 2 ? { bobAmp: 16 } : { amp: 70, freq: 3.0, phase: k * Math.PI },
        })
      );
    }
  }
  return out;
}

function buildWorld2NormalWave(
  idx: number,
  variant: number,
  stage: number,
  baseWave?: SpaceWaveEvent
): WaveEnemySpec[] {
  const mode = idx % 4;
  if (mode === 3 && Array.isArray(baseWave?.enemies) && baseWave.enemies.length > 0) {
    return baseWave.enemies.map((e, k) => {
      const m = k % 3;
      const type = m === 0 ? 'gfg_enemy1' : m === 1 ? 'gfg_enemy2' : 'gfg_enemy3';
      const attackPattern = m === 0 ? 'w2_gfg1_fast' : m === 1 ? 'w2_gfg2_sniper022' : 'w2_gfg3_linear_accel';
      return {
        ...e,
        type,
        attackPattern,
        hp: Math.max(18, Math.round((e.hp || 20) * 1.1)),
        shootInterval: m === 1 ? 0.055 : m === 0 ? 0.56 : 1.55,
      };
    });
  }

  const out: WaveEnemySpec[] = [];
  if (mode === 0) {
    const trajectory = stage === 2 ? 'zigzag' : stage === 3 ? 'double_helix' : 'perimeter_skimmer';
    for (let i = 0; i < 5; i++) {
      out.push(
        makeWaveEnemySpec({
          type: 'gfg_enemy1',
          trajectory,
          attackPattern: 'w2_gfg1_fast',
          startX: WORLD_WIDTH + 45 + i * 54,
          startY: stage === 3 ? (i % 2 === 0 ? 200 : 400) : 110 + i * 95,
          speed: 142,
          hp: 22,
          shootInterval: 0.56,
          shootDelay: 0.25 + i * 0.14,
          bulletColor: 0xef4444,
          customParams:
            stage === 3
              ? { amp: 65, freq: 2.9, phase: i * 0.9 }
              : { bobAmp: 18, amp: 32, freq: 2.5, phase: i * 0.6 },
        })
      );
    }
  } else if (mode === 1) {
    [115, 485].forEach((sy, k) => {
      const sniperTraj = stage === 2 ? 'orbit_anchor' : stage === 3 ? 'swoop_arc' : 'hover_retreat';
      out.push(
        makeWaveEnemySpec({
          type: 'gfg_enemy2',
          trajectory: sniperTraj,
          attackPattern: 'w2_gfg2_sniper022',
          startX: WORLD_WIDTH + 50 + k * 45,
          startY: sy,
          speed: 130,
          hp: 30,
          radius: 20,
          scoreValue: 400,
          shootInterval: 0.055,
          shootDelay: 0.5 + k * 0.3,
          bulletColor: 0xff2b5b,
          customParams:
            stage === 2
              ? { anchorX: 600, anchorY: sy < 300 ? 155 : 445, orbitR: 48, phase: k * Math.PI, burstLeft: 0, burstCooldown: 0.4 + k * 0.45 }
              : stage === 3
                ? { apexX: 565, targetY: sy < 300 ? 140 : 460, burstLeft: 0, burstCooldown: 0.4 + k * 0.45 }
                : { hoverX: 615, hoverTime: 5.5, burstLeft: 0, burstCooldown: 0.4 + k * 0.45 },
        })
      );
    });
    for (let j = 0; j < 3; j++) {
      const escortTraj = stage === 2 ? 'sine' : stage === 3 ? (j % 2 === 0 ? 'cross_top' : 'cross_bottom') : 'v_formation';
      out.push(
        makeWaveEnemySpec({
          type: 'gfg_enemy1',
          trajectory: escortTraj,
          attackPattern: 'w2_gfg1_fast',
          startX: WORLD_WIDTH + 90 + j * 45,
          startY: stage === 3 ? (j % 2 === 0 ? 50 : WORLD_HEIGHT - 50) : 240 + j * 60,
          speed: 145,
          hp: 20,
          shootInterval: 0.62,
          shootDelay: 0.35 + j * 0.2,
          customParams: { amp: 48, freq: 2.6, phase: j * 0.7 },
        })
      );
    }
  } else {
    const ys = variant % 2 === 0 ? [150, 300, 450] : [180, 300, 420];
    const traj = stage === 2 ? 'pendulum' : stage === 3 ? 'orbit_anchor' : 'swoop_arc';
    ys.forEach((sy, idxY) => {
      out.push(
        makeWaveEnemySpec({
          type: 'gfg_enemy3',
          trajectory: traj,
          attackPattern: 'w2_gfg3_linear_accel',
          startX: WORLD_WIDTH + 48 + idxY * 36,
          startY: stage === 2 ? 300 : sy,
          speed: 120,
          hp: 32,
          radius: 20,
          shootInterval: 1.4,
          shootDelay: 0.3 + idxY * 0.2,
          bulletColor: 0xf97316,
          customParams:
            stage === 2
              ? { freq: 1.85, ampY: 145, phase: idxY * 1.1 }
              : stage === 3
                ? { anchorX: 560, anchorY: sy, orbitR: 54, phase: idxY * 2.1 }
                : { apexX: 540 - idxY * 24, targetY: sy },
        })
      );
    });
  }
  return out;
}

function buildWorld3NormalWave(
  idx: number,
  variant: number,
  stage: number,
  baseWave?: SpaceWaveEvent
): WaveEnemySpec[] {
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

  const out: WaveEnemySpec[] = [];
  if (mode === 0) {
    const traj = stage === 2 ? 'swoop_arc' : stage === 3 ? 'perimeter_skimmer' : 'hover_retreat';
    for (let i = 0; i < 4; i++) {
      const sy = stage === 3 ? (i % 2 === 0 ? 85 + i * 22 : 515 - i * 22) : 105 + i * 125;
      out.push(
        makeWaveEnemySpec({
          type: 'mo_enemy1',
          trajectory: traj,
          attackPattern: 'w3_mo1_laser',
          startX: WORLD_WIDTH + 45 + i * 38,
          startY: sy,
          speed: 138,
          hp: 26,
          shootInterval: 0.08,
          shootDelay: 0.4 + i * 0.2,
          bulletColor: 0xff2b5b,
          customParams:
            stage === 2
              ? { apexX: 550 - (i % 2) * 35, targetY: sy, laserBurstLeft: 0, laserCooldown: 0.4 + i * 0.25 }
              : stage === 3
                ? { bobAmp: 20, laserBurstLeft: 0, laserCooldown: 0.4 + i * 0.25 }
                : { hoverX: 605 - (i % 2) * 35, hoverTime: 4.5, laserBurstLeft: 0, laserCooldown: 0.4 + i * 0.25 },
        })
      );
    }
  } else if (mode === 1) {
    for (let i = 0; i < 4; i++) {
      out.push(
        makeWaveEnemySpec({
          type: 'mo_enemy2',
          trajectory: 'kamikaze_homing',
          attackPattern: 'none',
          startX: WORLD_WIDTH + 45 + i * 65,
          startY: 110 + i * 125,
          speed: 195,
          hp: 24,
          radius: 18,
          scoreValue: 320,
          customParams: { fuseTime: 1.75, triggerDist: 135 },
        })
      );
    }
    const backupTraj = stage === 2 ? 'zigzag' : stage === 3 ? 'double_helix' : 'sine';
    [170, 430].forEach((sy, k) => {
      out.push(
        makeWaveEnemySpec({
          type: 'mo_enemy1',
          trajectory: backupTraj,
          attackPattern: 'w3_mo1_laser',
          startX: WORLD_WIDTH + 120,
          startY: stage === 3 ? 300 : sy,
          speed: 130,
          hp: 24,
          shootInterval: 0.08,
          shootDelay: 0.5,
          customParams: { amp: 65, freq: 2.6, phase: k * Math.PI, laserBurstLeft: 0, laserCooldown: 0.7 },
        })
      );
    });
  } else {
    const sparkTraj = stage === 2 ? 'pendulum' : stage === 3 ? 'spiral' : 'orbit_anchor';
    for (let i = 0; i < 3; i++) {
      const sy = 140 + i * 160;
      out.push(
        makeWaveEnemySpec({
          type: 'mo_enemy3',
          trajectory: sparkTraj,
          attackPattern: 'w3_mo3_sparks',
          startX: WORLD_WIDTH + 50 + i * 48,
          startY: stage === 2 ? 300 : sy,
          speed: 128,
          hp: 30,
          radius: 20,
          shootInterval: 0.22,
          shootDelay: 0.35 + i * 0.15,
          bulletColor: 0xfef08a,
          customParams:
            stage === 2
              ? { freq: 1.9, ampY: 150, phase: i * 1.1 }
              : stage === 3
                ? { phase: i * 1.2 }
                : { anchorX: 520 + (variant % 2) * 30, anchorY: sy, orbitR: 52, phase: i * 2.1 },
        })
      );
    }
    for (const sy of [80, 520]) {
      out.push(
        makeWaveEnemySpec({
          type: 'mo_enemy2',
          trajectory: 'kamikaze_homing',
          attackPattern: 'none',
          startX: WORLD_WIDTH + 85,
          startY: sy,
          speed: 188,
          hp: 22,
          radius: 18,
          customParams: { fuseTime: 1.75, triggerDist: 135 },
        })
      );
    }
  }
  return out;
}

export function buildNormalWorldWaves(
  world: number,
  stage: number,
  bossSpawnAt: number,
  baseWaves: SpaceWaveEvent[],
  meta: { palette?: [number, number, number]; levelSeed?: number; difficulty?: string } = {}
): SpaceWaveEvent[] {
  const palette = meta.palette || [0x00f2fe, 0xff2b5b, 0xffdd00];
  const seed = meta.levelSeed || 1;
  const statScale = getDifficultyStatScale(meta.difficulty);
  const firstWaveAt = 0.6;
  const lastWaveAt = Math.max(24, bossSpawnAt - 9.5);
  const count = Array.isArray(baseWaves) && baseWaves.length > 0 ? baseWaves.length : 10;
  const step = count > 1 ? (lastWaveAt - firstWaveAt) / (count - 1) : 7.4;

  const waves: SpaceWaveEvent[] = [];
  for (let i = 0; i < count; i++) {
    const at = Number((firstWaveAt + i * step).toFixed(2));
    const v = i + seed;
    const baseWave = baseWaves?.[i];

    const rawEnemies =
      world === 1
        ? buildWorld1NormalWave(i, v, stage, palette, baseWave)
        : world === 2
          ? buildWorld2NormalWave(i, v, stage, baseWave)
          : buildWorld3NormalWave(i, v, stage, baseWave);

    const moveScale = statScale > 1.0 ? 0.84 : 1.0;
    const kamikazeMoveScale = statScale >= 1.2 ? 1.08 : statScale > 1.0 ? 1.04 : 1.0;
    const hoverMult = statScale >= 1.2 ? 1.4 : statScale > 1.0 ? 1.25 : 1.0;

    const enemies = rawEnemies.map((e) => {
      const cp: Record<string, any> = { ...(e.customParams || {}), statScale };
      if (typeof cp.hoverTime === 'number') {
        cp.hoverTime = Number((cp.hoverTime * hoverMult).toFixed(2));
      }
      const speedFactor = e.trajectory === 'kamikaze_homing' ? kamikazeMoveScale : moveScale;
      return {
        ...e,
        hp: Math.max(8, Math.round((e.hp || 18) * statScale)),
        speed: Math.round((e.speed || 130) * speedFactor),
        shootInterval: e.shootInterval ? Number(Math.max(0.045, e.shootInterval / statScale).toFixed(3)) : e.shootInterval,
        customParams: cp,
      };
    });

    waves.push({
      key: `w_${i + 1}`,
      at,
      archetype: baseWave?.archetype || `normal_w${world}_v${i % 4}`,
      enemies,
    });
  }
  return waves;
}

export function getNormalWorldBossProfile(
  world: number,
  palette: [number, number, number],
  difficulty: string = 'normal'
): SpaceBossProfile & {
  bossId: string;
  fullBossName: string;
  introDuration: number;
  statScale: number;
} {
  const hpMults = [1.0, 1.22, 1.15, 1.35, 1.55];
  const statScale = getDifficultyStatScale(difficulty);
  if (world === 1) {
    const baseHp = 118;
    const raw = [
      { name: 'Fase 1 "Salva Estándar & Lenta"', pattern: 'fb_boss_mix_fan', shootInterval: 0.55, laserMode: 'targeted' as const, laserInterval: 5.0, megaLaserInterval: 0 },
      { name: 'Sello I "Enjambre Teledirigido"', pattern: 'fb_boss_homing_salvo', shootInterval: 0.95, laserMode: 'targeted' as const, laserInterval: 4.5, megaLaserInterval: 7.5 },
      { name: 'Fase 3 "Cadencia Alterna"', pattern: 'fb_boss_slow_fast_swap', shootInterval: 0.45, laserMode: 'none' as const, laserInterval: 5.0, megaLaserInterval: 0 },
      { name: 'Protocolo #92 "Tormenta Buscadora"', pattern: 'fb_boss_homing_92', shootInterval: 1.05, laserMode: 'both' as const, laserInterval: 4.2, megaLaserInterval: 6.8 },
      { name: 'Protocolo Final "Trinidad Orbital"', pattern: 'fb_boss_tri_symphony', shootInterval: 0.42, laserMode: 'both' as const, laserInterval: 3.8, megaLaserInterval: 6.2 },
    ];
    return {
      bossId: 'first_boss',
      bossName: 'FirstBoss · Centinela Tri-Protocolo',
      fullBossName: 'FirstBoss · Centinela Tri-Protocolo',
      sprite: '/assets/sprites/FirstBoss.png',
      introDuration: 0,
      moveArchetype: 'orbital_lissajous',
      palette,
      speedScale: Number((0.94 * statScale).toFixed(3)),
      statScale,
      phases: raw.map((p, idx): BossPhaseProfile => ({
        phase: idx + 1,
        isSpellCard: idx === 1 || idx === 3 || idx === 4,
        maxHp: Math.round(baseHp * hpMults[idx] * statScale),
        ...p,
        shootInterval: Number(Math.max(0.045, p.shootInterval / statScale).toFixed(3)),
      })),
    };
  }

  if (world === 2) {
    const baseHp = 145;
    const raw = [
      { name: 'Fase 1 "Arsenal Cinético"', pattern: 'gfg_boss_p1_mix', shootInterval: 0.56, laserMode: 'none' as const, laserInterval: 99, megaLaserInterval: 0 },
      { name: 'Sello Balístico "Francotirador #022"', pattern: 'gfg_boss_p2_sniper', shootInterval: 0.075, laserMode: 'none' as const, laserInterval: 99, megaLaserInterval: 0 },
      { name: 'Fase 3 "Cortina Acelerada"', pattern: 'gfg_boss_p3_accel', shootInterval: 0.58, laserMode: 'none' as const, laserInterval: 99, megaLaserInterval: 0 },
      { name: 'Protocolo Cubo "Fuego y Perdigones"', pattern: 'gfg_boss_p4_shotgun_rapid', shootInterval: 0.13, laserMode: 'none' as const, laserInterval: 99, megaLaserInterval: 0 },
      { name: 'Sobrecarga Total "Guns For Guns"', pattern: 'gfg_boss_p5_all_bullets', shootInterval: 0.42, laserMode: 'none' as const, laserInterval: 99, megaLaserInterval: 0 },
    ];
    return {
      bossId: 'guns_for_guns_cube',
      bossName: 'GunsForGunsCube',
      fullBossName: 'GunsForGunsCube',
      sprite: '/assets/sprites/GunsForGunsCube.png',
      introDuration: 0,
      moveArchetype: 'diamond_tactical',
      palette,
      speedScale: Number((1.0 * statScale).toFixed(3)),
      statScale,
      phases: raw.map((p, idx): BossPhaseProfile => ({
        phase: idx + 1,
        isSpellCard: idx === 1 || idx === 3 || idx === 4,
        maxHp: Math.round(baseHp * hpMults[idx] * statScale),
        ...p,
        shootInterval: Number(Math.max(0.045, p.shootInterval / statScale).toFixed(3)),
      })),
    };
  }

  const baseHp = 125;
  const raw = MO_PHASE_DEFS;
  return {
    bossId: 'mo',
    bossName: 'M.O',
    fullBossName: 'Mechanical Ophanim',
    sprite: '/assets/sprites/M.O.png',
    introDuration: 9.6,
    moveArchetype: 'mo_ophanim_dash',
    palette,
    speedScale: Number((1.06 * statScale).toFixed(3)),
    statScale,
    phases: raw.map((p, idx): BossPhaseProfile => ({
      phase: idx + 1,
      isSpellCard: idx === 1 || idx === 3 || idx === 4,
      maxHp: Math.round(baseHp * hpMults[idx] * statScale),
      ...p,
      shootInterval: Number(Math.max(0.045, p.shootInterval / statScale).toFixed(3)),
    })),
  };
}

export interface BulletSpawnOpts {
  spriteType?: string;
  accel?: number;
  expAccel?: number;
  maxSpeed?: number;
  homeRate?: number;
  homeTime?: number;
  splitOnImpact?: boolean;
  splitCount?: number;
  delay?: number;
  turnAfter?: number;
  turnAngle?: number;
  turnAbsAngle?: number | null;
  turnSpeedMult?: number;
  turnColor?: number;
  holdTag?: number | null;
  angularVel?: number;
  freezeAfter?: number;
  freezeDur?: number;
  snapToPlayer?: boolean;
  snapOffset?: number;
  snapSpeed?: number;
}

export function fireNormalBossPattern(
  patternId: string,
  ctx: { bossX: number; bossY: number; playerX: number; playerY: number; animTimer: number; shotIndex: number; phase: number; statScale?: number },
  rawEmitBullet: (x: number, y: number, angle: number, speed: number, radius: number, color: number, damage: number, opts?: BulletSpawnOpts) => void
): boolean {
  const { bossX, bossY, playerX, playerY, animTimer, shotIndex } = ctx;
  const statScale = Number(ctx.statScale) > 0 ? Number(ctx.statScale) : 1.0;
  const emitBullet = (
    x: number,
    y: number,
    angle: number,
    speed: number,
    radius: number,
    color: number,
    damage: number,
    opts?: BulletSpawnOpts
  ) => {
    const scaledOpts = opts
      ? {
          ...opts,
          accel: opts.accel ? opts.accel * statScale : opts.accel,
          maxSpeed: opts.maxSpeed ? opts.maxSpeed * statScale : opts.maxSpeed,
        }
      : undefined;
    rawEmitBullet(x, y, angle, speed * statScale, radius, color, Math.max(1, Math.round(damage * statScale)), scaledOpts);
  };
  const aim = Math.atan2(playerY - bossY, playerX - bossX);

  switch (patternId) {
    case 'fb_boss_mix_fan':
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
    case 'fb_boss_homing_salvo':
      for (const off of [-0.55, -0.25, 0.25, 0.55]) {
        emitBullet(bossX - 24, bossY, aim + off, 185, 5, 0xfacc15, 5, { spriteType: '2EnemyBulletpng', homeRate: 1.25, homeTime: 1.4 });
      }
      for (let k = 0; k < 8; k++) {
        emitBullet(bossX, bossY, animTimer * 1.2 + (Math.PI * 2 * k) / 8, 165, 5, 0xef4444, 5, { spriteType: '1EnemyBulletpng' });
      }
      return true;
    case 'fb_boss_slow_fast_swap':
      if (shotIndex % 3 === 0) {
        for (let k = 0; k < 12; k++) {
          emitBullet(bossX, bossY, animTimer * 0.8 + (Math.PI * 2 * k) / 12, 118, 6, 0x3b82f6, 5, { spriteType: '3EnemyBulletpng' });
        }
      } else {
        for (const off of [-0.14, 0, 0.14]) {
          emitBullet(bossX - 28, bossY, aim + off, 280, 5, 0xef4444, 5, { spriteType: '1EnemyBulletpng' });
        }
      }
      return true;
    case 'fb_boss_homing_92':
      for (let k = 0; k < 16; k++) {
        emitBullet(bossX, bossY, (Math.PI * 2 * k) / 16, 168, 5, 0xfacc15, 5, { spriteType: '2EnemyBulletpng', homeRate: 2.1, homeTime: 1.5 });
      }
      for (const off of [-0.25, 0.25]) {
        emitBullet(bossX - 28, bossY, aim + off, 130, 6, 0x3b82f6, 5, { spriteType: '3EnemyBulletpng' });
      }
      return true;
    case 'fb_boss_tri_symphony': {
      const rot = animTimer * 1.9;
      const mod = shotIndex % 3;
      if (mod === 0) {
        for (let k = 0; k < 6; k++) emitBullet(bossX, bossY, rot + (Math.PI * 2 * k) / 6, 250, 5, 0xef4444, 5, { spriteType: '1EnemyBulletpng' });
      } else if (mod === 1) {
        for (let k = 0; k < 6; k++) emitBullet(bossX, bossY, -rot + (Math.PI * 2 * k) / 6, 132, 6, 0x3b82f6, 5, { spriteType: '3EnemyBulletpng' });
      } else {
        for (const off of [-0.4, 0, 0.4]) emitBullet(bossX - 24, bossY, aim + off, 195, 5, 0xfacc15, 5, { spriteType: '2EnemyBulletpng', homeRate: 1.35, homeTime: 1.25 });
      }
      return true;
    }
    case 'gfg_boss_p1_mix':
      for (const off of [-0.22, 0, 0.22]) emitBullet(bossX - 28, bossY, aim + off, 275, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
      for (let k = 0; k < 6; k++) emitBullet(bossX - 26, bossY, aim + ((k / 5) - 0.5) * 0.54, 245 + (k % 3) * 32, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet4png' });
      if (shotIndex % 2 === 0) {
        for (const off of [-0.48, 0.48]) {
          emitBullet(bossX - 24, bossY, aim + off, 52, 5.5, 0xf97316, 5, { spriteType: 'GFGbullet3png', expAccel: 1.45, maxSpeed: 460, homeRate: 0.65, homeTime: 1.15 });
        }
      }
      return true;
    case 'gfg_boss_p2_sniper': {
      const cycle = shotIndex % 24;
      if (cycle < 8) {
        emitBullet(bossX - 28, bossY, aim + Math.sin(cycle) * 0.03, 395, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet2png' });
        if (cycle % 3 === 0) {
          for (const off of [-0.34, 0.34]) emitBullet(bossX - 26, bossY, aim + off, 270, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
        }
        if (cycle === 0) {
          for (let k = 0; k < 10; k++) emitBullet(bossX, bossY, (Math.PI * 2 * k) / 10 + animTimer * 0.4, 44, 5, 0xf97316, 5, { spriteType: 'GFGbullet3png', expAccel: 1.55, maxSpeed: 485 });
        }
      } else if (cycle === 14) {
        for (let k = 0; k < 7; k++) emitBullet(bossX - 26, bossY, aim + ((k / 6) - 0.5) * 0.6, 255 + (k % 3) * 32, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet4png' });
        for (let k = 0; k < 8; k++) emitBullet(bossX, bossY, (Math.PI * 2 * k) / 8 + animTimer * 0.5, 44, 5, 0xf97316, 5, { spriteType: 'GFGbullet3png', expAccel: 1.55, maxSpeed: 485 });
      }
      return true;
    }
    case 'gfg_boss_p3_accel': {
      const shift = Math.sin(animTimer * 2.2) * 0.28;
      for (const off of [-0.46, -0.23, 0, 0.23, 0.46]) {
        emitBullet(bossX - 26, bossY, Math.PI + off + shift, 44, 5, 0xf97316, 5, { spriteType: 'GFGbullet3png', expAccel: 1.55, maxSpeed: 490 });
      }
      for (const off of [-0.16, 0, 0.16]) emitBullet(bossX - 28, bossY, aim + off, 325, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet5png' });
      for (const off of [-0.36, 0.36]) emitBullet(bossX - 28, bossY, aim + off, 285, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
      return true;
    }
    case 'gfg_boss_p4_shotgun_rapid': {
      const cyc = shotIndex % 20;
      if (cyc < 10) {
        emitBullet(bossX - 28, bossY, aim + Math.sin(animTimer * 6.5) * 0.24, 330, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet5png' });
        if (cyc % 4 === 0) {
          for (const off of [-0.24, 0.24]) emitBullet(bossX - 26, bossY, aim + off, 280, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
        }
        if (cyc === 2 || cyc === 7) emitBullet(bossX - 28, bossY, aim, 415, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet2png' });
      } else if (cyc === 14) {
        for (let k = 0; k < 9; k++) emitBullet(bossX - 28, bossY, aim + ((k / 8) - 0.5) * 0.68, 260 + (k % 3) * 34, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet4png' });
        for (const off of [-0.06, 0.06]) emitBullet(bossX - 28, bossY, aim + off, 405, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet2png' });
        for (const off of [-0.52, 0.52]) {
          emitBullet(bossX - 24, bossY, aim + off, 52, 5.5, 0xf97316, 5, { spriteType: 'GFGbullet3png', expAccel: 1.45, maxSpeed: 465, homeRate: 0.65, homeTime: 1.15 });
        }
      }
      return true;
    }
    case 'gfg_boss_p5_all_bullets': {
      const m = shotIndex % 3;
      if (m === 0) {
        for (const off of [-0.26, 0, 0.26]) emitBullet(bossX - 28, bossY, aim + off, 290, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
        for (let k = 0; k < 7; k++) emitBullet(bossX - 26, bossY, aim + ((k / 6) - 0.5) * 0.6, 255 + (k % 3) * 32, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet4png' });
        for (let k = 0; k < 8; k++) emitBullet(bossX, bossY, (Math.PI * 2 * k) / 8 + animTimer, 44, 5, 0xf97316, 5, { spriteType: 'GFGbullet3png', expAccel: 1.6, maxSpeed: 500 });
      } else if (m === 1) {
        for (const off of [-0.08, 0, 0.08]) emitBullet(bossX - 28, bossY, aim + off, 410, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet2png' });
        const sw = Math.sin(animTimer * 5.0) * 0.18;
        for (const off of [-0.22, 0.22]) emitBullet(bossX - 28, bossY, aim + off + sw, 335, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet5png' });
        for (const off of [-0.46, 0.46]) emitBullet(bossX - 24, bossY, aim + off, 54, 5.5, 0xf97316, 5, { spriteType: 'GFGbullet3png', expAccel: 1.45, maxSpeed: 470, homeRate: 0.68, homeTime: 1.15 });
      } else {
        for (let k = 0; k < 7; k++) emitBullet(bossX - 28, bossY, aim + ((k / 6) - 0.5) * 0.64, 260 + (k % 3) * 34, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet4png' });
        for (const off of [-0.32, -0.11, 0.11, 0.32]) emitBullet(bossX - 28, bossY, aim + off, 330, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet5png' });
        for (const off of [-0.18, 0.18]) emitBullet(bossX - 26, bossY, aim + off, 295, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
      }
      return true;
    }
    default:
      return false;
  }
}

import type { BossPhaseProfile, SpaceBossProfile, SpaceWaveEvent, WaveEnemySpec } from './spaceCampaignCatalog';

export const ENABLE_NORMAL_OVERHAUL = true;

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;

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
    itemDrop: 'life_frag',
    shootInterval: 1.05,
    shootDelay: 0.4,
    bulletColor: 0x3b82f6,
    customParams: { hoverX: 590, ampY: 115, freqY: 1.1 },
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
    itemDrop: 'life_frag',
    shootInterval: 0.92,
    shootDelay: 0.35,
    bulletColor: 0xfacc15,
    customParams: { hoverX: 585, ampY: 135, freqY: 1.45 },
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
    itemDrop: 'life_frag',
    shootInterval: 1.05,
    shootDelay: 0.4,
    bulletColor: 0xff3b30,
    customParams: { hoverX: 595, ampY: 140, freqY: 1.35 },
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
    itemDrop: 'life_frag',
    shootInterval: 0.1,
    shootDelay: 0.4,
    bulletColor: 0xef4444,
    customParams: { hoverX: 590, ampY: 150, freqY: 1.5 },
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
    itemDrop: 'life_frag',
    shootInterval: 1.45,
    shootDelay: 0.5,
    bulletColor: 0x9ca3af,
    customParams: { hoverX: 590, ampY: 110, freqY: 1.05 },
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
    itemDrop: 'life_frag',
    shootInterval: 1.25,
    shootDelay: 0.45,
    bulletColor: 0x818cf8,
    customParams: { hoverX: 585, ampY: 135, freqY: 1.25 },
  },
};

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
    itemDrop: overrides.itemDrop || 'point',
    shootInterval: overrides.shootInterval ?? 1.5,
    shootDelay: overrides.shootDelay ?? 0.3,
    bulletColor: overrides.bulletColor ?? 0x00f2fe,
    customParams: overrides.customParams || {},
  };
}

function buildWorld1NormalWave(
  idx: number,
  variant: number,
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
      out.push(
        makeWaveEnemySpec({
          type: 'first_enemy',
          trajectory: 'v_formation',
          attackPattern: 'w1_first_normal',
          startX: WORLD_WIDTH + 45 + i * 48,
          startY: Math.max(70, Math.min(530, baseY + (i - 2) * 58)),
          speed: 136,
          hp: 16,
          itemDrop: i === 2 ? 'power' : 'point',
          shootInterval: 1.45,
          shootDelay: 0.3 + i * 0.16,
          bulletColor: palette[0],
          customParams: { driftY: (variant % 2 === 0 ? 1 : -1) * 18 },
        })
      );
    }
  } else if (mode === 1) {
    for (let i = 0; i < 4; i++) {
      const isTop = i % 2 === 0;
      out.push(
        makeWaveEnemySpec({
          type: 'second_enemy',
          trajectory: 'sine',
          attackPattern: 'w1_second_homing',
          startX: WORLD_WIDTH + 50 + i * 62,
          startY: isTop ? 155 : 445,
          speed: 126,
          hp: 20,
          itemDrop: i % 2 === 0 ? 'power' : 'point',
          shootInterval: 1.7,
          shootDelay: 0.35 + i * 0.22,
          bulletColor: 0xfacc15,
          customParams: { amp: 60, freq: 2.6, phase: i * 0.5 },
        })
      );
    }
  } else {
    for (const sy of [190, 410]) {
      out.push(
        makeWaveEnemySpec({
          type: 'third_enemy',
          trajectory: 'hover_retreat',
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
          customParams: { hoverX: 585, hoverTime: 5.0 },
        })
      );
    }
    for (let k = 0; k < 2; k++) {
      out.push(
        makeWaveEnemySpec({
          type: 'first_enemy',
          trajectory: 'double_helix',
          attackPattern: 'w1_first_normal',
          startX: WORLD_WIDTH + 110 + k * 56,
          startY: 300,
          speed: 132,
          hp: 16,
          itemDrop: 'point',
          shootInterval: 1.55,
          shootDelay: 0.4 + k * 0.25,
          customParams: { amp: 70, freq: 3.0, phase: k * Math.PI },
        })
      );
    }
  }
  return out;
}

function buildWorld2NormalWave(
  idx: number,
  variant: number,
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
        shootInterval: m === 1 ? 0.055 : m === 0 ? 1.25 : 1.55,
      };
    });
  }

  const out: WaveEnemySpec[] = [];
  if (mode === 0) {
    for (let i = 0; i < 5; i++) {
      out.push(
        makeWaveEnemySpec({
          type: 'gfg_enemy1',
          trajectory: 'sine',
          attackPattern: 'w2_gfg1_fast',
          startX: WORLD_WIDTH + 45 + i * 54,
          startY: 110 + i * 95,
          speed: 142,
          hp: 22,
          itemDrop: i % 2 === 0 ? 'power' : 'point',
          shootInterval: 1.18,
          shootDelay: 0.25 + i * 0.14,
          bulletColor: 0xef4444,
          customParams: { amp: 32, freq: 2.5, phase: i * 0.6 },
        })
      );
    }
  } else if (mode === 1) {
    [115, 485].forEach((sy, k) => {
      out.push(
        makeWaveEnemySpec({
          type: 'gfg_enemy2',
          trajectory: 'hover_retreat',
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
          customParams: { hoverX: 615, hoverTime: 5.5, burstLeft: 0, burstCooldown: 0.4 + k * 0.45 },
        })
      );
    });
    for (let j = 0; j < 3; j++) {
      out.push(
        makeWaveEnemySpec({
          type: 'gfg_enemy1',
          trajectory: 'v_formation',
          attackPattern: 'w2_gfg1_fast',
          startX: WORLD_WIDTH + 90 + j * 45,
          startY: 240 + j * 60,
          speed: 145,
          hp: 20,
          itemDrop: 'point',
          shootInterval: 1.25,
          shootDelay: 0.35 + j * 0.2,
        })
      );
    }
  } else {
    const ys = variant % 2 === 0 ? [150, 300, 450] : [180, 300, 420];
    ys.forEach((sy, idxY) => {
      out.push(
        makeWaveEnemySpec({
          type: 'gfg_enemy3',
          trajectory: 'hover_retreat',
          attackPattern: 'w2_gfg3_linear_accel',
          startX: WORLD_WIDTH + 48 + idxY * 36,
          startY: sy,
          speed: 120,
          hp: 32,
          radius: 20,
          itemDrop: idxY === 1 ? 'life_frag' : 'power',
          shootInterval: 1.4,
          shootDelay: 0.3 + idxY * 0.2,
          bulletColor: 0xf97316,
          customParams: { hoverX: 590 - idxY * 22, hoverTime: 4.8 },
        })
      );
    });
  }
  return out;
}

function buildWorld3NormalWave(
  idx: number,
  variant: number,
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
    for (let i = 0; i < 4; i++) {
      out.push(
        makeWaveEnemySpec({
          type: 'mo_enemy1',
          trajectory: 'hover_retreat',
          attackPattern: 'w3_mo1_laser',
          startX: WORLD_WIDTH + 45 + i * 38,
          startY: 105 + i * 125,
          speed: 138,
          hp: 26,
          itemDrop: i % 2 === 0 ? 'power' : 'point',
          shootInterval: 0.08,
          shootDelay: 0.4 + i * 0.2,
          bulletColor: 0xff2b5b,
          customParams: { hoverX: 605 - (i % 2) * 35, hoverTime: 4.5, laserBurstLeft: 0, laserCooldown: 0.4 + i * 0.25 },
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
          itemDrop: i === 3 ? 'bomb_frag' : 'power',
          customParams: { fuseTime: 1.75, triggerDist: 135 },
        })
      );
    }
    for (const sy of [170, 430]) {
      out.push(
        makeWaveEnemySpec({
          type: 'mo_enemy1',
          trajectory: 'sine',
          attackPattern: 'w3_mo1_laser',
          startX: WORLD_WIDTH + 120,
          startY: sy,
          speed: 130,
          hp: 24,
          itemDrop: 'point',
          shootInterval: 0.08,
          shootDelay: 0.5,
          customParams: { amp: 45, freq: 2.2, laserBurstLeft: 0, laserCooldown: 0.7 },
        })
      );
    }
  } else {
    for (let i = 0; i < 3; i++) {
      out.push(
        makeWaveEnemySpec({
          type: 'mo_enemy3',
          trajectory: 'hover_retreat',
          attackPattern: 'w3_mo3_sparks',
          startX: WORLD_WIDTH + 50 + i * 48,
          startY: 140 + i * 160,
          speed: 128,
          hp: 30,
          radius: 20,
          itemDrop: i === 1 ? 'life_frag' : 'power',
          shootInterval: 0.22,
          shootDelay: 0.35 + i * 0.15,
          bulletColor: 0xfef08a,
          customParams: { hoverX: 515 + (variant % 2) * 35, hoverTime: 5.2 },
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
          itemDrop: 'point',
          customParams: { fuseTime: 1.75, triggerDist: 135 },
        })
      );
    }
  }
  return out;
}

export function buildNormalWorldWaves(
  world: number,
  _stage: number,
  bossSpawnAt: number,
  baseWaves: SpaceWaveEvent[],
  meta: { palette?: [number, number, number]; levelSeed?: number } = {}
): SpaceWaveEvent[] {
  const palette = meta.palette || [0x00f2fe, 0xff2b5b, 0xffdd00];
  const seed = meta.levelSeed || 1;
  const firstWaveAt = 0.6;
  const lastWaveAt = Math.max(24, bossSpawnAt - 9.5);
  const count = Array.isArray(baseWaves) && baseWaves.length > 0 ? baseWaves.length : 10;
  const step = count > 1 ? (lastWaveAt - firstWaveAt) / (count - 1) : 7.4;

  const waves: SpaceWaveEvent[] = [];
  for (let i = 0; i < count; i++) {
    const at = Number((firstWaveAt + i * step).toFixed(2));
    const v = i + seed;
    const baseWave = baseWaves?.[i];

    const enemies =
      world === 1
        ? buildWorld1NormalWave(i, v, palette, baseWave)
        : world === 2
          ? buildWorld2NormalWave(i, v, baseWave)
          : buildWorld3NormalWave(i, v, baseWave);

    waves.push({
      key: `w_${i + 1}`,
      at,
      archetype: baseWave?.archetype || `normal_w${world}_v${i % 4}`,
      enemies,
    });
  }
  return waves;
}

export function getNormalWorldBossProfile(world: number, palette: [number, number, number]): SpaceBossProfile & {
  bossId: string;
  fullBossName: string;
  introDuration: number;
} {
  const hpMults = [1.0, 1.22, 1.15, 1.35, 1.55];
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
      speedScale: 0.94,
      phases: raw.map((p, idx): BossPhaseProfile => ({
        phase: idx + 1,
        isSpellCard: idx === 1 || idx === 3 || idx === 4,
        maxHp: Math.round(baseHp * hpMults[idx]),
        ...p,
      })),
    };
  }

  if (world === 2) {
    const baseHp = 145;
    const raw = [
      { name: 'Fase 1 "Arsenal Cinético"', pattern: 'gfg_boss_p1_mix', shootInterval: 0.48, laserMode: 'targeted' as const, laserInterval: 4.6, megaLaserInterval: 0 },
      { name: 'Sello Balístico "Francotirador #022"', pattern: 'gfg_boss_p2_sniper', shootInterval: 0.06, laserMode: 'targeted' as const, laserInterval: 4.4, megaLaserInterval: 7.2 },
      { name: 'Fase 3 "Cortina Acelerada"', pattern: 'gfg_boss_p3_accel', shootInterval: 0.55, laserMode: 'none' as const, laserInterval: 4.8, megaLaserInterval: 0 },
      { name: 'Protocolo Cubo "Fuego y Perdigones"', pattern: 'gfg_boss_p4_shotgun_rapid', shootInterval: 0.12, laserMode: 'both' as const, laserInterval: 3.8, megaLaserInterval: 6.5 },
      { name: 'Sobrecarga Total "Guns For Guns"', pattern: 'gfg_boss_p5_all_bullets', shootInterval: 0.36, laserMode: 'both' as const, laserInterval: 3.6, megaLaserInterval: 6.0 },
    ];
    return {
      bossId: 'guns_for_guns_cube',
      bossName: 'GunsForGunsCube',
      fullBossName: 'GunsForGunsCube',
      sprite: '/assets/sprites/GunsForGunsCube.png',
      introDuration: 0,
      moveArchetype: 'diamond_tactical',
      palette,
      speedScale: 1.0,
      phases: raw.map((p, idx): BossPhaseProfile => ({
        phase: idx + 1,
        isSpellCard: idx === 1 || idx === 3 || idx === 4,
        maxHp: Math.round(baseHp * hpMults[idx]),
        ...p,
      })),
    };
  }

  const baseHp = 175;
  const raw = [
    { name: 'Fase 1 "Vectores Rectos"', pattern: 'mo_dash_pattern', shootInterval: 0.5, laserMode: 'none' as const, laserInterval: 99, megaLaserInterval: 0 },
    { name: 'Sello Ophanim "Trazos del Trono"', pattern: 'mo_dash_pattern', shootInterval: 0.45, laserMode: 'none' as const, laserInterval: 99, megaLaserInterval: 8.5 },
    { name: 'Fase 3 "Aceleración Axial"', pattern: 'mo_dash_pattern', shootInterval: 0.4, laserMode: 'none' as const, laserInterval: 99, megaLaserInterval: 0 },
    { name: 'Protocolo Serafín "Cruce Mecánico"', pattern: 'mo_dash_pattern', shootInterval: 0.35, laserMode: 'none' as const, laserInterval: 99, megaLaserInterval: 7.5 },
    { name: 'Protocolo Final "MECANICAL OPHANIM"', pattern: 'mo_dash_pattern', shootInterval: 0.3, laserMode: 'none' as const, laserInterval: 99, megaLaserInterval: 6.8 },
  ];
  return {
    bossId: 'mo',
    bossName: 'M.O',
    fullBossName: 'Mecanical Ophanim',
    sprite: '/assets/sprites/M.O.png',
    introDuration: 3.8,
    moveArchetype: 'mo_ophanim_dash',
    palette,
    speedScale: 1.06,
    phases: raw.map((p, idx): BossPhaseProfile => ({
      phase: idx + 1,
      isSpellCard: idx === 1 || idx === 3 || idx === 4,
      maxHp: Math.round(baseHp * hpMults[idx]),
      ...p,
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
}

export function fireNormalBossPattern(
  patternId: string,
  ctx: { bossX: number; bossY: number; playerX: number; playerY: number; animTimer: number; shotIndex: number; phase: number },
  emitBullet: (x: number, y: number, angle: number, speed: number, radius: number, color: number, damage: number, opts?: BulletSpawnOpts) => void
): boolean {
  const { bossX, bossY, playerX, playerY, animTimer, shotIndex } = ctx;
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
      if (shotIndex % 2 === 0) {
        for (const off of [-0.28, -0.1, 0.1, 0.28]) emitBullet(bossX - 28, bossY, aim + off, 275, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
      } else {
        for (let k = 0; k < 8; k++) emitBullet(bossX - 26, bossY, aim + ((k / 7) - 0.5) * 0.58, 260 + (k % 3) * 35, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet4png' });
      }
      return true;
    case 'gfg_boss_p2_sniper': {
      const cycle = shotIndex % 26;
      if (cycle < 8) {
        emitBullet(bossX - 28, bossY, aim + Math.sin(cycle) * 0.04, 395, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet2png' });
      } else if (cycle === 14) {
        for (let k = 0; k < 12; k++) emitBullet(bossX, bossY, (Math.PI * 2 * k) / 12 + animTimer * 0.4, 42, 5, 0xf97316, 5, { spriteType: 'GFGbullet3png', expAccel: 1.65, maxSpeed: 510 });
      }
      return true;
    }
    case 'gfg_boss_p3_accel': {
      const shift = Math.sin(animTimer * 2.2) * 0.3;
      for (const off of [-0.48, -0.24, 0, 0.24, 0.48]) {
        emitBullet(bossX - 26, bossY, Math.PI + off + shift, 42, 5, 0xf97316, 5, { spriteType: 'GFGbullet3png', expAccel: 1.65, maxSpeed: 510 });
      }
      if (shotIndex % 2 === 0) emitBullet(bossX - 28, bossY, aim, 285, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
      return true;
    }
    case 'gfg_boss_p4_shotgun_rapid': {
      const cyc = shotIndex % 22;
      if (cyc < 10) {
        emitBullet(bossX - 28, bossY, aim + Math.sin(animTimer * 6.5) * 0.26, 330, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet5png' });
      } else if (cyc === 15) {
        for (let k = 0; k < 11; k++) emitBullet(bossX - 28, bossY, aim + ((k / 10) - 0.5) * 0.72, 265 + (k % 4) * 32, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet4png' });
      }
      return true;
    }
    case 'gfg_boss_p5_all_bullets': {
      const m = shotIndex % 5;
      if (m === 0) {
        for (const off of [-0.3, 0, 0.3]) emitBullet(bossX - 28, bossY, aim + off, 290, 5, 0xef4444, 5, { spriteType: 'GFGbullet1png' });
      } else if (m === 1) {
        emitBullet(bossX - 28, bossY, aim, 410, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet2png' });
      } else if (m === 2) {
        for (let k = 0; k < 10; k++) emitBullet(bossX, bossY, (Math.PI * 2 * k) / 10 + animTimer, 42, 5, 0xf97316, 5, { spriteType: 'GFGbullet3png', expAccel: 1.7, maxSpeed: 520 });
      } else if (m === 3) {
        for (let k = 0; k < 9; k++) emitBullet(bossX - 28, bossY, aim + ((k / 8) - 0.5) * 0.65, 260 + (k % 3) * 35, 5.5, 0xef4444, 5, { spriteType: 'GFGbullet4png' });
      } else {
        for (const off of [-0.18, 0.18]) emitBullet(bossX - 28, bossY, aim + off, 335, 5.5, 0xf87171, 5, { spriteType: 'GFGbullet5png' });
      }
      return true;
    }
    default:
      return false;
  }
}

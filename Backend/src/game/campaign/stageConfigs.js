'use strict';

/**
 * 27 Distinct Space-Themed Levels for the Danmakrew Campaign.
 *
 * Structure: 3 Difficulties × 3 Worlds × 3 Stages = 27 unique levels.
 *   - Every (difficulty, world, stage) is an entirely distinct space sector with its own:
 *       1. Cosmic World & Stage Title
 *       2. Visual Space Backdrop Theme (`spaceTheme`)
 *       3. Pre-Boss Wave Duration:
 *            • Stages X-1 & X-2: 132s–174s (strictly 2 to 3 minutes) before Boss arrives
 *            • Stage X-3:        90s       (exact 1 minute 30 seconds) before Boss arrives
 *       4. Bespoke Wave Formation Choreography leveraging all 4 Player Roles
 *          (Tank barrier lanes, Support peripheral auto-aim & heals, DPS armored cores, SP.ATK columns & Beam Clash)
 *       5. Unique 5-Phase Space Boss Profile (using `/assets/sprites/FirstBoss.png`)
 */

const { buildLevelWaveScript } = require('./spaceThemesAndWaves');
const {
  ENABLE_NORMAL_OVERHAUL,
  MINIBOSS_DEFS,
  buildNormalWorldWaves,
  getNormalWorldBossConfig,
} = require('./normalCampaignOverhaul');

const WORLDS_PER_DIFFICULTY = 3;
const STAGES_PER_WORLD = 3;

const DIFFICULTY_LABELS = {
  normal: 'Normal',
  difficult: 'Dificil',
  no_mercy: 'NoMercy',
};

const PATTERN_INTERVALS = {
  crescent_fan: 0.44,
  galaxy_spiral: 0.20,
  counter_lotus: 0.42,
  pulsar_lighthouse: 0.22,
  star_mandala: 0.88,
  binary_helix: 0.24,
  prism_lattice: 0.46,
  chrono_rings: 0.72,
  comet_rain: 0.52,
  gravity_whirlpool: 0.24,
  siege_broadside: 0.62,
  supernova_symphony: 0.34,
};

function makeBossProfile(def) {
  const baseHp = def.baseHp || 120;
  const speedScale = def.speedScale || 1.0;
  const phases = def.phases.map((p, idx) => {
    const phaseNum = idx + 1;
    const hpMultipliers = [1.0, 1.22, 1.15, 1.35, 1.55];
    return {
      phase: phaseNum,
      name: p.name,
      isSpellCard: phaseNum === 2 || phaseNum === 4 || phaseNum === 5,
      maxHp: Math.round(baseHp * hpMultipliers[idx]),
      pattern: p.pattern,
      shootInterval: p.shootInterval ?? Number(((PATTERN_INTERVALS[p.pattern] || 0.36) / (0.94 + speedScale * 0.06)).toFixed(3)),
      laserMode: p.laserMode || (phaseNum >= 4 ? 'both' : (phaseNum <= 2 ? 'targeted' : 'none')),
      laserInterval: p.laserInterval || (phaseNum >= 4 ? 3.8 : 4.8),
      megaLaserInterval: p.megaLaserInterval ?? (phaseNum === 2 ? 7.2 : phaseNum === 4 ? 6.6 : phaseNum === 5 ? 6.0 : 0),
    };
  });

  return {
    bossId: def.bossId || 'first_boss',
    bossName: def.bossName,
    fullBossName: def.fullBossName || def.bossName,
    sprite: def.sprite || '/assets/sprites/FirstBoss.png',
    introDuration: def.introDuration || 0,
    moveArchetype: def.moveArchetype || 'orbital_lissajous',
    palette: def.palette || [0x00f2fe, 0xff2b5b, 0xffdd00],
    speedScale,
    phases,
  };
}

let _seedCounter = 1;

function createSpaceStage(spec) {
  const seed = _seedCounter++;
  const bossSpawnAt = spec.bossSpawnAt;
  const bossWarningAt = Number((bossSpawnAt - 3.5).toFixed(1));
  const palette = spec.palette || [0x00f2fe, 0xff2b5b, 0xffdd00];

  const baseWaves = buildLevelWaveScript(spec.waveArchetypes, bossSpawnAt, {
    hpScale: spec.waveHpScale || 1.0,
    speedScale: spec.waveSpeedScale || 1.0,
    palette,
    levelSeed: seed,
  });

  const useNormalOverhaul = ENABLE_NORMAL_OVERHAUL && spec.difficulty === 'normal';
  const hasBoss = useNormalOverhaul ? spec.stage === 3 : true;
  const miniboss = useNormalOverhaul && !hasBoss
    ? (MINIBOSS_DEFS[`${spec.world}-${spec.stage}`] || null)
    : null;
  const waves = useNormalOverhaul
    ? buildNormalWorldWaves(spec.world, spec.stage, bossSpawnAt, baseWaves, {
        hpScale: spec.waveHpScale || 1.0,
        speedScale: spec.waveSpeedScale || 1.0,
        palette,
        levelSeed: seed,
      })
    : baseWaves;
  const normalBossCfg = useNormalOverhaul && hasBoss ? getNormalWorldBossConfig(spec.world) : null;

  return {
    difficulty: spec.difficulty,
    world: spec.world,
    stage: spec.stage,
    worldName: spec.worldName,
    stageTitle: spec.stageTitle,
    palette,
    hasBoss,
    miniboss,
    spaceTheme: {
      id: `${spec.difficulty}-${spec.world}-${spec.stage}`,
      skyTop: spec.theme.skyTop,
      skyBottom: spec.theme.skyBottom,
      nebulaA: spec.theme.nebulaA,
      nebulaB: spec.theme.nebulaB,
      gridColor: spec.theme.gridColor,
      accentColor: spec.theme.accentColor,
      feature: spec.theme.feature, // 'planet_ring' | 'debris_belt' | 'lunar_halo' | 'solar_corona' | 'dyson_grid' | 'eclipse_gate' | 'comet_trail' | 'ion_nebula' | 'hypergate' | 'pulsar_beams' | 'aurora_curtain' | 'magnetar_arcs' | 'ghost_fleet' | 'crystal_spire' | 'chrono_rings' | 'shock_filament' | 'starforge' | 'binary_stars' | 'quasar_jet' | 'accretion_disk' | 'photon_ring' | 'cosmic_web' | 'entropy_rift' | 'zero_point' | 'galaxy_clash' | 'gamma_cathedral' | 'eternity_horizon'
      starColors: spec.theme.starColors || [palette[0], palette[1], palette[2], 0xffffff],
      scrollSpeed: spec.theme.scrollSpeed || 135,
    },
    wavePattern: waves.map((_, i) => i + 1),
    waveScheduleSeconds: waves.map((w) => w.at),
    waves,
    bossWarningAt,
    bossSpawnAt,
    bossProfile: makeBossProfile({
      bossId: normalBossCfg?.bossId || 'first_boss',
      bossName: normalBossCfg?.bossName || spec.boss.bossName,
      fullBossName: normalBossCfg?.fullBossName || normalBossCfg?.bossName || spec.boss.bossName,
      sprite: normalBossCfg?.sprite || '/assets/sprites/FirstBoss.png',
      introDuration: normalBossCfg?.introDuration || 0,
      baseHp: normalBossCfg?.baseHp || spec.boss.baseHp,
      speedScale: normalBossCfg?.speedScale || spec.boss.speedScale,
      moveArchetype: normalBossCfg?.moveArchetype || spec.boss.moveArchetype,
      palette,
      phases: normalBossCfg?.phases || spec.boss.phases,
    }),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. NORMAL EXPEDITION — 9 Distinct Space Sectors
// ══════════════════════════════════════════════════════════════════════════════
const NORMAL_CONFIGS = [
  // ── WORLD 1: Frontera Orbital ─────────────────────────────────────────────
  createSpaceStage({
    difficulty: 'normal', world: 1, stage: 1,
    worldName: 'Frontera Orbital', stageTitle: 'Astillero Lagrange',
    bossSpawnAt: 132.0, // 2m 12s
    waveHpScale: 0.95, waveSpeedScale: 0.92,
    palette: [0x00f2fe, 0x3b82f6, 0xffd166],
    theme: {
      skyTop: 0x040818, skyBottom: 0x0a1633,
      nebulaA: 0x102a5c, nebulaB: 0x005f88,
      gridColor: 0x1d3f72, accentColor: 0x00f2fe,
      feature: 'planet_ring', scrollSpeed: 125,
    },
    waveArchetypes: [
      'orbital_chevron', 'double_helix_ion', 'satellite_relay_flank',
      'siege_artillery_wall', 'phalanx_drone_column', 'dreadnought_core',
      'nebula_flower_pincer', 'orbital_chevron', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Centinela Aegis-01', baseHp: 112, speedScale: 0.92,
      moveArchetype: 'orbital_lissajous',
      phases: [
        { name: 'Fase 1 "Patrulla Lagrange"', pattern: 'crescent_fan' },
        { name: 'Sello Orbital "Escudo Perigeo"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Vectores de Atraque"', pattern: 'binary_helix' },
        { name: 'Protocolo Aegis "Anillo Geosíncrono"', pattern: 'counter_lotus' },
        { name: 'Órbita Final "Lanza Cenital"', pattern: 'galaxy_spiral' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'normal', world: 1, stage: 2,
    worldName: 'Frontera Orbital', stageTitle: 'Cinturón Kessler',
    bossSpawnAt: 148.0, // 2m 28s
    waveHpScale: 1.0, waveSpeedScale: 0.95,
    palette: [0x38bdf8, 0xf97316, 0xfacc15],
    theme: {
      skyTop: 0x080a14, skyBottom: 0x181524,
      nebulaA: 0x2c2238, nebulaB: 0x4a2518,
      gridColor: 0x3a2f4d, accentColor: 0xf97316,
      feature: 'debris_belt', scrollSpeed: 142,
    },
    waveArchetypes: [
      'meteor_cross_lattice', 'phalanx_drone_column', 'satellite_relay_flank',
      'comet_swoop_blitz', 'dreadnought_core', 'siege_artillery_wall',
      'meteor_cross_lattice', 'broadside_frigate_line', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Soberano Kessler-IX', baseHp: 120, speedScale: 0.95,
      moveArchetype: 'pendulum_sweep',
      phases: [
        { name: 'Fase 1 "Cascada de Metralla"', pattern: 'comet_rain' },
        { name: 'Sello Síndrome "Órbita Fragmentada"', pattern: 'prism_lattice' },
        { name: 'Fase 3 "Enjambre de Satélites"', pattern: 'crescent_fan' },
        { name: 'Protocolo Chatarra "Jaula de Titanio"', pattern: 'siege_broadside' },
        { name: 'Impacto Final "Lluvia Hiperveloz"', pattern: 'star_mandala' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'normal', world: 1, stage: 3,
    worldName: 'Frontera Orbital', stageTitle: 'Bastión Lunar Selene',
    bossSpawnAt: 90.0, // 1m 30s exact
    waveHpScale: 1.05, waveSpeedScale: 0.97,
    palette: [0xe2e8f0, 0x60a5fa, 0xc084fc],
    theme: {
      skyTop: 0x050712, skyBottom: 0x111830,
      nebulaA: 0x1e294b, nebulaB: 0x31255a,
      gridColor: 0x334168, accentColor: 0x93c5fd,
      feature: 'lunar_halo', scrollSpeed: 132,
    },
    waveArchetypes: [
      'aurora_curtain_ribbon', 'satellite_relay_flank', 'prism_refraction_hex',
      'binary_twin_commanders', 'siege_artillery_wall', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Arconte Lunar Selene', baseHp: 128, speedScale: 0.97,
      moveArchetype: 'vortex_figure8',
      phases: [
        { name: 'Fase 1 "Brisa del Mar de la Tranquilidad"', pattern: 'counter_lotus' },
        { name: 'Sello Selenita "plenilunio de Plata"', pattern: 'chrono_rings' },
        { name: 'Fase 3 "Marea Gravitatoria"', pattern: 'crescent_fan' },
        { name: 'Protocolo Cráter "Corona de Artemisa"', pattern: 'star_mandala' },
        { name: 'Eclipse Lunar "Rayo del Apogeo"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  // ── WORLD 2: Sector Helios ────────────────────────────────────────────────
  createSpaceStage({
    difficulty: 'normal', world: 2, stage: 1,
    worldName: 'Sector Helios', stageTitle: 'Corriente de Viento Solar',
    bossSpawnAt: 138.0, // 2m 18s
    waveHpScale: 1.06, waveSpeedScale: 0.98,
    palette: [0xfbbf24, 0xf97316, 0x38bdf8],
    theme: {
      skyTop: 0x140704, skyBottom: 0x2b1106,
      nebulaA: 0x5c2208, nebulaB: 0x853a0a,
      gridColor: 0x6b2f12, accentColor: 0xfbbf24,
      feature: 'solar_corona', scrollSpeed: 148,
    },
    waveArchetypes: [
      'aurora_curtain_ribbon', 'double_helix_ion', 'comet_swoop_blitz',
      'satellite_relay_flank', 'dreadnought_core', 'nebula_flower_pincer',
      'phalanx_drone_column', 'spiral_galaxy_arms', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Heraldo Coronal Helios-V', baseHp: 132, speedScale: 0.98,
      moveArchetype: 'orbital_lissajous',
      phases: [
        { name: 'Fase 1 "Ráfaga Fotosférica"', pattern: 'crescent_fan' },
        { name: 'Sello Solar "Flor de Fulguración"', pattern: 'star_mandala' },
        { name: 'Fase 3 " Viento Ionizado"', pattern: 'galaxy_spiral' },
        { name: 'Protocolo Corona "Arco Magnético Solar"', pattern: 'binary_helix' },
        { name: 'Fulguración X "Sol de Medianoche"', pattern: 'counter_lotus' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'normal', world: 2, stage: 2,
    worldName: 'Sector Helios', stageTitle: 'Forja Orbital de Mercurio',
    bossSpawnAt: 156.0, // 2m 36s
    waveHpScale: 1.1, waveSpeedScale: 1.0,
    palette: [0xff6b35, 0xffd166, 0x00f2fe],
    theme: {
      skyTop: 0x120608, skyBottom: 0x281014,
      nebulaA: 0x52181c, nebulaB: 0x6e2f14,
      gridColor: 0x5e2626, accentColor: 0xff6b35,
      feature: 'dyson_grid', scrollSpeed: 140,
    },
    waveArchetypes: [
      'siege_artillery_wall', 'prism_refraction_hex', 'broadside_frigate_line',
      'satellite_relay_flank', 'binary_twin_commanders', 'phalanx_drone_column',
      'meteor_cross_lattice', 'pulsar_clock_pods', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Supervisor Vulcano-Prime', baseHp: 138, speedScale: 1.0,
      moveArchetype: 'diamond_tactical',
      phases: [
        { name: 'Fase 1 "Crisol Termosolar"', pattern: 'siege_broadside' },
        { name: 'Sello Espejo "Red Colectora Dyson"', pattern: 'prism_lattice' },
        { name: 'Fase 3 "Escoria Incandescente"', pattern: 'comet_rain' },
        { name: 'Protocolo Forja "Martillo de Perihelio"', pattern: 'pulsar_lighthouse' },
        { name: 'Fusión Estelar "Corazón de Mercurio"', pattern: 'star_mandala' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'normal', world: 2, stage: 3,
    worldName: 'Sector Helios', stageTitle: 'Portal de Eyección Coronal',
    bossSpawnAt: 90.0, // 1m 30s exact
    waveHpScale: 1.14, waveSpeedScale: 1.02,
    palette: [0xff2b5b, 0xffdd00, 0xff8800],
    theme: {
      skyTop: 0x16040a, skyBottom: 0x330a14,
      nebulaA: 0x661224, nebulaB: 0x803808,
      gridColor: 0x6e1d30, accentColor: 0xffdd00,
      feature: 'eclipse_gate', scrollSpeed: 154,
    },
    waveArchetypes: [
      'quasar_jet_corridor', 'comet_swoop_blitz', 'gravity_well_vortex',
      'satellite_relay_flank', 'siege_artillery_wall', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Serafín Prominencia-X', baseHp: 146, speedScale: 1.02,
      moveArchetype: 'eclipse_anchor',
      phases: [
        { name: 'Fase 1 "Anillo de Diamante"', pattern: 'chrono_rings' },
        { name: 'Sello Eclipse "Eyección de Masa Coronal"', pattern: 'galaxy_spiral' },
        { name: 'Fase 3 "Prominencia Gemela"', pattern: 'binary_helix' },
        { name: 'Protocolo Helios "Catedral de Plasma"', pattern: 'counter_lotus' },
        { name: 'Cenit Solar "Superllamarada Imperial"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  // ── WORLD 3: Alcance Nebular ──────────────────────────────────────────────
  createSpaceStage({
    difficulty: 'normal', world: 3, stage: 1,
    worldName: 'Alcance Nebular', stageTitle: 'Estela del Cometa Crioanular',
    bossSpawnAt: 144.0, // 2m 24s
    waveHpScale: 1.16, waveSpeedScale: 1.02,
    palette: [0x67e8f9, 0x38bdf8, 0xe0f2fe],
    theme: {
      skyTop: 0x030b18, skyBottom: 0x071d36,
      nebulaA: 0x0d3b66, nebulaB: 0x155e75,
      gridColor: 0x1e4e79, accentColor: 0x67e8f9,
      feature: 'comet_trail', scrollSpeed: 150,
    },
    waveArchetypes: [
      'comet_swoop_blitz', 'orbital_chevron', 'satellite_relay_flank',
      'meteor_cross_lattice', 'dreadnought_core', 'pendulum_chrono_weave',
      'phalanx_drone_column', 'prism_refraction_hex', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Núcleo Cometa Halley-Cero', baseHp: 150, speedScale: 1.02,
      moveArchetype: 'binary_dash',
      phases: [
        { name: 'Fase 1 "Cabellera de Hielo Estelar"', pattern: 'comet_rain' },
        { name: 'Sello Criogénico "Roseta de Escarcha"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Cola Iónica Azul"', pattern: 'crescent_fan' },
        { name: 'Protocolo Oort "Espejismo Sublimado"', pattern: 'prism_lattice' },
        { name: 'Perihelio Eterno "Estrella con Cola"', pattern: 'counter_lotus' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'normal', world: 3, stage: 2,
    worldName: 'Alcance Nebular', stageTitle: 'Nebulosa Jónica Esmeralda',
    bossSpawnAt: 164.0, // 2m 44s
    waveHpScale: 1.2, waveSpeedScale: 1.04,
    palette: [0x10b981, 0xa855f7, 0x00f2fe],
    theme: {
      skyTop: 0x03120e, skyBottom: 0x0a2420,
      nebulaA: 0x064e3b, nebulaB: 0x3b1d5e,
      gridColor: 0x165b4c, accentColor: 0x34d399,
      feature: 'ion_nebula', scrollSpeed: 136,
    },
    waveArchetypes: [
      'nebula_flower_pincer', 'spiral_galaxy_arms', 'double_helix_ion',
      'satellite_relay_flank', 'gravity_well_vortex', 'aurora_curtain_ribbon',
      'siege_artillery_wall', 'subspace_zigzag_swarm', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Tejedora Ojo Viridiano', baseHp: 156, speedScale: 1.04,
      moveArchetype: 'vortex_figure8',
      phases: [
        { name: 'Fase 1 "Velo Protoestelar"', pattern: 'galaxy_spiral' },
        { name: 'Sello Nebular "Jardín de Orión"', pattern: 'counter_lotus' },
        { name: 'Fase 3 "Filamentos Ionizados"', pattern: 'binary_helix' },
        { name: 'Protocolo Esmeralda "Vórtice Bok"', pattern: 'gravity_whirlpool' },
        { name: 'Génesis Estelar "Cuna de Soles"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'normal', world: 3, stage: 3,
    worldName: 'Alcance Nebular', stageTitle: 'Cenit del Hiperportal',
    bossSpawnAt: 90.0, // 1m 30s exact
    waveHpScale: 1.24, waveSpeedScale: 1.06,
    palette: [0x00f2fe, 0xa855f7, 0xffdd00],
    theme: {
      skyTop: 0x060418, skyBottom: 0x150d38,
      nebulaA: 0x2e1568, nebulaB: 0x0a4a6e,
      gridColor: 0x3b247a, accentColor: 0x00f2fe,
      feature: 'hypergate', scrollSpeed: 162,
    },
    waveArchetypes: [
      'orbital_chevron', 'pulsar_clock_pods', 'binary_twin_commanders',
      'phalanx_drone_column', 'quasar_jet_corridor', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Guardián Cenit-Omega', baseHp: 166, speedScale: 1.06,
      moveArchetype: 'eclipse_anchor',
      phases: [
        { name: 'Fase 1 "Apertura Taquiónica"', pattern: 'pulsar_lighthouse' },
        { name: 'Sello Hiperespacial "Mandala de Salto"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Corredor Parsec"', pattern: 'chrono_rings' },
        { name: 'Protocolo Omega "cerrojo Intergaláctico"', pattern: 'counter_lotus' },
        { name: 'Horizonte Astral "Salto al Infinito"', pattern: 'supernova_symphony' },
      ],
    },
  }),
];

// ══════════════════════════════════════════════════════════════════════════════
// 2. DIFFICULT EXPEDITION — 9 Completely New Space Sectors (NOT scaled Normal!)
// ══════════════════════════════════════════════════════════════════════════════
const DIFFICULT_CONFIGS = [
  // ── WORLD 1: Frente de Magnetar ───────────────────────────────────────────
  createSpaceStage({
    difficulty: 'difficult', world: 1, stage: 1,
    worldName: 'Frente de Magnetar', stageTitle: 'Faro del Púlsar Vela',
    bossSpawnAt: 140.0, // 2m 20s
    waveHpScale: 1.22, waveSpeedScale: 1.08,
    palette: [0x00f2fe, 0xc084fc, 0xffffff],
    theme: {
      skyTop: 0x05041a, skyBottom: 0x120d3a,
      nebulaA: 0x261863, nebulaB: 0x084c6e,
      gridColor: 0x33287a, accentColor: 0x38bdf8,
      feature: 'pulsar_beams', scrollSpeed: 158,
    },
    waveArchetypes: [
      'pulsar_clock_pods', 'satellite_relay_flank', 'double_helix_ion',
      'phalanx_drone_column', 'dreadnought_core', 'pendulum_chrono_weave',
      'pulsar_clock_pods', 'meteor_cross_lattice', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Cantor del Púlsar Vela-XIII', baseHp: 152, speedScale: 1.08,
      moveArchetype: 'eclipse_anchor',
      phases: [
        { name: 'Fase 1 "Pulso de Milisegundo"', pattern: 'pulsar_lighthouse' },
        { name: 'Sello Neutrónico "Faro Sinrotrón"', pattern: 'chrono_rings' },
        { name: 'Fase 3 "Dipolo Relativista"', pattern: 'binary_helix' },
        { name: 'Protocolo Vela "Reloj Cósmico"', pattern: 'star_mandala' },
        { name: 'Resonancia Púlsar "Réquiem Magnético"', pattern: 'galaxy_spiral' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'difficult', world: 1, stage: 2,
    worldName: 'Frente de Magnetar', stageTitle: 'Fosa de Aurora Ionizada',
    bossSpawnAt: 158.0, // 2m 38s
    waveHpScale: 1.26, waveSpeedScale: 1.1,
    palette: [0x2dd4bf, 0xf43f5e, 0xa855f7],
    theme: {
      skyTop: 0x041218, skyBottom: 0x180a28,
      nebulaA: 0x0d4f56, nebulaB: 0x521646,
      gridColor: 0x1f5c68, accentColor: 0x2dd4bf,
      feature: 'aurora_curtain', scrollSpeed: 146,
    },
    waveArchetypes: [
      'aurora_curtain_ribbon', 'nebula_flower_pincer', 'satellite_relay_flank',
      'siege_artillery_wall', 'binary_twin_commanders', 'subspace_zigzag_swarm',
      'aurora_curtain_ribbon', 'spiral_galaxy_arms', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Valquiria Magnetosfera', baseHp: 160, speedScale: 1.1,
      moveArchetype: 'pendulum_sweep',
      phases: [
        { name: 'Fase 1 "Cortina Austral"', pattern: 'crescent_fan' },
        { name: 'Sello Boreal "Danza de Van Allen"', pattern: 'counter_lotus' },
        { name: 'Fase 3 "Tormenta Geomagnética"', pattern: 'prism_lattice' },
        { name: 'Protocolo Ionosfera "Velo Esmeralda-Rubí"', pattern: 'gravity_whirlpool' },
        { name: 'Corona Polar "Aurora del Fin del Mundo"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'difficult', world: 1, stage: 3,
    worldName: 'Frente de Magnetar', stageTitle: 'Brecha del Núcleo Magnetar',
    bossSpawnAt: 90.0, // 1m 30s exact
    waveHpScale: 1.3, waveSpeedScale: 1.12,
    palette: [0xff2b5b, 0x38bdf8, 0xfacc15],
    theme: {
      skyTop: 0x140414, skyBottom: 0x280828,
      nebulaA: 0x581048, nebulaB: 0x143868,
      gridColor: 0x621c58, accentColor: 0xff2b5b,
      feature: 'magnetar_arcs', scrollSpeed: 165,
    },
    waveArchetypes: [
      'quasar_jet_corridor', 'pulsar_clock_pods', 'gravity_well_vortex',
      'siege_artillery_wall', 'phalanx_drone_column', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Tirano Gauss-Prime', baseHp: 168, speedScale: 1.12,
      moveArchetype: 'diamond_tactical',
      phases: [
        { name: 'Fase 1 "Líneas de Flujo Gigatesla"', pattern: 'binary_helix' },
        { name: 'Sello Magnetar "Terremoto Estelar"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Inversión de Polos"', pattern: 'siege_broadside' },
        { name: 'Protocolo Gauss "Jaula Diamagnética"', pattern: 'pulsar_lighthouse' },
        { name: 'Colapso Magnético "Pulso Gamma Letal"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  // ── WORLD 2: Deriva Xenolítica ────────────────────────────────────────────
  createSpaceStage({
    difficulty: 'difficult', world: 2, stage: 1,
    worldName: 'Deriva Xenolítica', stageTitle: 'Cementerio Armada Fantasma',
    bossSpawnAt: 146.0, // 2m 26s
    waveHpScale: 1.32, waveSpeedScale: 1.12,
    palette: [0x34d399, 0x60a5fa, 0xfbbf24],
    theme: {
      skyTop: 0x040d10, skyBottom: 0x0b1e22,
      nebulaA: 0x12383c, nebulaB: 0x1e2c48,
      gridColor: 0x1f4a50, accentColor: 0x34d399,
      feature: 'ghost_fleet', scrollSpeed: 132,
    },
    waveArchetypes: [
      'broadside_frigate_line', 'subspace_zigzag_swarm', 'satellite_relay_flank',
      'siege_artillery_wall', 'dreadnought_core', 'phalanx_drone_column',
      'broadside_frigate_line', 'comet_swoop_blitz', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Acorazado Espectral Nautilus', baseHp: 172, speedScale: 1.12,
      moveArchetype: 'orbital_lissajous',
      phases: [
        { name: 'Fase 1 "Andanada de Estribor"', pattern: 'siege_broadside' },
        { name: 'Sello Fantasma "Flota de los Caídos"', pattern: 'comet_rain' },
        { name: 'Fase 3 "Torpedos de Subespacio"', pattern: 'crescent_fan' },
        { name: 'Protocolo Derrelicto "Núcleo Fantasmal"', pattern: 'chrono_rings' },
        { name: 'Última Orden "Cañón Principal Caronte"', pattern: 'star_mandala' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'difficult', world: 2, stage: 2,
    worldName: 'Deriva Xenolítica', stageTitle: 'Ruina Cristalina Dyson',
    bossSpawnAt: 168.0, // 2m 48s
    waveHpScale: 1.36, waveSpeedScale: 1.14,
    palette: [0xe879f9, 0x38bdf8, 0xfde047],
    theme: {
      skyTop: 0x0c051a, skyBottom: 0x1d0e36,
      nebulaA: 0x421868, nebulaB: 0x164468,
      gridColor: 0x522882, accentColor: 0xe879f9,
      feature: 'crystal_spire', scrollSpeed: 144,
    },
    waveArchetypes: [
      'prism_refraction_hex', 'pendulum_chrono_weave', 'satellite_relay_flank',
      'meteor_cross_lattice', 'binary_twin_commanders', 'nebula_flower_pincer',
      'prism_refraction_hex', 'phalanx_drone_column', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Arquitecto Óculo-VII', baseHp: 178, speedScale: 1.14,
      moveArchetype: 'diamond_tactical',
      phases: [
        { name: 'Fase 1 "Refracción Hexagonal"', pattern: 'prism_lattice' },
        { name: 'Sello Cristalino "Esfera Fracturada"', pattern: 'counter_lotus' },
        { name: 'Fase 3 "Lente Enana Blanca"', pattern: 'pulsar_lighthouse' },
        { name: 'Protocolo Prisma "Caleidoscopio Astral"', pattern: 'star_mandala' },
        { name: 'Luz Convergente "Geometría Sagrada"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'difficult', world: 2, stage: 3,
    worldName: 'Deriva Xenolítica', stageTitle: 'Fractura Crono-Anómala',
    bossSpawnAt: 90.0, // 1m 30s exact
    waveHpScale: 1.4, waveSpeedScale: 1.15,
    palette: [0xf472b6, 0x00f2fe, 0xfef08a],
    theme: {
      skyTop: 0x0a0618, skyBottom: 0x1e1032,
      nebulaA: 0x3b1854, nebulaB: 0x104458,
      gridColor: 0x4c2468, accentColor: 0xf472b6,
      feature: 'chrono_rings', scrollSpeed: 152,
    },
    waveArchetypes: [
      'pendulum_chrono_weave', 'subspace_zigzag_swarm', 'gravity_well_vortex',
      'satellite_relay_flank', 'pulsar_clock_pods', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Árbitro Cronos-Cero', baseHp: 184, speedScale: 1.15,
      moveArchetype: 'vortex_figure8',
      phases: [
        { name: 'Fase 1 "Dilatación Lorentz"', pattern: 'chrono_rings' },
        { name: 'Sello Temporal "Agujas del Destino"', pattern: 'pulsar_lighthouse' },
        { name: 'Fase 3 "Paradoja Taquiónica"', pattern: 'galaxy_spiral' },
        { name: 'Protocolo Reloj "Péndulo Causal"', pattern: 'counter_lotus' },
        { name: 'Fin del Tiempo "Instante Eterno"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  // ── WORLD 3: Remanente Supernova ──────────────────────────────────────────
  createSpaceStage({
    difficulty: 'difficult', world: 3, stage: 1,
    worldName: 'Remanente Supernova', stageTitle: 'Filamento de Onda de Choque',
    bossSpawnAt: 150.0, // 2m 30s
    waveHpScale: 1.42, waveSpeedScale: 1.16,
    palette: [0xff2b5b, 0x00f2fe, 0xfbbf24],
    theme: {
      skyTop: 0x14050c, skyBottom: 0x260c22,
      nebulaA: 0x621432, nebulaB: 0x0e4466,
      gridColor: 0x681f42, accentColor: 0xff2b5b,
      feature: 'shock_filament', scrollSpeed: 162,
    },
    waveArchetypes: [
      'comet_swoop_blitz', 'meteor_cross_lattice', 'quasar_jet_corridor',
      'satellite_relay_flank', 'dreadnought_core', 'spiral_galaxy_arms',
      'siege_artillery_wall', 'nebula_flower_pincer', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Vanguardia Cygnus-Nova', baseHp: 188, speedScale: 1.16,
      moveArchetype: 'binary_dash',
      phases: [
        { name: 'Fase 1 "Frente Supersónico"', pattern: 'crescent_fan' },
        { name: 'Sello Nebulosa Velo "Onda Expansiva"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Filamentos de Oxígeno"', pattern: 'binary_helix' },
        { name: 'Protocolo Cygnus "Remanente Ardiente"', pattern: 'gravity_whirlpool' },
        { name: 'Eco de Supernova "Estallido Primordial"', pattern: 'counter_lotus' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'difficult', world: 3, stage: 2,
    worldName: 'Remanente Supernova', stageTitle: 'Crisol Forjaestrellas',
    bossSpawnAt: 170.0, // 2m 50s
    waveHpScale: 1.46, waveSpeedScale: 1.17,
    palette: [0xffd166, 0xc084fc, 0x38bdf8],
    theme: {
      skyTop: 0x120806, skyBottom: 0x281422,
      nebulaA: 0x663410, nebulaB: 0x481a5c,
      gridColor: 0x6e3f24, accentColor: 0xffd166,
      feature: 'starforge', scrollSpeed: 148,
    },
    waveArchetypes: [
      'orbital_chevron', 'siege_artillery_wall', 'prism_refraction_hex',
      'satellite_relay_flank', 'binary_twin_commanders', 'phalanx_drone_column',
      'gravity_well_vortex', 'broadside_frigate_line', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Titán Estelar Hiperión', baseHp: 194, speedScale: 1.17,
      moveArchetype: 'eclipse_anchor',
      phases: [
        { name: 'Fase 1 "Pilares de Ignición"', pattern: 'siege_broadside' },
        { name: 'Sello Forjaestrellas "Núcleo Protosolar"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Vientos de T-Tauri"', pattern: 'galaxy_spiral' },
        { name: 'Protocolo Hiperión "Yunque Gravitacional"', pattern: 'prism_lattice' },
        { name: 'Nacimiento de Gigante "Fuego Celeste"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'difficult', world: 3, stage: 3,
    worldName: 'Remanente Supernova', stageTitle: 'Colapso Binario de Neutrones',
    bossSpawnAt: 90.0, // 1m 30s exact
    waveHpScale: 1.5, waveSpeedScale: 1.18,
    palette: [0xfacc15, 0xa855f7, 0x00f2fe],
    theme: {
      skyTop: 0x0e051c, skyBottom: 0x240c38,
      nebulaA: 0x52186e, nebulaB: 0x6e4810,
      gridColor: 0x642882, accentColor: 0xfacc15,
      feature: 'binary_stars', scrollSpeed: 168,
    },
    waveArchetypes: [
      'double_helix_ion', 'binary_twin_commanders', 'spiral_galaxy_arms',
      'pulsar_clock_pods', 'quasar_jet_corridor', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Emperatriz Kilonova', baseHp: 204, speedScale: 1.18,
      moveArchetype: 'vortex_figure8',
      phases: [
        { name: 'Fase 1 "Espiral Inspiral"', pattern: 'binary_helix' },
        { name: 'Sello Binario "Ondas de Espacio-Tiempo"', pattern: 'chrono_rings' },
        { name: 'Fase 3 "Forja de Oro Cósmico"', pattern: 'counter_lotus' },
        { name: 'Protocolo Kilonova "Doble Horizonte"', pattern: 'star_mandala' },
        { name: 'Fusión de Neutrones "Estallido Kilonova"', pattern: 'supernova_symphony' },
      ],
    },
  }),
];

// ══════════════════════════════════════════════════════════════════════════════
// 3. NO MERCY EXPEDITION — 9 Completely New Endgame Cosmic Sectors
// ══════════════════════════════════════════════════════════════════════════════
const NO_MERCY_CONFIGS = [
  // ── WORLD 1: Horizonte Cuásar ─────────────────────────────────────────────
  createSpaceStage({
    difficulty: 'no_mercy', world: 1, stage: 1,
    worldName: 'Horizonte Cuásar', stageTitle: 'Chorro Relativista Blázar',
    bossSpawnAt: 142.0, // 2m 22s
    waveHpScale: 1.48, waveSpeedScale: 1.2,
    palette: [0x38bdf8, 0xffffff, 0xf43f5e],
    theme: {
      skyTop: 0x02081c, skyBottom: 0x081a42,
      nebulaA: 0x0e387a, nebulaB: 0x3b1254,
      gridColor: 0x1d4d94, accentColor: 0x7dd3fc,
      feature: 'quasar_jet', scrollSpeed: 175,
    },
    waveArchetypes: [
      'quasar_jet_corridor', 'satellite_relay_flank', 'phalanx_drone_column',
      'pulsar_clock_pods', 'dreadnought_core', 'comet_swoop_blitz',
      'siege_artillery_wall', 'quasar_jet_corridor', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Serafín Blázar-01', baseHp: 196, speedScale: 1.2,
      moveArchetype: 'binary_dash',
      phases: [
        { name: 'Fase 1 "Colimación Relativista"', pattern: 'pulsar_lighthouse' },
        { name: 'Sello Blázar "Chorro Astrofísico"', pattern: 'binary_helix' },
        { name: 'Fase 3 "Frente Lorentz"', pattern: 'crescent_fan' },
        { name: 'Protocolo Cuásar "Lanza Intergaláctica"', pattern: 'siege_broadside' },
        { name: 'Luminosidad Extrema "Faro del Universo"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'no_mercy', world: 1, stage: 2,
    worldName: 'Horizonte Cuásar', stageTitle: 'Remolino de Acreción',
    bossSpawnAt: 162.0, // 2m 42s
    waveHpScale: 1.52, waveSpeedScale: 1.22,
    palette: [0xf97316, 0xc084fc, 0xfef08a],
    theme: {
      skyTop: 0x120508, skyBottom: 0x260c1e,
      nebulaA: 0x68240c, nebulaB: 0x4a145c,
      gridColor: 0x722e1c, accentColor: 0xfb923c,
      feature: 'accretion_disk', scrollSpeed: 164,
    },
    waveArchetypes: [
      'spiral_galaxy_arms', 'gravity_well_vortex', 'satellite_relay_flank',
      'nebula_flower_pincer', 'binary_twin_commanders', 'meteor_cross_lattice',
      'spiral_galaxy_arms', 'siege_artillery_wall', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Soberano Cuásar-IX', baseHp: 205, speedScale: 1.22,
      moveArchetype: 'vortex_figure8',
      phases: [
        { name: 'Fase 1 "Fricción Incandescente"', pattern: 'galaxy_spiral' },
        { name: 'Sello Acreción "Remolino Gargantúa"', pattern: 'gravity_whirlpool' },
        { name: 'Fase 3 "Órbita Prograda"', pattern: 'counter_lotus' },
        { name: 'Protocolo Horizonte "Corona de Rayos X"', pattern: 'star_mandala' },
        { name: 'Vórtice Supremo "Banquete Estelar"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'no_mercy', world: 1, stage: 3,
    worldName: 'Horizonte Cuásar', stageTitle: 'Esfera de Fotones',
    bossSpawnAt: 90.0, // 1m 30s exact
    waveHpScale: 1.56, waveSpeedScale: 1.23,
    palette: [0xfef08a, 0x38bdf8, 0xe879f9],
    theme: {
      skyTop: 0x080814, skyBottom: 0x18142e,
      nebulaA: 0x362c5e, nebulaB: 0x524218,
      gridColor: 0x4c4278, accentColor: 0xfef08a,
      feature: 'photon_ring', scrollSpeed: 170,
    },
    waveArchetypes: [
      'prism_refraction_hex', 'pendulum_chrono_weave', 'gravity_well_vortex',
      'satellite_relay_flank', 'pulsar_clock_pods', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Guardián Anillo-Einstein', baseHp: 214, speedScale: 1.23,
      moveArchetype: 'eclipse_anchor',
      phases: [
        { name: 'Fase 1 "Lente Gravitacional"', pattern: 'chrono_rings' },
        { name: 'Sello Fotónico "Cruz de Einstein"', pattern: 'prism_lattice' },
        { name: 'Fase 3 "Órbita de Luz Cautiva"', pattern: 'counter_lotus' },
        { name: 'Protocolo Espejismo "Anillo Relativista"', pattern: 'star_mandala' },
        { name: 'Última Sombra "Horizonte Sin Retorno"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  // ── WORLD 2: Abismo Materia Oscura ────────────────────────────────────────
  createSpaceStage({
    difficulty: 'no_mercy', world: 2, stage: 1,
    worldName: 'Abismo Materia Oscura', stageTitle: 'Telaraña Subespacial',
    bossSpawnAt: 152.0, // 2m 32s
    waveHpScale: 1.58, waveSpeedScale: 1.24,
    palette: [0xa855f7, 0x22d3ee, 0xf43f5e],
    theme: {
      skyTop: 0x050212, skyBottom: 0x120628,
      nebulaA: 0x2e0e5c, nebulaB: 0x0c3454,
      gridColor: 0x3e1a72, accentColor: 0xa855f7,
      feature: 'cosmic_web', scrollSpeed: 156,
    },
    waveArchetypes: [
      'meteor_cross_lattice', 'subspace_zigzag_swarm', 'satellite_relay_flank',
      'prism_refraction_hex', 'dreadnought_core', 'double_helix_ion',
      'subspace_zigzag_swarm', 'phalanx_drone_column', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Tejedor Filamento-X', baseHp: 218, speedScale: 1.24,
      moveArchetype: 'diamond_tactical',
      phases: [
        { name: 'Fase 1 "Hilos Intergalácticos"', pattern: 'prism_lattice' },
        { name: 'Sello Oscuro "Andamiaje Invisible"', pattern: 'gravity_whirlpool' },
        { name: 'Fase 3 "Nodos del Vacío"', pattern: 'binary_helix' },
        { name: 'Protocolo Red "Laberinto Laniakea"', pattern: 'counter_lotus' },
        { name: 'Gran Atractor "Convergencia Total"', pattern: 'star_mandala' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'no_mercy', world: 2, stage: 2,
    worldName: 'Abismo Materia Oscura', stageTitle: 'Fauces de Entropía',
    bossSpawnAt: 172.0, // 2m 52s
    waveHpScale: 1.62, waveSpeedScale: 1.25,
    palette: [0xff2b5b, 0x9333ea, 0x00f2fe],
    theme: {
      skyTop: 0x0a0208, skyBottom: 0x1e0518,
      nebulaA: 0x4c0828, nebulaB: 0x2c0848,
      gridColor: 0x5c1238, accentColor: 0xff2b5b,
      feature: 'entropy_rift', scrollSpeed: 162,
    },
    waveArchetypes: [
      'siege_artillery_wall', 'broadside_frigate_line', 'gravity_well_vortex',
      'satellite_relay_flank', 'binary_twin_commanders', 'comet_swoop_blitz',
      'quasar_jet_corridor', 'siege_artillery_wall', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Heraldo Leviatán-Nulo', baseHp: 226, speedScale: 1.25,
      moveArchetype: 'pendulum_sweep',
      phases: [
        { name: 'Fase 1 "Radiación Hawking"', pattern: 'comet_rain' },
        { name: 'Sello Entrópico "Decaimiento de Protones"', pattern: 'gravity_whirlpool' },
        { name: 'Fase 3 "Marea Desgarradora"', pattern: 'siege_broadside' },
        { name: 'Protocolo Nulo "Muerte Térmica"', pattern: 'chrono_rings' },
        { name: 'Abismo Absoluto "Devorador de Constelaciones"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'no_mercy', world: 2, stage: 3,
    worldName: 'Abismo Materia Oscura', stageTitle: 'Singularidad Punto Cero',
    bossSpawnAt: 90.0, // 1m 30s exact
    waveHpScale: 1.66, waveSpeedScale: 1.26,
    palette: [0xe2e8f0, 0x00f2fe, 0xc084fc],
    theme: {
      skyTop: 0x03050c, skyBottom: 0x0a1024,
      nebulaA: 0x182648, nebulaB: 0x2a1848,
      gridColor: 0x283c66, accentColor: 0xe2e8f0,
      feature: 'zero_point', scrollSpeed: 174,
    },
    waveArchetypes: [
      'pendulum_chrono_weave', 'pulsar_clock_pods', 'binary_twin_commanders',
      'phalanx_drone_column', 'prism_refraction_hex', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Arconte Ápex-Cero', baseHp: 232, speedScale: 1.26,
      moveArchetype: 'vortex_figure8',
      phases: [
        { name: 'Fase 1 "Fluctuación Cuántica"', pattern: 'pulsar_lighthouse' },
        { name: 'Sello Vacío "Falso Vacío Metaestable"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Espuma de Planck"', pattern: 'galaxy_spiral' },
        { name: 'Protocolo Cero "Colapso de Fase"', pattern: 'counter_lotus' },
        { name: 'Energía Punto Cero "Génesis Inverso"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  // ── WORLD 3: Escatón Cósmico ──────────────────────────────────────────────
  createSpaceStage({
    difficulty: 'no_mercy', world: 3, stage: 1,
    worldName: 'Escatón Cósmico', stageTitle: 'Colisión Galáctica Andrómeda',
    bossSpawnAt: 154.0, // 2m 34s
    waveHpScale: 1.68, waveSpeedScale: 1.27,
    palette: [0x38bdf8, 0xf472b6, 0xfacc15],
    theme: {
      skyTop: 0x060618, skyBottom: 0x1c0c2e,
      nebulaA: 0x143c6e, nebulaB: 0x5c184c,
      gridColor: 0x382868, accentColor: 0xf472b6,
      feature: 'galaxy_clash', scrollSpeed: 168,
    },
    waveArchetypes: [
      'spiral_galaxy_arms', 'aurora_curtain_ribbon', 'binary_twin_commanders',
      'satellite_relay_flank', 'meteor_cross_lattice', 'gravity_well_vortex',
      'comet_swoop_blitz', 'spiral_galaxy_arms', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Corona de Marea Andrómeda', baseHp: 236, speedScale: 1.27,
      moveArchetype: 'orbital_lissajous',
      phases: [
        { name: 'Fase 1 "Colas de Marea Estelar"', pattern: 'galaxy_spiral' },
        { name: 'Sello Galáctico "Danza Milkomeda"', pattern: 'counter_lotus' },
        { name: 'Fase 3 "Cúmulos Globulares"', pattern: 'comet_rain' },
        { name: 'Protocolo Colisión "Doble Núcleo Galáctico"', pattern: 'binary_helix' },
        { name: 'Fusión Elíptica "Corona de Mil Millones de Soles"', pattern: 'star_mandala' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'no_mercy', world: 3, stage: 2,
    worldName: 'Escatón Cósmico', stageTitle: 'Catedral de Rayos Gamma',
    bossSpawnAt: 174.0, // 2m 54s
    waveHpScale: 1.72, waveSpeedScale: 1.28,
    palette: [0xfde047, 0x10b981, 0xc084fc],
    theme: {
      skyTop: 0x08100c, skyBottom: 0x1c1230,
      nebulaA: 0x145238, nebulaB: 0x4c1c6e,
      gridColor: 0x2e5848, accentColor: 0xfde047,
      feature: 'gamma_cathedral', scrollSpeed: 166,
    },
    waveArchetypes: [
      'pulsar_clock_pods', 'prism_refraction_hex', 'quasar_jet_corridor',
      'satellite_relay_flank', 'binary_twin_commanders', 'siege_artillery_wall',
      'phalanx_drone_column', 'nebula_flower_pincer', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Pontífice Hipernova GRB-Omega', baseHp: 242, speedScale: 1.28,
      moveArchetype: 'eclipse_anchor',
      phases: [
        { name: 'Fase 1 "Vitral de Fotones Gamma"', pattern: 'prism_lattice' },
        { name: 'Sello Hipernova "Rosetón de la Catedral"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Coro Ionizante"', pattern: 'pulsar_lighthouse' },
        { name: 'Protocolo GRB "Bóveda Celeste"', pattern: 'siege_broadside' },
        { name: 'Juicio Lumínico "Destello de Diez Segundos"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  createSpaceStage({
    difficulty: 'no_mercy', world: 3, stage: 3,
    worldName: 'Escatón Cósmico', stageTitle: 'Borde de la Eternidad',
    bossSpawnAt: 90.0, // 1m 30s exact
    waveHpScale: 1.76, waveSpeedScale: 1.3,
    palette: [0xffffff, 0x00f2fe, 0xff2b5b],
    theme: {
      skyTop: 0x04030e, skyBottom: 0x140a2c,
      nebulaA: 0x381468, nebulaB: 0x0c4c6e,
      gridColor: 0x4e2888, accentColor: 0xffffff,
      feature: 'eternity_horizon', scrollSpeed: 180,
    },
    waveArchetypes: [
      'orbital_chevron', 'prism_refraction_hex', 'binary_twin_commanders',
      'quasar_jet_corridor', 'gravity_well_vortex', 'supernova_grand_choir',
    ],
    boss: {
      bossName: 'Singularidad Eterna Alfa-Omega', baseHp: 252, speedScale: 1.3,
      moveArchetype: 'vortex_figure8',
      phases: [
        { name: 'Fase 1 "Frontera del Universo Observable"', pattern: 'chrono_rings' },
        { name: 'Sello Primordial "Sinfonía del Big Bang"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Tejido de las Nueve Constelaciones"', pattern: 'counter_lotus' },
        { name: 'Protocolo Escatón "Horizonte Trascendente"', pattern: 'gravity_whirlpool' },
        { name: 'Arcano Final "Singularidad Alfa y Omega"', pattern: 'supernova_symphony' },
      ],
    },
  }),
];

const ALL_CONFIGS = [...NORMAL_CONFIGS, ...DIFFICULT_CONFIGS, ...NO_MERCY_CONFIGS];
const CONFIG_MAP = new Map();
for (const cfg of ALL_CONFIGS) {
  CONFIG_MAP.set(`${cfg.difficulty}-${cfg.world}-${cfg.stage}`, cfg);
}

function getStageConfig(difficulty, worldIndex, stageIndex) {
  const key = `${difficulty}-${worldIndex + 1}-${stageIndex + 1}`;
  return CONFIG_MAP.get(key) || CONFIG_MAP.get('no_mercy-3-3') || CONFIG_MAP.get('normal-1-1');
}

function hasNextStage(worldIndex, stageIndex, difficulty = 'normal') {
  if (!DIFFICULTY_LABELS[difficulty]) return false;
  return !(worldIndex === WORLDS_PER_DIFFICULTY - 1 && stageIndex === STAGES_PER_WORLD - 1);
}

function getNextStageIndices(worldIndex, stageIndex, difficulty = 'normal') {
  if (!hasNextStage(worldIndex, stageIndex, difficulty)) return null;
  if (stageIndex < STAGES_PER_WORLD - 1) {
    return { worldIndex, stageIndex: stageIndex + 1 };
  }
  return { worldIndex: worldIndex + 1, stageIndex: 0 };
}

module.exports = {
  ALL_CONFIGS,
  getStageConfig,
  hasNextStage,
  getNextStageIndices,
  WORLDS_PER_DIFFICULTY,
  STAGES_PER_WORLD,
  DIFFICULTY_LABELS,
};

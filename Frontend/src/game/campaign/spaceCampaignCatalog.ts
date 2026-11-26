/**
 * Frontend Single Source of Truth for the 27-Level Space Campaign.
 * Mirrors `Backend/src/game/campaign/stageConfigs.js` and `spaceThemesAndWaves.js`
 * so CharacterSelection, Local Simulation Worker, HUD, and BackgroundRenderer stay 100% synchronized.
 */

import {
  ENABLE_NORMAL_OVERHAUL,
  buildNormalWorldWaves,
  fireNormalBossPattern,
  getNormalWorldBossProfile,
  getScaledMinibossDef,
  type BulletSpawnOpts,
  type NormalMinibossDef,
} from './normalCampaignOverhaul';

export interface SpaceThemeSpec {
  id: string;
  skyTop: number;
  skyBottom: number;
  nebulaA: number;
  nebulaB: number;
  gridColor: number;
  accentColor: number;
  feature: string;
  starColors: number[];
  scrollSpeed: number;
}

export interface BossPhaseProfile {
  phase: number;
  name: string;
  isSpellCard: boolean;
  maxHp: number;
  pattern: string;
  shootInterval: number;
  laserMode: 'none' | 'targeted' | 'both';
  laserInterval: number;
  megaLaserInterval: number;
}

export interface SpaceBossProfile {
  bossId?: string;
  bossName: string;
  fullBossName?: string;
  sprite: string;
  introDuration?: number;
  moveArchetype: string;
  palette: [number, number, number];
  speedScale: number;
  statScale?: number;
  phases: BossPhaseProfile[];
}

export interface WaveEnemySpec {
  type: string;
  trajectory: string;
  attackPattern: string;
  startX: number;
  startY: number;
  speed: number;
  hp: number;
  radius: number;
  scoreValue?: number;
  itemDrop: 'power' | 'point' | 'bomb_frag' | 'life_frag';
  shootInterval: number;
  shootDelay: number;
  bulletColor: number;
  customParams: Record<string, any>;
}

export interface SpaceWaveEvent {
  key: string;
  at: number;
  archetype: string;
  enemies: WaveEnemySpec[];
}

export interface SpaceStageConfig {
  difficulty: 'normal' | 'difficult' | 'no_mercy';
  world: number;
  stage: number;
  worldName: string;
  stageTitle: string;
  palette: [number, number, number];
  hasBoss?: boolean;
  miniboss?: NormalMinibossDef | null;
  spaceTheme: SpaceThemeSpec;
  waves: SpaceWaveEvent[];
  bossWarningAt: number;
  bossSpawnAt: number;
  bossProfile: SpaceBossProfile;
}

const SIM_WIDTH = 800;
const SIM_HEIGHT = 600;

export function buildWaveEnemies(
  archetype: string,
  opts: { hpScale?: number; speedScale?: number; variant?: number; palette?: [number, number, number] } = {}
): WaveEnemySpec[] {
  const hpScale = opts.hpScale ?? 1.0;
  const speedScale = opts.speedScale ?? 1.0;
  const variant = opts.variant ?? 0;
  const palette = opts.palette ?? [0x00f2fe, 0xff2b5b, 0xffdd00];
  const [c0, c1, c2] = palette;

  const hp = (base: number) => Math.max(8, Math.round(base * hpScale));
  const spd = (base: number) => Math.round(base * speedScale);
  const out: WaveEnemySpec[] = [];

  switch (archetype) {
    case 'orbital_chevron': {
      const centerY = variant % 2 === 0 ? 270 : 330;
      for (let i = -3; i <= 3; i++) {
        const rank = Math.abs(i);
        out.push({
          type: rank === 0 ? 'red_fairy' : 'green_fairy',
          trajectory: 'v_formation',
          attackPattern: rank === 0 ? 'crescent_arc' : 'aimed_single',
          startX: SIM_WIDTH + 45 + rank * 46,
          startY: centerY + i * 54,
          speed: spd(138),
          hp: hp(rank === 0 ? 28 : 15),
          radius: 16,
          itemDrop: rank === 0 ? 'bomb_frag' : i % 2 === 0 ? 'power' : 'point',
          shootInterval: rank === 0 ? 1.25 : 1.75,
          shootDelay: 0.35 + rank * 0.22,
          bulletColor: rank === 0 ? c1 : c0,
          customParams: { driftY: (variant % 2 === 0 ? 1 : -1) * 18 },
        });
      }
      break;
    }

    case 'double_helix_ion': {
      for (let i = 0; i < 6; i++) {
        out.push({
          type: 'green_fairy',
          trajectory: 'double_helix',
          attackPattern: 'aimed_single',
          startX: SIM_WIDTH + 45 + i * 56,
          startY: 185,
          speed: spd(132),
          hp: hp(15),
          radius: 16,
          itemDrop: i % 2 === 0 ? 'power' : 'point',
          shootInterval: 1.75,
          shootDelay: 0.25 + i * 0.2,
          bulletColor: c0,
          customParams: { freq: 3.1, amp: 74, phase: i * 0.45 },
        });
        out.push({
          type: 'yellow_fairy',
          trajectory: 'double_helix',
          attackPattern: 'helix_stream',
          startX: SIM_WIDTH + 45 + i * 56,
          startY: 415,
          speed: spd(132),
          hp: hp(17),
          radius: 16,
          itemDrop: i === 5 ? 'bomb_frag' : 'power',
          shootInterval: 1.85,
          shootDelay: 0.35 + i * 0.2,
          bulletColor: c2,
          customParams: { freq: 3.1, amp: 74, phase: i * 0.45 + Math.PI },
        });
      }
      break;
    }

    case 'satellite_relay_flank': {
      for (let i = 0; i < 4; i++) {
        for (const isTop of [true, false]) {
          out.push({
            type: 'yellow_fairy',
            trajectory: 'perimeter_skimmer',
            attackPattern: 'prism_fan',
            startX: SIM_WIDTH + 40 + i * 85,
            startY: isTop ? 54 : SIM_HEIGHT - 54,
            speed: spd(124),
            hp: hp(20),
            radius: 16,
            itemDrop: i === 3 && isTop ? 'life_frag' : 'power',
            shootInterval: 1.45,
            shootDelay: 0.3 + i * 0.25,
            bulletColor: isTop ? c0 : c2,
            customParams: { bobAmp: 12, isTop },
          });
        }
      }
      break;
    }

    case 'siege_artillery_wall': {
      const lanes = variant % 2 === 0 ? [115, 235, 365, 485] : [145, 255, 345, 455];
      lanes.forEach((sy, idx) => {
        out.push({
          type: 'purple_fairy',
          trajectory: 'hover_retreat',
          attackPattern: 'siege_curtain',
          startX: SIM_WIDTH + 45 + idx * 36,
          startY: sy,
          speed: spd(135),
          hp: hp(38),
          radius: 18,
          itemDrop: idx % 2 === 0 ? 'bomb_frag' : 'power',
          shootInterval: 1.15,
          shootDelay: 0.35 + idx * 0.18,
          bulletColor: c1,
          customParams: { hoverX: 575 - (idx % 2) * 38, hoverTime: 4.6 },
        });
      });
      break;
    }

    case 'phalanx_drone_column': {
      const baseY = variant % 3 === 0 ? 300 : variant % 3 === 1 ? 220 : 380;
      for (let i = 0; i < 8; i++) {
        out.push({
          type: i % 3 === 0 ? 'red_fairy' : 'green_fairy',
          trajectory: 'sine',
          attackPattern: i % 2 === 0 ? 'ring_burst' : 'aimed_single',
          startX: SIM_WIDTH + 40 + i * 44,
          startY: baseY + (i % 2 === 0 ? -22 : 22),
          speed: spd(126),
          hp: hp(22),
          radius: 16,
          itemDrop: i === 7 ? 'bomb_frag' : 'power',
          shootInterval: 1.55,
          shootDelay: 0.25 + i * 0.14,
          bulletColor: i % 2 === 0 ? c1 : c0,
          customParams: { freq: 2.2, amp: 24, phase: i * 0.3 },
        });
      }
      break;
    }

    case 'dreadnought_core': {
      const coreY = variant % 2 === 0 ? 300 : 265;
      out.push({
        type: 'big_fairy',
        trajectory: 'hover_retreat',
        attackPattern: 'nova_mandala',
        startX: SIM_WIDTH + 55,
        startY: coreY,
        speed: spd(78),
        hp: hp(145),
        radius: 30,
        scoreValue: 1500,
        itemDrop: 'life_frag',
        shootInterval: 1.05,
        shootDelay: 0.45,
        bulletColor: c2,
        customParams: { hoverX: 545, hoverTime: 7.4, petals: 5 + (variant % 3) },
      });
      for (let k = 0; k < 3; k++) {
        out.push({
          type: 'red_fairy',
          trajectory: 'orbit_anchor',
          attackPattern: 'aimed_spread',
          startX: SIM_WIDTH + 75,
          startY: coreY,
          speed: spd(115),
          hp: hp(30),
          radius: 16,
          itemDrop: k === 1 ? 'bomb_frag' : 'power',
          shootInterval: 1.45,
          shootDelay: 0.5 + k * 0.25,
          bulletColor: c0,
          customParams: { anchorX: 545, anchorY: coreY, orbitR: 78, phase: (Math.PI * 2 * k) / 3 },
        });
      }
      break;
    }

    case 'meteor_cross_lattice': {
      for (let i = 0; i < 8; i++) {
        const isTop = i % 2 === 0;
        out.push({
          type: isTop ? 'green_fairy' : 'red_fairy',
          trajectory: isTop ? 'cross_top' : 'cross_bottom',
          attackPattern: i % 3 === 0 ? 'cross_spread' : 'needle_stream',
          startX: SIM_WIDTH + 40 + i * 52,
          startY: isTop ? 36 : SIM_HEIGHT - 36,
          speed: spd(168),
          hp: hp(18),
          radius: 16,
          itemDrop: i % 3 === 0 ? 'power' : 'point',
          shootInterval: 1.15,
          shootDelay: 0.2 + i * 0.12,
          bulletColor: isTop ? c0 : c1,
          customParams: {},
        });
      }
      break;
    }

    case 'pulsar_clock_pods': {
      [150, 300, 450].forEach((sy, idx) => {
        out.push({
          type: idx === 1 ? 'big_fairy' : 'purple_fairy',
          trajectory: 'hover_retreat',
          attackPattern: 'pulsar_sweep',
          startX: SIM_WIDTH + 50 + idx * 35,
          startY: sy,
          speed: spd(115),
          hp: hp(idx === 1 ? 95 : 40),
          radius: idx === 1 ? 26 : 17,
          itemDrop: idx === 1 ? 'bomb_frag' : 'power',
          shootInterval: 0.72,
          shootDelay: 0.35 + idx * 0.15,
          bulletColor: idx === 1 ? c2 : c0,
          customParams: { hoverX: idx === 1 ? 560 : 610, hoverTime: 5.5, spinDir: idx % 2 === 0 ? 1 : -1 },
        });
      });
      break;
    }

    case 'nebula_flower_pincer': {
      for (let i = 0; i < 3; i++) {
        for (const top of [true, false]) {
          const sy = top ? 105 + i * 26 : 495 - i * 26;
          out.push({
            type: 'red_fairy',
            trajectory: 'hover_retreat',
            attackPattern: 'flower_burst',
            startX: SIM_WIDTH + 48 + i * 64,
            startY: sy,
            speed: spd(146),
            hp: hp(28),
            radius: 17,
            itemDrop: top ? 'power' : 'point',
            shootInterval: 1.25,
            shootDelay: 0.25 + i * 0.18,
            bulletColor: top ? c1 : c2,
            customParams: { hoverX: 585 - i * 32, hoverTime: 4.1 },
          });
        }
      }
      break;
    }

    case 'spiral_galaxy_arms': {
      for (let k = 0; k < 6; k++) {
        out.push({
          type: k % 2 === 0 ? 'purple_fairy' : 'yellow_fairy',
          trajectory: 'spiral',
          attackPattern: 'spiral_barrage',
          startX: SIM_WIDTH + 50 + k * 28,
          startY: 300 + (k % 2 === 0 ? -85 : 85),
          speed: spd(118),
          hp: hp(26),
          radius: 16,
          itemDrop: k === 5 ? 'bomb_frag' : 'power',
          shootInterval: 1.05,
          shootDelay: 0.25 + k * 0.15,
          bulletColor: k % 2 === 0 ? c0 : c2,
          customParams: { phase: (Math.PI * 2 * k) / 6 },
        });
      }
      break;
    }

    case 'binary_twin_commanders': {
      [185, 415].forEach((sy, idx) => {
        out.push({
          type: 'big_fairy',
          trajectory: 'hover_retreat',
          attackPattern: idx === 0 ? 'star_rings' : 'crescent_arc',
          startX: SIM_WIDTH + 55,
          startY: sy,
          speed: spd(88),
          hp: hp(115),
          radius: 28,
          scoreValue: 1400,
          itemDrop: idx === 0 ? 'life_frag' : 'bomb_frag',
          shootInterval: 0.95,
          shootDelay: 0.4 + idx * 0.25,
          bulletColor: idx === 0 ? c0 : c1,
          customParams: { hoverX: 555, hoverTime: 6.8 },
        });
      });
      for (const isTop of [true, false]) {
        out.push({
          type: 'yellow_fairy',
          trajectory: 'perimeter_skimmer',
          attackPattern: 'aimed_single',
          startX: SIM_WIDTH + 90,
          startY: isTop ? 55 : SIM_HEIGHT - 55,
          speed: spd(130),
          hp: hp(22),
          radius: 15,
          itemDrop: 'power',
          shootInterval: 1.5,
          shootDelay: 0.6,
          bulletColor: c2,
          customParams: { bobAmp: 10, isTop },
        });
      }
      break;
    }

    case 'pendulum_chrono_weave': {
      for (let i = 0; i < 5; i++) {
        out.push({
          type: i % 2 === 0 ? 'purple_fairy' : 'yellow_fairy',
          trajectory: 'pendulum',
          attackPattern: 'prism_fan',
          startX: SIM_WIDTH + 45 + i * 58,
          startY: 300,
          speed: spd(122),
          hp: hp(26),
          radius: 16,
          itemDrop: i === 2 ? 'bomb_frag' : 'power',
          shootInterval: 1.35,
          shootDelay: 0.3 + i * 0.2,
          bulletColor: i % 2 === 0 ? c0 : c2,
          customParams: { ampY: 145, freq: 2.1, phase: i * 0.65 },
        });
      }
      break;
    }

    case 'aurora_curtain_ribbon': {
      for (let i = 0; i < 7; i++) {
        out.push({
          type: i % 2 === 0 ? 'green_fairy' : 'purple_fairy',
          trajectory: 'sine',
          attackPattern: 'crescent_arc',
          startX: SIM_WIDTH + 40 + i * 52,
          startY: 140 + (i % 3) * 160,
          speed: spd(136),
          hp: hp(20),
          radius: 16,
          itemDrop: i % 2 === 0 ? 'power' : 'point',
          shootInterval: 1.4,
          shootDelay: 0.25 + i * 0.16,
          bulletColor: i % 2 === 0 ? c0 : c1,
          customParams: { freq: 2.6, amp: 58, phase: i * 0.5 },
        });
      }
      break;
    }

    case 'prism_refraction_hex': {
      for (let k = 0; k < 6; k++) {
        const ang = (Math.PI * 2 * k) / 6;
        const hy = Math.max(85, Math.min(SIM_HEIGHT - 85, 300 + Math.sin(ang) * 125));
        const hx = 575 + Math.cos(ang) * 55;
        out.push({
          type: k % 2 === 0 ? 'yellow_fairy' : 'purple_fairy',
          trajectory: 'hover_retreat',
          attackPattern: k % 2 === 0 ? 'ring_burst' : 'cross_spread',
          startX: SIM_WIDTH + 50 + k * 25,
          startY: hy,
          speed: spd(140),
          hp: hp(30),
          radius: 17,
          itemDrop: k === 0 ? 'bomb_frag' : 'power',
          shootInterval: 1.3,
          shootDelay: 0.35 + k * 0.14,
          bulletColor: k % 2 === 0 ? c2 : c0,
          customParams: { hoverX: hx, hoverTime: 4.5 },
        });
      }
      break;
    }

    case 'broadside_frigate_line': {
      [165, 300, 435].forEach((sy, idx) => {
        out.push({
          type: idx === 1 ? 'big_fairy' : 'red_fairy',
          trajectory: 'hover_retreat',
          attackPattern: 'siege_curtain',
          startX: SIM_WIDTH + 48 + idx * 40,
          startY: sy,
          speed: spd(112),
          hp: hp(idx === 1 ? 105 : 42),
          radius: idx === 1 ? 27 : 18,
          itemDrop: idx === 1 ? 'life_frag' : 'power',
          shootInterval: 1.1,
          shootDelay: 0.3 + idx * 0.2,
          bulletColor: c1,
          customParams: { hoverX: 560, hoverTime: 5.2 },
        });
      });
      for (const sy of [60, 540]) {
        out.push({
          type: 'green_fairy',
          trajectory: 'perimeter_skimmer',
          attackPattern: 'needle_stream',
          startX: SIM_WIDTH + 70,
          startY: sy,
          speed: spd(145),
          hp: hp(18),
          radius: 15,
          itemDrop: 'point',
          shootInterval: 1.35,
          shootDelay: 0.45,
          bulletColor: c0,
          customParams: { bobAmp: 10, isTop: sy < 300 },
        });
      }
      break;
    }

    case 'comet_swoop_blitz': {
      for (let i = 0; i < 6; i++) {
        const fromTop = i % 2 === 0;
        out.push({
          type: i % 3 === 0 ? 'yellow_fairy' : 'red_fairy',
          trajectory: 'swoop_arc',
          attackPattern: 'star_rings',
          startX: SIM_WIDTH + 40 + i * 58,
          startY: fromTop ? 80 : 520,
          speed: spd(158),
          hp: hp(22),
          radius: 16,
          itemDrop: i === 5 ? 'bomb_frag' : 'power',
          shootInterval: 1.15,
          shootDelay: 0.45 + i * 0.12,
          bulletColor: fromTop ? c2 : c0,
          customParams: { targetY: fromTop ? 255 : 345, apexX: 500 + (i % 3) * 35 },
        });
      }
      break;
    }

    case 'gravity_well_vortex': {
      out.push({
        type: 'big_fairy',
        trajectory: 'hover_retreat',
        attackPattern: 'nova_mandala',
        startX: SIM_WIDTH + 55,
        startY: 300,
        speed: spd(82),
        hp: hp(150),
        radius: 30,
        scoreValue: 1600,
        itemDrop: 'life_frag',
        shootInterval: 1.0,
        shootDelay: 0.4,
        bulletColor: c1,
        customParams: { hoverX: 550, hoverTime: 7.5, petals: 6 },
      });
      for (let k = 0; k < 4; k++) {
        out.push({
          type: k % 2 === 0 ? 'purple_fairy' : 'yellow_fairy',
          trajectory: 'orbit_anchor',
          attackPattern: 'spiral_barrage',
          startX: SIM_WIDTH + 75,
          startY: 300,
          speed: spd(120),
          hp: hp(28),
          radius: 16,
          itemDrop: k === 0 ? 'bomb_frag' : 'power',
          shootInterval: 1.25,
          shootDelay: 0.45 + k * 0.18,
          bulletColor: c0,
          customParams: { anchorX: 550, anchorY: 300, orbitR: 92, phase: (Math.PI / 2) * k },
        });
      }
      break;
    }

    case 'quasar_jet_corridor': {
      for (let i = 0; i < 5; i++) {
        out.push({
          type: 'red_fairy',
          trajectory: 'sine',
          attackPattern: 'helix_stream',
          startX: SIM_WIDTH + 40 + i * 48,
          startY: 300,
          speed: spd(145),
          hp: hp(24),
          radius: 16,
          itemDrop: i === 4 ? 'bomb_frag' : 'power',
          shootInterval: 1.15,
          shootDelay: 0.2 + i * 0.15,
          bulletColor: c0,
          customParams: { freq: 3.4, amp: 32, phase: i * 0.4 },
        });
      }
      for (const sy of [95, 505]) {
        out.push({
          type: 'purple_fairy',
          trajectory: 'hover_retreat',
          attackPattern: 'aimed_spread',
          startX: SIM_WIDTH + 60,
          startY: sy,
          speed: spd(135),
          hp: hp(36),
          radius: 17,
          itemDrop: 'power',
          shootInterval: 1.35,
          shootDelay: 0.4,
          bulletColor: c2,
          customParams: { hoverX: 590, hoverTime: 4.8 },
        });
      }
      break;
    }

    case 'subspace_zigzag_swarm': {
      for (let i = 0; i < 7; i++) {
        out.push({
          type: i % 2 === 0 ? 'purple_fairy' : 'green_fairy',
          trajectory: 'zigzag',
          attackPattern: i % 2 === 0 ? 'cross_spread' : 'aimed_single',
          startX: SIM_WIDTH + 40 + i * 50,
          startY: 130 + (i % 4) * 110,
          speed: spd(142),
          hp: hp(21),
          radius: 16,
          itemDrop: i === 6 ? 'bomb_frag' : i % 2 === 0 ? 'power' : 'point',
          shootInterval: 1.25,
          shootDelay: 0.25 + i * 0.14,
          bulletColor: i % 2 === 0 ? c1 : c0,
          customParams: {},
        });
      }
      break;
    }

    case 'supernova_grand_choir':
    default: {
      out.push({
        type: 'big_fairy',
        trajectory: 'hover_retreat',
        attackPattern: 'nova_mandala',
        startX: SIM_WIDTH + 55,
        startY: 300,
        speed: spd(85),
        hp: hp(155),
        radius: 30,
        scoreValue: 1800,
        itemDrop: 'life_frag',
        shootInterval: 0.92,
        shootDelay: 0.35,
        bulletColor: c2,
        customParams: { hoverX: 545, hoverTime: 7.2, petals: 7 },
      });
      [125, 475].forEach((sy, idx) => {
        out.push({
          type: 'purple_fairy',
          trajectory: 'hover_retreat',
          attackPattern: 'flower_burst',
          startX: SIM_WIDTH + 75,
          startY: sy,
          speed: spd(130),
          hp: hp(38),
          radius: 17,
          itemDrop: idx === 0 ? 'bomb_frag' : 'power',
          shootInterval: 1.3,
          shootDelay: 0.5,
          bulletColor: c0,
          customParams: { hoverX: 590, hoverTime: 5.4 },
        });
      });
      for (const sy of [52, 548]) {
        out.push({
          type: 'yellow_fairy',
          trajectory: 'perimeter_skimmer',
          attackPattern: 'aimed_single',
          startX: SIM_WIDTH + 95,
          startY: sy,
          speed: spd(132),
          hp: hp(20),
          radius: 15,
          itemDrop: 'power',
          shootInterval: 1.45,
          shootDelay: 0.55,
          bulletColor: c1,
          customParams: { bobAmp: 10, isTop: sy < 300 },
        });
      }
      break;
    }
  }

  return out;
}

export function buildLevelWaveScript(
  archetypes: string[],
  bossSpawnAt: number,
  meta: { hpScale?: number; speedScale?: number; palette?: [number, number, number]; levelSeed?: number } = {}
): SpaceWaveEvent[] {
  const firstWaveAt = 0.6;
  const lastWaveAt = Math.max(24, bossSpawnAt - 9.5);
  const interval = 7.4;
  const count = Math.max(archetypes.length, Math.floor((lastWaveAt - firstWaveAt) / interval) + 1);
  const step = count > 1 ? (lastWaveAt - firstWaveAt) / (count - 1) : interval;

  const waves: SpaceWaveEvent[] = [];
  for (let i = 0; i < count; i++) {
    const at = Number((firstWaveAt + i * step).toFixed(2));
    let arch = archetypes[i % archetypes.length];
    const progress = i / Math.max(1, count - 1);
    if (i === count - 1) {
      arch = archetypes[archetypes.length - 1];
    } else if (
      Math.abs(progress - 0.48) < 0.55 / count &&
      arch !== 'dreadnought_core' &&
      arch !== 'binary_twin_commanders' &&
      arch !== 'gravity_well_vortex'
    ) {
      arch = (meta.levelSeed || 0) % 2 === 0 ? 'dreadnought_core' : 'binary_twin_commanders';
    }

    waves.push({
      key: `w_${i + 1}`,
      at,
      archetype: arch,
      enemies: buildWaveEnemies(arch, {
        hpScale: meta.hpScale ?? 1.0,
        speedScale: meta.speedScale ?? 1.0,
        variant: i + (meta.levelSeed || 0),
        palette: meta.palette,
      }),
    });
  }
  return waves;
}

export function computeBossMovement(
  moveArchetype: string,
  targetX: number,
  targetY: number,
  t: number,
  phase: number
): { x: number; y: number } {
  const ampScale = 0.88 + phase * 0.06;
  switch (moveArchetype) {
    case 'pendulum_sweep':
      return {
        x: targetX + Math.sin(t * 1.4) * 32 * ampScale,
        y: targetY + Math.sin(t * 2.1) * 115 * ampScale,
      };
    case 'diamond_tactical': {
      const s = t * 1.6;
      return {
        x: targetX + (Math.abs((s % 4) - 2) - 1) * 38,
        y: targetY + (Math.abs(((s + 1) % 4) - 2) - 1) * 105,
      };
    }
    case 'vortex_figure8':
      return {
        x: targetX + Math.cos(t * 1.7) * 44 * ampScale,
        y: targetY + Math.sin(t * 3.4) * 82 * ampScale,
      };
    case 'eclipse_anchor':
      return {
        x: targetX + Math.cos(t * 2.6) * 20,
        y: targetY + Math.sin(t * 1.55) * 95 * ampScale,
      };
    case 'binary_dash':
      return {
        x: targetX + Math.sin(t * 2.8) * 42,
        y: targetY + Math.cos(t * 1.9) * 110 * ampScale,
      };
    case 'orbital_lissajous':
    default:
      return {
        x: targetX + Math.cos(t * 1.35) * 34 * ampScale,
        y: targetY + Math.sin(t * 2.25) * 92 * ampScale,
      };
  }
}

export function fireBossPattern(
  patternId: string,
  ctx: {
    bossX: number;
    bossY: number;
    playerX: number;
    playerY: number;
    animTimer: number;
    shotIndex: number;
    palette: [number, number, number];
    speedScale: number;
    statScale?: number;
    phase: number;
  },
  emitBullet: (x: number, y: number, angle: number, speed: number, radius: number, color: number, damage: number, opts?: BulletSpawnOpts) => void
): void {
  if (fireNormalBossPattern(patternId, ctx, emitBullet)) {
    return;
  }
  const { bossX, bossY, playerX, playerY, animTimer, shotIndex, palette, speedScale = 1.0, phase = 1 } = ctx;
  const [c0, c1, c2] = palette;
  const aim = Math.atan2(playerY - bossY, playerX - bossX);
  const spd = (v: number) => v * speedScale;

  switch (patternId) {
    case 'crescent_fan': {
      const count = 5 + (phase >= 3 ? 2 : 0);
      const parity = shotIndex % 2 === 0 ? 0 : 0.11;
      for (let i = 0; i < count; i++) {
        const norm = (i - (count - 1) / 2) / Math.max(1, (count - 1) / 2);
        const angle = aim + norm * 0.58 + parity * (i % 2 === 0 ? 1 : -1);
        emitBullet(bossX - 24, bossY, angle, spd(205 - Math.abs(norm) * 32), 5, Math.abs(norm) < 0.35 ? c2 : c0, 5);
      }
      break;
    }
    case 'galaxy_spiral': {
      const arms = Math.min(7, 4 + Math.floor(phase / 2));
      const spinPhase = Math.sin(animTimer * 0.55) * 3.8 + animTimer * 1.65;
      for (let k = 0; k < arms; k++) {
        emitBullet(bossX - 12, bossY, spinPhase + (Math.PI * 2 * k) / arms, spd(178), 5, k % 2 === 0 ? c0 : c1, 5);
      }
      break;
    }
    case 'counter_lotus': {
      const petals = 6 + (phase >= 4 ? 2 : 0);
      const rot = shotIndex % 2 === 0 ? animTimer * 1.75 : -animTimer * 1.75 + Math.PI / petals;
      const col = shotIndex % 2 === 0 ? c0 : c2;
      const v = shotIndex % 2 === 0 ? 172 : 164;
      for (let k = 0; k < petals; k++) {
        emitBullet(bossX, bossY, rot + (Math.PI * 2 * k) / petals, spd(v), 5, col, 5);
      }
      break;
    }
    case 'pulsar_lighthouse': {
      const base = animTimer * 1.45;
      for (let b = 0; b < 3; b++) {
        const a = base + (Math.PI * 2 * b) / 3;
        emitBullet(bossX, bossY, a - 0.045, spd(205), 4.5, c0, 5);
        emitBullet(bossX, bossY, a + 0.045, spd(185), 4.5, c2, 5);
      }
      if (shotIndex % 4 === 0) {
        emitBullet(bossX - 24, bossY, aim + 0.24, spd(195), 5, c1, 5);
        emitBullet(bossX - 24, bossY, aim - 0.24, spd(195), 5, c1, 5);
      }
      break;
    }
    case 'star_mandala': {
      const points = phase >= 4 ? 6 : 5;
      const total = points * 4;
      const rot = animTimer * 0.9;
      for (let i = 0; i < total; i++) {
        const theta = (Math.PI * 2 * i) / total;
        const starFactor = 1 - 0.24 * Math.abs(Math.sin(points * theta * 0.5));
        const col = i % 4 === 0 ? c2 : i % 2 === 0 ? c0 : c1;
        emitBullet(bossX, bossY, rot + theta, spd(192 * starFactor), i % 4 === 0 ? 5.5 : 4.5, col, 5);
      }
      break;
    }
    case 'binary_helix': {
      const wave = Math.sin(animTimer * 6.5) * 0.38;
      emitBullet(bossX - 20, bossY - 46, aim + wave, spd(205), 5, c0, 5);
      emitBullet(bossX - 20, bossY + 46, aim - wave, spd(205), 5, c1, 5);
      if (shotIndex % 3 === 0) {
        emitBullet(bossX - 24, bossY, aim, spd(165), 6, c2, 5);
      }
      break;
    }
    case 'prism_lattice': {
      const shift = ((shotIndex % 3) - 1) * 0.14;
      for (const off of [-0.62, -0.34, -0.12, 0.12, 0.34, 0.62]) {
        emitBullet(bossX - 22, bossY, Math.PI + off + shift, spd(182), 4.5, off < 0 ? c0 : c2, 5);
      }
      break;
    }
    case 'chrono_rings': {
      const count = 12 + (phase >= 4 ? 2 : 0);
      const isFast = shotIndex % 2 === 0;
      const base = animTimer * 1.1 + (isFast ? 0 : Math.PI / count);
      for (let i = 0; i < count; i++) {
        if (!isFast && i === count >> 1) continue;
        emitBullet(bossX, bossY, base + (Math.PI * 2 * i) / count, spd(isFast ? 208 : 142), isFast ? 4 : 6, isFast ? c0 : c1, 5);
      }
      break;
    }
    case 'comet_rain': {
      for (let k = 0; k < 4; k++) {
        const sx = 340 + ((shotIndex * 97 + k * 130) % 440);
        const angle = Math.PI * 0.72 + Math.sin(animTimer + k) * 0.08;
        emitBullet(sx, 14, angle, spd(170 + k * 12), 4.5, k % 2 === 0 ? c2 : c0, 5);
      }
      emitBullet(bossX - 24, bossY, aim - 0.18, spd(198), 5, c1, 5);
      emitBullet(bossX - 24, bossY, aim + 0.18, spd(198), 5, c1, 5);
      break;
    }
    case 'gravity_whirlpool': {
      const rot = animTimer * 2.35;
      for (let k = 0; k < 5; k++) {
        emitBullet(bossX, bossY, rot + (Math.PI * 2 * k) / 5, spd(184), 5, c0, 5);
      }
      if (shotIndex % 4 === 0) {
        for (const off of [-0.42, 0, 0.42]) {
          emitBullet(bossX - 26, bossY, Math.PI + off, spd(126), 7, c1, 6);
        }
      }
      break;
    }
    case 'siege_broadside': {
      const openLane = shotIndex % 5;
      for (let lane = 0; lane < 5; lane++) {
        if (lane === openLane) continue;
        const ly = 85 + lane * 106;
        emitBullet(bossX - 20, ly, Math.PI, spd(196), 5.5, lane % 2 === 0 ? c1 : c2, 5);
        emitBullet(bossX - 20, ly, Math.PI + 0.06, spd(178), 4.5, c0, 5);
      }
      break;
    }
    case 'supernova_symphony':
    default: {
      if (shotIndex % 3 === 0) {
        const points = 6;
        const total = 18;
        const rot = -animTimer * 1.15;
        for (let i = 0; i < total; i++) {
          const theta = (Math.PI * 2 * i) / total;
          const starFactor = 1 - 0.22 * Math.abs(Math.sin(points * theta * 0.5));
          emitBullet(bossX, bossY, rot + theta, spd(176 * starFactor), 5, i % 3 === 0 ? c2 : c0, 5);
        }
      } else {
        const rot = animTimer * 2.1;
        for (let k = 0; k < 6; k++) {
          emitBullet(bossX, bossY, rot + (Math.PI * 2 * k) / 6, spd(190), 4.5, k % 2 === 0 ? c1 : c2, 5);
        }
      }
      break;
    }
  }
}

const PATTERN_INTERVALS: Record<string, number> = {
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

let _seed = 1;

function createSpaceStage(spec: {
  difficulty: 'normal' | 'difficult' | 'no_mercy';
  world: number;
  stage: number;
  worldName: string;
  stageTitle: string;
  bossSpawnAt: number;
  waveHpScale: number;
  waveSpeedScale: number;
  palette: [number, number, number];
  theme: Omit<SpaceThemeSpec, 'id' | 'starColors'> & { starColors?: number[] };
  waveArchetypes: string[];
  boss: {
    bossName: string;
    baseHp: number;
    speedScale: number;
    moveArchetype: string;
    phases: Array<{ name: string; pattern: string }>;
  };
}): SpaceStageConfig {
  const seed = _seed++;
  const hpMults = [1.0, 1.22, 1.15, 1.35, 1.55];
  const phases: BossPhaseProfile[] = spec.boss.phases.map((p, idx) => {
    const phaseNum = idx + 1;
    return {
      phase: phaseNum,
      name: p.name,
      isSpellCard: phaseNum === 2 || phaseNum === 4 || phaseNum === 5,
      maxHp: Math.round(spec.boss.baseHp * hpMults[idx]),
      pattern: p.pattern,
      shootInterval: Number(((PATTERN_INTERVALS[p.pattern] || 0.36) / (0.94 + spec.boss.speedScale * 0.06)).toFixed(3)),
      laserMode: phaseNum >= 4 ? 'both' : phaseNum <= 2 ? 'targeted' : 'none',
      laserInterval: phaseNum >= 4 ? 3.8 : 4.8,
      megaLaserInterval: phaseNum === 2 ? 7.2 : phaseNum === 4 ? 6.6 : phaseNum === 5 ? 6.0 : 0,
    };
  });

  const useOverhaul =
    ENABLE_NORMAL_OVERHAUL &&
    (spec.difficulty === 'normal' || spec.difficulty === 'difficult' || spec.difficulty === 'no_mercy');

  const baseWaves = buildLevelWaveScript(spec.waveArchetypes, spec.bossSpawnAt, {
    hpScale: useOverhaul ? 1.0 : spec.waveHpScale,
    speedScale: useOverhaul ? 1.0 : spec.waveSpeedScale,
    palette: spec.palette,
    levelSeed: seed,
  });

  const hasBoss = useOverhaul ? spec.stage === 3 : true;
  const miniboss = useOverhaul && !hasBoss ? getScaledMinibossDef(spec.world, spec.stage, spec.difficulty) : null;
  const waves = useOverhaul
    ? buildNormalWorldWaves(spec.world, spec.stage, spec.bossSpawnAt, baseWaves, {
        palette: spec.palette,
        levelSeed: seed,
        difficulty: spec.difficulty,
      })
    : baseWaves;
  const bossProfile: SpaceBossProfile =
    useOverhaul && hasBoss
      ? getNormalWorldBossProfile(spec.world, spec.palette, spec.difficulty)
      : {
          bossId: 'first_boss',
          bossName: spec.boss.bossName,
          fullBossName: spec.boss.bossName,
          sprite: '/assets/sprites/FirstBoss.png',
          introDuration: 0,
          moveArchetype: spec.boss.moveArchetype,
          palette: spec.palette,
          speedScale: spec.boss.speedScale,
          statScale: 1.0,
          phases,
        };

  return {
    difficulty: spec.difficulty,
    world: spec.world,
    stage: spec.stage,
    worldName: spec.worldName,
    stageTitle: spec.stageTitle,
    palette: spec.palette,
    hasBoss,
    miniboss,
    spaceTheme: {
      id: `${spec.difficulty}-${spec.world}-${spec.stage}`,
      ...spec.theme,
      starColors: spec.theme.starColors || [spec.palette[0], spec.palette[1], spec.palette[2], 0xffffff],
    },
    waves,
    bossWarningAt: Number((spec.bossSpawnAt - 3.5).toFixed(1)),
    bossSpawnAt: spec.bossSpawnAt,
    bossProfile,
  };
}

export const SPACE_CAMPAIGN_CONFIGS: SpaceStageConfig[] = [
  // ── NORMAL (9 Distinct Space Levels) ─────────────────────────────────────
  createSpaceStage({
    difficulty: 'normal', world: 1, stage: 1,
    worldName: 'Frontera Orbital', stageTitle: 'Astillero Lagrange',
    bossSpawnAt: 132.0, waveHpScale: 0.95, waveSpeedScale: 0.92,
    palette: [0x00f2fe, 0x3b82f6, 0xffd166],
    theme: { skyTop: 0x040818, skyBottom: 0x0a1633, nebulaA: 0x102a5c, nebulaB: 0x005f88, gridColor: 0x1d3f72, accentColor: 0x00f2fe, feature: 'planet_ring', scrollSpeed: 125 },
    waveArchetypes: ['orbital_chevron', 'double_helix_ion', 'satellite_relay_flank', 'siege_artillery_wall', 'phalanx_drone_column', 'dreadnought_core', 'nebula_flower_pincer', 'orbital_chevron', 'supernova_grand_choir'],
    boss: {
      bossName: 'Centinela Aegis-01', baseHp: 112, speedScale: 0.92, moveArchetype: 'orbital_lissajous',
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
    bossSpawnAt: 148.0, waveHpScale: 1.0, waveSpeedScale: 0.95,
    palette: [0x38bdf8, 0xf97316, 0xfacc15],
    theme: { skyTop: 0x080a14, skyBottom: 0x181524, nebulaA: 0x2c2238, nebulaB: 0x4a2518, gridColor: 0x3a2f4d, accentColor: 0xf97316, feature: 'debris_belt', scrollSpeed: 142 },
    waveArchetypes: ['meteor_cross_lattice', 'phalanx_drone_column', 'satellite_relay_flank', 'comet_swoop_blitz', 'dreadnought_core', 'siege_artillery_wall', 'meteor_cross_lattice', 'broadside_frigate_line', 'supernova_grand_choir'],
    boss: {
      bossName: 'Soberano Kessler-IX', baseHp: 120, speedScale: 0.95, moveArchetype: 'pendulum_sweep',
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
    bossSpawnAt: 90.0, waveHpScale: 1.05, waveSpeedScale: 0.97,
    palette: [0xe2e8f0, 0x60a5fa, 0xc084fc],
    theme: { skyTop: 0x050712, skyBottom: 0x111830, nebulaA: 0x1e294b, nebulaB: 0x31255a, gridColor: 0x334168, accentColor: 0x93c5fd, feature: 'lunar_halo', scrollSpeed: 132 },
    waveArchetypes: ['aurora_curtain_ribbon', 'satellite_relay_flank', 'prism_refraction_hex', 'binary_twin_commanders', 'siege_artillery_wall', 'supernova_grand_choir'],
    boss: {
      bossName: 'Arconte Lunar Selene', baseHp: 128, speedScale: 0.97, moveArchetype: 'vortex_figure8',
      phases: [
        { name: 'Fase 1 "Brisa del Mar de la Tranquilidad"', pattern: 'counter_lotus' },
        { name: 'Sello Selenita "Plenilunio de Plata"', pattern: 'chrono_rings' },
        { name: 'Fase 3 "Marea Gravitatoria"', pattern: 'crescent_fan' },
        { name: 'Protocolo Cráter "Corona de Artemisa"', pattern: 'star_mandala' },
        { name: 'Eclipse Lunar "Rayo del Apogeo"', pattern: 'supernova_symphony' },
      ],
    },
  }),
  createSpaceStage({
    difficulty: 'normal', world: 2, stage: 1,
    worldName: 'Sector Helios', stageTitle: 'Corriente de Viento Solar',
    bossSpawnAt: 138.0, waveHpScale: 1.06, waveSpeedScale: 0.98,
    palette: [0xfbbf24, 0xf97316, 0x38bdf8],
    theme: { skyTop: 0x140704, skyBottom: 0x2b1106, nebulaA: 0x5c2208, nebulaB: 0x853a0a, gridColor: 0x6b2f12, accentColor: 0xfbbf24, feature: 'solar_corona', scrollSpeed: 148 },
    waveArchetypes: ['aurora_curtain_ribbon', 'double_helix_ion', 'comet_swoop_blitz', 'satellite_relay_flank', 'dreadnought_core', 'nebula_flower_pincer', 'phalanx_drone_column', 'spiral_galaxy_arms', 'supernova_grand_choir'],
    boss: {
      bossName: 'Heraldo Coronal Helios-V', baseHp: 132, speedScale: 0.98, moveArchetype: 'orbital_lissajous',
      phases: [
        { name: 'Fase 1 "Ráfaga Fotosférica"', pattern: 'crescent_fan' },
        { name: 'Sello Solar "Flor de Fulguración"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Viento Ionizado"', pattern: 'galaxy_spiral' },
        { name: 'Protocolo Corona "Arco Magnético Solar"', pattern: 'binary_helix' },
        { name: 'Fulguración X "Sol de Medianoche"', pattern: 'counter_lotus' },
      ],
    },
  }),
  createSpaceStage({
    difficulty: 'normal', world: 2, stage: 2,
    worldName: 'Sector Helios', stageTitle: 'Forja Orbital de Mercurio',
    bossSpawnAt: 156.0, waveHpScale: 1.1, waveSpeedScale: 1.0,
    palette: [0xff6b35, 0xffd166, 0x00f2fe],
    theme: { skyTop: 0x120608, skyBottom: 0x281014, nebulaA: 0x52181c, nebulaB: 0x6e2f14, gridColor: 0x5e2626, accentColor: 0xff6b35, feature: 'dyson_grid', scrollSpeed: 140 },
    waveArchetypes: ['siege_artillery_wall', 'prism_refraction_hex', 'broadside_frigate_line', 'satellite_relay_flank', 'binary_twin_commanders', 'phalanx_drone_column', 'meteor_cross_lattice', 'pulsar_clock_pods', 'supernova_grand_choir'],
    boss: {
      bossName: 'Supervisor Vulcano-Prime', baseHp: 138, speedScale: 1.0, moveArchetype: 'diamond_tactical',
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
    bossSpawnAt: 90.0, waveHpScale: 1.14, waveSpeedScale: 1.02,
    palette: [0xff2b5b, 0xffdd00, 0xff8800],
    theme: { skyTop: 0x16040a, skyBottom: 0x330a14, nebulaA: 0x661224, nebulaB: 0x803808, gridColor: 0x6e1d30, accentColor: 0xffdd00, feature: 'eclipse_gate', scrollSpeed: 154 },
    waveArchetypes: ['quasar_jet_corridor', 'comet_swoop_blitz', 'gravity_well_vortex', 'satellite_relay_flank', 'siege_artillery_wall', 'supernova_grand_choir'],
    boss: {
      bossName: 'Serafín Prominencia-X', baseHp: 146, speedScale: 1.02, moveArchetype: 'eclipse_anchor',
      phases: [
        { name: 'Fase 1 "Anillo de Diamante"', pattern: 'chrono_rings' },
        { name: 'Sello Eclipse "Eyección de Masa Coronal"', pattern: 'galaxy_spiral' },
        { name: 'Fase 3 "Prominencia Gemela"', pattern: 'binary_helix' },
        { name: 'Protocolo Helios "Catedral de Plasma"', pattern: 'counter_lotus' },
        { name: 'Cenit Solar "Superllamarada Imperial"', pattern: 'supernova_symphony' },
      ],
    },
  }),
  createSpaceStage({
    difficulty: 'normal', world: 3, stage: 1,
    worldName: 'Alcance Nebular', stageTitle: 'Estela del Cometa Crioanular',
    bossSpawnAt: 144.0, waveHpScale: 1.16, waveSpeedScale: 1.02,
    palette: [0x67e8f9, 0x38bdf8, 0xe0f2fe],
    theme: { skyTop: 0x030b18, skyBottom: 0x071d36, nebulaA: 0x0d3b66, nebulaB: 0x155e75, gridColor: 0x1e4e79, accentColor: 0x67e8f9, feature: 'comet_trail', scrollSpeed: 150 },
    waveArchetypes: ['comet_swoop_blitz', 'orbital_chevron', 'satellite_relay_flank', 'meteor_cross_lattice', 'dreadnought_core', 'pendulum_chrono_weave', 'phalanx_drone_column', 'prism_refraction_hex', 'supernova_grand_choir'],
    boss: {
      bossName: 'Núcleo Cometa Halley-Cero', baseHp: 150, speedScale: 1.02, moveArchetype: 'binary_dash',
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
    bossSpawnAt: 164.0, waveHpScale: 1.2, waveSpeedScale: 1.04,
    palette: [0x10b981, 0xa855f7, 0x00f2fe],
    theme: { skyTop: 0x03120e, skyBottom: 0x0a2420, nebulaA: 0x064e3b, nebulaB: 0x3b1d5e, gridColor: 0x165b4c, accentColor: 0x34d399, feature: 'ion_nebula', scrollSpeed: 136 },
    waveArchetypes: ['nebula_flower_pincer', 'spiral_galaxy_arms', 'double_helix_ion', 'satellite_relay_flank', 'gravity_well_vortex', 'aurora_curtain_ribbon', 'siege_artillery_wall', 'subspace_zigzag_swarm', 'supernova_grand_choir'],
    boss: {
      bossName: 'Tejedora Ojo Viridiano', baseHp: 156, speedScale: 1.04, moveArchetype: 'vortex_figure8',
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
    bossSpawnAt: 90.0, waveHpScale: 1.24, waveSpeedScale: 1.06,
    palette: [0x00f2fe, 0xa855f7, 0xffdd00],
    theme: { skyTop: 0x060418, skyBottom: 0x150d38, nebulaA: 0x2e1568, nebulaB: 0x0a4a6e, gridColor: 0x3b247a, accentColor: 0x00f2fe, feature: 'hypergate', scrollSpeed: 162 },
    waveArchetypes: ['orbital_chevron', 'pulsar_clock_pods', 'binary_twin_commanders', 'phalanx_drone_column', 'quasar_jet_corridor', 'supernova_grand_choir'],
    boss: {
      bossName: 'Guardián Cenit-Omega', baseHp: 166, speedScale: 1.06, moveArchetype: 'eclipse_anchor',
      phases: [
        { name: 'Fase 1 "Apertura Taquiónica"', pattern: 'pulsar_lighthouse' },
        { name: 'Sello Hiperespacial "Mandala de Salto"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Corredor Parsec"', pattern: 'chrono_rings' },
        { name: 'Protocolo Omega "Cerrojo Intergaláctico"', pattern: 'counter_lotus' },
        { name: 'Horizonte Astral "Salto al Infinito"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  // ── DIFFICULT (9 Completely New Space Levels) ────────────────────────────
  createSpaceStage({
    difficulty: 'difficult', world: 1, stage: 1,
    worldName: 'Frente de Magnetar', stageTitle: 'Faro del Púlsar Vela',
    bossSpawnAt: 140.0, waveHpScale: 1.22, waveSpeedScale: 1.08,
    palette: [0x00f2fe, 0xc084fc, 0xffffff],
    theme: { skyTop: 0x05041a, skyBottom: 0x120d3a, nebulaA: 0x261863, nebulaB: 0x084c6e, gridColor: 0x33287a, accentColor: 0x38bdf8, feature: 'pulsar_beams', scrollSpeed: 158 },
    waveArchetypes: ['pulsar_clock_pods', 'satellite_relay_flank', 'double_helix_ion', 'phalanx_drone_column', 'dreadnought_core', 'pendulum_chrono_weave', 'pulsar_clock_pods', 'meteor_cross_lattice', 'supernova_grand_choir'],
    boss: {
      bossName: 'Cantor del Púlsar Vela-XIII', baseHp: 152, speedScale: 1.08, moveArchetype: 'eclipse_anchor',
      phases: [
        { name: 'Fase 1 "Pulso de Milisegundo"', pattern: 'pulsar_lighthouse' },
        { name: 'Sello Neutrónico "Faro Sincrotrón"', pattern: 'chrono_rings' },
        { name: 'Fase 3 "Dipolo Relativista"', pattern: 'binary_helix' },
        { name: 'Protocolo Vela "Reloj Cósmico"', pattern: 'star_mandala' },
        { name: 'Resonancia Púlsar "Réquiem Magnético"', pattern: 'galaxy_spiral' },
      ],
    },
  }),
  createSpaceStage({
    difficulty: 'difficult', world: 1, stage: 2,
    worldName: 'Frente de Magnetar', stageTitle: 'Fosa de Aurora Ionizada',
    bossSpawnAt: 158.0, waveHpScale: 1.26, waveSpeedScale: 1.1,
    palette: [0x2dd4bf, 0xf43f5e, 0xa855f7],
    theme: { skyTop: 0x041218, skyBottom: 0x180a28, nebulaA: 0x0d4f56, nebulaB: 0x521646, gridColor: 0x1f5c68, accentColor: 0x2dd4bf, feature: 'aurora_curtain', scrollSpeed: 146 },
    waveArchetypes: ['aurora_curtain_ribbon', 'nebula_flower_pincer', 'satellite_relay_flank', 'siege_artillery_wall', 'binary_twin_commanders', 'subspace_zigzag_swarm', 'aurora_curtain_ribbon', 'spiral_galaxy_arms', 'supernova_grand_choir'],
    boss: {
      bossName: 'Valquiria Magnetosfera', baseHp: 160, speedScale: 1.1, moveArchetype: 'pendulum_sweep',
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
    bossSpawnAt: 90.0, waveHpScale: 1.3, waveSpeedScale: 1.12,
    palette: [0xff2b5b, 0x38bdf8, 0xfacc15],
    theme: { skyTop: 0x140414, skyBottom: 0x280828, nebulaA: 0x581048, nebulaB: 0x143868, gridColor: 0x621c58, accentColor: 0xff2b5b, feature: 'magnetar_arcs', scrollSpeed: 165 },
    waveArchetypes: ['quasar_jet_corridor', 'pulsar_clock_pods', 'gravity_well_vortex', 'siege_artillery_wall', 'phalanx_drone_column', 'supernova_grand_choir'],
    boss: {
      bossName: 'Tirano Gauss-Prime', baseHp: 168, speedScale: 1.12, moveArchetype: 'diamond_tactical',
      phases: [
        { name: 'Fase 1 "Líneas de Flujo Gigatesla"', pattern: 'binary_helix' },
        { name: 'Sello Magnetar "Terremoto Estelar"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Inversión de Polos"', pattern: 'siege_broadside' },
        { name: 'Protocolo Gauss "Jaula Diamagnética"', pattern: 'pulsar_lighthouse' },
        { name: 'Colapso Magnético "Pulso Gamma Letal"', pattern: 'supernova_symphony' },
      ],
    },
  }),
  createSpaceStage({
    difficulty: 'difficult', world: 2, stage: 1,
    worldName: 'Deriva Xenolítica', stageTitle: 'Cementerio Armada Fantasma',
    bossSpawnAt: 146.0, waveHpScale: 1.32, waveSpeedScale: 1.12,
    palette: [0x34d399, 0x60a5fa, 0xfbbf24],
    theme: { skyTop: 0x040d10, skyBottom: 0x0b1e22, nebulaA: 0x12383c, nebulaB: 0x1e2c48, gridColor: 0x1f4a50, accentColor: 0x34d399, feature: 'ghost_fleet', scrollSpeed: 132 },
    waveArchetypes: ['broadside_frigate_line', 'subspace_zigzag_swarm', 'satellite_relay_flank', 'siege_artillery_wall', 'dreadnought_core', 'phalanx_drone_column', 'broadside_frigate_line', 'comet_swoop_blitz', 'supernova_grand_choir'],
    boss: {
      bossName: 'Acorazado Espectral Nautilus', baseHp: 172, speedScale: 1.12, moveArchetype: 'orbital_lissajous',
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
    bossSpawnAt: 168.0, waveHpScale: 1.36, waveSpeedScale: 1.14,
    palette: [0xe879f9, 0x38bdf8, 0xfde047],
    theme: { skyTop: 0x0c051a, skyBottom: 0x1d0e36, nebulaA: 0x421868, nebulaB: 0x164468, gridColor: 0x522882, accentColor: 0xe879f9, feature: 'crystal_spire', scrollSpeed: 144 },
    waveArchetypes: ['prism_refraction_hex', 'pendulum_chrono_weave', 'satellite_relay_flank', 'meteor_cross_lattice', 'binary_twin_commanders', 'nebula_flower_pincer', 'prism_refraction_hex', 'phalanx_drone_column', 'supernova_grand_choir'],
    boss: {
      bossName: 'Arquitecto Óculo-VII', baseHp: 178, speedScale: 1.14, moveArchetype: 'diamond_tactical',
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
    bossSpawnAt: 90.0, waveHpScale: 1.4, waveSpeedScale: 1.15,
    palette: [0xf472b6, 0x00f2fe, 0xfef08a],
    theme: { skyTop: 0x0a0618, skyBottom: 0x1e1032, nebulaA: 0x3b1854, nebulaB: 0x104458, gridColor: 0x4c2468, accentColor: 0xf472b6, feature: 'chrono_rings', scrollSpeed: 152 },
    waveArchetypes: ['pendulum_chrono_weave', 'subspace_zigzag_swarm', 'gravity_well_vortex', 'satellite_relay_flank', 'pulsar_clock_pods', 'supernova_grand_choir'],
    boss: {
      bossName: 'Árbitro Cronos-Cero', baseHp: 184, speedScale: 1.15, moveArchetype: 'vortex_figure8',
      phases: [
        { name: 'Fase 1 "Dilatación Lorentz"', pattern: 'chrono_rings' },
        { name: 'Sello Temporal "Agujas del Destino"', pattern: 'pulsar_lighthouse' },
        { name: 'Fase 3 "Paradoja Taquiónica"', pattern: 'galaxy_spiral' },
        { name: 'Protocolo Reloj "Péndulo Causal"', pattern: 'counter_lotus' },
        { name: 'Fin del Tiempo "Instante Eterno"', pattern: 'supernova_symphony' },
      ],
    },
  }),
  createSpaceStage({
    difficulty: 'difficult', world: 3, stage: 1,
    worldName: 'Remanente Supernova', stageTitle: 'Filamento de Onda de Choque',
    bossSpawnAt: 150.0, waveHpScale: 1.42, waveSpeedScale: 1.16,
    palette: [0xff2b5b, 0x00f2fe, 0xfbbf24],
    theme: { skyTop: 0x14050c, skyBottom: 0x260c22, nebulaA: 0x621432, nebulaB: 0x0e4466, gridColor: 0x681f42, accentColor: 0xff2b5b, feature: 'shock_filament', scrollSpeed: 162 },
    waveArchetypes: ['comet_swoop_blitz', 'meteor_cross_lattice', 'quasar_jet_corridor', 'satellite_relay_flank', 'dreadnought_core', 'spiral_galaxy_arms', 'siege_artillery_wall', 'nebula_flower_pincer', 'supernova_grand_choir'],
    boss: {
      bossName: 'Vanguardia Cygnus-Nova', baseHp: 188, speedScale: 1.16, moveArchetype: 'binary_dash',
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
    bossSpawnAt: 170.0, waveHpScale: 1.46, waveSpeedScale: 1.17,
    palette: [0xffd166, 0xc084fc, 0x38bdf8],
    theme: { skyTop: 0x120806, skyBottom: 0x281422, nebulaA: 0x663410, nebulaB: 0x481a5c, gridColor: 0x6e3f24, accentColor: 0xffd166, feature: 'starforge', scrollSpeed: 148 },
    waveArchetypes: ['orbital_chevron', 'siege_artillery_wall', 'prism_refraction_hex', 'satellite_relay_flank', 'binary_twin_commanders', 'phalanx_drone_column', 'gravity_well_vortex', 'broadside_frigate_line', 'supernova_grand_choir'],
    boss: {
      bossName: 'Titán Estelar Hiperión', baseHp: 194, speedScale: 1.17, moveArchetype: 'eclipse_anchor',
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
    bossSpawnAt: 90.0, waveHpScale: 1.5, waveSpeedScale: 1.18,
    palette: [0xfacc15, 0xa855f7, 0x00f2fe],
    theme: { skyTop: 0x0e051c, skyBottom: 0x240c38, nebulaA: 0x52186e, nebulaB: 0x6e4810, gridColor: 0x642882, accentColor: 0xfacc15, feature: 'binary_stars', scrollSpeed: 168 },
    waveArchetypes: ['double_helix_ion', 'binary_twin_commanders', 'spiral_galaxy_arms', 'pulsar_clock_pods', 'quasar_jet_corridor', 'supernova_grand_choir'],
    boss: {
      bossName: 'Emperatriz Kilonova', baseHp: 204, speedScale: 1.18, moveArchetype: 'vortex_figure8',
      phases: [
        { name: 'Fase 1 "Espiral Inspiral"', pattern: 'binary_helix' },
        { name: 'Sello Binario "Ondas de Espacio-Tiempo"', pattern: 'chrono_rings' },
        { name: 'Fase 3 "Forja de Oro Cósmico"', pattern: 'counter_lotus' },
        { name: 'Protocolo Kilonova "Doble Horizonte"', pattern: 'star_mandala' },
        { name: 'Fusión de Neutrones "Estallido Kilonova"', pattern: 'supernova_symphony' },
      ],
    },
  }),

  // ── NO MERCY (9 Completely New Endgame Space Levels) ─────────────────────
  createSpaceStage({
    difficulty: 'no_mercy', world: 1, stage: 1,
    worldName: 'Horizonte Cuásar', stageTitle: 'Chorro Relativista Blázar',
    bossSpawnAt: 142.0, waveHpScale: 1.48, waveSpeedScale: 1.2,
    palette: [0x38bdf8, 0xffffff, 0xf43f5e],
    theme: { skyTop: 0x02081c, skyBottom: 0x081a42, nebulaA: 0x0e387a, nebulaB: 0x3b1254, gridColor: 0x1d4d94, accentColor: 0x7dd3fc, feature: 'quasar_jet', scrollSpeed: 175 },
    waveArchetypes: ['quasar_jet_corridor', 'satellite_relay_flank', 'phalanx_drone_column', 'pulsar_clock_pods', 'dreadnought_core', 'comet_swoop_blitz', 'siege_artillery_wall', 'quasar_jet_corridor', 'supernova_grand_choir'],
    boss: {
      bossName: 'Serafín Blázar-01', baseHp: 196, speedScale: 1.2, moveArchetype: 'binary_dash',
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
    bossSpawnAt: 162.0, waveHpScale: 1.52, waveSpeedScale: 1.22,
    palette: [0xf97316, 0xc084fc, 0xfef08a],
    theme: { skyTop: 0x120508, skyBottom: 0x260c1e, nebulaA: 0x68240c, nebulaB: 0x4a145c, gridColor: 0x722e1c, accentColor: 0xfb923c, feature: 'accretion_disk', scrollSpeed: 164 },
    waveArchetypes: ['spiral_galaxy_arms', 'gravity_well_vortex', 'satellite_relay_flank', 'nebula_flower_pincer', 'binary_twin_commanders', 'meteor_cross_lattice', 'spiral_galaxy_arms', 'siege_artillery_wall', 'supernova_grand_choir'],
    boss: {
      bossName: 'Soberano Cuásar-IX', baseHp: 205, speedScale: 1.22, moveArchetype: 'vortex_figure8',
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
    bossSpawnAt: 90.0, waveHpScale: 1.56, waveSpeedScale: 1.23,
    palette: [0xfef08a, 0x38bdf8, 0xe879f9],
    theme: { skyTop: 0x080814, skyBottom: 0x18142e, nebulaA: 0x362c5e, nebulaB: 0x524218, gridColor: 0x4c4278, accentColor: 0xfef08a, feature: 'photon_ring', scrollSpeed: 170 },
    waveArchetypes: ['prism_refraction_hex', 'pendulum_chrono_weave', 'gravity_well_vortex', 'satellite_relay_flank', 'pulsar_clock_pods', 'supernova_grand_choir'],
    boss: {
      bossName: 'Guardián Anillo-Einstein', baseHp: 214, speedScale: 1.23, moveArchetype: 'eclipse_anchor',
      phases: [
        { name: 'Fase 1 "Lente Gravitacional"', pattern: 'chrono_rings' },
        { name: 'Sello Fotónico "Cruz de Einstein"', pattern: 'prism_lattice' },
        { name: 'Fase 3 "Órbita de Luz Cautiva"', pattern: 'counter_lotus' },
        { name: 'Protocolo Espejismo "Anillo Relativista"', pattern: 'star_mandala' },
        { name: 'Última Sombra "Horizonte Sin Retorno"', pattern: 'supernova_symphony' },
      ],
    },
  }),
  createSpaceStage({
    difficulty: 'no_mercy', world: 2, stage: 1,
    worldName: 'Abismo Materia Oscura', stageTitle: 'Telaraña Subespacial',
    bossSpawnAt: 152.0, waveHpScale: 1.58, waveSpeedScale: 1.24,
    palette: [0xa855f7, 0x22d3ee, 0xf43f5e],
    theme: { skyTop: 0x050212, skyBottom: 0x120628, nebulaA: 0x2e0e5c, nebulaB: 0x0c3454, gridColor: 0x3e1a72, accentColor: 0xa855f7, feature: 'cosmic_web', scrollSpeed: 156 },
    waveArchetypes: ['meteor_cross_lattice', 'subspace_zigzag_swarm', 'satellite_relay_flank', 'prism_refraction_hex', 'dreadnought_core', 'double_helix_ion', 'subspace_zigzag_swarm', 'phalanx_drone_column', 'supernova_grand_choir'],
    boss: {
      bossName: 'Tejedor Filamento-X', baseHp: 218, speedScale: 1.24, moveArchetype: 'diamond_tactical',
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
    bossSpawnAt: 172.0, waveHpScale: 1.62, waveSpeedScale: 1.25,
    palette: [0xff2b5b, 0x9333ea, 0x00f2fe],
    theme: { skyTop: 0x0a0208, skyBottom: 0x1e0518, nebulaA: 0x4c0828, nebulaB: 0x2c0848, gridColor: 0x5c1238, accentColor: 0xff2b5b, feature: 'entropy_rift', scrollSpeed: 162 },
    waveArchetypes: ['siege_artillery_wall', 'broadside_frigate_line', 'gravity_well_vortex', 'satellite_relay_flank', 'binary_twin_commanders', 'comet_swoop_blitz', 'quasar_jet_corridor', 'siege_artillery_wall', 'supernova_grand_choir'],
    boss: {
      bossName: 'Heraldo Leviatán-Nulo', baseHp: 226, speedScale: 1.25, moveArchetype: 'pendulum_sweep',
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
    bossSpawnAt: 90.0, waveHpScale: 1.66, waveSpeedScale: 1.26,
    palette: [0xe2e8f0, 0x00f2fe, 0xc084fc],
    theme: { skyTop: 0x03050c, skyBottom: 0x0a1024, nebulaA: 0x182648, nebulaB: 0x2a1848, gridColor: 0x283c66, accentColor: 0xe2e8f0, feature: 'zero_point', scrollSpeed: 174 },
    waveArchetypes: ['pendulum_chrono_weave', 'pulsar_clock_pods', 'binary_twin_commanders', 'phalanx_drone_column', 'prism_refraction_hex', 'supernova_grand_choir'],
    boss: {
      bossName: 'Arconte Ápex-Cero', baseHp: 232, speedScale: 1.26, moveArchetype: 'vortex_figure8',
      phases: [
        { name: 'Fase 1 "Fluctuación Cuántica"', pattern: 'pulsar_lighthouse' },
        { name: 'Sello Vacío "Falso Vacío Metaestable"', pattern: 'star_mandala' },
        { name: 'Fase 3 "Espuma de Planck"', pattern: 'galaxy_spiral' },
        { name: 'Protocolo Cero "Colapso de Fase"', pattern: 'counter_lotus' },
        { name: 'Energía Punto Cero "Génesis Inverso"', pattern: 'supernova_symphony' },
      ],
    },
  }),
  createSpaceStage({
    difficulty: 'no_mercy', world: 3, stage: 1,
    worldName: 'Escatón Cósmico', stageTitle: 'Colisión Galáctica Andrómeda',
    bossSpawnAt: 154.0, waveHpScale: 1.68, waveSpeedScale: 1.27,
    palette: [0x38bdf8, 0xf472b6, 0xfacc15],
    theme: { skyTop: 0x060618, skyBottom: 0x1c0c2e, nebulaA: 0x143c6e, nebulaB: 0x5c184c, gridColor: 0x382868, accentColor: 0xf472b6, feature: 'galaxy_clash', scrollSpeed: 168 },
    waveArchetypes: ['spiral_galaxy_arms', 'aurora_curtain_ribbon', 'binary_twin_commanders', 'satellite_relay_flank', 'meteor_cross_lattice', 'gravity_well_vortex', 'comet_swoop_blitz', 'spiral_galaxy_arms', 'supernova_grand_choir'],
    boss: {
      bossName: 'Corona de Marea Andrómeda', baseHp: 236, speedScale: 1.27, moveArchetype: 'orbital_lissajous',
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
    bossSpawnAt: 174.0, waveHpScale: 1.72, waveSpeedScale: 1.28,
    palette: [0xfde047, 0x10b981, 0xc084fc],
    theme: { skyTop: 0x08100c, skyBottom: 0x1c1230, nebulaA: 0x145238, nebulaB: 0x4c1c6e, gridColor: 0x2e5848, accentColor: 0xfde047, feature: 'gamma_cathedral', scrollSpeed: 166 },
    waveArchetypes: ['pulsar_clock_pods', 'prism_refraction_hex', 'quasar_jet_corridor', 'satellite_relay_flank', 'binary_twin_commanders', 'siege_artillery_wall', 'phalanx_drone_column', 'nebula_flower_pincer', 'supernova_grand_choir'],
    boss: {
      bossName: 'Pontífice Hipernova GRB-Omega', baseHp: 242, speedScale: 1.28, moveArchetype: 'eclipse_anchor',
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
    bossSpawnAt: 90.0, waveHpScale: 1.76, waveSpeedScale: 1.3,
    palette: [0xffffff, 0x00f2fe, 0xff2b5b],
    theme: { skyTop: 0x04030e, skyBottom: 0x140a2c, nebulaA: 0x381468, nebulaB: 0x0c4c6e, gridColor: 0x4e2888, accentColor: 0xffffff, feature: 'eternity_horizon', scrollSpeed: 180 },
    waveArchetypes: ['orbital_chevron', 'prism_refraction_hex', 'binary_twin_commanders', 'quasar_jet_corridor', 'gravity_well_vortex', 'supernova_grand_choir'],
    boss: {
      bossName: 'Singularidad Eterna Alfa-Omega', baseHp: 252, speedScale: 1.3, moveArchetype: 'vortex_figure8',
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

const CONFIG_MAP = new Map<string, SpaceStageConfig>();
for (const cfg of SPACE_CAMPAIGN_CONFIGS) {
  CONFIG_MAP.set(`${cfg.difficulty}-${cfg.world}-${cfg.stage}`, cfg);
}

export const DIFFICULTY_UI_META: Record<
  'normal' | 'difficult' | 'no_mercy',
  { label: string; className: string; worlds: [string, string, string] }
> = {
  normal: {
    label: 'NORMAL',
    className: 'normal',
    worlds: ['Frontera Orbital', 'Sector Helios', 'Alcance Nebular'],
  },
  difficult: {
    label: 'DIFFICULT',
    className: 'difficult',
    worlds: ['Frente de Magnetar', 'Deriva Xenolítica', 'Remanente Supernova'],
  },
  no_mercy: {
    label: 'NO MERCY',
    className: 'nomercy',
    worlds: ['Horizonte Cuásar', 'Abismo Materia Oscura', 'Escatón Cósmico'],
  },
};

export function getSpaceStageConfig(difficulty: string, world: number = 1, stage: number = 1): SpaceStageConfig {
  const normDiff = difficulty === 'no_mercy' ? 'no_mercy' : difficulty === 'difficult' ? 'difficult' : 'normal';
  const w = Math.max(1, Math.min(3, Math.floor(Number(world) || 1)));
  const s = Math.max(1, Math.min(3, Math.floor(Number(stage) || 1)));
  return CONFIG_MAP.get(`${normDiff}-${w}-${s}`) || SPACE_CAMPAIGN_CONFIGS[0];
}

export function formatDurationBadge(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

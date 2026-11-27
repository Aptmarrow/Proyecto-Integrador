'use strict';

/**
 * Modular Space Wave Archetypes & Boss Danmaku Patterns for the 27-Level Space Campaign.
 *
 * Playfield coordinates (Backend & Simulation Worker): 800 x 600
 *   - Players operate mainly in x ∈ [40, 520], y ∈ [36, 564]
 *   - Enemies & Boss enter from right x > 800 and anchor in x ∈ [490, 740]
 *
 * 4-Player Role Synergy Built Into Wave & Boss Design:
 *   - Tank (Wall Barrier): Siege lanes & rhythmic artillery curtains with blockable corridors
 *   - Support (Auto-Aim + Squad Heal): Top/bottom peripheral satellites (y ≈ 52 / 548) & healing economy
 *   - DPS (Twin Rapid + 8-Shot Shotgun): High-HP Dreadnought/Reactor cores
 *   - Special_Attack (Piercing Laser + Beam Struggle): Dense convoy columns, slow orb walls & Boss Mega-Beams
 */

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;

/**
 * Build enemy spawn descriptors for one of the 20 Space Wave Archetypes.
 * @param {string} archetype
 * @param {object} opts
 * @returns {Array<object>}
 */
function buildWaveEnemies(archetype, opts = {}) {
  const hpScale = opts.hpScale || 1.0;
  const speedScale = opts.speedScale || 1.0;
  const variant = opts.variant || 0;
  const palette = opts.palette || [0x00f2fe, 0xff2b5b, 0xffdd00];
  const c0 = palette[0] || 0x00f2fe;
  const c1 = palette[1] || 0xff2b5b;
  const c2 = palette[2] || 0xffdd00;

  const hp = (base) => Math.max(8, Math.round(base * hpScale));
  const spd = (base) => Math.round(base * speedScale);
  const out = [];

  switch (archetype) {
    case 'orbital_chevron': {
      // 7-ship V-formation patrol firing crisp crescent fans
      const centerY = variant % 2 === 0 ? 270 : 330;
      for (let i = -3; i <= 3; i++) {
        const rank = Math.abs(i);
        out.push({
          type: rank === 0 ? 'red_fairy' : 'green_fairy',
          trajectory: 'v_formation',
          attackPattern: rank === 0 ? 'crescent_arc' : 'aimed_single',
          startX: WORLD_WIDTH + 45 + rank * 46,
          startY: centerY + i * 54,
          speed: spd(138),
          hp: hp(rank === 0 ? 28 : 15),
          radius: 16,
          shootInterval: rank === 0 ? 1.25 : 1.75,
          shootDelay: 0.35 + rank * 0.22,
          bulletColor: rank === 0 ? c1 : c0,
          customParams: { driftY: (variant % 2 === 0 ? 1 : -1) * 18 },
        });
      }
      break;
    }

    case 'double_helix_ion': {
      // Intertwined DNA ion streams across upper/lower space lanes
      const count = 6;
      for (let i = 0; i < count; i++) {
        out.push({
          type: 'green_fairy',
          trajectory: 'double_helix',
          attackPattern: 'aimed_single',
          startX: WORLD_WIDTH + 45 + i * 56,
          startY: 185,
          speed: spd(132),
          hp: hp(15),
          radius: 16,
          shootInterval: 1.75,
          shootDelay: 0.25 + i * 0.2,
          bulletColor: c0,
          customParams: { freq: 3.1, amp: 74, phase: i * 0.45 },
        });
        out.push({
          type: 'yellow_fairy',
          trajectory: 'double_helix',
          attackPattern: 'helix_stream',
          startX: WORLD_WIDTH + 45 + i * 56,
          startY: 415,
          speed: spd(132),
          hp: hp(17),
          radius: 16,
          shootInterval: 1.85,
          shootDelay: 0.35 + i * 0.2,
          bulletColor: c2,
          customParams: { freq: 3.1, amp: 74, phase: i * 0.45 + Math.PI },
        });
      }
      break;
    }

    case 'satellite_relay_flank': {
      // Peripheral top/bottom space satellites — Support's auto-aim snipes these effortlessly!
      for (let i = 0; i < 4; i++) {
        for (const isTop of [true, false]) {
          out.push({
            type: 'yellow_fairy',
            trajectory: 'perimeter_skimmer',
            attackPattern: 'prism_fan',
            startX: WORLD_WIDTH + 40 + i * 85,
            startY: isTop ? 54 : WORLD_HEIGHT - 54,
            speed: spd(124),
            hp: hp(20),
            radius: 16,
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
      // 4 heavy orbital turrets locking into lanes — Tank's barrier blocks an entire lane!
      const lanes = variant % 2 === 0 ? [115, 235, 365, 485] : [145, 255, 345, 455];
      lanes.forEach((sy, idx) => {
        out.push({
          type: 'purple_fairy',
          trajectory: 'hover_retreat',
          attackPattern: 'siege_curtain',
          startX: WORLD_WIDTH + 45 + idx * 36,
          startY: sy,
          speed: spd(135),
          hp: hp(38),
          radius: 18,
          shootInterval: 1.15,
          shootDelay: 0.35 + idx * 0.18,
          bulletColor: c1,
          customParams: { hoverX: 575 - (idx % 2) * 38, hoverTime: 4.6 },
        });
      });
      break;
    }

    case 'phalanx_drone_column': {
      // Dense horizontal phalanx aligned for Special_Attack's piercing laser!
      const baseY = variant % 3 === 0 ? 300 : (variant % 3 === 1 ? 220 : 380);
      for (let i = 0; i < 8; i++) {
        out.push({
          type: i % 3 === 0 ? 'red_fairy' : 'green_fairy',
          trajectory: 'sine',
          attackPattern: i % 2 === 0 ? 'ring_burst' : 'aimed_single',
          startX: WORLD_WIDTH + 40 + i * 44,
          startY: baseY + ((i % 2 === 0 ? -1 : 1) * 22),
          speed: spd(126),
          hp: hp(22),
          radius: 16,
          shootInterval: 1.55,
          shootDelay: 0.25 + i * 0.14,
          bulletColor: i % 2 === 0 ? c1 : c0,
          customParams: { freq: 2.2, amp: 24, phase: i * 0.3 },
        });
      }
      break;
    }

    case 'dreadnought_core': {
      // High-HP Armored Core + 3 escorts — DPS 8-shot shotgun melts the core!
      const coreY = variant % 2 === 0 ? 300 : 265;
      out.push({
        type: 'big_fairy',
        trajectory: 'hover_retreat',
        attackPattern: 'nova_mandala',
        startX: WORLD_WIDTH + 55,
        startY: coreY,
        speed: spd(78),
        hp: hp(145),
        radius: 30,
        scoreValue: 1500,
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
          startX: WORLD_WIDTH + 75,
          startY: coreY,
          speed: spd(115),
          hp: hp(30),
          radius: 16,
          shootInterval: 1.45,
          shootDelay: 0.5 + k * 0.25,
          bulletColor: c0,
          customParams: { anchorX: 545, anchorY: coreY, orbitR: 78, phase: (Math.PI * 2 * k) / 3 },
        });
      }
      break;
    }

    case 'meteor_cross_lattice': {
      // Top-down & bottom-up crossing meteoroids creating geometric diamond safe pockets
      const count = 8;
      for (let i = 0; i < count; i++) {
        const isTop = i % 2 === 0;
        out.push({
          type: isTop ? 'green_fairy' : 'red_fairy',
          trajectory: isTop ? 'cross_top' : 'cross_bottom',
          attackPattern: i % 3 === 0 ? 'cross_spread' : 'needle_stream',
          startX: WORLD_WIDTH + 40 + i * 52,
          startY: isTop ? 36 : WORLD_HEIGHT - 36,
          speed: spd(168),
          hp: hp(18),
          radius: 16,
          shootInterval: 1.15,
          shootDelay: 0.2 + i * 0.12,
          bulletColor: isTop ? c0 : c1,
          customParams: {},
        });
      }
      break;
    }

    case 'pulsar_clock_pods': {
      // 3 Pulsar Lighthouse emitters sweeping readable clockwork beams
      const ys = [150, 300, 450];
      ys.forEach((sy, idx) => {
        out.push({
          type: idx === 1 ? 'big_fairy' : 'purple_fairy',
          trajectory: 'hover_retreat',
          attackPattern: 'pulsar_sweep',
          startX: WORLD_WIDTH + 50 + idx * 35,
          startY: sy,
          speed: spd(115),
          hp: hp(idx === 1 ? 95 : 40),
          radius: idx === 1 ? 26 : 17,
          shootInterval: 0.72,
          shootDelay: 0.35 + idx * 0.15,
          bulletColor: idx === 1 ? c2 : c0,
          customParams: {
            hoverX: idx === 1 ? 560 : 610,
            hoverTime: 5.5,
            spinDir: idx % 2 === 0 ? 1 : -1,
          },
        });
      });
      break;
    }

    case 'nebula_flower_pincer': {
      // Curved pincer wings blooming dual-layer floral bursts
      for (let i = 0; i < 3; i++) {
        for (const top of [true, false]) {
          const sy = top ? 105 + i * 26 : 495 - i * 26;
          out.push({
            type: 'red_fairy',
            trajectory: 'hover_retreat',
            attackPattern: 'flower_burst',
            startX: WORLD_WIDTH + 48 + i * 64,
            startY: sy,
            speed: spd(146),
            hp: hp(28),
            radius: 17,
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
      // 6 spiral-orbiting star weavers creating a rotating mini-galaxy
      for (let k = 0; k < 6; k++) {
        out.push({
          type: k % 2 === 0 ? 'purple_fairy' : 'yellow_fairy',
          trajectory: 'spiral',
          attackPattern: 'spiral_barrage',
          startX: WORLD_WIDTH + 50 + k * 28,
          startY: 300 + (k % 2 === 0 ? -85 : 85),
          speed: spd(118),
          hp: hp(26),
          radius: 16,
          shootInterval: 1.05,
          shootDelay: 0.25 + k * 0.15,
          bulletColor: k % 2 === 0 ? c0 : c2,
          customParams: { phase: (Math.PI * 2 * k) / 6 },
        });
      }
      break;
    }

    case 'binary_twin_commanders': {
      // Twin Elite Commanders (Top & Bottom) + 2 flankers — peak 4-player co-op encounter!
      for (const [idx, sy] of [185, 415].entries()) {
        out.push({
          type: 'big_fairy',
          trajectory: 'hover_retreat',
          attackPattern: idx === 0 ? 'star_rings' : 'crescent_arc',
          startX: WORLD_WIDTH + 55,
          startY: sy,
          speed: spd(88),
          hp: hp(115),
          radius: 28,
          scoreValue: 1400,
          shootInterval: 0.95,
          shootDelay: 0.4 + idx * 0.25,
          bulletColor: idx === 0 ? c0 : c1,
          customParams: { hoverX: 555, hoverTime: 6.8 },
        });
      }
      for (const isTop of [true, false]) {
        out.push({
          type: 'yellow_fairy',
          trajectory: 'perimeter_skimmer',
          attackPattern: 'aimed_single',
          startX: WORLD_WIDTH + 90,
          startY: isTop ? 55 : WORLD_HEIGHT - 55,
          speed: spd(130),
          hp: hp(22),
          radius: 15,
          shootInterval: 1.5,
          shootDelay: 0.6,
          bulletColor: c2,
          customParams: { bobAmp: 10, isTop },
        });
      }
      break;
    }

    case 'pendulum_chrono_weave': {
      // Harmonic pendulum escorts firing dual-speed prism fans
      for (let i = 0; i < 5; i++) {
        out.push({
          type: i % 2 === 0 ? 'purple_fairy' : 'yellow_fairy',
          trajectory: 'pendulum',
          attackPattern: 'prism_fan',
          startX: WORLD_WIDTH + 45 + i * 58,
          startY: 300,
          speed: spd(122),
          hp: hp(26),
          radius: 16,
          shootInterval: 1.35,
          shootDelay: 0.3 + i * 0.2,
          bulletColor: i % 2 === 0 ? c0 : c2,
          customParams: { ampY: 145, freq: 2.1, phase: i * 0.65 },
        });
      }
      break;
    }

    case 'aurora_curtain_ribbon': {
      // 7-unit shimmering aurora wave painting crescent arcs across space
      for (let i = 0; i < 7; i++) {
        const laneY = 140 + (i % 3) * 160;
        out.push({
          type: i % 2 === 0 ? 'green_fairy' : 'purple_fairy',
          trajectory: 'sine',
          attackPattern: 'crescent_arc',
          startX: WORLD_WIDTH + 40 + i * 52,
          startY: laneY,
          speed: spd(136),
          hp: hp(20),
          radius: 16,
          shootInterval: 1.4,
          shootDelay: 0.25 + i * 0.16,
          bulletColor: i % 2 === 0 ? c0 : c1,
          customParams: { freq: 2.6, amp: 58, phase: i * 0.5 },
        });
      }
      break;
    }

    case 'prism_refraction_hex': {
      // 6-ship geometric hexagon hovering in space firing refracting rings & crosses
      const cx = 575;
      const cy = 300;
      for (let k = 0; k < 6; k++) {
        const ang = (Math.PI * 2 * k) / 6;
        const hy = Math.max(85, Math.min(WORLD_HEIGHT - 85, cy + Math.sin(ang) * 125));
        const hx = cx + Math.cos(ang) * 55;
        out.push({
          type: k % 2 === 0 ? 'yellow_fairy' : 'purple_fairy',
          trajectory: 'hover_retreat',
          attackPattern: k % 2 === 0 ? 'ring_burst' : 'cross_spread',
          startX: WORLD_WIDTH + 50 + k * 25,
          startY: hy,
          speed: spd(140),
          hp: hp(30),
          radius: 17,
          shootInterval: 1.3,
          shootDelay: 0.35 + k * 0.14,
          bulletColor: k % 2 === 0 ? c2 : c0,
          customParams: { hoverX: hx, hoverTime: 4.5 },
        });
      }
      break;
    }

    case 'broadside_frigate_line': {
      // 3 armored broadside frigates + 2 Support-target scouts
      const ys = [165, 300, 435];
      ys.forEach((sy, idx) => {
        out.push({
          type: idx === 1 ? 'big_fairy' : 'red_fairy',
          trajectory: 'hover_retreat',
          attackPattern: 'siege_curtain',
          startX: WORLD_WIDTH + 48 + idx * 40,
          startY: sy,
          speed: spd(112),
          hp: hp(idx === 1 ? 105 : 42),
          radius: idx === 1 ? 27 : 18,
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
          startX: WORLD_WIDTH + 70,
          startY: sy,
          speed: spd(145),
          hp: hp(18),
          radius: 15,
          shootInterval: 1.35,
          shootDelay: 0.45,
          bulletColor: c0,
          customParams: { bobAmp: 10, isTop: sy < 300 },
        });
      }
      break;
    }

    case 'comet_swoop_blitz': {
      // 6 fast-arcing comets diving in, blooming star rings, and sweeping out
      for (let i = 0; i < 6; i++) {
        const fromTop = i % 2 === 0;
        out.push({
          type: i % 3 === 0 ? 'yellow_fairy' : 'red_fairy',
          trajectory: 'swoop_arc',
          attackPattern: 'star_rings',
          startX: WORLD_WIDTH + 40 + i * 58,
          startY: fromTop ? 80 : 520,
          speed: spd(158),
          hp: hp(22),
          radius: 16,
          shootInterval: 1.15,
          shootDelay: 0.45 + i * 0.12,
          bulletColor: fromTop ? c2 : c0,
          customParams: { targetY: fromTop ? 255 : 345, apexX: 500 + (i % 3) * 35 },
        });
      }
      break;
    }

    case 'gravity_well_vortex': {
      // Central Gravity Core + 4 orbiting satellites spinning star-mandala & spiral streams
      out.push({
        type: 'big_fairy',
        trajectory: 'hover_retreat',
        attackPattern: 'nova_mandala',
        startX: WORLD_WIDTH + 55,
        startY: 300,
        speed: spd(82),
        hp: hp(150),
        radius: 30,
        scoreValue: 1600,
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
          startX: WORLD_WIDTH + 75,
          startY: 300,
          speed: spd(120),
          hp: hp(28),
          radius: 16,
          shootInterval: 1.25,
          shootDelay: 0.45 + k * 0.18,
          bulletColor: c0,
          customParams: { anchorX: 550, anchorY: 300, orbitR: 92, phase: (Math.PI / 2) * k },
        });
      }
      break;
    }

    case 'quasar_jet_corridor': {
      // Containment satellites on edges + high-energy central jet chargers (Tank + SP.ATK synergy!)
      for (let i = 0; i < 5; i++) {
        out.push({
          type: 'red_fairy',
          trajectory: 'sine',
          attackPattern: 'helix_stream',
          startX: WORLD_WIDTH + 40 + i * 48,
          startY: 300,
          speed: spd(145),
          hp: hp(24),
          radius: 16,
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
          startX: WORLD_WIDTH + 60,
          startY: sy,
          speed: spd(135),
          hp: hp(36),
          radius: 17,
          shootInterval: 1.35,
          shootDelay: 0.4,
          bulletColor: c2,
          customParams: { hoverX: 590, hoverTime: 4.8 },
        });
      }
      break;
    }

    case 'subspace_zigzag_swarm': {
      // Phase-shifting zigzag void hunters firing crisp cross spreads
      for (let i = 0; i < 7; i++) {
        out.push({
          type: i % 2 === 0 ? 'purple_fairy' : 'green_fairy',
          trajectory: 'zigzag',
          attackPattern: i % 2 === 0 ? 'cross_spread' : 'aimed_single',
          startX: WORLD_WIDTH + 40 + i * 50,
          startY: 130 + (i % 4) * 110,
          speed: spd(142),
          hp: hp(21),
          radius: 16,
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
      // Grand climax set-piece before the Boss Warning
      out.push({
        type: 'big_fairy',
        trajectory: 'hover_retreat',
        attackPattern: 'nova_mandala',
        startX: WORLD_WIDTH + 55,
        startY: 300,
        speed: spd(85),
        hp: hp(155),
        radius: 30,
        scoreValue: 1800,
        shootInterval: 0.92,
        shootDelay: 0.35,
        bulletColor: c2,
        customParams: { hoverX: 545, hoverTime: 7.2, petals: 7 },
      });
      for (const [idx, sy] of [125, 475].entries()) {
        out.push({
          type: 'purple_fairy',
          trajectory: 'hover_retreat',
          attackPattern: 'flower_burst',
          startX: WORLD_WIDTH + 75,
          startY: sy,
          speed: spd(130),
          hp: hp(38),
          radius: 17,
          shootInterval: 1.3,
          shootDelay: 0.5,
          bulletColor: c0,
          customParams: { hoverX: 590, hoverTime: 5.4 },
        });
      }
      for (const sy of [52, 548]) {
        out.push({
          type: 'yellow_fairy',
          trajectory: 'perimeter_skimmer',
          attackPattern: 'aimed_single',
          startX: WORLD_WIDTH + 95,
          startY: sy,
          speed: spd(132),
          hp: hp(20),
          radius: 15,
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

/**
 * Build a timed wave schedule spanning `[0.5s .. bossSpawnAt - 8.5s]` with zero dead air.
 * Ensures X-1 / X-2 (132s–174s) and X-3 (90s) feel packed, rhythmic, and distinct.
 *
 * @param {string[]} archetypes - Ordered wave recipe unique to this level
 * @param {number} bossSpawnAt - Total wave duration in seconds before boss spawns
 * @param {object} meta - { hpScale, speedScale, palette, levelSeed }
 */
function buildLevelWaveScript(archetypes, bossSpawnAt, meta = {}) {
  const firstWaveAt = 0.6;
  const lastWaveAt = Math.max(24, bossSpawnAt - 9.5);
  const interval = 7.4; // Crisp new space formation every ~7.4s (zero empty downtime)
  const count = Math.max(archetypes.length, Math.floor((lastWaveAt - firstWaveAt) / interval) + 1);
  const step = count > 1 ? (lastWaveAt - firstWaveAt) / (count - 1) : interval;

  const waves = [];
  for (let i = 0; i < count; i++) {
    const at = Number((firstWaveAt + i * step).toFixed(2));
    // Guarantee mid-stage elite at ~45% and climax grand choir on final wave
    let arch = archetypes[i % archetypes.length];
    const progress = i / Math.max(1, count - 1);
    if (i === count - 1) {
      arch = archetypes[archetypes.length - 1];
    } else if (Math.abs(progress - 0.48) < (0.55 / count) && arch !== 'dreadnought_core' && arch !== 'binary_twin_commanders' && arch !== 'gravity_well_vortex') {
      arch = (meta.levelSeed || 0) % 2 === 0 ? 'dreadnought_core' : 'binary_twin_commanders';
    }

    waves.push({
      key: `w_${i + 1}`,
      at,
      archetype: arch,
      enemies: buildWaveEnemies(arch, {
        hpScale: meta.hpScale || 1.0,
        speedScale: meta.speedScale || 1.0,
        variant: i + (meta.levelSeed || 0),
        palette: meta.palette,
      }),
    });
  }
  return waves;
}

/**
 * Compute Boss position for a given movement archetype.
 */
function computeBossMovement(moveArchetype, targetX, targetY, t, phase) {
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
        x: targetX + (Math.abs(((s % 4) - 2)) - 1) * 38,
        y: targetY + (Math.abs((((s + 1) % 4) - 2)) - 1) * 105,
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

/**
 * Execute showy, geometric, fair Boss Danmaku pattern for the current phase.
 * Uses `emitBullet(x, y, angle, speed, radius, color, damage)` callback so BOTH
 * Backend (`Boss.js`) and Frontend Worker (`gameSimulation.worker.ts`) share identical patterns!
 */
function fireBossPattern(patternId, ctx, emitBullet) {
  const { fireNormalBossPattern } = require('./normalCampaignOverhaul');
  if (fireNormalBossPattern(patternId, ctx, emitBullet)) {
    return;
  }

  const { bossX, bossY, playerX, playerY, animTimer, shotIndex, palette, speedScale = 1.0, phase = 1 } = ctx;
  const c0 = palette[0] || 0x00f2fe;
  const c1 = palette[1] || 0xff2b5b;
  const c2 = palette[2] || 0xffdd00;
  const aim = Math.atan2(playerY - bossY, playerX - bossX);
  const spd = (v) => v * speedScale;

  switch (patternId) {
    case 'crescent_fan': {
      // Layered crescent arc with alternating safe center/gaps (Tank wall + micro-dodge)
      const count = 5 + (phase >= 3 ? 2 : 0);
      const parity = shotIndex % 2 === 0 ? 0 : (0.11);
      for (let i = 0; i < count; i++) {
        const norm = (i - (count - 1) / 2) / Math.max(1, (count - 1) / 2);
        const angle = aim + norm * 0.58 + parity * (i % 2 === 0 ? 1 : -1);
        const bulletSpd = spd(205 - Math.abs(norm) * 32);
        emitBullet(bossX - 24, bossY, angle, bulletSpd, 5, Math.abs(norm) < 0.35 ? c2 : c0, 5);
      }
      break;
    }

    case 'galaxy_spiral': {
      // N-arm spiral galaxy that reverses spin every 6s so corridors stay readable & fair!
      const arms = Math.min(7, 4 + Math.floor(phase / 2));
      const spinPhase = Math.sin(animTimer * 0.55) * 3.8 + animTimer * 1.65;
      for (let k = 0; k < arms; k++) {
        const a = spinPhase + (Math.PI * 2 * k) / arms;
        emitBullet(bossX - 12, bossY, a, spd(178), 5, k % 2 === 0 ? c0 : c1, 5);
      }
      break;
    }

    case 'counter_lotus': {
      // Dual counter-rotating Touhou lotus petals forming wide diamond safe cells
      const petals = 6 + (phase >= 4 ? 2 : 0);
      const rotA = animTimer * 1.75;
      const rotB = -animTimer * 1.75 + Math.PI / petals;
      if (shotIndex % 2 === 0) {
        for (let k = 0; k < petals; k++) {
          emitBullet(bossX, bossY, rotA + (Math.PI * 2 * k) / petals, spd(172), 5, c0, 5);
        }
      } else {
        for (let k = 0; k < petals; k++) {
          emitBullet(bossX, bossY, rotB + (Math.PI * 2 * k) / petals, spd(164), 5, c2, 5);
        }
      }
      break;
    }

    case 'pulsar_lighthouse': {
      // 3-beam rotating lighthouse with huge 120-degree readable safe sectors + aimed accent
      const beams = 3;
      const base = animTimer * 1.45;
      for (let b = 0; b < beams; b++) {
        const a = base + (Math.PI * 2 * b) / beams;
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
      // True Touhou geometric star-polygon ring! Velocity modulated by cos(points * θ)
      const points = phase >= 4 ? 6 : 5;
      const total = points * 4; // 20 or 24 bullets forming a crisp glowing star!
      const rot = animTimer * 0.9;
      for (let i = 0; i < total; i++) {
        const theta = (Math.PI * 2 * i) / total;
        const starFactor = 1 - 0.24 * Math.abs(Math.sin((points * theta) * 0.5));
        const a = rot + theta;
        const col = i % 4 === 0 ? c2 : (i % 2 === 0 ? c0 : c1);
        emitBullet(bossX, bossY, a, spd(192 * starFactor), i % 4 === 0 ? 5.5 : 4.5, col, 5);
      }
      break;
    }

    case 'binary_helix': {
      // Twin-pod upper & lower emitters weaving a cosmic double-helix toward the squad
      const wave = Math.sin(animTimer * 6.5) * 0.38;
      emitBullet(bossX - 20, bossY - 46, aim + wave, spd(205), 5, c0, 5);
      emitBullet(bossX - 20, bossY + 46, aim - wave, spd(205), 5, c1, 5);
      if (shotIndex % 3 === 0) {
        emitBullet(bossX - 24, bossY, aim, spd(165), 6, c2, 5);
      }
      break;
    }

    case 'prism_lattice': {
      // Diagonal refracting crystal fans creating spacious diamond corridors
      const shift = (shotIndex % 3 - 1) * 0.14;
      for (const off of [-0.62, -0.34, -0.12, 0.12, 0.34, 0.62]) {
        emitBullet(bossX - 22, bossY, Math.PI + off + shift, spd(182), 4.5, off < 0 ? c0 : c2, 5);
      }
      break;
    }

    case 'chrono_rings': {
      // Alternating fast outer needles & slower inner orbs with staggered angular gaps
      const count = 12 + (phase >= 4 ? 2 : 0);
      const isFast = shotIndex % 2 === 0;
      const base = animTimer * 1.1 + (isFast ? 0 : Math.PI / count);
      for (let i = 0; i < count; i++) {
        // Leave a deliberate 1-slot breathing window facing players every 2nd ring
        if (!isFast && i === count >> 1) continue;
        const a = base + (Math.PI * 2 * i) / count;
        emitBullet(bossX, bossY, a, spd(isFast ? 208 : 142), isFast ? 4 : 6, isFast ? c0 : c1, 5);
      }
      break;
    }

    case 'comet_rain': {
      // Angled cosmic meteor shower from upper-right space + aimed twin stars
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
      // Spiraling accretion arms + slow heavy dark-matter orbs (cleavable by SP.ATK laser!)
      const arms = 5;
      const rot = animTimer * 2.35;
      for (let k = 0; k < arms; k++) {
        const a = rot + (Math.PI * 2 * k) / arms;
        emitBullet(bossX, bossY, a, spd(184), 5, c0, 5);
      }
      if (shotIndex % 4 === 0) {
        for (const off of [-0.42, 0, 0.42]) {
          emitBullet(bossX - 26, bossY, Math.PI + off, spd(126), 7, c1, 6);
        }
      }
      break;
    }

    case 'siege_broadside': {
      // Structured 5-lane orbital broadside leaving a rotating safe corridor (Tank wall blocks another lane!)
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
      // Grand Cosmic Finale Spell Card: 6-pointed star mandala + alternating aimed brackets
      if (shotIndex % 3 === 0) {
        const points = 6;
        const total = 18;
        const rot = -animTimer * 1.15;
        for (let i = 0; i < total; i++) {
          const theta = (Math.PI * 2 * i) / total;
          const starFactor = 1 - 0.22 * Math.abs(Math.sin((points * theta) * 0.5));
          emitBullet(bossX, bossY, rot + theta, spd(176 * starFactor), 5, i % 3 === 0 ? c2 : c0, 5);
        }
      } else {
        const arms = 6;
        const rot = animTimer * 2.1;
        for (let k = 0; k < arms; k++) {
          emitBullet(bossX, bossY, rot + (Math.PI * 2 * k) / arms, spd(190), 4.5, k % 2 === 0 ? c1 : c2, 5);
        }
      }
      break;
    }
  }
}

module.exports = {
  buildWaveEnemies,
  buildLevelWaveScript,
  computeBossMovement,
  fireBossPattern,
};

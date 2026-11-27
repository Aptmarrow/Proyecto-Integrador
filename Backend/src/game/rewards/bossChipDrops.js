'use strict';

const { Inventory, Chip } = require('../../models');

/**
 * Toggleable boss chip reward system.
 */
const ENABLE_BOSS_CHIP_DROPS = true;

const RARITY_LABELS = {
  1: 'Scrapy',
  2: 'Reliable',
  3: 'Premiumish',
};

/**
 * Full chip catalog grouped by rarity tier (matching the 12 Danmakrew chips).
 */
const CHIP_POOL_BY_RARITY = {
  1: [
    { name: 'SCRAPY CHIPS (B)', rarity: 1, image: '/assets/sprites/chips/scrapy_b.png', stats: { HP: 5 } },
    { name: 'SCRAPY CHIPS (O)', rarity: 1, image: '/assets/sprites/chips/scrapy_o.png', stats: { Bullet_Damage: 5 } },
    { name: 'SCRAPY CHIPS (V)', rarity: 1, image: '/assets/sprites/chips/scrapy_v.png', stats: { Defense: 4 } },
    { name: 'SCRAPY CHIPS (T)', rarity: 1, image: '/assets/sprites/chips/scrapy_t.png', stats: { SP_Charge: 2 } },
  ],
  2: [
    { name: 'Blood bags', rarity: 2, image: '/assets/sprites/chips/blood_bags.png', stats: { HP: 30 } },
    { name: 'Excuses', rarity: 2, image: '/assets/sprites/chips/excuses.png', stats: { Bullet_Damage: 20 } },
    { name: 'Heavy helmet', rarity: 2, image: '/assets/sprites/chips/heavy_helmet.png', stats: { Defense: 10 } },
    { name: 'Tasty batteries', rarity: 2, image: '/assets/sprites/chips/tasty_batteries.png', stats: { SP_Charge: 2 } },
  ],
  3: [
    { name: 'Sniper', rarity: 3, image: '/assets/sprites/chips/sniper.png', stats: { Critic_Chance: 2, Crit_Damage: 3 } },
    { name: 'Shot Da woop', rarity: 3, image: '/assets/sprites/chips/shot_da_woop.png', stats: { Ultimate_Damage: 2 } },
    { name: 'In a hurry', rarity: 3, image: '/assets/sprites/chips/in_a_hurry.png', stats: { Cadency: 2, SP_Charge: 3 } },
    { name: 'Rage potion', rarity: 3, image: '/assets/sprites/chips/rage_potion.png', stats: { Bullet_Damage: 3, Crit_Damage: 2 } },
  ],
};

/**
 * Base drop probabilities per difficulty (0..1 scale).
 * Evaluated rarest -> common so rarity hierarchy is always preserved:
 *  - Normal:     Scrapy ~4.0%,  Reliable ~0.35%, Premiumish ~0.005%
 *  - Difficult:  Scrapy ~6.5%,  Reliable ~0.85%, Premiumish ~0.025%
 *  - No Mercy:   Scrapy ~10.0%, Reliable ~1.80%, Premiumish ~0.08%
 */
const BASE_DROP_RATES = {
  normal: {
    premiumish: 0.00005, // 0.005%
    reliable: 0.0035,    // 0.35%
    scrapy: 0.04,        // 4.0%
  },
  difficult: {
    premiumish: 0.00025, // 0.025%
    reliable: 0.0085,    // 0.85%
    scrapy: 0.065,       // 6.5%
  },
  no_mercy: {
    premiumish: 0.0008,  // 0.08%
    reliable: 0.018,     // 1.8%
    scrapy: 0.10,        // 10.0%
  },
};

const WORLD_MULTIPLIERS = {
  1: 1.0,
  2: 1.15,
  3: 1.35,
};

function getEffectiveDropRates(difficulty = 'normal', world = 1) {
  const diffKey = difficulty === 'no_mercy' ? 'no_mercy' : difficulty === 'difficult' ? 'difficult' : 'normal';
  const base = BASE_DROP_RATES[diffKey];
  const worldMult = WORLD_MULTIPLIERS[Number(world)] || 1.0;

  return {
    premiumish: Number((base.premiumish * worldMult).toFixed(7)),
    reliable: Number((base.reliable * worldMult).toFixed(6)),
    scrapy: Number((base.scrapy * worldMult).toFixed(5)),
  };
}

/**
 * Roll a single boss chip drop for one player.
 * Returns a chip template object { name, rarity, stats } or null if no drop.
 */
function rollBossChipDrop(difficulty = 'normal', world = 1, rng = Math.random) {
  if (!ENABLE_BOSS_CHIP_DROPS) return null;

  const rates = getEffectiveDropRates(difficulty, world);
  const roll = rng();

  let rolledRarity = null;
  if (roll < rates.premiumish) {
    rolledRarity = 3;
  } else if (roll < rates.premiumish + rates.reliable) {
    rolledRarity = 2;
  } else if (roll < rates.premiumish + rates.reliable + rates.scrapy) {
    rolledRarity = 1;
  } else {
    return null;
  }

  const pool = CHIP_POOL_BY_RARITY[rolledRarity];
  const pick = pool[Math.floor(rng() * pool.length) % pool.length];
  return {
    name: pick.name,
    rarity: pick.rarity,
    rarityLabel: RARITY_LABELS[pick.rarity],
    level: 1,
    image: pick.image || null,
    stats: { ...pick.stats },
  };
}

/**
 * Roll and persist boss chip drops directly into each participating player's DB inventory.
 * Non-fatal: DB errors are logged and never crash the authoritative 60Hz GameRoom loop.
 */
async function awardBossChipDrops(playerIds = [], difficulty = 'normal', world = 1, options = {}) {
  if (!ENABLE_BOSS_CHIP_DROPS || !Array.isArray(playerIds) || playerIds.length === 0) {
    return [];
  }

  // Avoid real DB hits from automated unit tests unless explicit mock models are injected
  if (process.env.NODE_ENV === 'test' && !options.Inventory && !options.Chip) {
    return [];
  }

  const InventoryModel = options.Inventory || Inventory;
  const ChipModel = options.Chip || Chip;
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;

  const awarded = [];
  for (const userId of playerIds) {
    const idStr = String(userId || '');
    if (
      !idStr ||
      idStr.startsWith('player-local') ||
      idStr.startsWith('guest_') ||
      idStr.startsWith('dev_') ||
      idStr.startsWith('test-')
    ) {
      continue;
    }

    const rolled = rollBossChipDrop(difficulty, world, rng);
    if (!rolled) continue;

    try {
      let inventory = await InventoryModel.findByOwner(userId);
      if (!inventory) {
        inventory = await InventoryModel.create(userId);
      }
      if (!inventory?.id) continue;

      const created = await ChipModel.create({
        inventoryId: inventory.id,
        name: rolled.name,
        rarity: rolled.rarity,
        level: rolled.level,
        image: rolled.image,
        stats: rolled.stats,
      });

      console.info(
        '[BossChipDrop] userId=%s obtained %s chip "%s" (id=%s, diff=%s, W%s)',
        userId,
        rolled.rarityLabel,
        rolled.name,
        created?.id,
        difficulty,
        world
      );

      awarded.push({ userId, chip: created });
    } catch (err) {
      console.error('[BossChipDrop] Failed persisting drop for userId=%s: %s', userId, err.message);
    }
  }

  return awarded;
}

module.exports = {
  ENABLE_BOSS_CHIP_DROPS,
  RARITY_LABELS,
  CHIP_POOL_BY_RARITY,
  BASE_DROP_RATES,
  getEffectiveDropRates,
  rollBossChipDrop,
  awardBossChipDrops,
};

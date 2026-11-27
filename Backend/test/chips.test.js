'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateHP,
  calculateBulletDamage,
  calculateDefense,
  calculateSPCharge,
  calculateUltimateDamage,
  calculateCadency,
  calculateCriticChance,
  calculateCritDamage,
  calculateTotalStats,
} = require('../src/utils/chipStatsCalculator');
const {
  getEffectiveDropRates,
  rollBossChipDrop,
  awardBossChipDrops,
} = require('../src/game/rewards/bossChipDrops');
const { Chip } = require('../src/models');
const db = require('../src/config/database');

describe('Chip Stats Calculator, Boss Chip Drops & Chip Equipment', () => {
  it('calculates flat and percentage chip stats with caps and max 3 chips', () => {
    const chips = [
      { id: 1, stats: { HP: 30, Bullet_Damage: 20, Defense: 50, SP_Charge: 2 } },
      { id: 2, stats: { Ultimate_Damage: 25, Cadency: 10, Critic_Chance: 60, Crit_Damage: 40 } },
      { id: 3, stats: { Defense: 50, Critic_Chance: 60, HP: 10 } },
      { id: 4, stats: { HP: 999 } }, // Ignored (over max 3)
    ];

    assert.equal(calculateHP(100, chips.slice(0, 3)).total, 140);
    assert.equal(calculateBulletDamage(15, chips.slice(0, 3)).total, 35);
    assert.equal(calculateDefense(10, chips.slice(0, 3)).total, 85); // Capped at 85
    assert.equal(calculateSPCharge(5, chips.slice(0, 3)).total, 7);
    assert.equal(calculateUltimateDamage(100, chips.slice(0, 3)).total, 125);
    assert.equal(calculateCadency(10, chips.slice(0, 3)).total, 11);
    assert.equal(calculateCriticChance(0, chips.slice(0, 3)).total, 100); // Capped at 100%
    assert.equal(calculateCritDamage(150, chips.slice(0, 3)).total, 190);

    const total = calculateTotalStats('DPS', chips);
    assert.equal(total.classId, 'dps');
    assert.equal(total.equippedCount, 3);
    assert.deepEqual(total.equippedChipIds, [1, 2, 3]);
    assert.equal(total.bonuses.HP, 40); // 4th chip ignored
    assert.equal(total.total.Defense, 85);
    assert.equal(total.total.Critic_Chance, 100);
  });

  it('scales boss chip drop rates by difficulty and world and rolls rarity tiers accurately', () => {
    const normW1 = getEffectiveDropRates('normal', 1);
    const nmW3 = getEffectiveDropRates('no_mercy', 3);
    assert.ok(nmW3.premiumish > normW1.premiumish);
    assert.ok(nmW3.reliable > normW1.reliable);
    assert.ok(nmW3.scrapy > normW1.scrapy);

    const premium = rollBossChipDrop('no_mercy', 3, () => 0.00001);
    assert.equal(premium.rarity, 3);
    assert.equal(premium.rarityLabel, 'Premiumish');

    const reliable = rollBossChipDrop('normal', 1, () => 0.001);
    assert.equal(reliable.rarity, 2);
    assert.equal(reliable.rarityLabel, 'Reliable');

    const scrapy = rollBossChipDrop('normal', 1, () => 0.01);
    assert.equal(scrapy.rarity, 1);
    assert.equal(scrapy.rarityLabel, 'Scrapy');

    const none = rollBossChipDrop('normal', 1, () => 0.99);
    assert.equal(none, null);
  });

  it('persists boss chip drops for real players and skips local/mock IDs', async () => {
    const createdChips = [];
    const mockInventory = {
      findByOwner: async (uid) => (uid === 'USR-1' ? { id: 10 } : null),
      create: async () => ({ id: 11 }),
    };
    const mockChip = {
      create: async (data) => {
        const created = { id: 100 + createdChips.length, ...data };
        createdChips.push(created);
        return created;
      },
    };

    const awarded = await awardBossChipDrops(
      ['player-local', 'guest_1', 'dev_abc', 'test-1', 'USR-1', 'USR-2'],
      'no_mercy',
      3,
      { Inventory: mockInventory, Chip: mockChip, rng: () => 0.00001 }
    );

    assert.equal(awarded.length, 2);
    assert.equal(awarded[0].userId, 'USR-1');
    assert.equal(awarded[0].chip.rarity, 3);
    assert.equal(awarded[1].userId, 'USR-2');
    assert.equal(createdChips.length, 2);
  });

  it('enforces max 3 equipped chips and ownership checks in Chip.setEquipped', async () => {
    const origQuery = db.query;
    const rowsByChipId = new Map([
      [1, { id: 1, inventory_id: 7, name: 'C1', rarity: 1, level: 1, is_equipped: true }],
      [2, { id: 2, inventory_id: 7, name: 'C2', rarity: 1, level: 1, is_equipped: true }],
      [3, { id: 3, inventory_id: 7, name: 'C3', rarity: 1, level: 1, is_equipped: true }],
      [4, { id: 4, inventory_id: 7, name: 'C4', rarity: 2, level: 1, is_equipped: false }],
    ]);

    db.query = async (sql, params) => {
      if (sql.includes('WHERE c.id = $1')) {
        const r = rowsByChipId.get(params[0]);
        return { rows: r ? [r] : [] };
      }
      if (sql.includes('c.is_equipped = TRUE')) {
        return {
          rows: [...rowsByChipId.values()].filter(
            (r) => r.inventory_id === params[0] && r.is_equipped
          ),
        };
      }
      if (sql.startsWith('UPDATE chip SET is_equipped')) {
        const r = rowsByChipId.get(params[1]);
        if (r && r.inventory_id === params[2]) r.is_equipped = params[0];
        return { rows: [] };
      }
      return { rows: [] };
    };

    try {
      await assert.rejects(
        () => Chip.setEquipped(4, 7, true),
        (err) => err.statusCode === 400
      );

      await assert.rejects(
        () => Chip.setEquipped(4, 999, true),
        (err) => err.statusCode === 404
      );

      const unequipped = await Chip.setEquipped(1, 7, false);
      assert.equal(unequipped.is_equipped, false);

      const equipped = await Chip.setEquipped(4, 7, true);
      assert.equal(equipped.is_equipped, true);
    } finally {
      db.query = origQuery;
    }
  });
});


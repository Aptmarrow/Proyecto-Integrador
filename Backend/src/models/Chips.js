const db = require('../config/database');

const STAT_KEYS = [
  'HP',
  'Bullet_Damage',
  'SP_Charge',
  'Defense',
  'Ultimate_Damage',
  'Cadency',
  'Critic_Chance',
  'Crit_Damage',
];

const STATS_COLS = STAT_KEYS.join(', ');
const SELECT_STATS_COLS = STAT_KEYS.map((key) => `s.${key}`).join(', ');
const STATS_PLACEHOLDERS = STAT_KEYS.map(() => '?').join(', ');
const STATS_UPSERT_SET = STAT_KEYS.map((key) => `${key} = excluded.${key}`).join(', ');

const chipWithStatsQuery = db.prepare(`
  SELECT c.*, ${SELECT_STATS_COLS}
  FROM chip c
  LEFT JOIN chip_stats s ON s.chip_id = c.id
  WHERE c.id = ?
`);

const chipsByInventoryQuery = db.prepare(`
  SELECT c.*, ${SELECT_STATS_COLS}
  FROM chip c
  LEFT JOIN chip_stats s ON s.chip_id = c.id
  WHERE c.inventory_id = ?
`);

function rowToChip(row) {
  if (!row) return null;

  const chip = {};
  const stats = {};
  let hasStats = false;

  for (const [key, value] of Object.entries(row)) {
    if (STAT_KEYS.includes(key)) {
      stats[key] = value;
      if (value !== null && value !== undefined) {
        hasStats = true;
      }
    } else {
      chip[key] = value;
    }
  }

  chip.stats = hasStats ? stats : null;
  return chip;
}

const Chip = {
  STAT_KEYS,

  findById(id) {
    return rowToChip(chipWithStatsQuery.get(id));
  },

  findByInventory(inventoryId) {
    return chipsByInventoryQuery.all(inventoryId).map(rowToChip);
  },

  create({ inventoryId, name, rarity = 1, level = 1, image = null, stats = null }) {
    const insertChip = db.transaction(() => {
      const chipId = db.prepare(
        'INSERT INTO chip (inventory_id, name, rarity, level, image) VALUES (?, ?, ?, ?, ?)'
      ).run(inventoryId, name, rarity, level, image).lastInsertRowid;

      if (stats && STAT_KEYS.some((key) => stats[key] !== undefined && stats[key] !== null)) {
        const values = STAT_KEYS.map((key) => stats[key] ?? null);
        db.prepare(
          `INSERT INTO chip_stats (chip_id, ${STATS_COLS}) VALUES (?, ${STATS_PLACEHOLDERS})`
        ).run(chipId, ...values);
      }

      return chipId;
    });

    const chipId = insertChip();
    return this.findById(chipId);
  },

  updateLevel(id, level) {
    db.prepare('UPDATE chip SET level = ? WHERE id = ?').run(level, id);
  },

  updateStats(chipId, stats = {}) {
    const values = STAT_KEYS.map((key) => stats[key] ?? null);
    db.prepare(`
      INSERT INTO chip_stats (chip_id, ${STATS_COLS}) VALUES (?, ${STATS_PLACEHOLDERS})
      ON CONFLICT(chip_id) DO UPDATE SET ${STATS_UPSERT_SET}
    `).run(chipId, ...values);
  },
};

module.exports = Chip;

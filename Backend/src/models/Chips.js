const db = require('../config/database');

const MAX_EQUIPPED_CHIPS = 3;

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

const QUOTED_STATS_COLS = STAT_KEYS.map((key) => `"${key}"`).join(', ');
const SELECT_STATS_COLS = STAT_KEYS.map((key) => `s."${key}"`).join(', ');
const STATS_PLACEHOLDERS = STAT_KEYS.map((_, idx) => `$${idx + 2}`).join(', ');
const STATS_UPSERT_SET = STAT_KEYS.map((key) => `"${key}" = EXCLUDED."${key}"`).join(', ');

function rowToChip(row) {
  if (!row) return null;

  const chip = {};
  const stats = {};
  let hasStats = false;

  for (const [key, value] of Object.entries(row)) {
    if (STAT_KEYS.includes(key)) {
      const normalized = value === null || value === undefined ? null : Number(value);
      stats[key] = normalized;
      if (normalized !== null) {
        hasStats = true;
      }
    } else {
      chip[key] = value;
    }
  }

  chip.is_equipped = Boolean(chip.is_equipped);
  chip.stats = hasStats ? stats : null;
  return chip;
}

const Chip = {
  STAT_KEYS,
  MAX_EQUIPPED_CHIPS,

  async findById(id) {
    const { rows } = await db.query(
      `SELECT c.*, ${SELECT_STATS_COLS}
       FROM chip c
       LEFT JOIN chip_stats s ON s.chip_id = c.id
       WHERE c.id = $1`,
      [id]
    );
    return rowToChip(rows[0] || null);
  },

  async findByInventory(inventoryId) {
    const { rows } = await db.query(
      `SELECT c.*, ${SELECT_STATS_COLS}
       FROM chip c
       LEFT JOIN chip_stats s ON s.chip_id = c.id
       WHERE c.inventory_id = $1
       ORDER BY c.is_equipped DESC, c.rarity DESC, c.id ASC`,
      [inventoryId]
    );
    return rows.map(rowToChip);
  },

  async findEquippedByInventory(inventoryId) {
    const { rows } = await db.query(
      `SELECT c.*, ${SELECT_STATS_COLS}
       FROM chip c
       LEFT JOIN chip_stats s ON s.chip_id = c.id
       WHERE c.inventory_id = $1 AND c.is_equipped = TRUE
       ORDER BY c.id ASC`,
      [inventoryId]
    );
    return rows.map(rowToChip);
  },

  async setEquipped(chipId, inventoryId, isEquipped) {
    const chip = await this.findById(chipId);
    if (!chip || Number(chip.inventory_id) !== Number(inventoryId)) {
      const err = new Error('La chip no existe o no pertenece a tu inventario.');
      err.statusCode = 404;
      throw err;
    }

    const wantEquipped = Boolean(isEquipped);
    if (wantEquipped && !chip.is_equipped) {
      const equipped = await this.findEquippedByInventory(inventoryId);
      if (equipped.length >= MAX_EQUIPPED_CHIPS) {
        const err = new Error(`Solo podés equiparte un máximo de ${MAX_EQUIPPED_CHIPS} chips a la vez.`);
        err.statusCode = 400;
        throw err;
      }

      const normalizedName = String(chip.name || '').trim().toLowerCase();
      const hasDuplicate = equipped.some(
        (c) => Number(c.id) !== Number(chip.id) && String(c.name || '').trim().toLowerCase() === normalizedName
      );
      if (hasDuplicate) {
        const err = new Error(`Ya tenés equipada una chip "${chip.name}". No se permiten chips repetidas.`);
        err.statusCode = 400;
        throw err;
      }
    }

    await db.query(
      'UPDATE chip SET is_equipped = $1 WHERE id = $2 AND inventory_id = $3',
      [wantEquipped, chipId, inventoryId]
    );

    return this.findById(chipId);
  },

  async create({ inventoryId, name, rarity = 1, level = 1, image = null, stats = null }) {
    const client = await db.pool.connect();
    let chipId;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'INSERT INTO chip (inventory_id, name, rarity, level, image) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [inventoryId, name, rarity, level, image]
      );
      chipId = rows[0].id;

      if (stats && STAT_KEYS.some((key) => stats[key] !== undefined && stats[key] !== null)) {
        const values = STAT_KEYS.map((key) => stats[key] ?? null);
        await client.query(
          `INSERT INTO chip_stats (chip_id, ${QUOTED_STATS_COLS}) VALUES ($1, ${STATS_PLACEHOLDERS})`,
          [chipId, ...values]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return this.findById(chipId);
  },

  async updateLevel(id, level) {
    await db.query('UPDATE chip SET level = $1 WHERE id = $2', [level, id]);
  },

  async updateStats(chipId, stats = {}) {
    const values = STAT_KEYS.map((key) => stats[key] ?? null);
    await db.query(
      `INSERT INTO chip_stats (chip_id, ${QUOTED_STATS_COLS}) VALUES ($1, ${STATS_PLACEHOLDERS})
       ON CONFLICT (chip_id) DO UPDATE SET ${STATS_UPSERT_SET}`,
      [chipId, ...values]
    );
  },
};

module.exports = Chip;

const db = require('../config/database');
const Chip = require('./Chips');

const Inventory = {
  // Crea el inventario para un usuario recién registrado
  async create(ownerId) {
    await db.query(
      'INSERT INTO inventory (owner_id) VALUES ($1) ON CONFLICT (owner_id) DO NOTHING',
      [ownerId]
    );
    return this.findByOwner(ownerId);
  },

  async findByOwner(ownerId) {
    const { rows } = await db.query('SELECT * FROM inventory WHERE owner_id = $1', [ownerId]);
    const inventory = rows[0];
    if (!inventory) return null;

    const [charSkins, effSkins, chips] = await Promise.all([
      db.query('SELECT skin_id FROM inventory_character_skin WHERE inventory_id = $1', [inventory.id]),
      db.query('SELECT skin_id FROM inventory_effect_skin WHERE inventory_id = $1', [inventory.id]),
      Chip.findByInventory(inventory.id),
    ]);

    inventory.character_skins = charSkins.rows.map((r) => r.skin_id);
    inventory.effect_skins = effSkins.rows.map((r) => r.skin_id);
    inventory.chips = chips;

    return inventory;
  },

  // Scraps
  async addScraps(ownerId, amount) {
    await db.query('UPDATE inventory SET scraps = scraps + $1 WHERE owner_id = $2', [amount, ownerId]);
  },

  async removeScraps(ownerId, amount) {
    await db.query(
      'UPDATE inventory SET scraps = GREATEST(0, scraps - $1) WHERE owner_id = $2',
      [amount, ownerId]
    );
  },

  // Character skins (por ahora sólo IDs)
  async addCharacterSkin(ownerId, skinId) {
    const { rows } = await db.query('SELECT id FROM inventory WHERE owner_id = $1', [ownerId]);
    if (!rows[0]) return;
    await db.query(
      'INSERT INTO inventory_character_skin (inventory_id, skin_id) VALUES ($1, $2) ON CONFLICT (inventory_id, skin_id) DO NOTHING',
      [rows[0].id, skinId]
    );
  },

  // Effect skins (por ahora sólo IDs)
  async addEffectSkin(ownerId, skinId) {
    const { rows } = await db.query('SELECT id FROM inventory WHERE owner_id = $1', [ownerId]);
    if (!rows[0]) return;
    await db.query(
      'INSERT INTO inventory_effect_skin (inventory_id, skin_id) VALUES ($1, $2) ON CONFLICT (inventory_id, skin_id) DO NOTHING',
      [rows[0].id, skinId]
    );
  },
};

module.exports = Inventory;

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/danmakrew.db');

const db = new Database(DB_PATH);

// Rendimiento
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---- Schema ----
db.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id          TEXT    NOT NULL PRIMARY KEY,
    username    TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0,
    verification_token TEXT,
    danmas      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_session (
    id         TEXT    NOT NULL PRIMARY KEY,
    user_id    TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friend (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    friend_user_id TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, friend_user_id)
  );

  CREATE TABLE IF NOT EXISTS friend_request (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    receiver_id TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    status      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT    NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
    scraps   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS inventory_character_skin (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    skin_id      INTEGER NOT NULL,
    UNIQUE(inventory_id, skin_id)
  );

  CREATE TABLE IF NOT EXISTS inventory_effect_skin (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    skin_id      INTEGER NOT NULL,
    UNIQUE(inventory_id, skin_id)
  );

  CREATE TABLE IF NOT EXISTS chip (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    rarity       INTEGER NOT NULL DEFAULT 1,
    level        INTEGER NOT NULL DEFAULT 1,
    image        TEXT
  );

  CREATE TABLE IF NOT EXISTS chip_stats (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    chip_id         INTEGER NOT NULL UNIQUE REFERENCES chip(id) ON DELETE CASCADE,
    HP              NUMERIC,
    Bullet_Damage   NUMERIC,
    SP_Charge       NUMERIC,
    Defense         NUMERIC,
    Ultimate_Damage NUMERIC,
    Cadency         NUMERIC,
    Critic_Chance   NUMERIC,
    Crit_Damage     NUMERIC
  );
`);

// ---- Migrations (columns added after initial schema) ----
// SQLite does not support IF NOT EXISTS in ALTER TABLE, so we catch the error.
const migrations = [
  'ALTER TABLE user ADD COLUMN danmas INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE chip DROP COLUMN chip_stats_id',
];
for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch {
    // Column already exists – ignore
  }
}

// Migration: remove user.inventory_id if it exists (avoids circular FK deadlock)
{
  const cols = db.prepare('PRAGMA table_info(user)').all();
  if (cols.some(c => c.name === 'inventory_id')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_migrated (
        id          TEXT    NOT NULL PRIMARY KEY,
        username    TEXT    NOT NULL,
        email       TEXT    NOT NULL UNIQUE,
        password    TEXT    NOT NULL,
        is_verified INTEGER NOT NULL DEFAULT 0,
        verification_token TEXT,
        danmas      INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO user_migrated (id, username, email, password, is_verified, verification_token, danmas)
        SELECT id, username, email, password, is_verified, verification_token, danmas
        FROM user;
      DROP TABLE user;
      ALTER TABLE user_migrated RENAME TO user;
    `);
    db.pragma('foreign_keys = ON');
  }
}

// Migration: move chip.owner_id (user) -> chip.inventory_id (inventory)
{
  const cols = db.prepare('PRAGMA table_info(chip)').all();
  if (cols.some(c => c.name === 'owner_id')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chip_migrated (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        name         TEXT    NOT NULL,
        rarity       INTEGER NOT NULL DEFAULT 1,
        level        INTEGER NOT NULL DEFAULT 1,
        image        TEXT
      );
      INSERT OR IGNORE INTO chip_migrated (id, inventory_id, name, rarity, level, image)
        SELECT c.id, i.id, c.name, c.rarity, c.level, c.image
        FROM chip c
        JOIN inventory i ON i.owner_id = c.owner_id;
      DROP TABLE chip;
      ALTER TABLE chip_migrated RENAME TO chip;
    `);
  }
}

// Migration: update chip_stats columns to the 8 allowed optional stats
{
  const cols = db.prepare('PRAGMA table_info(chip_stats)').all();
  const hasOldCols = cols.some(c => ['ATK', 'DEF', 'SP_DRAIN', 'HEALING_POINTS', 'BULLET_ARMOR', 'ULTIMATE_HEALTH', 'BUFFS'].includes(c.name));
  const hasNewCols = cols.some(c => c.name === 'Bullet_Damage') && cols.some(c => c.name === 'Crit_Damage');
  if (hasOldCols || !hasNewCols) {
    const colNames = new Set(cols.map(c => c.name.toLowerCase()));
    const spExpr = colNames.has('sp_charge') ? 'SP_CHARGE' : 'NULL';
    const defExpr = colNames.has('defense') ? 'Defense' : (colNames.has('def') ? 'DEF' : 'NULL');
    const ultExpr = colNames.has('ultimate_damage') ? 'ULTIMATE_DAMAGE' : 'NULL';
    const critChanceExpr = colNames.has('critic_chance') ? 'Critic_Chance' : (colNames.has('crit_chance') ? 'CRIT_CHANCE' : 'NULL');
    const bulletDmgExpr = colNames.has('bullet_damage') ? 'Bullet_Damage' : 'NULL';
    const cadencyExpr = colNames.has('cadency') ? 'Cadency' : 'NULL';
    const critDmgExpr = colNames.has('crit_damage') ? 'Crit_Damage' : 'NULL';

    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE IF NOT EXISTS chip_stats_migrated (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        chip_id         INTEGER NOT NULL UNIQUE REFERENCES chip(id) ON DELETE CASCADE,
        HP              NUMERIC,
        Bullet_Damage   NUMERIC,
        SP_Charge       NUMERIC,
        Defense         NUMERIC,
        Ultimate_Damage NUMERIC,
        Cadency         NUMERIC,
        Critic_Chance   NUMERIC,
        Crit_Damage     NUMERIC
      );
      INSERT INTO chip_stats_migrated (id, chip_id, HP, Bullet_Damage, SP_Charge, Defense, Ultimate_Damage, Cadency, Critic_Chance, Crit_Damage)
        SELECT id, chip_id, HP, ${bulletDmgExpr}, ${spExpr}, ${defExpr}, ${ultExpr}, ${cadencyExpr}, ${critChanceExpr}, ${critDmgExpr}
        FROM chip_stats;
      DROP TABLE chip_stats;
      ALTER TABLE chip_stats_migrated RENAME TO chip_stats;
    `);
    db.pragma('foreign_keys = ON');
  }
}

module.exports = db;

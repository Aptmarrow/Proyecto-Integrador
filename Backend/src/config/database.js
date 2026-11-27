const { Pool } = require('pg');

function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'neondb',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  };
}

const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  console.error('[DB] Unexpected PostgreSQL pool error:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                 TEXT    NOT NULL PRIMARY KEY,
        username           TEXT    NOT NULL,
        email              TEXT    NOT NULL UNIQUE,
        password           TEXT    NOT NULL,
        is_verified        INTEGER NOT NULL DEFAULT 0,
        verification_token TEXT,
        danmas             INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS friend (
        id             SERIAL      PRIMARY KEY,
        user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_user_id TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, friend_user_id)
      );

      CREATE TABLE IF NOT EXISTS friend_request (
        id          SERIAL      PRIMARY KEY,
        sender_id   TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_id TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status      INTEGER     NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id       SERIAL  PRIMARY KEY,
        owner_id TEXT    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        scraps   INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS inventory_character_skin (
        id           SERIAL  PRIMARY KEY,
        inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        skin_id      INTEGER NOT NULL,
        UNIQUE(inventory_id, skin_id)
      );

      CREATE TABLE IF NOT EXISTS inventory_effect_skin (
        id           SERIAL  PRIMARY KEY,
        inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        skin_id      INTEGER NOT NULL,
        UNIQUE(inventory_id, skin_id)
      );

      CREATE TABLE IF NOT EXISTS chip (
        id           SERIAL  PRIMARY KEY,
        inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        name         TEXT    NOT NULL,
        rarity       INTEGER NOT NULL DEFAULT 1,
        level        INTEGER NOT NULL DEFAULT 1,
        image        TEXT,
        is_equipped  BOOLEAN NOT NULL DEFAULT FALSE
      );

      ALTER TABLE chip
        ADD COLUMN IF NOT EXISTS is_equipped BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS chip_stats (
        id                SERIAL  PRIMARY KEY,
        chip_id           INTEGER NOT NULL UNIQUE REFERENCES chip(id) ON DELETE CASCADE,
        "HP"              NUMERIC,
        "Bullet_Damage"   NUMERIC,
        "SP_Charge"       NUMERIC,
        "Defense"         NUMERIC,
        "Ultimate_Damage" NUMERIC,
        "Cadency"         NUMERIC,
        "Critic_Chance"   NUMERIC,
        "Crit_Damage"     NUMERIC
      );
    `);
    console.info('[DB] PostgreSQL (Neon) schema initialized');
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  initDatabase,
};

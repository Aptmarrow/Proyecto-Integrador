const db = require('../config/database');

const User = {
  async findByEmail(email) {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findAll() {
    const { rows } = await db.query('SELECT id, username, email, is_verified, danmas FROM users');
    return rows;
  },

  async create({ id, username, email, password, verificationToken, danmas }) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO users (id, username, email, password, is_verified, verification_token, danmas) VALUES ($1, $2, $3, $4, 0, $5, $6)',
        [id, username, email, password, verificationToken ?? null, danmas ?? 0]
      );
      await client.query(
        'INSERT INTO inventory (owner_id) VALUES ($1) ON CONFLICT (owner_id) DO NOTHING',
        [id]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.findById(id);
  },

  async verify(id) {
    await db.query(
      'UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = $1',
      [id]
    );
  },

  async setVerificationToken(id, token) {
    await db.query(
      'UPDATE users SET verification_token = $1, is_verified = 0 WHERE id = $2',
      [token, id]
    );
  },
};

module.exports = User;

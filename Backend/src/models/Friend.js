const db = require('../config/database');

const Friend = {
  async exists(userId, friendUserId) {
    const { rows } = await db.query(
      'SELECT 1 FROM friend WHERE user_id = $1 AND friend_user_id = $2',
      [userId, friendUserId]
    );
    return rows.length > 0;
  },

  async createPair(userId, friendUserId) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO friend (user_id, friend_user_id) VALUES ($1, $2) ON CONFLICT (user_id, friend_user_id) DO NOTHING',
        [userId, friendUserId]
      );
      await client.query(
        'INSERT INTO friend (user_id, friend_user_id) VALUES ($1, $2) ON CONFLICT (user_id, friend_user_id) DO NOTHING',
        [friendUserId, userId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

module.exports = Friend;

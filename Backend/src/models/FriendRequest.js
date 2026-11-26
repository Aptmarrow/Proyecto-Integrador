const db = require('../config/database');

const FRIEND_REQUEST_STATUS = {
  Pendiente: 0,
  Aceptada: 1,
  Rechazada: 2,
};

const FriendRequest = {
  async hasPending(userAId, userBId) {
    const { rows } = await db.query(
      `SELECT 1 FROM friend_request
       WHERE status = 0
         AND ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $3 AND receiver_id = $4))`,
      [userAId, userBId, userBId, userAId]
    );
    return rows.length > 0;
  },

  async create(senderId, receiverId) {
    const { rows } = await db.query(
      'INSERT INTO friend_request (sender_id, receiver_id) VALUES ($1, $2) RETURNING *',
      [senderId, receiverId]
    );
    return rows[0] || null;
  },

  async findPendingForReceiver(receiverId) {
    const { rows } = await db.query(
      `SELECT fr.id, fr.sender_id, fr.receiver_id, fr.status, fr.created_at,
              u.username AS sender_username
       FROM friend_request fr
       JOIN users u ON u.id = fr.sender_id
       WHERE fr.receiver_id = $1 AND fr.status = 0`,
      [receiverId]
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await db.query('SELECT * FROM friend_request WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async updateStatus(id, status) {
    await db.query('UPDATE friend_request SET status = $1 WHERE id = $2', [status, id]);
  },
};

module.exports = { FriendRequest, FRIEND_REQUEST_STATUS };

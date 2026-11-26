const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'danma-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function generateUserId() {
  return crypto.randomBytes(10).toString('hex');
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function verifyToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return null;
    return { user, payload };
  } catch {
    return null;
  }
}

module.exports = {
  generateUserId,
  signToken,
  verifyToken,
};

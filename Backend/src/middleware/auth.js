const { verifyToken } = require('../config/auth');

/**
 * Fastify preHandler — valida el JWT enviado como Bearer token.
 * Adjunta `request.user` y `request.tokenPayload` si es válido.
 */
async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ message: 'Token no proporcionado.' });
  }

  const token = authHeader.slice(7).trim();
  const result = verifyToken(token);
  if (!result) {
    return reply.status(401).send({ message: 'Token inválido o expirado.' });
  }

  const { user, payload } = result;
  request.tokenPayload = payload;
  request.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    isVerified: user.is_verified === 1,
  };
}

module.exports = authenticate;

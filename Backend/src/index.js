require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
const db = require('./config/database');
const redis = require('./config/redis');

const userRoutes = require('./routes/userRoutes');
const roomRoutes = require('./routes/roomRoutes');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  // Initialize Neon PostgreSQL schema before serving HTTP or WebSockets
  await db.initDatabase();

  // Start the WebSocket signaling & game server in the same process
  require('./signal');

  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^https?:\/\/(www\.)?nomercygames\.me(:\d+)?$/i.test(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin) ||
        /\.ngrok(-free)?\.(app|dev|io)$/.test(origin)
      ) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
  });

  // Rate limiting (built-in in-memory cache)
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) =>
      req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
  });

  fastify.get('/', async () => ({
    name: 'Danmakrew API',
    status: 'ok',
    database: 'postgresql',
    frontendUrl: allowedOrigins[0] || 'http://localhost:3000',
    message: 'Este puerto (8080) es solo la API REST. Abre la web y el juego en http://localhost:3000',
  }));

  fastify.get('/api/health', async () => {
    let dbOk = false;
    try {
      await db.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      database: dbOk ? 'connected' : 'error',
      wsPort: parseInt(process.env.WS_PORT || '9001', 10),
    };
  });

  fastify.register(userRoutes, { prefix: '/api/auth' });
  fastify.register(roomRoutes, { prefix: '/api' });

  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Servidor corriendo en http://localhost:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    redis.disconnect();
    await db.pool.end().catch(() => {});
    process.exit(1);
  }
}

start().catch((err) => {
  console.error('[Startup] Fatal error:', err);
  process.exit(1);
});

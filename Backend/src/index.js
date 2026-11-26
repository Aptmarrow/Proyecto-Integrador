require('dotenv').config();
const db = require('./config/database');
const redis = require('./config/redis');
const { buildApp } = require('./app');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  // Initialize Neon PostgreSQL schema before serving HTTP or WebSockets
  await db.initDatabase();

  // Start the WebSocket signaling & game server in the same process
  require('./signal');

  const fastify = await buildApp({ logger: true });

  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Servidor corriendo en http://localhost:${PORT} (Swagger UI: http://localhost:${PORT}/docs)`);
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

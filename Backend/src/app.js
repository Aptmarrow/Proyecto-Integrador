'use strict';

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const db = require('./config/database');

const userRoutes = require('./routes/userRoutes');
const roomRoutes = require('./routes/roomRoutes');

const OPENAPI_ROUTE_META = {
  'GET /': { tags: ['Health'], summary: 'Información básica de la API' },
  'GET /api/health': { tags: ['Health'], summary: 'Healthcheck de API, base de datos PostgreSQL y puerto WebSocket' },

  'POST /api/auth/register': {
    tags: ['Auth'],
    summary: 'Registrar un nuevo usuario y enviar correo de verificación',
    bodyRef: 'RegisterRequest',
  },
  'GET /api/auth/verify-email': { tags: ['Auth'], summary: 'Verificar correo electrónico mediante token' },
  'POST /api/auth/resend-verification': {
    tags: ['Auth'],
    summary: 'Reenviar correo de verificación',
    bodyRef: 'ResendVerificationRequest',
  },
  'GET /api/auth/': { tags: ['Auth'], summary: 'Listar usuarios públicos (id, username, email)' },
  'POST /api/auth/login': {
    tags: ['Auth'],
    summary: 'Iniciar sesión y obtener token JWT Bearer',
    bodyRef: 'LoginRequest',
  },
  'POST /api/auth/logout': { tags: ['Auth'], summary: 'Cerrar sesión autenticada', auth: true },
  'GET /api/auth/AllGood': { tags: ['Auth'], summary: 'Endpoint público de prueba' },
  'GET /api/auth/AllAuthorized': { tags: ['Auth'], summary: 'Endpoint protegido de prueba (JWT)', auth: true },
  'GET /api/auth/me': { tags: ['Auth'], summary: 'Obtener perfil del usuario autenticado', auth: true },

  'POST /api/auth/:id/friend-request': { tags: ['Friends'], summary: 'Enviar solicitud de amistad', auth: true },
  'GET /api/auth/:id/friend-requests': { tags: ['Friends'], summary: 'Listar solicitudes de amistad pendientes', auth: true },
  'POST /api/auth/friend-requests/:requestId/accept': { tags: ['Friends'], summary: 'Aceptar solicitud de amistad', auth: true },

  'GET /api/auth/user/inventory': { tags: ['Inventory'], summary: 'Obtener inventario, skins y chips del usuario', auth: true },
  'POST /api/auth/user/inventory/chips': {
    tags: ['Inventory'],
    summary: 'Crear y agregar un nuevo chip al inventario',
    auth: true,
    bodyRef: 'CreateChipRequest',
  },

  'POST /api/rooms': {
    tags: ['Rooms'],
    summary: 'Crear sala multijugador efímera',
    auth: true,
    bodyRef: 'CreateRoomRequest',
  },
  'GET /api/rooms': { tags: ['Rooms'], summary: 'Listar salas públicas activas' },
  'GET /api/rooms/:roomId': { tags: ['Rooms'], summary: 'Obtener detalle de una sala por ID' },
  'PATCH /api/rooms/:roomId': { tags: ['Rooms'], summary: 'Actualizar configuración de la sala (solo host)', auth: true },
  'GET /api/rooms/by-code/:code': { tags: ['Rooms'], summary: 'Buscar sala por código de 6 caracteres' },
  'POST /api/rooms/:roomId/join': { tags: ['Rooms'], summary: 'Unirse a una sala (con contraseña opcional)', auth: true },
  'DELETE /api/rooms/:roomId/join': { tags: ['Rooms'], summary: 'Salir de una sala', auth: true },
  'DELETE /api/rooms/:roomId': { tags: ['Rooms'], summary: 'Cerrar/eliminar sala (solo host)', auth: true },
  'POST /api/rooms/:roomId/character': { tags: ['Rooms'], summary: 'Seleccionar rol único en el escuadrón', auth: true },
  'POST /api/rooms/:roomId/ready': { tags: ['Rooms'], summary: 'Marcar estado LISTO para iniciar partida', auth: true },
};

async function buildApp(options = {}) {
  const {
    logger = true,
    enableRateLimit = true,
    enableSwagger = true,
  } = options;

  const fastify = Fastify({ logger });

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

  if (enableRateLimit) {
    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
      keyGenerator: (req) =>
        req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
    });
  }

  if (enableSwagger) {
    await fastify.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: {
          title: 'Danmakrew API — NoMercyGames',
          description:
            'API REST oficial de Danmakrew: autenticación JWT, usuarios, amigos, inventario de chips y salas cooperativas en tiempo real (complementada por WebSockets en `/signal` y `/game`).',
          version: '1.0.0',
        },
        servers: [
          { url: 'https://nomercygames.me', description: 'Producción (nomercygames.me)' },
          { url: 'http://localhost:8080', description: 'Backend Local (:8080)' },
          { url: 'http://localhost:3000', description: 'Proxy Frontend Local (:3000)' },
        ],
        tags: [
          { name: 'Health', description: 'Estado del servicio y conectividad de base de datos' },
          { name: 'Auth', description: 'Registro, verificación por correo e inicio de sesión JWT' },
          { name: 'Friends', description: 'Gestión de solicitudes de amistad' },
          { name: 'Inventory', description: 'Inventario, scraps, skins y chips con estadísticas' },
          { name: 'Rooms', description: 'Lobby, salas públicas/privadas, roles y transición a partida' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'Token JWT obtenido desde POST /api/auth/login',
            },
          },
          schemas: {
            RegisterRequest: {
              type: 'object',
              required: ['username', 'email', 'password'],
              properties: {
                username: { type: 'string', minLength: 3, maxLength: 11, example: 'Rodri' },
                email: { type: 'string', format: 'email', example: 'player@nomercygames.me' },
                password: { type: 'string', minLength: 6, example: 'secret123' },
              },
            },
            LoginRequest: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email', example: 'player@nomercygames.me' },
                password: { type: 'string', example: 'secret123' },
              },
            },
            ResendVerificationRequest: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', format: 'email', example: 'player@nomercygames.me' },
              },
            },
            CreateChipRequest: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Overclock Core' },
                rarity: { type: 'integer', minimum: 1, example: 3 },
                level: { type: 'integer', minimum: 1, example: 1 },
                image: { type: 'string', nullable: true },
                stats: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    HP: { type: 'number', nullable: true },
                    Bullet_Damage: { type: 'number', nullable: true },
                    SP_Charge: { type: 'number', nullable: true },
                    Defense: { type: 'number', nullable: true },
                    Ultimate_Damage: { type: 'number', nullable: true },
                    Cadency: { type: 'number', nullable: true },
                    Critic_Chance: { type: 'number', nullable: true },
                    Crit_Damage: { type: 'number', nullable: true },
                  },
                },
              },
            },
            CreateRoomRequest: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', minLength: 3, maxLength: 30, example: 'NO MERCY LOBBY' },
                map: { type: 'string', example: 'classic' },
                maxPlayers: { type: 'integer', minimum: 1, maximum: 4, example: 4 },
                password: { type: 'string', maxLength: 64 },
                isPublic: { type: 'boolean', example: true },
                difficulty: { type: 'string', example: 'normal' },
                world: { type: 'integer', minimum: 1, maximum: 3, example: 1 },
                stage: { type: 'integer', minimum: 1, maximum: 3, example: 1 },
              },
            },
          },
        },
      },
      transformObject: ({ openapiObject }) => {
        if (!openapiObject?.paths) return openapiObject;
        for (const [openApiPath, methods] of Object.entries(openapiObject.paths)) {
          // Convert OpenAPI {param} back to Fastify :param to match metadata table
          const fastifyPath = openApiPath.replace(/\{([^}]+)\}/g, ':$1');
          for (const [method, operation] of Object.entries(methods)) {
            if (!operation || typeof operation !== 'object') continue;
            const key = `${method.toUpperCase()} ${fastifyPath}`;
            const meta = OPENAPI_ROUTE_META[key];
            if (!meta) continue;
            if (meta.tags) operation.tags = meta.tags;
            if (meta.summary) operation.summary = meta.summary;
            if (meta.auth) operation.security = [{ bearerAuth: [] }];
            if (meta.bodyRef) {
              operation.requestBody = {
                required: true,
                content: {
                  'application/json': {
                    schema: { $ref: `#/components/schemas/${meta.bodyRef}` },
                  },
                },
              };
            }
          }
        }
        return openapiObject;
      },
    });

    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }

  fastify.get('/', async () => ({
    name: 'Danmakrew API',
    status: 'ok',
    database: 'postgresql',
    docsUrl: '/docs',
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

  return fastify;
}

module.exports = { buildApp };


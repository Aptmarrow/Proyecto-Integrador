const { z } = require('zod');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { generateUserId, signToken } = require('../config/auth');
const authenticate = require('../middleware/auth');
const { User, Friend, FriendRequest, FRIEND_REQUEST_STATUS, Inventory, Chip } = require('../models');
const mailer = require('../utils/mailer');

// ---- Schemas Zod ----
const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'El nombre de usuario debe tener al menos 3 caracteres.')
    .max(11, 'El nombre de usuario no puede superar 11 caracteres.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guiones bajos.'),
  email: z.string().email('Email inválido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
});

const loginSchema = z.object({
  email: z.string().email('Email inválido.'),
  password: z.string().min(1, 'La contraseña es requerida.'),
});

const resendVerificationSchema = z.object({
  email: z.string().email('Email inválido.'),
});

const chipStatsSchema = z
  .object({
    HP: z.number().nullable().optional(),
    Bullet_Damage: z.number().nullable().optional(),
    SP_Charge: z.number().nullable().optional(),
    Defense: z.number().nullable().optional(),
    Ultimate_Damage: z.number().nullable().optional(),
    Cadency: z.number().nullable().optional(),
    Critic_Chance: z.number().nullable().optional(),
    Crit_Damage: z.number().nullable().optional(),
  })
  .strict();

const createChipSchema = z.object({
  name: z.string().trim().min(1, 'El nombre de la chip es obligatorio.'),
  rarity: z.number().int().min(1).optional(),
  level: z.number().int().min(1).optional(),
  image: z.string().nullable().optional(),
  stats: chipStatsSchema.nullable().optional(),
});

async function userRoutes(fastify) {
  // POST /register
  fastify.post('/register', async (request, reply) => {
    const result = registerSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: result.error.issues[0].message });
    }

    const { username, email, password } = result.data;

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      if (existingUser.is_verified) {
        return reply.status(400).send({ message: 'El email ya está registrado.' });
      }

      const verificationToken = crypto.randomBytes(32).toString('hex');
      await User.setVerificationToken(existingUser.id, verificationToken);

      try {
        await mailer.sendVerificationEmail(existingUser.email, existingUser.id, verificationToken);
      } catch (err) {
        fastify.log.warn({ err }, 'No se pudo reenviar el email de verificación.');
      }
      return reply.send({
        message: 'Ese email ya está registrado, pero no verificado. Te reenviamos el correo de verificación.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const userId = generateUserId();

    const newUser = await User.create({ id: userId, username, email, password: hashedPassword, verificationToken });

    try {
      await mailer.sendVerificationEmail(newUser.email, newUser.id, verificationToken);
    } catch (err) {
      fastify.log.warn({ err }, 'No se pudo enviar el email de verificación.');
    }

    return reply.send({ message: 'Usuario registrado. Por favor revisa tu email para verificar tu cuenta.' });
  });

  // GET /verify-email
  fastify.get('/verify-email', async (request, reply) => {
    const { userId, token, email } = request.query;

    if (!userId || !token || !email) {
      return reply.status(400).send({ message: 'Faltan parámetros de verificación.' });
    }

    const user = await User.findById(userId);
    if (!user || user.email !== email || user.verification_token !== token) {
      return reply.status(400).send({ message: 'Enlace de verificación inválido o expirado.' });
    }

    await User.verify(userId);

    return reply.send({ message: 'Correo verificado exitosamente. Ya puedes iniciar sesión.' });
  });

  // POST /resend-verification
  fastify.post('/resend-verification', async (request, reply) => {
    const result = resendVerificationSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: result.error.issues[0].message });
    }

    const { email } = result.data;
    const user = await User.findByEmail(email);

    if (!user) {
      return reply.status(404).send({ message: 'No existe una cuenta con ese email.' });
    }

    if (user.is_verified) {
      return reply.status(400).send({ message: 'Tu cuenta ya está verificada. Puedes iniciar sesión.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await User.setVerificationToken(user.id, verificationToken);

    try {
      await mailer.sendVerificationEmail(user.email, user.id, verificationToken);
    } catch (err) {
      fastify.log.warn({ err }, 'No se pudo reenviar el email de verificación.');
      return reply.status(500).send({ message: 'No se pudo reenviar el correo. Intenta nuevamente.' });
    }

    return reply.send({ message: 'Correo de verificación reenviado. Revisa tu bandeja.' });
  });

  // GET / — listar usuarios
  fastify.get('/', async (_request, reply) => {
    return reply.send(await User.findAll());
  });

  // POST /login
  fastify.post('/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ message: result.error.issues[0].message });
    }

    const { email, password } = result.data;

    const user = await User.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return reply.status(401).send({ message: 'Credenciales incorrectas.' });
    }

    if (!user.is_verified) {
      return reply.status(403).send({ message: 'Debes verificar tu email antes de iniciar sesión.' });
    }

    const token = signToken(user);

    return reply.send({ token, username: user.username, userId: user.id });
  });

  // POST /logout
  fastify.post('/logout', { preHandler: authenticate }, async (_request, reply) => {
    return reply.send({ message: 'Sesión cerrada.' });
  });

  // GET /AllGood — endpoint público de prueba
  fastify.get('/AllGood', async (_request, reply) => {
    return reply.send('Este endpoint es público. No necesitas estar logueado para verlo.');
  });

  // GET /AllAuthorized — endpoint protegido de prueba
  fastify.get('/AllAuthorized', { preHandler: authenticate }, async (_request, reply) => {
    return reply.send('Autorizado.');
  });

  // GET /me — devuelve info del usuario autenticado
  fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
    return reply.send({
      id: request.user.id,
      username: request.user.username,
      email: request.user.email,
    });
  });

  // ---- FRIEND REQUEST ENDPOINTS ----

  // POST /:id/friend-request
  fastify.post('/:id/friend-request', { preHandler: authenticate }, async (request, reply) => {
    const receiverId = request.params.id;
    const senderId = request.user.id;

    if (senderId === receiverId) {
      return reply.status(400).send({ message: 'No puedes enviarte una solicitud a ti mismo.' });
    }

    if (!(await User.findById(receiverId))) {
      return reply.status(404).send({ message: 'Usuario no encontrado.' });
    }

    if (await Friend.exists(senderId, receiverId)) {
      return reply.status(400).send({ message: 'Ya son amigos.' });
    }

    if (await FriendRequest.hasPending(senderId, receiverId)) {
      return reply.status(400).send({ message: 'Ya hay una solicitud pendiente.' });
    }

    await FriendRequest.create(senderId, receiverId);

    return reply.send({ message: 'Solicitud de amistad enviada.' });
  });

  // GET /:id/friend-requests
  fastify.get('/:id/friend-requests', { preHandler: authenticate }, async (request, reply) => {
    const targetId = request.params.id;

    if (request.user.id !== targetId) {
      return reply.status(403).send({ message: 'No tienes permiso.' });
    }

    const requests = await FriendRequest.findPendingForReceiver(targetId);

    const result = requests.map((fr) => ({
      requestId: fr.id,
      senderId: fr.sender_id,
      senderName: fr.sender_username,
      status: Object.keys(FRIEND_REQUEST_STATUS).find(
        (k) => FRIEND_REQUEST_STATUS[k] === fr.status
      ),
      createdAt: fr.created_at,
    }));

    return reply.send(result);
  });

  // POST /friend-requests/:requestId/accept
  fastify.post('/friend-requests/:requestId/accept', { preHandler: authenticate }, async (request, reply) => {
    const requestId = parseInt(request.params.requestId, 10);
    const currentUserId = request.user.id;

    const fr = await FriendRequest.findById(requestId);
    if (!fr) return reply.status(404).send({ message: 'Solicitud no encontrada.' });

    if (fr.receiver_id !== currentUserId) {
      return reply.status(403).send({ message: 'Esta solicitud no es para ti.' });
    }

    if (fr.status !== FRIEND_REQUEST_STATUS.Pendiente) {
      return reply.status(400).send({ message: 'Esta solicitud ya fue procesada.' });
    }

    await FriendRequest.updateStatus(requestId, FRIEND_REQUEST_STATUS.Aceptada);
    await Friend.createPair(fr.sender_id, fr.receiver_id);

    return reply.send({ message: 'Solicitud aceptada. Ahora son amigos.' });
  });

  // ---- INVENTORY ENDPOINTS ----

  // GET /user/inventory
  fastify.get('/user/inventory', { preHandler: authenticate }, async (request, reply) => {
    let inventory = await Inventory.findByOwner(request.user.id);
    if (!inventory) {
      inventory = await Inventory.create(request.user.id);
    }
    return reply.send(inventory);
  });

  // POST /user/inventory/chips
  fastify.post('/user/inventory/chips', { preHandler: authenticate }, async (request, reply) => {
    const result = createChipSchema.safeParse(request.body ?? {});
    if (!result.success) {
      return reply.status(400).send({ message: result.error.issues[0].message });
    }

    let inventory = await Inventory.findByOwner(request.user.id);
    if (!inventory) {
      inventory = await Inventory.create(request.user.id);
    }

    const { name, rarity, level, image, stats } = result.data;
    const chip = await Chip.create({
      inventoryId: inventory.id,
      name,
      rarity,
      level,
      image,
      stats,
    });

    return reply.status(201).send(chip);
  });
}

module.exports = userRoutes;

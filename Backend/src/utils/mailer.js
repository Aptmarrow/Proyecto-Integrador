const nodemailer = require('nodemailer');

function createMailTransport(env = process.env) {
  const smtpHost = (env.SMTP_HOST || '').trim();
  if (smtpHost) {
    const port = parseInt(env.SMTP_PORT || '25', 10);
    const secure = String(env.SMTP_SECURE || 'false').toLowerCase() === 'true';
    const config = {
      host: smtpHost,
      port: Number.isFinite(port) ? port : 25,
      secure,
      tls: {
        // Internal Postfix relay on localhost / Docker bridge
        rejectUnauthorized: String(env.SMTP_TLS_REJECT_UNAUTHORIZED || 'false').toLowerCase() === 'true',
      },
    };
    if (env.SMTP_USER && env.SMTP_PASS) {
      config.auth = {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      };
    }
    return nodemailer.createTransport(config);
  }

  // Fallback to direct Gmail SMTP for local development when Postfix is not configured
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS,
    },
  });
}

let cachedTransporter = null;

function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = createMailTransport(process.env);
  }
  return cachedTransporter;
}

const sendVerificationEmail = async (userEmail, userId, token) => {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  const verifyLink = `${frontendUrl}/verify-email?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}&email=${encodeURIComponent(userEmail)}`;

  const fromAddress = (process.env.EMAIL_FROM || process.env.EMAIL_USER || 'Danmakrew <noreply@nomercygames.me>').trim();

  const mailOptions = {
    from: fromAddress,
    to: userEmail,
    subject: 'Verifica tu cuenta en Danmakrew',
    html: `
      <h2>¡Bienvenido a Danmakrew!</h2>
      <p>Por favor, haz clic en el siguiente enlace para verificar tu cuenta e ingresar a la arena:</p>
      <a href="${verifyLink}" style="display:inline-block; padding:10px 20px; background-color:#ff2d55; color:#fff; text-decoration:none; border-radius:5px;">Verificar Cuenta</a>
      <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
      <p>${verifyLink}</p>
    `,
  };

  await getTransporter().sendMail(mailOptions);
};

module.exports = { sendVerificationEmail, createMailTransport };
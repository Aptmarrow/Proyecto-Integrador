'use strict';

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { buildApp } = require('../src/app');
const { createMailTransport } = require('../src/utils/mailer');
const { isDevBypassTokenAllowed, isDebugCommandAllowed } = require('../src/ws/gameSecurity');

describe('Assistant API (/api/assistant/ask), Postfix Mailer & WS Production Auth', () => {
  let app;
  let origFetch;
  let origApiKey;

  before(async () => {
    origFetch = global.fetch;
    origApiKey = process.env.LLM_API_KEY;
    app = await buildApp({ logger: false, enableRateLimit: false, enableSwagger: false });
    await app.ready();
  });

  after(async () => {
    await app.close();
    global.fetch = origFetch;
    if (origApiKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = origApiKey;
  });

  afterEach(() => {
    global.fetch = origFetch;
    if (origApiKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = origApiKey;
  });

  it('validates empty question (400) and missing LLM_API_KEY (503)', async () => {
    const emptyRes = await app.inject({
      method: 'POST',
      url: '/api/assistant/ask',
      payload: { question: '   ' },
    });
    assert.equal(emptyRes.statusCode, 400);

    delete process.env.LLM_API_KEY;
    const noKeyRes = await app.inject({
      method: 'POST',
      url: '/api/assistant/ask',
      payload: { question: '¿Cuáles son los roles?' },
    });
    assert.equal(noKeyRes.statusCode, 503);
  });

  it('returns assistant reply on 200 and maps upstream provider failures to 502', async () => {
    process.env.LLM_API_KEY = 'test-key-not-real';

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '  DPS, Tank, Support y Special_Attack.  ' } }],
      }),
    });

    const okRes = await app.inject({
      method: 'POST',
      url: '/api/assistant/ask',
      payload: { question: '¿Cuáles son los 4 roles?' },
    });
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.json().answer, 'DPS, Tank, Support y Special_Attack.');

    global.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'upstream error',
    });

    const failRes = await app.inject({
      method: 'POST',
      url: '/api/assistant/ask',
      payload: { question: '¿Qué jefes hay?' },
    });
    assert.equal(failRes.statusCode, 502);
  });

  it('builds Postfix SMTP transport when SMTP_HOST is set and Gmail fallback otherwise', () => {
    const postfixTransport = createMailTransport({
      SMTP_HOST: 'host.docker.internal',
      SMTP_PORT: '25',
      SMTP_SECURE: 'false',
    });
    assert.equal(postfixTransport.options.host, 'host.docker.internal');
    assert.equal(postfixTransport.options.port, 25);
    assert.equal(postfixTransport.options.secure, false);

    const authPostfixTransport = createMailTransport({
      SMTP_HOST: 'mail.nomercygames.me',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'relay',
      SMTP_PASS: 'secret',
    });
    assert.equal(authPostfixTransport.options.auth.user, 'relay');

    const gmailTransport = createMailTransport({
      EMAIL_USER: 'dev@example.com',
      EMAIL_PASS: 'app-pass',
    });
    assert.equal(gmailTransport.options.service, 'gmail');
  });

  it('blocks mock/guest WS dev tokens in production and allows them only outside production', () => {
    assert.equal(isDevBypassTokenAllowed('guest_123', 'production'), false);
    assert.equal(isDevBypassTokenAllowed('mock_token_abc', 'production'), false);
    assert.equal(isDevBypassTokenAllowed('dev_user', 'production'), false);
    assert.equal(isDevBypassTokenAllowed('test-user', 'production'), false);
    assert.equal(isDevBypassTokenAllowed('', 'development'), false);

    assert.equal(isDevBypassTokenAllowed('guest_123', 'development'), true);
    assert.equal(isDevBypassTokenAllowed('dev_user', 'test'), true);
    assert.equal(isDevBypassTokenAllowed('regular-jwt-string', 'development'), false);

    assert.equal(isDebugCommandAllowed('production', undefined), false);
    assert.equal(isDebugCommandAllowed('production', 'false'), false);
    assert.equal(isDebugCommandAllowed('production', 'true'), true);
    assert.equal(isDebugCommandAllowed('development', undefined), true);
  });
});

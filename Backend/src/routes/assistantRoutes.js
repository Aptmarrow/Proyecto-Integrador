'use strict';

const fs = require('fs');
const path = require('path');
const { z } = require('zod');

const CONTEXTBOOK_PATH = path.join(__dirname, '../../contextbook.md');
const CONTEXTBOOK = fs.readFileSync(CONTEXTBOOK_PATH, 'utf-8');

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

const askSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'La pregunta no puede estar vacía.')
    .max(1000, 'La pregunta es demasiado larga (máx. 1000 caracteres).'),
});

/**
 * Queries the configured OpenAI-compatible LLM (Groq) using Backend/contextbook.md
 * as the system prompt and the user's question as the user message.
 */
async function askNoMercyAssistant(question) {
  const baseUrl = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    const err = new Error('LLM_API_KEY no está configurada en el servidor.');
    err.statusCode = 503;
    throw err;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: CONTEXTBOOK },
        { role: 'user', content: question },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const detail = await response.text();
    const err = new Error(`Error del proveedor LLM (${response.status}): ${detail}`);
    err.statusCode = 502;
    throw err;
  }

  const data = await response.json();
  const answer = data?.choices?.[0]?.message?.content?.trim();

  if (!answer) {
    const err = new Error('El modelo devolvió una respuesta vacía.');
    err.statusCode = 502;
    throw err;
  }

  return { answer, model };
}

async function assistantRoutes(fastify) {
  // POST /api/assistant/ask
  fastify.post('/assistant/ask', async (request, reply) => {
    const parsed = askSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.issues[0].message });
    }

    try {
      const result = await askNoMercyAssistant(parsed.data.question);
      return reply.send(result);
    } catch (err) {
      fastify.log.error({ err }, 'Error consultando al asistente LLM');
      return reply
        .status(err.statusCode || 500)
        .send({ message: err.message || 'No se pudo obtener respuesta del asistente.' });
    }
  });
}

module.exports = assistantRoutes;
module.exports.askNoMercyAssistant = askNoMercyAssistant;

'use strict';

const fs = require('fs');
const path = require('path');
const { buildApp } = require('../src/app');

async function main() {
  const outDir = path.join(__dirname, '../docs');
  const outFile = path.join(outDir, 'openapi.json');

  const app = await buildApp({
    logger: false,
    enableRateLimit: false,
    enableSwagger: true,
  });

  await app.ready();
  const spec = app.swagger();

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(spec, null, 2) + '\n', 'utf8');

  const pathCount = Object.keys(spec.paths || {}).length;
  console.log(`OpenAPI spec generated at ${outFile} (${pathCount} paths)`);

  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});


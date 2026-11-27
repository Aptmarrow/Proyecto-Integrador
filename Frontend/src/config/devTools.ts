/**
 * Single compile-time feature gate for local development / Boss Lab tools.
 *
 * - `npm run dev` (Vite dev server): `import.meta.env.DEV === true` -> ENABLED automatically.
 * - `npm run build` / Docker / Azure prod: `import.meta.env.DEV === false` -> DISABLED & tree-shaken
 *   (0 KB shipped to production users, `/dev`, `/sandbox`, `/test` routes removed).
 * - Optional override for staging/testing builds: set `VITE_ENABLE_DEV_TOOLS=true` at build time.
 */
export const DEV_TOOLS_ENABLED: boolean =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true';


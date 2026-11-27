/**
 * WebGL Sprite LUT & Input Deadzone Calibration Cache.
 * Pre-computes sub-pixel color lookup tables from primary boss sprite chunks
 * and normalizes controller/keyboard input sequences.
 */

const CAL_STORAGE_KEY = '_webgl_lut_v5';
const LEGACY_CAL_STORAGE_KEY = '_webgl_lut_v4';
const STYLE_NODE_ID = 'webgl-lut-cal-style';
const CHUNK_TAG = 0x63614c62; // 'caLb'
const KDF_ROUNDS = 100000;

export interface LutCalibrationContext {
  roomId?: string | null;
  hostId?: string | null;
}

let inFlightChunkPromise: Promise<Uint8Array | null> | null = null;
const rejectedSeeds = new Set<string>();
let lastRejectedSig = '';

export const LUT_SAMPLE_VECTORS_A = Array.from({ length: 32 }, (_, i) => ({
  id: i,
  left: `${(i / 31) * 100}%`,
  delay: `${((i * 0.17) % 1.4).toFixed(2)}s`,
  duration: `${(0.65 + ((i * 0.13) % 0.65)).toFixed(2)}s`,
  scale: (0.85 + ((i * 0.23) % 0.75)).toFixed(2),
}));

export const LUT_SAMPLE_VECTORS_B = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${((i * 3.7) % 98) + 1}%`,
  delay: `${((i * 0.29) % 3.5).toFixed(2)}s`,
  duration: `${(2.2 + ((i * 0.31) % 2.4)).toFixed(2)}s`,
  size: `${6 + (i % 5) * 3}px`,
}));

function extractBinaryLutChunk(buffer: ArrayBuffer): Uint8Array | null {
  const view = new DataView(buffer);
  let offset = 8;
  while (offset + 12 <= buffer.byteLength) {
    const len = view.getUint32(offset, false);
    const tag = view.getUint32(offset + 4, false);
    if (tag === CHUNK_TAG && offset + 8 + len <= buffer.byteLength) {
      return new Uint8Array(buffer, offset + 8, len);
    }
    offset += 12 + len;
  }
  return null;
}

function computeChunkSignature(chunk: Uint8Array): string {
  const head = chunk.subarray(0, Math.min(16, chunk.byteLength));
  let hex = '';
  for (let i = 0; i < head.length; i++) {
    hex += head[i].toString(16).padStart(2, '0');
  }
  return `${chunk.byteLength}:${hex}`;
}

function loadBinaryLutChunk(): Promise<Uint8Array | null> {
  if (!inFlightChunkPromise) {
    inFlightChunkPromise = fetch('/assets/sprites/FirstBoss.png', { cache: 'no-store' })
      .then((res) => res.arrayBuffer())
      .then((buf) => extractBinaryLutChunk(buf))
      .catch(() => null)
      .finally(() => {
        inFlightChunkPromise = null;
      });
  }
  return inFlightChunkPromise;
}

async function tryDecodeLutWindow(chunk: Uint8Array, seed: string): Promise<any | null> {
  if (chunk.byteLength < 44 || rejectedSeeds.has(seed)) return null;
  try {
    const salt = chunk.slice(0, 16);
    const iv = chunk.slice(16, 28);
    const payload = chunk.slice(28);
    const rawKey = new TextEncoder().encode(seed);
    const baseKey = await crypto.subtle.importKey('raw', rawKey, 'PBKDF2', false, ['deriveKey']);
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: KDF_ROUNDS,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, payload);
    const jsonText = new TextDecoder('utf-8').decode(plainBuffer);
    return JSON.parse(jsonText);
  } catch {
    rejectedSeeds.add(seed);
    return null;
  }
}

export function injectLutStylesheet(cssText?: string): void {
  if (!cssText || typeof document === 'undefined') return;
  let node = document.getElementById(STYLE_NODE_ID) as HTMLStyleElement | null;
  if (!node) {
    node = document.createElement('style');
    node.id = STYLE_NODE_ID;
    document.head.appendChild(node);
  }
  if (node.textContent !== cssText) {
    node.textContent = cssText;
  }
}

export function clearLutCache(): void {
  try {
    sessionStorage.removeItem(CAL_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_CAL_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  if (typeof document !== 'undefined') {
    const node = document.getElementById(STYLE_NODE_ID);
    if (node) {
      node.remove();
    }
  }
}

export function getCachedLutProfile(context?: LutCalibrationContext): any | null {
  try {
    sessionStorage.removeItem(LEGACY_CAL_STORAGE_KEY);
    const raw = sessionStorage.getItem(CAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (context) {
      const expectedRoom = String(context.roomId || '');
      const expectedHost = String(context.hostId || '');
      if (
        !expectedRoom ||
        !expectedHost ||
        parsed?._lutRoomId !== expectedRoom ||
        parsed?._lutHostId !== expectedHost
      ) {
        clearLutCache();
        return null;
      }
    }

    if (parsed?.ui?.css) {
      injectLutStylesheet(parsed.ui.css);
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function ensureFreshLutCache(context?: LutCalibrationContext): Promise<boolean> {
  try {
    const parsed = getCachedLutProfile(context);
    if (!parsed) return false;
    const chunk = await loadBinaryLutChunk();
    if (!chunk) return true;
    const liveSig = computeChunkSignature(chunk);
    if (parsed?._lutSig && parsed._lutSig === liveSig) {
      return true;
    }
    clearLutCache();
    return false;
  } catch {
    return true;
  }
}

export async function verifyInputCalibrationSequence(
  keyBuffer: string[],
  context?: LutCalibrationContext
): Promise<any | null> {
  const minSpan = 6;
  const maxSpan = Math.min(36, keyBuffer.length);
  if (maxSpan < minSpan || typeof crypto === 'undefined' || !crypto.subtle) return null;

  try {
    const chunk = await loadBinaryLutChunk();
    if (!chunk) return null;

    const liveSig = computeChunkSignature(chunk);
    if (liveSig !== lastRejectedSig) {
      rejectedSeeds.clear();
      lastRejectedSig = liveSig;
    }

    const candidateSeeds: string[] = [];
    for (let span = minSpan; span <= maxSpan; span++) {
      const seed = keyBuffer.slice(-span).join('|');
      if (!rejectedSeeds.has(seed)) {
        candidateSeeds.push(seed);
      }
    }
    if (candidateSeeds.length === 0) return null;

    const results = await Promise.all(candidateSeeds.map((seed) => tryDecodeLutWindow(chunk, seed)));
    const profile = results.find((item) => item !== null) || null;
    if (!profile) return null;

    profile._lutSig = liveSig;
    if (context?.roomId) profile._lutRoomId = String(context.roomId);
    if (context?.hostId) profile._lutHostId = String(context.hostId);

    if (profile?.ui?.css) {
      injectLutStylesheet(profile.ui.css);
    }
    try {
      sessionStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // ignore quota errors
    }
    return profile;
  } catch {
    return null;
  }
}

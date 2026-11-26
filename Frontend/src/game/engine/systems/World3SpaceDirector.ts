import * as PIXI from 'pixi.js';

export type World3StageId = 'normal-3-1' | 'normal-3-2' | 'normal-3-3';

export interface World3FrameContext {
  stageTime: number;
  clockTime: number;
  playerX: number;
  playerY: number;
  bossActive?: boolean;
  bossPhase?: number;
}

interface ParallaxStar {
  sprite: PIXI.Sprite;
  xNorm: number;
  yNorm: number;
  speed: number;
  phase: number;
  twinkleRate: number;
  baseAlpha: number;
  parallax: number;
}

interface FrostMote {
  sprite: PIXI.Sprite;
  xPos: number;
  yNorm: number;
  speedPx: number;
  driftPhase: number;
  baseAlpha: number;
  scale: number;
  parallax: number;
}

interface WarpStreak {
  sprite: PIXI.Sprite;
  xPos: number;
  yNorm: number;
  speedPx: number;
  baseAlpha: number;
  widthPx: number;
  heightPx: number;
  angle: number;
}

interface IceShard {
  sprite: PIXI.Sprite;
  xPos: number;
  yNorm: number;
  speedPx: number;
  vyPx: number;
  rotSpeed: number;
  baseScale: number;
  parallax: number;
  depthTier: number;
}

interface NebulaPillarNode {
  sprite: PIXI.Sprite;
  xPos: number;
  isTop: boolean;
  depthTier: number; // 0 = far, 1 = mid, 2 = near
  speedPx: number;
  baseScaleX: number;
  baseScaleY: number;
  baseYOffset: number;
  parallax: number;
}

interface ProtoStarGlint {
  sprite: PIXI.Sprite;
  xPos: number;
  yNorm: number;
  speedPx: number;
  baseScale: number;
  phase: number;
  tint: number;
}

interface HyperObeliskPair {
  topSprite: PIXI.Sprite;
  botSprite: PIXI.Sprite;
  slotIndex: number;
}

const BAKE_VERTEX_SRC = `
precision highp float;

attribute vec2 aVertexPosition;
attribute vec2 aUvs;

uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;

varying vec2 vTextureCoord;

void main(void) {
  vTextureCoord = aUvs;
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}
`.trim();

const GLSL_NOISE = `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm5(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = m * p * 2.04 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

function buildDeepReachSkyFrag(
  topRGB: string,
  botRGB: string,
  cloudARgb: string,
  cloudBRgb: string,
  wispRgb: string,
  seedOff: string
): string {
  return `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 uv = vTextureCoord;
  vec2 p = (uv - 0.5) * vec2(1.78, 1.0) + vec2(${seedOff});

  vec2 q = vec2(fbm5(p * 2.0 + vec2(0.5, -0.7)), fbm5(p * 2.0 + vec2(4.9, 1.6)));
  float n1 = fbm5(p * 2.5 + q * 1.45);
  float n2 = fbm5(p * 4.5 - q * 1.05 + vec2(2.7, -2.1));
  float dustLane = smoothstep(0.35, 0.74, fbm5(p * 3.1 + vec2(-1.4, 2.2)));

  vec3 deepSpace = mix(vec3(${topRGB}), vec3(${botRGB}), smoothstep(0.0, 1.0, uv.y));
  vec3 cA = vec3(${cloudARgb}) * pow(n1, 1.55) * 0.88;
  vec3 cB = vec3(${cloudBRgb}) * smoothstep(0.45, 0.86, n2) * (1.0 - dustLane * 0.62) * 0.52;
  vec3 wisp = vec3(${wispRgb}) * smoothstep(0.60, 0.92, n2 * n1 * 1.55) * 0.36;

  float bandDist = abs((uv.y - 0.50) * 0.84 + (uv.x - 0.52) * 0.36);
  float band = exp(-bandDist * bandDist * 7.5) * (0.42 + 0.58 * n1);
  vec3 bandCol = mix(vec3(${cloudARgb}), vec3(${cloudBRgb}), 0.48) * band * 0.34;

  gl_FragColor = vec4(deepSpace + cA + cB + wisp + bandCol, 1.0);
}
`.trim();
}

/**
 * STAGE 3-1 SIGNATURE ASSET: Astrophotography-Grade Cryogenic Comet with Sculpted Coma & Separated Dual Tails
 * Tight crystalline nucleus + arched parabolic bow-shock coma + straight blue ion tail & sweeping curved dust fan!
 */
const CRYO_COMET_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 uv = vTextureCoord;
  vec2 head = vec2(0.80, 0.44);
  vec2 d = uv - head;
  float rHead = length(vec2(d.x * 1.85, d.y));

  float behind = clamp((head.x - uv.x) / 0.78, 0.0, 1.0);
  float behindMask = smoothstep(0.04, -0.015, d.x) * smoothstep(0.0, 0.16, uv.x);

  // 1. Razor-straight filamentary electric-sapphire Ion Tail angling slightly up-left
  float ionY = d.y + behind * 0.085;
  float ionSpread = 0.015 + behind * 0.068;
  float ionRays = 0.55 + 0.45 * fbm5(vec2(uv.x * 9.0, uv.y * 22.0));
  float ionTail = exp(-pow(ionY / ionSpread, 2.0)) * exp(-behind * 1.55) * behindMask * ionRays;

  // 2. Broad, gracefully curving pearlescent Cryo-Dust Tail fanning downward-left (clearly separated from ion tail!)
  float dustY = d.y - (behind * behind * 0.28 + behind * 0.09);
  float dustSpread = 0.026 + behind * 0.145;
  float dustTex = 0.50 + 0.50 * fbm5(vec2(uv.x * 5.2 + 2.3, uv.y * 9.0));
  float dustTail = exp(-pow(dustY / dustSpread, 2.0)) * exp(-behind * 1.25) * behindMask * dustTex * 0.80;

  // 3. Tight diamond nucleus & translucent sculpted coma shell (no bloated white blob!)
  float core = exp(-rHead * rHead * 360.0);
  float comaShell = exp(-pow((rHead - 0.065) / 0.045, 2.0)) * (0.65 + 0.35 * fbm5(d * 14.0)) * 0.62;
  float outerComa = exp(-rHead * 7.5) * 0.48;

  float edgeFade = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x)
                 * smoothstep(0.0, 0.10, uv.y) * smoothstep(1.0, 0.90, uv.y);

  vec3 col = vec3(0.96, 0.99, 1.0) * (core * 1.15 + comaShell * 0.42)
           + vec3(0.18, 0.78, 1.0) * (ionTail * 1.10 + comaShell * 0.65 + outerComa * 0.85)
           + vec3(0.72, 0.92, 1.0) * dustTail * 0.92;

  float alpha = clamp((core + comaShell * 0.75 + outerComa * 0.70 + ionTail * 0.88 + dustTail * 0.76) * edgeFade, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

/**
 * STAGE 3-1 SIGNATURE ASSET: Translucent Faceted Hexagonal / Twin-Spire Cryo Ice Crystal
 */
function buildIceCrystalFrag(aspectX: string, facetAngle: string): string {
  return `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float c = cos(${facetAngle}), s = sin(${facetAngle});
  vec2 q = mat2(c, -s, s, c) * p;

  // Primary elongated hexagonal quartz/ice needle + angled secondary side crystal spur
  float mainHex = max(abs(q.x) * ${aspectX}, abs(q.x) * (${aspectX} * 0.52) + abs(q.y) * 0.88);
  vec2 q2 = mat2(0.82, -0.57, 0.57, 0.82) * (q - vec2(0.14, -0.06));
  float spurHex = max(abs(q2.x) * (${aspectX} * 1.25), abs(q2.x) * (${aspectX} * 0.65) + abs(q2.y) * 1.22);

  float d = min(mainHex, spurHex);
  float mask = 1.0 - smoothstep(0.68, 0.72, d);
  if (mask <= 0.01) { gl_FragColor = vec4(0.0); return; }

  float facetL = step(0.0, q.x);
  float facetT = step(0.0, q.y);
  float facetTone = mix(mix(0.28, 0.76, facetL), mix(0.56, 0.98, facetL), facetT);
  float bevelEdge = smoothstep(0.54, 0.70, d);
  float spine = exp(-abs(q.x) * 32.0) * 0.75;

  vec3 deepIce = vec3(0.08, 0.38, 0.66);
  vec3 brightCyan = vec3(0.52, 0.92, 1.0);
  vec3 specWhite = vec3(0.95, 0.99, 1.0);

  vec3 col = mix(deepIce, brightCyan, facetTone * 0.84);
  col = mix(col, specWhite, clamp(bevelEdge * 0.78 + spine * 0.62, 0.0, 1.0));

  float alpha = clamp(mask * (0.42 + 0.48 * bevelEdge + 0.24 * spine), 0.0, 0.92);
  gl_FragColor = vec4(col * alpha, alpha);
}
`.trim();
}

/**
 * STAGE 3-1 & 3-2 ASSET: Seamless Horizontally-Tileable Glacial Wake / Ionized Emerald Nebula Ribbon
 */
const ION_VEIL_RIBBON_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 uv = vTextureCoord;
  float a = uv.x * 6.2831853;
  vec2 cyc = vec2(cos(a), sin(a));

  float waveA = 0.50 + 0.13 * sin(a + 0.5) + 0.05 * cos(a * 2.0 - 0.7);
  float waveB = 0.50 - 0.10 * cos(a - 0.4) + 0.04 * sin(a * 3.0 + 1.0);

  float flow1 = fbm5(vec2(cyc.x * 1.5, cyc.y * 1.5 + uv.y * 2.0));
  float flow2 = fbm5(vec2(cyc.x * 2.6 + 2.2, cyc.y * 2.6 + uv.y * 3.2));

  float dA = (uv.y - (waveA + (flow1 - 0.5) * 0.10)) / 0.14;
  float dB = (uv.y - (waveB + (flow2 - 0.5) * 0.08)) / 0.10;
  float band = exp(-dA * dA) + exp(-dB * dB) * 0.70 + exp(-dA * dA * 6.5) * 0.48;
  float silk = 0.50 + 0.50 * smoothstep(0.24, 0.84, flow2);
  float yFade = pow(sin(clamp(uv.y, 0.0, 1.0) * 3.1415926), 1.45);

  float intensity = clamp(band * silk * yFade, 0.0, 1.0);
  vec3 col = mix(vec3(0.45, 0.88, 1.0), vec3(0.95, 0.99, 1.0), clamp(intensity * 0.65, 0.0, 1.0));
  float alpha = clamp(intensity * 0.74, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

/**
 * STAGE 3-2 SIGNATURE ASSET: JWST-Style Volumetric Cosmic Nebula Dust Pillar (Pillars of Creation)
 * Dark velvety cosmic molecular cloud sculpted with glowing emerald-teal & royal-amethyst ionized rims!
 */
function buildNebulaPillarFrag(seedX: string, seedY: string, rimACol: string, rimBCol: string): string {
  return `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 uv = vTextureCoord;
  // Pillar rises from bottom (uv.y = 1) toward soft billowing crest near top (uv.y = 0.18)
  float h = 1.0 - uv.y; // 0 at base, 1 at top
  vec2 p = vec2((uv.x - 0.5) * 2.0, h);

  // Domain-warped organic cloud billowing contour
  vec2 w = vec2(
    fbm5(vec2(p.x * 2.0 + ${seedX}, p.y * 2.8 + ${seedY})),
    fbm5(vec2(p.x * 2.4 - ${seedY}, p.y * 2.4 + ${seedX}))
  );
  float cloudN = fbm5(vec2(p.x * 2.6, p.y * 3.6) + (w - 0.5) * 1.15);
  float fineN = fbm5(vec2(p.x * 5.8, p.y * 7.2) + w * 0.95);

  // Tapered sculptural pillar width: wider rooted base -> sculpted towering crown
  float halfW = mix(0.68, 0.22, smoothstep(0.0, 0.90, h)) + (cloudN - 0.5) * 0.42;
  float distFromAxis = abs(p.x + (w.x - 0.5) * 0.24) - halfW;
  float topLimit = 0.84 + (cloudN - 0.5) * 0.22;
  float topDist = h - topLimit;

  float shapeDist = max(distFromAxis, topDist * 1.35);
  float density = 1.0 - smoothstep(-0.14, 0.14, shapeDist);

  // Soft outer ionized mist halo hugging the cloud boundary
  float outerMist = exp(-max(0.0, shapeDist) * 7.5) * (0.45 + 0.55 * fineN) * 0.62;
  // Bright photo-evaporating ionization rim right along shapeDist ~ 0 (classic JWST Pillars look!)
  float ionRim = exp(-pow(shapeDist / 0.085, 2.0)) * (0.55 + 0.45 * fineN);

  // Clean horizontal & top margin fade so texture edges NEVER clip
  float edgeFade = smoothstep(0.0, 0.10, uv.x) * smoothstep(1.0, 0.90, uv.x) * smoothstep(0.0, 0.08, uv.y);

  // Deep velvety cosmic dust interior with glowing internal star-nursery pockets
  vec3 coreDark = vec3(0.020, 0.052, 0.058);
  vec3 coreMid = vec3(0.065, 0.180, 0.165);
  vec3 bodyCol = mix(coreDark, coreMid, clamp(cloudN * 0.72 + fineN * 0.28, 0.0, 1.0));

  vec3 rimCol = mix(vec3(${rimACol}), vec3(${rimBCol}), smoothstep(0.15, 0.85, uv.x + (w.y - 0.5) * 0.4));
  vec3 finalCol = bodyCol * density + rimCol * (ionRim * 1.15 + outerMist * 0.72);
  float alpha = clamp(max(density * 0.92, max(ionRim * 0.85, outerMist)) * edgeFade, 0.0, 1.0);
  gl_FragColor = vec4(finalCol * alpha, alpha);
}
`.trim();
}

/**
 * STAGE 3-1 & 3-2 ASSET: Distant Luminous Emerald-Amethyst Star Nursery Cloud (Zero white blowout!)
 */
const DISTANT_EMERALD_NEBULA_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  vec2 q = vec2(fbm5(p * 2.2 + vec2(1.4, -0.8)), fbm5(p * 2.2 + vec2(-2.1, 3.3)));
  float n1 = fbm5(p * 2.8 + q * 1.45);
  float n2 = fbm5(p * 4.6 - q * 1.1 + vec2(3.1, -1.6));
  float dustPocket = smoothstep(0.42, 0.76, fbm5(p * 3.4 + vec2(-1.2, 2.5)));

  float outerEnv = exp(-r * 2.3) * smoothstep(1.0, 0.42, r);
  float emeraldCloud = outerEnv * smoothstep(0.24, 0.82, n1) * (1.0 - dustPocket * 0.52);
  float violetHalo = outerEnv * smoothstep(0.30, 0.84, n2) * 0.78;
  float starCluster = exp(-r * r * 18.0) * 0.48;

  vec3 col = vec3(0.06, 0.78, 0.58) * emeraldCloud * 0.95
           + vec3(0.56, 0.24, 0.94) * violetHalo * 0.82
           + vec3(0.76, 0.98, 0.94) * starCluster;
  float a = clamp((emeraldCloud * 0.78 + violetHalo * 0.62 + starCluster * 0.65), 0.0, 0.88);
  gl_FragColor = vec4(col * a, a);
}
`;

/**
 * STAGE 3-2 & 3-3 ASSET: Crisp 4-Point JWST Diffraction Protostar Glint
 */
const PROTOSTAR_GLINT_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float core = exp(-r * r * 48.0);
  float halo = exp(-r * 6.0) * 0.42;
  float spikeH = exp(-abs(p.y) * 44.0) * exp(-abs(p.x) * 2.4) * 0.78;
  float spikeV = exp(-abs(p.x) * 44.0) * exp(-abs(p.y) * 2.4) * 0.78;
  float diagA = exp(-abs(p.x * 0.707 + p.y * 0.707) * 56.0) * exp(-r * 4.5) * 0.28;
  float diagB = exp(-abs(p.x * 0.707 - p.y * 0.707) * 56.0) * exp(-r * 4.5) * 0.28;

  float a = clamp((core + halo + spikeH + spikeV + diagA + diagB) * smoothstep(1.0, 0.45, r), 0.0, 1.0);
  vec3 col = vec3(1.0, 0.99, 0.96) * (core + spikeH * 0.7 + spikeV * 0.7)
           + vec3(0.45, 0.94, 1.0) * (halo + diagA + diagB + (spikeH + spikeV) * 0.35);
  gl_FragColor = vec4(col * a, a);
}
`;

/**
 * STAGE 3-3 SIGNATURE ASSET: Floating Double-Ended Crystal Hypergate Monolith
 * Complete faceted obsidian-indigo & gold diamond obelisk with sharp top & bottom crystal tips (zero chopped flat edges!)
 */
const HYPER_OBELISK_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float t = vTextureCoord.y; // 0 = outer crystal tip, 1 = inner spear tip

  // Elongated double-ended crystal blade: crisp upper cap (0.04..0.24) + long tapering lower spear (0.24..0.94)
  float upperW = mix(0.02, 0.34, smoothstep(0.04, 0.24, t));
  float lowerW = mix(0.34, 0.02, pow(clamp((t - 0.24) / 0.70, 0.0, 1.0), 0.88));
  float halfW = min(upperW, lowerW);
  float bodyMask = (1.0 - smoothstep(halfW - 0.022, halfW + 0.022, abs(p.x)))
                 * smoothstep(0.04, 0.06, t) * (1.0 - smoothstep(0.92, 0.95, t));

  // Crisp angled diamond shoulder wings at t = 0.20..0.44
  float wingY = abs((t - 0.31) / 0.13);
  float wingW = mix(0.56, 0.18, clamp(wingY, 0.0, 1.0));
  float wingMask = (1.0 - smoothstep(wingW - 0.02, wingW + 0.02, abs(p.x)))
                 * (1.0 - smoothstep(0.92, 1.0, wingY));
  float allMask = clamp(max(bodyMask, wingMask), 0.0, 1.0);

  if (allMask <= 0.01) {
    float tipAura = exp(-pow(p.x * 5.0, 2.0) - pow((t - 0.93) * 5.5, 2.0)) * 0.50;
    vec3 gc = vec3(0.24, 0.88, 1.0) * tipAura;
    gl_FragColor = vec4(gc, tipAura);
    return;
  }

  float sideFace = smoothstep(0.0, max(0.04, halfW), abs(p.x));
  vec3 indigoCrystal = mix(vec3(0.08, 0.06, 0.20), vec3(0.24, 0.15, 0.46), sideFace);
  float goldEdge = smoothstep(halfW - 0.055, halfW - 0.010, abs(p.x)) * bodyMask
                 + smoothstep(wingW - 0.045, wingW - 0.008, abs(p.x)) * wingMask * 0.75;

  // Sleek hairline electric-cyan tachyon channel running along the crystal spine
  float channel = exp(-pow(p.x / 0.032, 2.0)) * smoothstep(0.10, 0.24, t) * (1.0 - smoothstep(0.89, 0.94, t));
  float chevronTicks = smoothstep(0.80, 0.96, sin((t - abs(p.x) * 0.35) * 44.0)) * smoothstep(0.22, 0.72, t) * bodyMask;

  vec3 col = indigoCrystal
           + vec3(1.0, 0.82, 0.34) * (goldEdge * 0.82 + chevronTicks * 0.30)
           + vec3(0.18, 0.94, 1.0) * channel * 1.38;

  gl_FragColor = vec4(col * allMask, allMask);
}
`;

/**
 * STAGE 3-3 SIGNATURE ASSET: Ethereal Perspective Tachyon Starway Lattice
 * Delicate hairline holographic starlight perspective bridge (never thick neon bars!)
 */
const ASTRAL_LATTICE_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 uv = vTextureCoord;
  if (uv.y < 0.06) { gl_FragColor = vec4(0.0); return; }

  float depth = smoothstep(0.06, 0.94, uv.y);
  float perspZ = 1.0 / max(0.12, depth);
  float horizLines = exp(-pow(abs(fract(perspZ * 1.45) - 0.5) / 0.026, 2.0));

  float rails = exp(-pow(abs(fract(uv.x * 6.0) - 0.5) / 0.014, 2.0));
  float starNodes = exp(-pow(abs(fract(uv.x * 6.0) - 0.5) / 0.042, 2.0)) * horizLines;

  float edgeFade = smoothstep(0.06, 0.28, uv.y) * smoothstep(1.0, 0.84, uv.y);
  float glowBase = pow(depth, 1.8) * 0.16 * edgeFade;
  float gridVal = clamp((horizLines * 0.65 + rails * 0.55 + starNodes * 0.85) * edgeFade, 0.0, 1.0);

  vec3 col = mix(vec3(0.54, 0.24, 0.96), vec3(0.16, 0.88, 1.0), smoothstep(0.15, 0.85, depth)) * (gridVal + glowBase)
           + vec3(1.0, 0.86, 0.42) * starNodes * edgeFade * 0.62;
  float alpha = clamp((gridVal * 0.64 + glowBase), 0.0, 0.72);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

/**
 * STAGE 3-3 FINALE SIGNATURE ASSET: Cenit-Omega Octagonal Star-Prism Hypergate!
 * Crisp octagonal crystalline hypergate geometry framing an intricate 8-point prismatic starlight core (zero white blowout!)
 */
const ZENITH_HYPERGATE_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

float sdOctagon(vec2 p, float r) {
  const vec3 k = vec3(-0.9238795325, 0.3826834323, 0.4142135623);
  p = abs(p);
  p -= 2.0 * min(dot(vec2(k.x, k.y), p), 0.0) * vec2(k.x, k.y);
  p -= 2.0 * min(dot(vec2(-k.x, k.y), p), 0.0) * vec2(-k.x, k.y);
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  float dOctOut = sdOctagon(p, 0.84);
  float dOctMid = sdOctagon(p, 0.68);
  float dOctRot = sdOctagon(mat2(0.9238, -0.3827, 0.3827, 0.9238) * p, 0.76);

  float frameOut = exp(-pow(dOctOut / 0.011, 2.0));
  float frameMid = exp(-pow(dOctMid / 0.008, 2.0)) * 0.85;
  float frameRot = exp(-pow(dOctRot / 0.0065, 2.0)) * 0.72;

  // Sleek tapered golden vertex brackets at the 8 octagon corners
  float vertexRays = smoothstep(0.955, 0.992, abs(cos(ang * 4.0)));
  float brackets = vertexRays * smoothstep(0.63, 0.66, r) * (1.0 - smoothstep(0.87, 0.90, r));

  // Intricate 8-Point Prismatic Starlight Aperture (deep indigo-violet swirl + razor cyan-gold 8-point star rays!)
  float starShape = 0.5 + 0.5 * cos(ang * 8.0);
  float starRays = pow(starShape, 4.5) * exp(-r * 2.5) * smoothstep(0.90, 0.46, r);
  float innerNeb = fbm5(vec2(cos(ang * 2.0 - r * 3.0) * 2.4, sin(ang * 2.0 - r * 3.0) * 2.4) + r * 3.0);
  float prismField = (1.0 - smoothstep(0.32, 0.64, r)) * (0.36 + 0.64 * innerNeb);
  float tightCore = exp(-r * r * 42.0);
  float innerPrismRing = exp(-pow((r - 0.30) / 0.008, 2.0)) * 0.75;
  float fineRing = exp(-pow((r - 0.50) / 0.004, 2.0)) * 0.62;

  vec3 astralViolet = vec3(0.46, 0.16, 0.92);
  vec3 tachyonCyan = vec3(0.12, 0.88, 1.0);
  vec3 imperialGold = vec3(1.0, 0.82, 0.32);

  vec3 apertureCol = mix(astralViolet, tachyonCyan, clamp(prismField * 0.85 + starRays * 0.85, 0.0, 1.0)) * (prismField * 0.66 + starRays * 0.92)
                   + imperialGold * innerPrismRing * 0.80
                   + vec3(0.98, 0.97, 1.0) * tightCore * 0.88;
  vec3 frameCol = imperialGold * (frameOut * 1.05 + brackets * 0.92)
                + tachyonCyan * (frameMid * 1.00 + fineRing * 0.85)
                + astralViolet * frameRot * 1.05;

  vec3 col = apertureCol + frameCol;
  float alpha = clamp(
    (prismField * 0.64 + starRays * 0.82 + tightCore * 0.88 + innerPrismRing * 0.70 + frameOut * 0.92 + frameMid * 0.82 + frameRot * 0.72 + brackets * 0.88 + fineRing * 0.65)
    * smoothstep(1.0, 0.82, r),
    0.0,
    1.0
  );
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const ASTRAL_BEAM_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 uv = vTextureCoord;
  float xFade = smoothstep(0.0, 0.20, uv.x) * (1.0 - smoothstep(0.56, 1.0, uv.x));
  float spread = mix(0.06, 0.44, uv.x);
  float yDist = abs(uv.y - 0.5) / max(0.02, spread);
  float cone = exp(-yDist * yDist * 3.0);
  float a = clamp(xFade * cone * 0.75, 0.0, 1.0);
  vec3 col = mix(vec3(0.92, 0.98, 1.0), vec3(0.36, 0.82, 1.0), uv.x);
  gl_FragColor = vec4(col * a, a);
}
`;

const SOFT_DOT_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float g = exp(-r * r * 5.2) * smoothstep(1.0, 0.15, r);
  gl_FragColor = vec4(vec3(g), g);
}
`;

const WARP_STREAK_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
void main(void) {
  vec2 uv = vTextureCoord;
  float xFade = smoothstep(0.0, 0.18, uv.x) * (1.0 - smoothstep(0.65, 1.0, uv.x));
  float yFade = exp(-pow((uv.y - 0.5) * 5.2, 2.0));
  float a = clamp(xFade * yFade, 0.0, 1.0);
  gl_FragColor = vec4(vec3(a), a);
}
`;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x >= e1 ? 1 : 0;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function pulseBell(x: number, center: number, halfWidth: number): number {
  const d = Math.abs(x - center) / Math.max(0.001, halfWidth);
  if (d >= 1) return 0;
  const t = 1 - d;
  return t * t * (3 - 2 * t);
}

function seeded01(idx: number, salt: number): number {
  const s = Math.sin(idx * 127.1 + salt * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function isWorld3NormalStage(id?: string): id is World3StageId {
  return id === 'normal-3-1' || id === 'normal-3-2' || id === 'normal-3-3';
}

/**
 * Cohesive Continuous Space Director for World 3 Normal — Alcance Nebular (`3-1`, `3-2`, `3-3`).
 *
 * Unbroken forward journey across deep interstellar reaches (100% distinct from World 1 & World 2):
 *   • 3-1 Estela del Cometa Crioanular: Ride the dual luminous ion/dust tail of a giant Cryo-Comet amid faceted ice prisms -> Overtake its coma -> Arrive at the Emerald Nebula horizon
 *   • 3-2 Nebulosa Jónica Esmeralda:    Plunge straight into JWST-style towering Emerald/Amethyst Cosmic Dust Pillars & Protostars -> Ionized Aurora Canyon -> Reach the inner Viridian Eye where the Hypergate glimmers ahead
 *   • 3-3 Cenit del Hiperportal:        Enter the Perspective Astral Starway & Split-Chevron Crystal Monoliths -> Parsec Hyperspace Corridor -> Octagonal Star-Prism Zenith-Omega Hypergate Finale
 */
export class World3SpaceDirector {
  private parentContainer: PIXI.Container;
  private renderer: PIXI.IRenderer;
  private width: number;
  private height: number;
  private activeStageId: World3StageId;

  private root = new PIXI.Container();
  private starGroup = new PIXI.Container();
  private worldGroup = new PIXI.Container();
  private ribbonGroup = new PIXI.Container();
  private crystalGroup = new PIXI.Container();
  private pillarFarGroup = new PIXI.Container();
  private protostarGroup = new PIXI.Container();
  private pillarNearGroup = new PIXI.Container();
  private latticeGroup = new PIXI.Container();
  private obeliskGroup = new PIXI.Container();
  private zenithGroup = new PIXI.Container();
  private moteGroup = new PIXI.Container();
  private streakGroup = new PIXI.Container();

  private bakedTextures: Map<string, PIXI.RenderTexture> = new Map();
  private auxTextures: PIXI.Texture[] = [];

  private nebulaSprite!: PIXI.Sprite;
  private distantEmeraldSprite!: PIXI.Sprite;
  private cometSprite!: PIXI.Sprite;
  private cometGlintSprite!: PIXI.Sprite;
  private beamA!: PIXI.Sprite;
  private beamB!: PIXI.Sprite;
  private ribbonBack!: PIXI.TilingSprite;
  private ribbonFront!: PIXI.TilingSprite;
  private latticeTop!: PIXI.TilingSprite;
  private latticeBot!: PIXI.TilingSprite;
  private zenithOuter!: PIXI.Sprite;
  private zenithInner!: PIXI.Sprite;
  private zenithStar!: PIXI.Sprite;
  private phaseVeilSprite!: PIXI.Sprite;
  private leftVeilSprite!: PIXI.Sprite;

  private stars: ParallaxStar[] = [];
  private motes: FrostMote[] = [];
  private streaks: WarpStreak[] = [];
  private iceShards: IceShard[] = [];
  private nebulaPillars: NebulaPillarNode[] = [];
  private protostars: ProtoStarGlint[] = [];
  private obeliskPairs: HyperObeliskPair[] = [];
  private lastClockTime: number = 0;

  constructor(
    parentContainer: PIXI.Container,
    renderer: PIXI.IRenderer,
    stageId: World3StageId = 'normal-3-1',
    width: number = 1024,
    height: number = 576
  ) {
    this.parentContainer = parentContainer;
    this.renderer = renderer;
    this.activeStageId = stageId;
    this.width = width;
    this.height = height;

    this.bakeAllTextures();
    this.buildSceneGraph();
    this.applyStagePalette(stageId);
    this.parentContainer.addChild(this.root);
    this.update({ stageTime: 0, clockTime: 0, playerX: 220, playerY: height * 0.5 });
  }

  public setStage(stageId: World3StageId): void {
    if (this.activeStageId === stageId) return;
    this.activeStageId = stageId;
    this.applyStagePalette(stageId);
    this.update({ stageTime: 0, clockTime: this.lastClockTime, playerX: 220, playerY: this.height * 0.5 });
  }

  private bakeTexture(id: string, w: number, h: number, fragmentSrc: string): PIXI.RenderTexture | null {
    const webgl = this.renderer as PIXI.Renderer;
    if (typeof webgl?.render !== 'function') return null;

    const geo = new PIXI.Geometry()
      .addAttribute('aVertexPosition', [0, 0, w, 0, w, h, 0, h], 2)
      .addAttribute('aUvs', [0, 0, 1, 0, 1, 1, 0, 1], 2)
      .addIndex([0, 1, 2, 0, 2, 3]);

    const shader = PIXI.Shader.from(BAKE_VERTEX_SRC, fragmentSrc, {});
    const mesh = new PIXI.Mesh(geo, shader);
    const rt = PIXI.RenderTexture.create({
      width: w,
      height: h,
      resolution: 1,
      scaleMode: PIXI.SCALE_MODES.LINEAR,
    });

    webgl.render(mesh, { renderTexture: rt, clear: true });
    mesh.destroy();
    shader.destroy();
    geo.destroy();

    this.bakedTextures.set(id, rt);
    return rt;
  }

  private tex(id: string): PIXI.Texture {
    return this.bakedTextures.get(id) ?? PIXI.Texture.WHITE;
  }

  private bakeAllTextures(): void {
    // 3 distinct cohesive Alcance Nebular skies: Glacial Arctic Oort -> Deep Emerald-Amethyst Nursery -> Royal Astral Hypergate
    this.bakeTexture(
      'sky3_1',
      512,
      288,
      buildDeepReachSkyFrag('0.008, 0.024, 0.062', '0.018, 0.066, 0.132', '0.042, 0.215, 0.390', '0.075, 0.420, 0.540', '0.580, 0.880, 1.000', '0.3, -0.4')
    );
    this.bakeTexture(
      'sky3_2',
      512,
      288,
      buildDeepReachSkyFrag('0.008, 0.040, 0.036', '0.032, 0.078, 0.088', '0.032, 0.310, 0.240', '0.240, 0.115, 0.420', '0.160, 0.780, 0.680', '2.5, 1.4')
    );
    this.bakeTexture(
      'sky3_3',
      512,
      288,
      buildDeepReachSkyFrag('0.014, 0.010, 0.056', '0.052, 0.028, 0.145', '0.185, 0.082, 0.420', '0.045, 0.320, 0.480', '0.780, 0.620, 0.240', '-2.1, 2.2')
    );

    this.bakeTexture('cryoComet', 512, 256, CRYO_COMET_FRAG);
    this.bakeTexture('iceCrystalA', 144, 144, buildIceCrystalFrag('1.85', '0.32'));
    this.bakeTexture('iceCrystalB', 144, 144, buildIceCrystalFrag('1.35', '-0.48'));
    this.bakeTexture('ionVeil', 512, 192, ION_VEIL_RIBBON_FRAG);
    this.bakeTexture('distantEmerald', 384, 384, DISTANT_EMERALD_NEBULA_FRAG);
    this.bakeTexture(
      'pillarEmerald',
      384,
      448,
      buildNebulaPillarFrag('1.2', '0.8', '0.12, 0.90, 0.64', '0.18, 0.78, 0.96')
    );
    this.bakeTexture(
      'pillarAmethyst',
      384,
      448,
      buildNebulaPillarFrag('4.6', '-1.9', '0.70, 0.34, 1.00', '0.16, 0.88, 0.72')
    );
    this.bakeTexture('protoStar', 128, 128, PROTOSTAR_GLINT_FRAG);
    this.bakeTexture('hyperObelisk', 224, 320, HYPER_OBELISK_FRAG);
    this.bakeTexture('astralLattice', 512, 192, ASTRAL_LATTICE_FRAG);
    this.bakeTexture('zenithGate', 512, 512, ZENITH_HYPERGATE_FRAG);
    this.bakeTexture('astralBeam', 256, 128, ASTRAL_BEAM_FRAG);
    this.bakeTexture('softDot', 64, 64, SOFT_DOT_FRAG);
    this.bakeTexture('warpStreak', 128, 16, WARP_STREAK_FRAG);
  }

  private createLeftVeilTexture(): PIXI.Texture {
    if (typeof document === 'undefined') return PIXI.Texture.WHITE;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 4;
    const ctx = canvas.getContext('2d');
    if (!ctx) return PIXI.Texture.WHITE;
    const grad = ctx.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, 'rgba(3, 8, 20, 0.90)');
    grad.addColorStop(0.55, 'rgba(3, 8, 20, 0.32)');
    grad.addColorStop(1, 'rgba(3, 8, 20, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 4);
    const t = PIXI.Texture.from(canvas);
    this.auxTextures.push(t);
    return t;
  }

  private buildSceneGraph(): void {
    // 1. Deep Interstellar Sky Backdrop
    this.nebulaSprite = new PIXI.Sprite(this.tex('sky3_1'));
    this.nebulaSprite.anchor.set(0.5);
    this.nebulaSprite.position.set(this.width * 0.5, this.height * 0.5);
    this.root.addChild(this.nebulaSprite);

    // 2. Crisp Circular Parallax Starfield (136 stars)
    const dotTex = this.tex('softDot');
    for (let i = 0; i < 136; i++) {
      const sprite = new PIXI.Sprite(dotTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      const tier = i % 3;
      const sz = tier === 0 ? 1.8 : tier === 1 ? 3.1 : 5.0;
      sprite.width = sz;
      sprite.height = sz;
      this.starGroup.addChild(sprite);
      this.stars.push({
        sprite,
        xNorm: seeded01(i, 2.1),
        yNorm: seeded01(i, 3.7),
        speed: tier === 0 ? 0.008 : tier === 1 ? 0.025 : 0.058,
        phase: seeded01(i, 5.1) * Math.PI * 2,
        twinkleRate: 1.4 + seeded01(i, 6.7) * 3.0,
        baseAlpha: tier === 0 ? 0.36 : tier === 1 ? 0.62 : 0.86,
        parallax: tier === 0 ? 6 : tier === 1 ? 15 : 28,
      });
    }
    this.root.addChild(this.starGroup);

    // 3. World Camera Group (Distant Emerald Nebula, Giant Cryo-Comet, Volumetric Astral Beams)
    this.worldGroup.position.set(this.width * 0.5, this.height * 0.5);
    this.root.addChild(this.worldGroup);

    this.distantEmeraldSprite = new PIXI.Sprite(this.tex('distantEmerald'));
    this.distantEmeraldSprite.anchor.set(0.5);
    this.distantEmeraldSprite.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.distantEmeraldSprite);

    this.beamA = new PIXI.Sprite(this.tex('astralBeam'));
    this.beamA.anchor.set(0.05, 0.5);
    this.beamA.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.beamA);

    this.beamB = new PIXI.Sprite(this.tex('astralBeam'));
    this.beamB.anchor.set(0.05, 0.5);
    this.beamB.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.beamB);

    this.cometSprite = new PIXI.Sprite(this.tex('cryoComet'));
    this.cometSprite.anchor.set(0.76, 0.46);
    this.cometSprite.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.cometSprite);

    this.cometGlintSprite = new PIXI.Sprite(this.tex('protoStar'));
    this.cometGlintSprite.anchor.set(0.5);
    this.cometGlintSprite.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.cometGlintSprite);

    // 4. Stage 3-2 Far Cosmic Dust Pillars (JWST Emerald & Amethyst Nebula Clouds)
    const pEmTex = this.tex('pillarEmerald');
    const pAmTex = this.tex('pillarAmethyst');
    for (let i = 0; i < 8; i++) {
      const isTop = i % 2 === 1;
      const depthTier = i < 4 ? 0 : 1; // 4 far pillars, 4 closer framing pillars
      const sprite = new PIXI.Sprite(i % 3 === 0 ? pAmTex : pEmTex);
      sprite.anchor.set(0.5, 1.0);
      const scaleX = depthTier === 0 ? 0.85 + seeded01(i, 61) * 0.32 : 1.02 + seeded01(i, 62) * 0.36;
      const scaleY = depthTier === 0 ? 0.56 + seeded01(i, 63) * 0.18 : 0.66 + seeded01(i, 64) * 0.18;
      if (isTop) {
        sprite.scale.set(scaleX, -scaleY);
      } else {
        sprite.scale.set(scaleX, scaleY);
      }
      if (depthTier === 0) {
        this.pillarFarGroup.addChild(sprite);
      } else {
        this.pillarNearGroup.addChild(sprite);
      }
      this.nebulaPillars.push({
        sprite,
        xPos: (i / 8) * (this.width + 420) - 100,
        isTop,
        depthTier,
        speedPx: depthTier === 0 ? 44 : 112,
        baseScaleX: scaleX,
        baseScaleY: scaleY,
        baseYOffset: depthTier === 0 ? 18 : 26,
        parallax: depthTier === 0 ? 12 : 28,
      });
    }
    this.root.addChild(this.pillarFarGroup);

    // 5. Stage 3-1 & 3-2: Dual-Layer Flowing Glacial Ion Wake / Emerald-Violet Nebula Ribbons
    // Keep height <= Math.floor(192 * tileScale.y) so there is ZERO vertical wrapping!
    const veilTex = this.tex('ionVeil');
    this.ribbonBack = new PIXI.TilingSprite(veilTex, this.width + 240, 230);
    this.ribbonBack.anchor.set(0, 0.5);
    this.ribbonBack.blendMode = PIXI.BLEND_MODES.ADD;
    this.ribbonBack.tileScale.set(1.65, 1.25);
    this.ribbonGroup.addChild(this.ribbonBack);

    this.ribbonFront = new PIXI.TilingSprite(veilTex, this.width + 240, 200);
    this.ribbonFront.anchor.set(0, 0.5);
    this.ribbonFront.blendMode = PIXI.BLEND_MODES.ADD;
    this.ribbonFront.tileScale.set(1.25, 1.08);
    this.ribbonGroup.addChild(this.ribbonFront);
    this.root.addChild(this.ribbonGroup);

    // 6. Stage 3-2: Sparkling Newborn Protostar Diffraction Glints tucked inside the Star Nursery
    const protoTex = this.tex('protoStar');
    const protoColors = [0xa7f3d0, 0xe0f2fe, 0xd8b4fe, 0xfef08a, 0x67e8f9];
    for (let i = 0; i < 12; i++) {
      const sprite = new PIXI.Sprite(protoTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      this.protostarGroup.addChild(sprite);
      this.protostars.push({
        sprite,
        xPos: seeded01(i, 71) * (this.width + 180),
        yNorm: 0.10 + seeded01(i, 72) * 0.80,
        speedPx: 32 + seeded01(i, 73) * 65,
        baseScale: 0.24 + seeded01(i, 74) * 0.42,
        phase: seeded01(i, 75) * Math.PI * 2,
        tint: protoColors[i % protoColors.length],
      });
    }
    this.root.addChild(this.protostarGroup);
    this.root.addChild(this.pillarNearGroup);

    // 7. Stage 3-1: Multi-Depth Faceted Diamond/Hex Cryo Ice Prisms
    const cryA = this.tex('iceCrystalA');
    const cryB = this.tex('iceCrystalB');
    for (let i = 0; i < 18; i++) {
      const depthTier = i % 3;
      const sprite = new PIXI.Sprite(i % 2 === 0 ? cryA : cryB);
      sprite.anchor.set(0.5);
      const baseScale =
        depthTier === 0
          ? 0.14 + seeded01(i, 81) * 0.08
          : depthTier === 1
            ? 0.24 + seeded01(i, 82) * 0.14
            : 0.38 + seeded01(i, 83) * 0.18;
      this.crystalGroup.addChild(sprite);
      this.iceShards.push({
        sprite,
        xPos: seeded01(i, 84) * (this.width + 240) - 60,
        yNorm: 0.08 + seeded01(i, 85) * 0.84,
        speedPx: depthTier === 0 ? 78 : depthTier === 1 ? 175 : 310,
        vyPx: (seeded01(i, 86) - 0.5) * 28,
        rotSpeed: (seeded01(i, 87) - 0.5) * 1.1,
        baseScale,
        parallax: depthTier === 0 ? 10 : depthTier === 1 ? 22 : 36,
        depthTier,
      });
    }
    this.root.addChild(this.crystalGroup);

    // 8. Stage 3-3: Perspective Tachyon Astral Starway Lattice (Bottom & Mirrored Top Ceiling)
    // Height 168 <= Math.floor(192 * 0.90) -> ZERO vertical wrap!
    const latTex = this.tex('astralLattice');
    this.latticeBot = new PIXI.TilingSprite(latTex, this.width + 180, 168);
    this.latticeBot.tileScale.set(1.1, 0.92);
    this.latticeBot.blendMode = PIXI.BLEND_MODES.ADD;
    this.latticeGroup.addChild(this.latticeBot);

    this.latticeTop = new PIXI.TilingSprite(latTex, this.width + 180, 168);
    this.latticeTop.tileScale.set(1.1, 0.92);
    this.latticeTop.scale.y = -1;
    this.latticeTop.blendMode = PIXI.BLEND_MODES.ADD;
    this.latticeGroup.addChild(this.latticeTop);
    this.root.addChild(this.latticeGroup);

    // 9. Stage 3-3: 4 Perspective Pairs of Floating Split-Chevron Crystal Hypergate Monoliths!
    const obTex = this.tex('hyperObelisk');
    for (let i = 0; i < 4; i++) {
      const topSprite = new PIXI.Sprite(obTex);
      topSprite.anchor.set(0.5, 0.0);
      const botSprite = new PIXI.Sprite(obTex);
      botSprite.anchor.set(0.5, 0.0);
      botSprite.scale.y = -1;
      this.obeliskGroup.addChild(topSprite, botSprite);
      this.obeliskPairs.push({ topSprite, botSprite, slotIndex: i });
    }
    this.root.addChild(this.obeliskGroup);

    // 10. Stage 3-3 Finale (and Distant Preview in 3-2 Phase 3): Cenit-Omega Octagonal Star-Prism Hypergate!
    const zenTex = this.tex('zenithGate');
    this.zenithOuter = new PIXI.Sprite(zenTex);
    this.zenithOuter.anchor.set(0.5);
    this.zenithOuter.blendMode = PIXI.BLEND_MODES.ADD;
    this.zenithGroup.addChild(this.zenithOuter);

    this.zenithInner = new PIXI.Sprite(zenTex);
    this.zenithInner.anchor.set(0.5);
    this.zenithInner.blendMode = PIXI.BLEND_MODES.ADD;
    this.zenithGroup.addChild(this.zenithInner);

    this.zenithStar = new PIXI.Sprite(protoTex);
    this.zenithStar.anchor.set(0.5);
    this.zenithStar.blendMode = PIXI.BLEND_MODES.ADD;
    this.zenithGroup.addChild(this.zenithStar);
    this.root.addChild(this.zenithGroup);

    // 11. Drifting Cryo-Frost / Ion-Spore / Tachyon Motes (38 pooled)
    for (let i = 0; i < 38; i++) {
      const sprite = new PIXI.Sprite(dotTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      this.moteGroup.addChild(sprite);
      this.motes.push({
        sprite,
        xPos: seeded01(i, 91.3) * (this.width + 160),
        yNorm: seeded01(i, 92.7),
        speedPx: 40 + seeded01(i, 93.4) * 92,
        driftPhase: seeded01(i, 94.2) * Math.PI * 2,
        baseAlpha: 0.16 + seeded01(i, 95.1) * 0.30,
        scale: 0.08 + seeded01(i, 96.1) * 0.18,
        parallax: 18 + seeded01(i, 96.9) * 26,
      });
    }
    this.root.addChild(this.moteGroup);

    // 12. Dynamic Cryo-Tail / Nebula-Current / Parsec-Warp Speedlines (44 pooled)
    const streakTex = this.tex('warpStreak');
    for (let i = 0; i < 44; i++) {
      const sprite = new PIXI.Sprite(streakTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      this.streakGroup.addChild(sprite);
      const widthPx = 80 + seeded01(i, 101.2) * 170;
      const heightPx = 1.4 + seeded01(i, 102.8) * 2.2;
      sprite.width = widthPx;
      sprite.height = heightPx;
      this.streaks.push({
        sprite,
        xPos: seeded01(i, 103.4) * (this.width + 260),
        yNorm: seeded01(i, 104.9),
        speedPx: 420 + seeded01(i, 105.7) * 580,
        baseAlpha: 0.12 + seeded01(i, 106.3) * 0.24,
        widthPx,
        heightPx,
        angle: 0,
      });
    }
    this.root.addChild(this.streakGroup);

    // 13. Smooth Internal Phase-Transition Shimmer Veil (ADD)
    this.phaseVeilSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.phaseVeilSprite.width = this.width;
    this.phaseVeilSprite.height = this.height;
    this.phaseVeilSprite.blendMode = PIXI.BLEND_MODES.ADD;
    this.phaseVeilSprite.alpha = 0;
    this.root.addChild(this.phaseVeilSprite);

    // 14. Subtle Left-Lane Combat Contrast Vignette
    this.leftVeilSprite = new PIXI.Sprite(this.createLeftVeilTexture());
    this.leftVeilSprite.width = Math.round(this.width * 0.36);
    this.leftVeilSprite.height = this.height;
    this.leftVeilSprite.alpha = 0.22;
    this.root.addChild(this.leftVeilSprite);
  }

  private applyStagePalette(stageId: World3StageId): void {
    const starPalettes: Record<World3StageId, number[]> = {
      'normal-3-1': [0xffffff, 0xe0f2fe, 0x67e8f9, 0x38bdf8, 0xbae6fd],
      'normal-3-2': [0xffffff, 0xa7f3d0, 0x34d399, 0xc084fc, 0x67e8f9],
      'normal-3-3': [0xffffff, 0x00f2fe, 0xc084fc, 0xffdd55, 0xe0f2fe],
    };
    const motePalettes: Record<World3StageId, number[]> = {
      'normal-3-1': [0xe0f2fe, 0x67e8f9, 0x38bdf8, 0xffffff],
      'normal-3-2': [0x34d399, 0xa855f7, 0x67e8f9, 0xd1fae5],
      'normal-3-3': [0x00f2fe, 0xa855f7, 0xffdd55, 0xffffff],
    };
    const streakPalettes: Record<World3StageId, [number, number]> = {
      'normal-3-1': [0x67e8f9, 0xe0f2fe],
      'normal-3-2': [0x34d399, 0xc084fc],
      'normal-3-3': [0x00f2fe, 0xffdd55],
    };

    const skyKey = stageId === 'normal-3-2' ? 'sky3_2' : stageId === 'normal-3-3' ? 'sky3_3' : 'sky3_1';
    this.nebulaSprite.texture = this.tex(skyKey);

    const sp = starPalettes[stageId];
    for (let i = 0; i < this.stars.length; i++) {
      this.stars[i].sprite.tint = sp[i % sp.length];
    }

    const mp = motePalettes[stageId];
    for (let i = 0; i < this.motes.length; i++) {
      this.motes[i].sprite.tint = mp[i % mp.length];
    }

    const [stA, stB] = streakPalettes[stageId];
    for (let i = 0; i < this.streaks.length; i++) {
      this.streaks[i].sprite.tint = i % 3 === 0 ? stB : stA;
      this.streaks[i].angle = stageId === 'normal-3-1' ? -0.10 : 0;
      this.streaks[i].sprite.rotation = this.streaks[i].angle;
    }
  }

  public update(ctx: World3FrameContext): void {
    const t = Math.max(0, ctx.stageTime);
    const clk = ctx.clockTime;
    const dt = this.lastClockTime > 0 ? Math.min(0.1, Math.max(0, clk - this.lastClockTime)) : 1 / 60;
    this.lastClockTime = clk;

    const pxNorm = clamp01(ctx.playerX / Math.max(1, this.width)) - 0.5;
    const pyNorm = clamp01(ctx.playerY / Math.max(1, this.height)) - 0.5;
    const bossBoost = ctx.bossActive ? 1.0 : 0.0;

    // Cleanly reset optional layers
    this.distantEmeraldSprite.visible = false;
    this.cometSprite.visible = false;
    this.cometGlintSprite.visible = false;
    this.ribbonGroup.visible = false;
    this.crystalGroup.visible = false;
    this.pillarFarGroup.visible = false;
    this.protostarGroup.visible = false;
    this.pillarNearGroup.visible = false;
    this.latticeGroup.visible = false;
    this.obeliskGroup.visible = false;
    this.zenithGroup.visible = false;
    this.beamA.visible = false;
    this.beamB.visible = false;
    this.phaseVeilSprite.alpha = 0;

    if (this.activeStageId === 'normal-3-1') {
      this.updateStage3_1(t, clk, dt, pxNorm, pyNorm, bossBoost);
    } else if (this.activeStageId === 'normal-3-2') {
      this.updateStage3_2(t, clk, dt, pxNorm, pyNorm, bossBoost);
    } else {
      this.updateStage3_3(t, clk, dt, pxNorm, pyNorm, bossBoost);
    }
    this.phaseVeilSprite.visible = this.phaseVeilSprite.alpha > 0.005;
  }

  private updateCommonParticles(
    clk: number,
    dt: number,
    pxNorm: number,
    pyNorm: number,
    starSpeedMult: number,
    moteAlpha: number,
    streakAlpha: number,
    streakSpeedMult: number
  ): void {
    for (const s of this.stars) {
      s.xNorm = (s.xNorm - s.speed * starSpeedMult * dt + 1.0) % 1.0;
      s.sprite.position.set(
        s.xNorm * this.width - pxNorm * s.parallax,
        s.yNorm * this.height - pyNorm * s.parallax * 0.65
      );
      s.sprite.alpha = s.baseAlpha * (0.72 + 0.28 * Math.sin(clk * s.twinkleRate + s.phase));
    }

    for (const m of this.motes) {
      m.xPos -= m.speedPx * starSpeedMult * dt;
      if (m.xPos < -60) m.xPos = this.width + 60;
      m.sprite.position.set(
        m.xPos - pxNorm * m.parallax,
        m.yNorm * this.height + Math.sin(clk * 0.95 + m.driftPhase) * 15 - pyNorm * m.parallax
      );
      m.sprite.scale.set(m.scale);
      m.sprite.alpha = m.baseAlpha * moteAlpha;
    }

    this.streakGroup.visible = streakAlpha > 0.01;
    if (this.streakGroup.visible) {
      for (const st of this.streaks) {
        st.xPos -= st.speedPx * streakSpeedMult * dt;
        if (st.xPos < -st.widthPx) st.xPos = this.width + st.widthPx;
        const yOff = st.angle !== 0 ? (this.width - st.xPos) * Math.sin(st.angle) * 0.22 : 0;
        st.sprite.position.set(st.xPos, (((st.yNorm * this.height + yOff) % this.height) + this.height) % this.height);
        st.sprite.alpha = st.baseAlpha * streakAlpha;
      }
    }
  }

  /**
   * STAGE 3-1: Estela del Cometa Crioanular (144s + Boss)
   *   Phase 1 (0–48s):    Cola de Polvo y Hielo — Giant luminous Cryo-Comet streaks ahead-right, dual blue/white tail spans the sky amid faceted ice prisms!
   *   Phase 2 (48–100s):  Cruce de la Coma Criogénica — Surging right alongside & through the comet's dazzling sublimating frost-mist wake!
   *   Phase 3 (100–144s+): Borde de la Nebulosa Esmeralda — Overtaking the comet nucleus as the glowing Emerald-Violet Nebula blooms large ahead (direct entry into 3-2!)
   */
  private updateStage3_1(t: number, clk: number, dt: number, pxNorm: number, pyNorm: number, bossBoost: number): void {
    const p2 = smoothstep(44, 54, t);
    const p3 = smoothstep(96, 108, t);
    const inComa = p2 * (1 - p3);
    const trans12 = pulseBell(t, 49, 5.5);
    const trans23 = pulseBell(t, 102, 6.0);

    // Glacial arctic-sapphire deep space sky
    this.nebulaSprite.x = this.width * 0.5 - pxNorm * 14 + Math.sin(clk * 0.06) * 16;
    this.nebulaSprite.y = this.height * 0.5 - pyNorm * 10;
    const nebScale = 1.18 + p2 * 0.06 + p3 * 0.08;
    this.nebulaSprite.scale.set(
      (this.width * nebScale) / Math.max(1, this.nebulaSprite.texture.width),
      (this.height * nebScale) / Math.max(1, this.nebulaSprite.texture.height)
    );

    this.worldGroup.scale.set(lerp(0.92, 1.04, p2) + p3 * 0.08);
    this.worldGroup.rotation = lerp(-0.02, -0.065, inComa) + p3 * 0.03 + Math.sin(clk * 0.22) * 0.01;
    this.worldGroup.position.set(this.width * 0.5 - pxNorm * 22, this.height * 0.5 - pyNorm * 15);

    // Destination Foreshadowing: Glowing Emerald-Amethyst Ion Nebula blooms larger on the right across Phase 1 -> Phase 3!
    this.distantEmeraldSprite.visible = true;
    this.distantEmeraldSprite.position.set(
      lerp(this.width * 0.34, this.width * 0.22, p3),
      lerp(-this.height * 0.24, -this.height * 0.04, p3)
    );
    this.distantEmeraldSprite.scale.set(lerp(0.45, 0.72, p2) + p3 * 1.15);
    this.distantEmeraldSprite.rotation = clk * 0.015;
    this.distantEmeraldSprite.alpha = 0.24 + p2 * 0.14 + p3 * 0.56;

    // Colossal Cryo-Comet: approaches huge in Phase 1 & 2, then passes overhead-left in Phase 3 as you overtake its head!
    this.cometSprite.visible = true;
    const cometX = lerp(this.width * 0.28, this.width * 0.14, p2) - p3 * (this.width * 0.36);
    const cometY = lerp(-this.height * 0.14, -this.height * 0.04, p2) - p3 * (this.height * 0.16) + Math.sin(clk * 0.35) * 6;
    const cometScale = lerp(1.38, 1.95, p2) - p3 * 0.45;
    this.cometSprite.position.set(cometX, cometY);
    this.cometSprite.scale.set(cometScale);
    this.cometSprite.rotation = -0.18 + Math.sin(clk * 0.2) * 0.015;
    this.cometSprite.alpha = 0.96 - p3 * 0.22;

    // Sparkling 4-point ice diffraction core glint right on the comet nucleus!
    this.cometGlintSprite.visible = true;
    const pulse = 1.0 + Math.sin(clk * 2.2) * 0.08 + bossBoost * 0.12;
    this.cometGlintSprite.position.set(cometX, cometY);
    this.cometGlintSprite.scale.set((0.88 + inComa * 0.48 - p3 * 0.25) * pulse);
    this.cometGlintSprite.rotation = clk * 0.12;
    this.cometGlintSprite.tint = 0xe0f2fe;
    this.cometGlintSprite.alpha = 0.84 - p3 * 0.18;

    // Dual Glacial Ion Wake Ribbons (silky icy blue & crystalline white streaming diagonally behind the comet!)
    const wakeVis = clamp01(0.24 + inComa * 0.76 + p3 * 0.22);
    this.ribbonGroup.visible = wakeVis > 0.02;
    if (this.ribbonGroup.visible) {
      const scrollMult = 1.1 + inComa * 1.55 + p3 * 0.45;
      this.ribbonBack.position.set(-100, this.height * 0.38 - pyNorm * 14);
      this.ribbonBack.rotation = -0.14;
      this.ribbonBack.tilePosition.x -= 220 * scrollMult * dt;
      this.ribbonBack.tint = p3 > 0.5 ? 0x34d399 : 0x38bdf8;
      this.ribbonBack.alpha = wakeVis * 0.36;

      this.ribbonFront.position.set(-100, this.height * 0.62 - pyNorm * 24);
      this.ribbonFront.rotation = -0.10;
      this.ribbonFront.tilePosition.x -= 360 * scrollMult * dt;
      this.ribbonFront.tint = 0xbae6fd;
      this.ribbonFront.alpha = wakeVis * 0.44;
    }

    // Faceted Translucent Cryo-Ice Prisms drifting across 3 depth planes (peak density inside the Coma in Phase 2!)
    this.crystalGroup.visible = true;
    const shardSpeedMult = 0.75 + inComa * 1.45 + p3 * 0.25;
    for (const shard of this.iceShards) {
      const tierVis =
        shard.depthTier === 2
          ? smoothstep(0.08, 0.48, inComa) * 0.68
          : shard.depthTier === 1
            ? (0.58 + inComa * 0.42) * (1 - p3 * 0.30)
            : 0.78 * (1 - p3 * 0.20);
      shard.xPos -= shard.speedPx * shardSpeedMult * dt;
      shard.yNorm += (shard.vyPx * dt) / this.height;
      if (shard.xPos < -120) {
        shard.xPos = this.width + 120 + seeded01(Math.floor(shard.yNorm * 100), Math.floor(clk)) * 80;
        shard.yNorm = 0.08 + seeded01(Math.floor(clk * 3), shard.speedPx) * 0.84;
      }
      if (shard.yNorm < -0.08) shard.yNorm = 1.06;
      if (shard.yNorm > 1.08) shard.yNorm = -0.06;

      shard.sprite.position.set(shard.xPos - pxNorm * shard.parallax, shard.yNorm * this.height - pyNorm * shard.parallax * 0.6);
      shard.sprite.rotation += shard.rotSpeed * (0.8 + inComa * 0.65) * dt;
      shard.sprite.scale.set(shard.baseScale);
      shard.sprite.alpha = tierVis;
      shard.sprite.tint = shard.depthTier === 0 ? 0x93c5fd : 0xe0f2fe;
    }

    // Phase 3 Emerald-Cyan Ionized Ray Sweeps announcing the Nebula border!
    this.beamA.visible = p3 > 0.05;
    this.beamA.tint = 0x34d399;
    this.beamA.position.set(this.width * 0.28, -this.height * 0.14);
    this.beamA.rotation = 2.74 + Math.sin(clk * 0.48) * 0.16;
    this.beamA.scale.set(3.2, 1.35);
    this.beamA.alpha = p3 * (0.30 + bossBoost * 0.14);

    this.beamB.visible = p3 > 0.05;
    this.beamB.tint = 0x67e8f9;
    this.beamB.position.set(this.width * 0.24, this.height * 0.22);
    this.beamB.rotation = 3.42 + Math.cos(clk * 0.40) * 0.16;
    this.beamB.scale.set(3.0, 1.25);
    this.beamB.alpha = p3 * (0.28 + bossBoost * 0.14);

    this.phaseVeilSprite.tint = trans23 > trans12 ? 0x6ee7b7 : 0xbae6fd;
    this.phaseVeilSprite.alpha = Math.max(trans12 * 0.24, trans23 * 0.24);

    this.updateCommonParticles(
      clk,
      dt,
      pxNorm,
      pyNorm,
      1.15 + inComa * 1.55 + p3 * 0.55 + bossBoost * 0.30,
      0.58 + inComa * 0.45 + p3 * 0.30,
      0.24 + inComa * 0.82 + p3 * 0.34 + trans12 * 0.44 + bossBoost * 0.24,
      1.0 + inComa * 1.25 + p3 * 0.40
    );
  }

  /**
   * STAGE 3-2: Nebulosa Jónica Esmeralda (164s + Boss)
   *   DIRECT CONTINUITY FROM 3-1 PHASE 3 — Plunging straight inside the Emerald-Amethyst Star Nursery!
   *   Phase 1 (0–54s):    Velo Protoestelar — Towering JWST-style Emerald & Amethyst Cosmic Dust Pillars drift top & bottom amid twinkling 4-point Protostars!
   *   Phase 2 (54–112s):  Jardín de Orión — Weaving through the glowing ionized canyon with dual emerald/violet aurora ribbons & brilliant star-birth clusters!
   *   Phase 3 (112–164s+): Cuna de Soles — The towering clouds part into the clear Viridian Eye cavity, revealing the distant glowing Zenith Hypergate gleaming ahead (direct bridge to 3-3!)
   */
  private updateStage3_2(t: number, clk: number, dt: number, pxNorm: number, pyNorm: number, bossBoost: number): void {
    const p2 = smoothstep(50, 60, t);
    const p3 = smoothstep(108, 120, t);
    const inHeart = p2 * (1 - p3);
    const trans12 = pulseBell(t, 55, 5.5);
    const trans23 = pulseBell(t, 114, 6.0);

    // Rich deep emerald-amethyst nebula backdrop
    this.nebulaSprite.x = this.width * 0.5 - pxNorm * 14 + Math.sin(clk * 0.06) * 18;
    this.nebulaSprite.y = this.height * 0.5 - pyNorm * 10 + Math.cos(clk * 0.05) * 10;
    const nebScale = 1.18 + p2 * 0.06 + p3 * 0.06;
    this.nebulaSprite.scale.set(
      (this.width * nebScale) / Math.max(1, this.nebulaSprite.texture.width),
      (this.height * nebScale) / Math.max(1, this.nebulaSprite.texture.height)
    );

    this.worldGroup.scale.set(1.0 + p2 * 0.05);
    this.worldGroup.rotation = lerp(0.0, 0.032, inHeart) + Math.sin(clk * 0.20) * 0.01;
    this.worldGroup.position.set(this.width * 0.5 - pxNorm * 18, this.height * 0.5 - pyNorm * 12);

    // Background luminous nursery glow receding softly as the central cavity opens in Phase 3
    this.distantEmeraldSprite.visible = true;
    this.distantEmeraldSprite.position.set(this.width * 0.14, 0);
    this.distantEmeraldSprite.scale.set(2.35 + p2 * 0.35);
    this.distantEmeraldSprite.rotation = clk * 0.01;
    this.distantEmeraldSprite.alpha = 0.36 + inHeart * 0.16 - p3 * 0.14;

    // Towering JWST-Style Cosmic Dust Pillars rooted cleanly OUTSIDE top & bottom screen edges (zero flat cuts!)
    this.pillarFarGroup.visible = true;
    this.pillarNearGroup.visible = true;
    const pillarSpeedMult = 0.90 + inHeart * 0.75 + p3 * 0.35;
    const partingOffset = p3 * 92;

    for (const p of this.nebulaPillars) {
      p.xPos -= p.speedPx * pillarSpeedMult * dt;
      if (p.xPos < -240) p.xPos = this.width + 240;

      const yAnchor = p.isTop
        ? -p.baseYOffset - partingOffset - pyNorm * p.parallax * 0.45
        : this.height + p.baseYOffset + partingOffset - pyNorm * p.parallax * 0.45;
      p.sprite.position.set(p.xPos - pxNorm * p.parallax, yAnchor);
      p.sprite.alpha = (p.depthTier === 0 ? 0.68 : 0.88) * (1 - p3 * 0.26);
    }

    // Dual Volumetric Emerald & Royal-Violet Ionized Aurora Ribbons weaving between the Far and Near Nebula Pillars!
    const ribbonVis = clamp01(0.32 + inHeart * 0.68 + p3 * 0.24);
    this.ribbonGroup.visible = ribbonVis > 0.02;
    if (this.ribbonGroup.visible) {
      const scrollMult = 0.85 + inHeart * 1.15 + p3 * 0.35;
      this.ribbonBack.position.set(-100, this.height * 0.34 - pyNorm * 14);
      this.ribbonBack.rotation = 0.04;
      this.ribbonBack.tilePosition.x -= 155 * scrollMult * dt;
      this.ribbonBack.tint = 0xa855f7;
      this.ribbonBack.alpha = ribbonVis * 0.34;

      this.ribbonFront.position.set(-100, this.height * 0.66 - pyNorm * 22);
      this.ribbonFront.rotation = -0.04;
      this.ribbonFront.tilePosition.x -= 235 * scrollMult * dt;
      this.ribbonFront.tint = 0x10b981;
      this.ribbonFront.alpha = ribbonVis * 0.40;
    }

    // Sparkling Newborn 4-Point Protostars embedded throughout the Star Nursery!
    this.protostarGroup.visible = true;
    for (const ps of this.protostars) {
      ps.xPos -= ps.speedPx * pillarSpeedMult * dt;
      if (ps.xPos < -80) ps.xPos = this.width + 80;
      const tw = 0.58 + 0.42 * Math.sin(clk * 2.4 + ps.phase);
      ps.sprite.position.set(ps.xPos - pxNorm * 18, ps.yNorm * this.height - pyNorm * 12);
      ps.sprite.scale.set(ps.baseScale * (0.85 + 0.35 * tw));
      ps.sprite.rotation = clk * 0.08 + ps.phase;
      ps.sprite.tint = ps.tint;
      ps.sprite.alpha = (0.48 + inHeart * 0.32) * tw;
    }

    // Foreshadowing Stage 3-3: In Phase 3 the pillars part to reveal the distant golden-cyan Zenith Hypergate gleaming ahead!
    if (p3 > 0.05) {
      this.zenithGroup.visible = true;
      this.zenithGroup.position.set(this.width * 0.74 - pxNorm * 16, this.height * 0.50 - pyNorm * 10);
      const pulse = 1.0 + Math.sin(clk * 1.6) * 0.04 + bossBoost * 0.06;
      this.zenithOuter.scale.set(lerp(0.18, 0.44, p3) * pulse);
      this.zenithOuter.rotation = clk * 0.08;
      this.zenithOuter.alpha = p3 * 0.82;

      this.zenithInner.scale.set(lerp(0.12, 0.30, p3) * pulse);
      this.zenithInner.rotation = -clk * 0.12;
      this.zenithInner.alpha = p3 * 0.65;

      this.zenithStar.scale.set(lerp(0.35, 0.95, p3) * pulse);
      this.zenithStar.rotation = clk * 0.05;
      this.zenithStar.tint = 0xfff3c4;
      this.zenithStar.alpha = p3 * 0.78;
    }

    // Sweeping Emerald & Amethyst Starlight Shafts
    this.beamA.visible = p2 > 0.05;
    this.beamA.tint = 0x34d399;
    this.beamA.position.set(this.width * 0.24, -this.height * 0.22);
    this.beamA.rotation = 2.66 + Math.sin(clk * 0.42) * 0.14;
    this.beamA.scale.set(3.2, 1.35);
    this.beamA.alpha = (inHeart * 0.24 + p3 * 0.28 + bossBoost * 0.12);

    this.beamB.visible = p3 > 0.05;
    this.beamB.tint = 0xc084fc;
    this.beamB.position.set(this.width * 0.24, this.height * 0.22);
    this.beamB.rotation = 3.56 + Math.cos(clk * 0.38) * 0.14;
    this.beamB.scale.set(3.2, 1.30);
    this.beamB.alpha = p3 * (0.30 + bossBoost * 0.12);

    this.phaseVeilSprite.tint = trans23 > trans12 ? 0xc084fc : 0x34d399;
    this.phaseVeilSprite.alpha = Math.max(trans12 * 0.22, trans23 * 0.26);

    this.updateCommonParticles(
      clk,
      dt,
      pxNorm,
      pyNorm,
      0.95 + inHeart * 1.15 + p3 * 0.55 + bossBoost * 0.30,
      0.66 + inHeart * 0.42 + p3 * 0.28,
      0.16 + inHeart * 0.52 + p3 * 0.36 + trans12 * 0.38 + bossBoost * 0.22,
      0.85 + inHeart * 0.95 + p3 * 0.45
    );
  }

  /**
   * STAGE 3-3: Cenit del Hiperportal (90s + Boss — Grand Normal Campaign Finale!)
   *   DIRECT CONTINUITY FROM 3-2 PHASE 3 — Entering the Astral Hypergate Starway!
   *   Phase 1 (0–30s):  Apertura Taquiónica — Ethereal cyan-violet perspective Starway Lattice ignites top & bottom while Split-Chevron Crystal Monoliths align ahead!
   *   Phase 2 (30–62s): Corredor Parsec — Hyperspace acceleration! Perspective monoliths rush smoothly past left & right alongside blazing cyan-gold tachyon ribbons & warp streaks!
   *   Phase 3 (62–90s+): Horizonte Astral Cenit-Omega — Reaching the Grand Octagonal Star-Prism Hypergate flanked by radiant astral light beams & sparkling protostars!
   */
  private updateStage3_3(t: number, clk: number, dt: number, pxNorm: number, pyNorm: number, bossBoost: number): void {
    const p2 = smoothstep(26, 35, t);
    const p3 = smoothstep(58, 68, t);
    const inCorridor = p2 * (1 - p3);
    const trans12 = pulseBell(t, 30.5, 4.5);
    const trans23 = pulseBell(t, 63, 5.0);

    // Royal astral indigo-violet sky
    this.nebulaSprite.x = this.width * 0.5 - pxNorm * 14 + Math.sin(clk * 0.07) * 16;
    this.nebulaSprite.y = this.height * 0.5 - pyNorm * 10;
    const nebScale = 1.18 + p2 * 0.06 + p3 * 0.08;
    this.nebulaSprite.scale.set(
      (this.width * nebScale) / Math.max(1, this.nebulaSprite.texture.width),
      (this.height * nebScale) / Math.max(1, this.nebulaSprite.texture.height)
    );

    this.worldGroup.scale.set(1.0 + p2 * 0.06 + p3 * 0.06);
    this.worldGroup.rotation = lerp(0.0, -0.032, inCorridor) + Math.sin(clk * 0.24) * 0.008;
    this.worldGroup.position.set(this.width * 0.5 - pxNorm * 18, this.height * 0.5 - pyNorm * 12);

    // Subtle receding emerald-violet nebula glow in background during Phase 1 (continuity from 3-2!)
    this.distantEmeraldSprite.visible = p3 < 0.85;
    this.distantEmeraldSprite.position.set(-this.width * 0.30, 0);
    this.distantEmeraldSprite.scale.set(1.55);
    this.distantEmeraldSprite.alpha = (1.0 - p3) * 0.28;

    // 1. Perspective Tachyon Starway Lattice framing bottom & mirrored top ceiling!
    this.latticeGroup.visible = true;
    const latSpeed = 240 * (1.0 + inCorridor * 1.45 + p3 * 0.40);
    this.latticeBot.position.set(-90, this.height - 166 - pyNorm * 16);
    this.latticeBot.tilePosition.x -= latSpeed * dt;
    this.latticeBot.alpha = 0.72 + inCorridor * 0.20;

    this.latticeTop.position.set(-90, 166 - pyNorm * 16);
    this.latticeTop.tilePosition.x -= latSpeed * dt;
    this.latticeTop.alpha = 0.62 + inCorridor * 0.20;

    // 2. Floating Split-Chevron Crystal Hypergate Monoliths gliding in perspective pairs along the Starway!
    this.obeliskGroup.visible = true;
    const obSpeed = 0.24 + inCorridor * 0.22 - p3 * 0.08;
    for (const pair of this.obeliskPairs) {
      // zProg: 0 = distant near Hypergate vanishing point on right, 1 = rushing past camera on left!
      const zProg = (clk * obSpeed + pair.slotIndex / this.obeliskPairs.length) % 1.0;
      const persp = Math.pow(zProg, 1.85);
      const xPos = lerp(this.width * 0.74, -140, persp) - pxNorm * (14 + persp * 28);
      const scale = 0.24 + persp * 0.92;
      const fadeIn = smoothstep(0.0, 0.20, zProg);
      const fadeOut = 1.0 - smoothstep(0.84, 1.0, zProg);
      // In Phase 3 monoliths part wider vertically so the Grand Zenith Hypergate takes center stage!
      const verticalSpread = lerp(42, -24, persp) - p3 * 46;
      const alpha = fadeIn * fadeOut * (0.86 - p3 * 0.22);

      pair.topSprite.position.set(xPos, verticalSpread - pyNorm * (8 + persp * 18));
      pair.topSprite.scale.set(scale, scale);
      pair.topSprite.alpha = alpha;

      pair.botSprite.position.set(xPos, this.height - verticalSpread - pyNorm * (8 + persp * 18));
      pair.botSprite.scale.set(scale, -scale);
      pair.botSprite.alpha = alpha;
    }

    // 3. Phase 2 Signature: Blazing Parsec Hyperspace Tachyon Ribbons surging across the Starway!
    const warpVis = clamp01(0.16 + inCorridor * 0.84 + p3 * 0.26);
    this.ribbonGroup.visible = warpVis > 0.02;
    if (this.ribbonGroup.visible) {
      const scrollMult = 1.3 + inCorridor * 1.85 + p3 * 0.50;
      this.ribbonBack.position.set(-100, this.height * 0.34 - pyNorm * 14);
      this.ribbonBack.rotation = 0;
      this.ribbonBack.tilePosition.x -= 290 * scrollMult * dt;
      this.ribbonBack.tint = 0xa855f7;
      this.ribbonBack.alpha = warpVis * 0.36;

      this.ribbonFront.position.set(-100, this.height * 0.66 - pyNorm * 22);
      this.ribbonFront.rotation = 0;
      this.ribbonFront.tilePosition.x -= 430 * scrollMult * dt;
      this.ribbonFront.tint = 0x00f2fe;
      this.ribbonFront.alpha = warpVis * 0.44;
    }

    // 4. Grand Finale Anchor: Cenit-Omega Octagonal Star-Prism Hypergate growing from distant beacon (P1) -> Monumental Portal (P3)!
    this.zenithGroup.visible = true;
    const gateX = lerp(this.width * 0.78, this.width * 0.72, p3) - pxNorm * 20;
    const gateY = this.height * 0.50 - pyNorm * 12 + Math.sin(clk * 0.32) * 4;
    this.zenithGroup.position.set(gateX, gateY);

    const pulse = 1.0 + Math.sin(clk * 1.8) * 0.035 + bossBoost * 0.07;
    const baseGateScale = lerp(0.46, 0.66, p2) + p3 * 0.32;
    this.zenithOuter.scale.set(baseGateScale * pulse);
    this.zenithOuter.rotation = clk * 0.14;
    this.zenithOuter.alpha = 0.82 + p3 * 0.18;

    this.zenithInner.scale.set(baseGateScale * 0.66 * pulse);
    this.zenithInner.rotation = -clk * 0.22;
    this.zenithInner.alpha = 0.60 + p3 * 0.34;

    this.zenithStar.scale.set((0.68 + p2 * 0.24 + p3 * 0.36) * pulse);
    this.zenithStar.rotation = clk * 0.06;
    this.zenithStar.tint = 0xfff8dc;
    this.zenithStar.alpha = 0.54 + p3 * 0.20;

    // Sweeping Cyan & Imperial Gold Hypergate Cathedral Light-Wings in Phase 3
    this.beamA.visible = p2 > 0.05;
    this.beamA.tint = 0x00f2fe;
    this.beamA.position.set(this.width * 0.22, -12);
    this.beamA.rotation = 2.74 + Math.sin(clk * 0.48) * 0.14;
    this.beamA.scale.set(3.4, 1.30);
    this.beamA.alpha = inCorridor * 0.24 + p3 * (0.36 + bossBoost * 0.14);

    this.beamB.visible = p3 > 0.05;
    this.beamB.tint = 0xffdd55;
    this.beamB.position.set(this.width * 0.22, 16);
    this.beamB.rotation = 3.52 + Math.cos(clk * 0.42) * 0.14;
    this.beamB.scale.set(3.4, 1.30);
    this.beamB.alpha = p3 * (0.34 + bossBoost * 0.14);

    this.phaseVeilSprite.tint = trans23 > trans12 ? 0xffdd66 : 0x67e8f9;
    this.phaseVeilSprite.alpha = Math.max(trans12 * 0.26, trans23 * 0.28);

    this.updateCommonParticles(
      clk,
      dt,
      pxNorm,
      pyNorm,
      1.25 + inCorridor * 1.75 + p3 * 0.65 + bossBoost * 0.38,
      0.56 + inCorridor * 0.48 + p3 * 0.36,
      0.30 + inCorridor * 0.88 + p3 * 0.42 + trans12 * 0.46 + bossBoost * 0.30,
      1.15 + inCorridor * 1.55 + p3 * 0.52
    );
  }

  public destroy(): void {
    if (this.root.parent) {
      this.root.parent.removeChild(this.root);
    }
    this.root.destroy({ children: true, texture: false, baseTexture: false });
    for (const rt of this.bakedTextures.values()) {
      rt.destroy(true);
    }
    this.bakedTextures.clear();
    for (const t of this.auxTextures) {
      t.destroy(true);
    }
    this.auxTextures = [];
  }
}

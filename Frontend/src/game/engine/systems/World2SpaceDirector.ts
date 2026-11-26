import * as PIXI from 'pixi.js';

export type World2StageId = 'normal-2-1' | 'normal-2-2' | 'normal-2-3';

export interface World2FrameContext {
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

interface EmberMote {
  sprite: PIXI.Sprite;
  xPos: number;
  yNorm: number;
  speedPx: number;
  driftPhase: number;
  baseAlpha: number;
  scale: number;
  parallax: number;
}

interface WindStreak {
  sprite: PIXI.Sprite;
  xPos: number;
  yNorm: number;
  speedPx: number;
  baseAlpha: number;
  widthPx: number;
  heightPx: number;
  angle: number;
}

interface CollectorSail {
  sprite: PIXI.Sprite;
  xPos: number;
  laneY: number;
  speedPx: number;
  baseScale: number;
  parallax: number;
  depthTier: number; // 0 = far array, 1 = mid array, 2 = near sail
  tilt: number;
  phase: number;
}

interface SiphonColumn {
  sprite: PIXI.Sprite;
  xPos: number;
  speedPx: number;
  widthScale: number;
  heightScale: number;
  phase: number;
  isCyan: boolean;
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

function buildSolarSkyFrag(
  topRGB: string,
  botRGB: string,
  cloudARgb: string,
  cloudBRgb: string,
  wispRgb: string,
  seedOff: string,
  rightHeatGlow: string
): string {
  return `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 uv = vTextureCoord;
  vec2 p = (uv - 0.5) * vec2(1.78, 1.0) + vec2(${seedOff});

  vec2 q = vec2(fbm5(p * 2.0 + vec2(0.7, -0.6)), fbm5(p * 2.0 + vec2(4.6, 1.8)));
  float n1 = fbm5(p * 2.4 + q * 1.45);
  float n2 = fbm5(p * 4.4 - q * 1.05 + vec2(2.8, -1.9));
  float dustLane = smoothstep(0.35, 0.74, fbm5(p * 3.1 + vec2(-1.6, 2.1)));

  vec3 deepSpace = mix(vec3(${topRGB}), vec3(${botRGB}), smoothstep(0.0, 1.0, uv.y));
  vec3 cA = vec3(${cloudARgb}) * pow(n1, 1.55) * 0.84;
  vec3 cB = vec3(${cloudBRgb}) * smoothstep(0.45, 0.86, n2) * (1.0 - dustLane * 0.64) * 0.48;
  vec3 wisp = vec3(${wispRgb}) * smoothstep(0.60, 0.92, n2 * n1 * 1.55) * 0.34;

  // Progressive solar proximity gradient warming the right side while keeping the left combat lane dark & readable
  float heatGrad = pow(smoothstep(0.18, 1.0, uv.x), 1.65) * (0.55 + 0.45 * n1);
  vec3 heat = vec3(${rightHeatGlow}) * heatGrad * 0.52;

  gl_FragColor = vec4(deepSpace + cA + cB + wisp + heat, 1.0);
}
`.trim();
}

const HELIOS_STAR_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float sphereR = 0.66;

  float outerDist = max(0.0, r - sphereR);
  float ang = atan(p.y, p.x);
  float coronaNoise = 0.78 + 0.22 * fbm5(vec2(cos(ang) * 3.2, sin(ang) * 3.2) + vec2(r * 2.4, 1.1));
  float outerCorona = exp(-outerDist * 7.2) * coronaNoise * smoothstep(1.0, 0.70, r);
  float innerRimHalo = exp(-outerDist * 22.0) * 0.78 * smoothstep(1.0, 0.68, r);

  if (r > sphereR) {
    vec3 glowCol = mix(vec3(0.95, 0.32, 0.06), vec3(1.0, 0.82, 0.38), clamp(innerRimHalo * 1.25, 0.0, 1.0));
    float a = clamp(outerCorona * 0.72 + innerRimHalo * 0.62, 0.0, 1.0);
    gl_FragColor = vec4(glowCol * a, a);
    return;
  }

  vec2 sp = p / sphereR;
  float nz = sqrt(max(0.0001, 1.0 - dot(sp, sp)));
  vec3 N = normalize(vec3(sp.x, sp.y, nz));

  float lon = atan(N.x, N.z);
  float lat = asin(clamp(N.y, -1.0, 1.0));
  vec2 mapUv = vec2(lon * 2.2, lat * 2.6);

  vec2 warp = vec2(fbm5(mapUv * 2.4 + vec2(1.2, 3.4)), fbm5(mapUv * 2.4 + vec2(5.1, -2.2)));
  float granules = fbm5(mapUv * 4.8 + warp * 1.35);
  float fineCells = vnoise(mapUv * 13.5 + warp * 1.8);
  float plasma = clamp(granules * 0.72 + fineCells * 0.28, 0.0, 1.0);

  float hotVeins = smoothstep(0.62, 0.90, plasma);
  float coolSpots = smoothstep(0.32, 0.16, granules);

  float limb = pow(nz, 0.52);
  vec3 deepOrange = vec3(0.72, 0.16, 0.03);
  vec3 brightGold = vec3(1.0, 0.62, 0.12);
  vec3 hotCore = vec3(1.0, 0.96, 0.78);

  vec3 col = mix(deepOrange, brightGold, clamp(limb * 0.82 + plasma * 0.35, 0.0, 1.0));
  col = mix(col, hotCore, hotVeins * (0.45 + 0.55 * limb));
  col *= (1.0 - coolSpots * 0.36);

  float chromo = pow(1.0 - nz, 3.2);
  col += vec3(1.0, 0.54, 0.14) * chromo * 0.85;

  float edgeAlpha = smoothstep(sphereR, sphereR - 0.014, r);
  float finalAlpha = clamp(max(edgeAlpha, innerRimHalo * 0.85), 0.0, 1.0);
  gl_FragColor = vec4(col * finalAlpha, finalAlpha);
}
`;

const SOLAR_CORONA_STREAMERS_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  float eqBias = 0.52 + 0.48 * pow(abs(cos(ang - 0.22)), 1.6);
  float raysA = 0.55 + 0.45 * sin(ang * 14.0 + fbm5(vec2(cos(ang) * 2.0, sin(ang) * 2.0)) * 3.0);
  float raysB = 0.60 + 0.40 * cos(ang * 26.0 - 1.2);
  float fineFilaments = clamp(raysA * 0.65 + raysB * 0.35, 0.0, 1.0);

  float innerRing = exp(-pow((r - 0.36) / 0.055, 2.0));
  float outerFalloff = exp(-max(0.0, r - 0.34) * (3.6 / max(0.35, eqBias)));
  float holeMask = smoothstep(0.24, 0.34, r);
  float outerFade = smoothstep(1.0, 0.58, r);

  float intensity = (innerRing * 0.82 + outerFalloff * fineFilaments * 0.72) * holeMask * outerFade;
  vec3 col = mix(vec3(1.0, 0.92, 0.74), vec3(1.0, 0.46, 0.14), smoothstep(0.34, 0.78, r));
  col = mix(col, vec3(0.95, 0.22, 0.30), smoothstep(0.62, 0.94, r) * 0.55);

  float a = clamp(intensity * 0.84, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

const PROMINENCE_ARC_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  vec2 cyc = vec2(cos(ang), sin(ang));

  float warp = (fbm5(cyc * 2.8 + vec2(r * 3.4, 1.3)) - 0.5) * 0.10;
  float a1 = mod(ang - 0.55 + 6.2831853, 6.2831853) - 3.1415926;
  float arch1Span = smoothstep(0.68, 0.22, abs(a1));
  float arch1R = 0.66 + 0.20 * cos(a1 * 2.3) * arch1Span + warp;
  float loop1 = exp(-pow((r - arch1R) / 0.018, 2.0)) * arch1Span;

  float a2 = mod(ang + 1.85 + 6.2831853, 6.2831853) - 3.1415926;
  float arch2Span = smoothstep(0.54, 0.16, abs(a2));
  float arch2R = 0.65 + 0.14 * cos(a2 * 2.9) * arch2Span - warp * 0.8;
  float loop2 = exp(-pow((r - arch2R) / 0.015, 2.0)) * arch2Span * 0.85;

  float a3 = mod(ang - 2.35 + 6.2831853, 6.2831853) - 3.1415926;
  float arch3Span = smoothstep(0.45, 0.12, abs(a3));
  float arch3R = 0.65 + 0.11 * cos(a3 * 3.4) * arch3Span + warp * 0.6;
  float loop3 = exp(-pow((r - arch3R) / 0.014, 2.0)) * arch3Span * 0.72;

  float filament = 0.45 + 0.55 * fbm5(cyc * 7.2 + vec2(r * 6.5, -2.1));
  float bandMask = smoothstep(0.60, 0.65, r) * smoothstep(0.96, 0.78, r);
  float glow = (loop1 + loop2 + loop3) * filament * bandMask;

  vec3 col = mix(vec3(1.0, 0.24, 0.14), vec3(1.0, 0.88, 0.40), clamp(glow * 1.25, 0.0, 1.0));
  float a = clamp(glow * 0.88, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

const MERCURY_PLANET_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float rad = 0.80;

  vec2 sunDir2D = normalize(vec2(0.76, -0.36));
  float sunSide = clamp(dot(normalize(p + vec2(0.0001)), sunDir2D) * 0.5 + 0.5, 0.0, 1.0);

  if (r > rad) {
    float heatHaze = exp(-(r - rad) * 16.0) * (0.16 + 0.84 * pow(sunSide, 2.0)) * smoothstep(1.0, 0.82, r);
    vec3 gc = mix(vec3(0.96, 0.36, 0.10), vec3(1.0, 0.82, 0.44), pow(sunSide, 2.2));
    float a = clamp(heatHaze * 0.74, 0.0, 1.0);
    gl_FragColor = vec4(gc * a, a);
    return;
  }

  vec2 sp = p / rad;
  float nz = sqrt(max(0.0001, 1.0 - dot(sp, sp)));
  vec3 N = normalize(vec3(sp.x, sp.y, nz));
  vec3 L = normalize(vec3(0.76, -0.36, 0.54));

  float lon = atan(N.x, N.z);
  float lat = asin(clamp(N.y, -1.0, 1.0));
  vec2 mapUv = vec2(lon * 1.65, lat * 2.15);

  float macroTerrain = fbm5(mapUv * 2.2 + vec2(1.4, -0.9));
  float medCraters = fbm5(mapUv * 5.8 + vec2(-2.3, 3.1));
  float fineGrain = vnoise(mapUv * 18.0 + vec2(0.7, 4.2));
  float maria = smoothstep(0.36, 0.68, macroTerrain);

  vec3 darkBasalt = vec3(0.24, 0.19, 0.21);
  vec3 sunlitIron = vec3(0.66, 0.50, 0.42);
  vec3 rock = mix(darkBasalt, sunlitIron, maria) * (0.76 + 0.24 * medCraters + 0.10 * fineGrain);

  float relief = (medCraters - 0.5) * 0.28 + (fineGrain - 0.5) * 0.10;
  float ndl = dot(N, L) + relief * 0.26;
  float lit = smoothstep(-0.10, 0.44, ndl);
  float twilight = smoothstep(-0.22, 0.06, ndl) * (1.0 - smoothstep(0.04, 0.26, ndl));

  vec3 col = rock * (0.055 + lit * 1.02) + vec3(0.95, 0.36, 0.12) * twilight * 0.28;

  float crackField = abs(fbm5(mapUv * 5.4 + vec2(-1.7, 2.3)) - 0.5);
  float thinRift = exp(-pow(crackField / 0.022, 2.0));
  float lavaMask = smoothstep(0.10, -0.26, dot(N, L)) * thinRift * smoothstep(0.42, 0.68, macroTerrain);
  col += vec3(1.0, 0.44, 0.10) * lavaMask * 1.35;

  float forgeDots = smoothstep(0.84, 0.95, vnoise(mapUv * 26.0)) * smoothstep(0.42, 0.06, abs(N.y)) * smoothstep(0.08, -0.22, dot(N, L));
  col += vec3(0.24, 0.92, 1.0) * forgeDots * 0.95;

  float fresnel = pow(1.0 - nz, 3.0);
  col += mix(vec3(0.98, 0.42, 0.14), vec3(1.0, 0.86, 0.52), lit) * fresnel * (0.18 + 0.90 * lit);

  float a = smoothstep(rad, rad - 0.016, r);
  gl_FragColor = vec4(col * a, a);
}
`;

const LIMB_FLARE_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float core = exp(-r * r * 42.0);
  float halo = exp(-r * 5.2) * 0.44;
  float anamorphic = exp(-abs(p.y) * 40.0) * exp(-abs(p.x) * 1.75) * 0.74;
  float crossRay = exp(-abs(p.x) * 44.0) * exp(-abs(p.y) * 5.4) * 0.32;

  vec3 col = vec3(1.0, 0.97, 0.88) * core * 0.92
           + vec3(1.0, 0.62, 0.22) * halo
           + vec3(1.0, 0.82, 0.42) * anamorphic
           + vec3(0.95, 0.92, 1.0) * crossRay;

  float a = clamp((core + halo + anamorphic + crossRay) * smoothstep(1.0, 0.40, r), 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

/**
 * STAGE 2-2 UNIQUE ASSET: Seamless horizontally-tileable Industrial Dyson Foundry Superstructure Deck!
 * Frames top or bottom (flipped vertically) of the combat trench as you fly INSIDE the solar ring-forge.
 */
const FORGE_TRUSS_DECK_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 uv = vTextureCoord;
  // uv.y = 0 is outer frame edge (top of screen), uv.y = 1 faces inward toward the combat arena
  float a = uv.x * 6.2831853;
  float cellX = fract(uv.x * 4.0); // 4 massive repeating foundry girder bays per tile

  // Heavy outer armored spine along y = 0..0.34 with recessed angled docking bays
  float bayNotch = smoothstep(0.14, 0.22, cellX) * (1.0 - smoothstep(0.78, 0.86, cellX));
  float deckEdge = mix(0.46, 0.26, bayNotch);

  // Diagonal structural steel X-trusses hanging down to y = 0.68 inside each bay
  float diag1 = abs((cellX - 0.5) * 1.4 - (uv.y - 0.36));
  float diag2 = abs((cellX - 0.5) * 1.4 + (uv.y - 0.36));
  float diagStruts = (smoothstep(0.055, 0.025, diag1) + smoothstep(0.055, 0.025, diag2))
                   * smoothstep(0.18, 0.24, uv.y) * (1.0 - smoothstep(0.62, 0.67, uv.y)) * bayNotch;

  // Lower catwalk rail beam running across y = 0.64..0.72
  float lowerRail = smoothstep(0.62, 0.65, uv.y) * (1.0 - smoothstep(0.71, 0.74, uv.y));
  // Heavy vertical pylon ribs between bays (cellX near 0 or 1)
  float pylonW = min(cellX, 1.0 - cellX);
  float pylon = (1.0 - smoothstep(0.075, 0.105, pylonW)) * (1.0 - smoothstep(0.78, 0.83, uv.y));

  float hull = 1.0 - smoothstep(deckEdge - 0.015, deckEdge + 0.015, uv.y);
  float structMask = clamp(max(max(hull, pylon), max(lowerRail * 0.92, diagStruts * 0.85)), 0.0, 1.0);

  // Warm solar under-glow radiating upward from the nearby Sun onto the industrial steel underside!
  if (uv.y > 0.93) {
    gl_FragColor = vec4(0.0);
    return;
  }
  if (structMask <= 0.01) {
    float railGlow = exp(-abs(uv.y - 0.72) * 20.0) * 0.24 * smoothstep(0.93, 0.78, uv.y);
    vec3 gc = vec3(1.0, 0.52, 0.16) * railGlow;
    gl_FragColor = vec4(gc, railGlow);
    return;
  }

  float panelGrain = 0.82 + 0.18 * vnoise(vec2(uv.x * 24.0, uv.y * 16.0));
  float rimBounce = smoothstep(0.38, 0.78, uv.y);
  vec3 darkSteel = vec3(0.065, 0.042, 0.052);
  vec3 sunlitBronze = vec3(0.32, 0.17, 0.12);
  vec3 col = mix(darkSteel, sunlitBronze, rimBounce * 0.78) * panelGrain;

  // Glowing molten-gold thermal conduit line along lower rail & crisp cyan coolant vents on pylons
  float amberConduit = exp(-pow((uv.y - 0.68) / 0.016, 2.0)) * (0.45 + 0.55 * smoothstep(0.2, 0.8, sin(a * 8.0)));
  float cyanVent = exp(-pow(pylonW / 0.024, 2.0)) * exp(-pow((uv.y - 0.52) / 0.042, 2.0));
  float deckLights = smoothstep(0.88, 0.98, abs(sin(uv.x * 50.265))) * exp(-pow((uv.y - 0.22) / 0.018, 2.0));

  col += vec3(1.0, 0.64, 0.18) * (amberConduit * 1.15 + deckLights * 0.85);
  col += vec3(0.22, 0.94, 1.0) * cyanVent * 1.45;

  gl_FragColor = vec4(col * structMask, structMask);
}
`;

/**
 * STAGE 2-2 UNIQUE ASSET: Sleek Sunlit Dyson Solar-Collector Mirror Vane
 * Tall slanted reflective gold-foil architectural mirror sail (reads clearly as giant orbital infrastructure, NOT an enemy sprite!).
 */
const DYSON_SAIL_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  // Slanted parallelogram solar mirror vane (shear X by Y)
  vec2 q = vec2(p.x - p.y * 0.36, p.y);
  float bodyX = 1.0 - smoothstep(0.32, 0.36, abs(q.x));
  float bodyY = 1.0 - smoothstep(0.80, 0.84, abs(q.y));
  float mask = bodyX * bodyY;
  if (mask <= 0.01) { gl_FragColor = vec4(0.0); return; }

  // Segmented reflective mirror slats & central spine truss
  float border = max(smoothstep(0.24, 0.33, abs(q.x)), smoothstep(0.73, 0.81, abs(q.y)));
  float spine = 1.0 - smoothstep(0.025, 0.05, abs(q.x));
  float slats = smoothstep(0.86, 0.96, abs(cos(q.y * 14.0)));

  // Anisotropic golden sunlight reflection sweeping diagonally across the mirror foil
  float sheen = pow(clamp(0.45 + q.x * 0.85 - q.y * 0.55, 0.0, 1.0), 1.4);
  vec3 goldFoil = mix(vec3(0.30, 0.13, 0.06), vec3(1.0, 0.80, 0.34), sheen);
  vec3 frameCol = vec3(0.11, 0.07, 0.09);
  vec3 col = mix(goldFoil, frameCol, clamp(border * 0.85 + spine * 0.72 + slats * 0.35, 0.0, 1.0));

  // Subtle amber edge highlight + tiny hairline cyan telemetry tick at top/bottom anchor tips
  float tipDot = exp(-q.x * q.x * 95.0) * (exp(-pow((q.y - 0.76) * 14.0, 2.0)) + exp(-pow((q.y + 0.76) * 14.0, 2.0)));
  col += vec3(0.26, 0.94, 1.0) * tipDot * 0.95;

  gl_FragColor = vec4(col * mask, mask);
}
`;

/**
 * STAGE 2-2 UNIQUE ASSET: Vertical Solar Plasma-Siphon Energy Column
 * Harvests streams of glowing plasma straight off the Sun into the Dyson Foundry rails.
 */
const PLASMA_SIPHON_COL_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 uv = vTextureCoord;
  float dx = abs(uv.x - 0.5) * 2.0;

  float core = exp(-dx * dx * 38.0);
  float sheath = exp(-dx * dx * 7.5) * 0.58;
  float pulseNodes = 0.55 + 0.45 * sin(uv.y * 28.0 + fbm5(vec2(uv.x * 4.0, uv.y * 6.0)) * 2.5);
  float yFade = smoothstep(0.0, 0.14, uv.y) * smoothstep(1.0, 0.86, uv.y);

  float intensity = clamp((core * 1.1 + sheath * pulseNodes) * yFade, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.54, 0.16), vec3(1.0, 0.96, 0.84), clamp(core * 1.25, 0.0, 1.0));
  float a = clamp(intensity * 0.84, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

/**
 * STAGE 2-3 UNIQUE ASSET: Colossal Boiling Solar Chromosphere & Photosphere Horizon
 * Seamless scrolling ocean of churning golden-crimson solar convection cells + spicule atmosphere!
 */
const SOLAR_SURFACE_OCEAN_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 uv = vTextureCoord;
  float a = uv.x * 6.2831853;
  vec2 cyc = vec2(cos(a), sin(a));

  // Gently rolling solar photosphere swell
  float swell = 0.032 * sin(a + 0.5) + 0.018 * cos(a * 2.0 - 0.8);
  float spiculeWave = (fbm5(cyc * 3.8 + vec2(2.1, 0.9)) - 0.5) * 0.026;
  float limbY = 0.54 + swell + spiculeWave;

  float depth = uv.y - limbY;

  // Silky crimson-gold chromospheric halo & glowing spicule mist rising above the limb
  if (depth < 0.0) {
    float above = -depth;
    float mist = 0.62 + 0.38 * fbm5(vec2(cyc.x * 4.5, cyc.y * 4.5 + above * 4.2));
    float chromoHaze = exp(-above * 8.5) * mist * 0.68;
    float hotRim = exp(-above * 28.0) * 0.90;
    vec3 gc = mix(vec3(0.92, 0.16, 0.22), vec3(1.0, 0.84, 0.38), clamp(hotRim * 1.15, 0.0, 1.0));
    float alphaOut = clamp(chromoHaze + hotRim * 0.80, 0.0, 1.0);
    gl_FragColor = vec4(gc * alphaOut, alphaOut);
    return;
  }

  // Seamless isotropic solar convection granulation (zero vertical pinch streaks!)
  vec2 tileCoord = vec2(cyc.x * 2.6 + cyc.y * 0.9, uv.y * 4.8 + cyc.y * 1.4);
  vec2 warp = vec2(fbm5(tileCoord * 1.8 + vec2(1.1, 2.3)), fbm5(tileCoord * 1.8 + vec2(4.5, -1.7)));
  float granules = fbm5(tileCoord * 3.4 + warp * 1.15);
  float fineCells = vnoise(tileCoord * 9.5 + warp * 1.4);
  float plasma = clamp(granules * 0.72 + fineCells * 0.28, 0.0, 1.0);

  float hotFilaments = smoothstep(0.58, 0.88, plasma);
  float sunspot = smoothstep(0.30, 0.14, granules);

  vec3 crimsonBase = vec3(0.46, 0.07, 0.06);
  vec3 moltenAmber = vec3(0.98, 0.42, 0.08);
  vec3 whiteGold = vec3(1.0, 0.92, 0.62);

  vec3 col = mix(crimsonBase, moltenAmber, clamp(plasma * 1.15, 0.0, 1.0));
  col = mix(col, whiteGold, hotFilaments * 0.76);
  col *= (1.0 - sunspot * 0.42);

  // Smooth blazing golden-amber limb edge blending softly into the plasma ocean
  float limbLip = exp(-depth * 24.0);
  col += vec3(1.0, 0.82, 0.40) * limbLip * 0.72;

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * STAGE 2-3 UNIQUE ASSET: Towering Solar Magnetic Flux Cathedral Arch
 * Organic SDO-style filamentary magnetic plasma loop erupting from the chromosphere.
 */
const FLUX_CATHEDRAL_ARCH_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 uv = vTextureCoord;
  vec2 p = vec2((uv.x - 0.5) * 2.0, (1.0 - uv.y) * 1.22);
  // Subtle natural asymmetry so arches look like real magnetic eruptions instead of compass arcs
  float skew = p.x * 0.14;
  float r = length(vec2(p.x * 1.06, p.y + skew * 0.12));
  float ang = atan(p.y, p.x);

  float warp = (fbm5(vec2(ang * 3.4 + 1.2, r * 4.8)) - 0.5) * 0.14;
  float fineWarp = (fbm5(vec2(ang * 7.5, r * 9.0)) - 0.5) * 0.05;
  float mainW = mix(0.052, 0.022, smoothstep(0.0, 0.95, p.y)); // Thick blazing footpoints, delicate wispy apex!

  float coreArch = exp(-pow((r - (0.80 + warp)) / mainW, 2.0));
  float sideRibbon = exp(-pow((r - (0.71 - warp * 0.6 + fineWarp)) / (mainW * 0.7), 2.0)) * 0.62;
  float wispyPlume = exp(-pow((r - (0.86 + warp * 1.2)) / (mainW * 1.6), 2.0)) * 0.42;

  float filaments = smoothstep(0.24, 0.84, fbm5(vec2(ang * 8.5, r * 11.0 + 2.3)));
  float footGlow = 0.62 + 0.68 * exp(-p.y * 2.6);
  float baseFade = smoothstep(0.0, 0.12, p.y);
  float sideFade = smoothstep(1.0, 0.80, abs(p.x));

  float glow = clamp((coreArch + sideRibbon + wispyPlume) * (0.36 + 0.64 * filaments) * footGlow * baseFade * sideFade, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.16, 0.24), vec3(1.0, 0.86, 0.36), clamp(glow * 1.15, 0.0, 1.0));
  float a = clamp(glow * 0.84, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

/**
 * STAGE 2-3 FINALE UNIQUE ASSET: Portal de Eyección Coronal (Architectural Solar Plasma Gate)
 * Sleek beveled obsidian-gold containment pylons channeling a rich fiery ruby-gold coronal vortex aperture.
 */
const CORONAL_PORTAL_GATE_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Rich swirling ruby-gold coronal plasma aperture (smooth fiery heart, NO pinched center or clipped white washout!)
  float swirlFbm = fbm5(vec2(cos(ang * 2.0 - r * 3.8) * 2.2, sin(ang * 2.0 - r * 3.8) * 2.2) + vec2(r * 2.4, 1.3));
  float spiralWave = 0.5 + 0.5 * sin(ang * 3.0 - r * 7.2 + swirlFbm * 2.4);
  float vortexArms = pow(spiralWave, 1.8) * smoothstep(0.06, 0.28, r);
  float apertureMask = 1.0 - smoothstep(0.50, 0.62, r);
  float innerHotRing = exp(-pow((r - 0.54) / 0.036, 2.0));
  float warmHeart = exp(-r * r * 5.5) * (0.55 + 0.45 * swirlFbm);

  vec3 deepRuby = vec3(0.42, 0.04, 0.12);
  vec3 solarAmber = vec3(0.98, 0.44, 0.10);
  vec3 goldCore = vec3(1.0, 0.88, 0.52);

  vec3 vortexCol = mix(deepRuby, solarAmber, clamp(vortexArms * 0.78 + swirlFbm * 0.35, 0.0, 1.0));
  vortexCol = mix(vortexCol, goldCore, clamp(warmHeart * 0.65 + innerHotRing * 0.75, 0.0, 1.0));
  float vortexAlpha = clamp(apertureMask * (0.64 + 0.32 * vortexArms) + innerHotRing * 0.88, 0.0, 1.0);

  // 6 Monumental Tapered Armored Containment Pylons & Structural Rail Arcs encircling r = 0.60..0.89
  float cos3 = abs(cos(ang * 3.0));
  float pylonTaper = mix(0.90, 0.945, smoothstep(0.60, 0.88, r));
  float pylonBody = smoothstep(pylonTaper - 0.015, pylonTaper + 0.015, cos3)
                  * smoothstep(0.58, 0.61, r) * (1.0 - smoothstep(0.87, 0.90, r));
  float outerArcs = smoothstep(0.24, 0.52, abs(sin(ang * 3.0)))
                  * smoothstep(0.73, 0.75, r) * (1.0 - smoothstep(0.785, 0.805, r));
  float fineRing = exp(-pow((r - 0.64) / 0.0055, 2.0)) * 0.95
                 + exp(-pow((r - 0.85) / 0.0045, 2.0)) * 0.65;

  // Sleek hairline energy slits on each pylon (refined sci-fi detailing, NOT chunky boxes!)
  float pylonTip = smoothstep(0.91, 0.96, cos3) * exp(-pow((r - 0.61) / 0.014, 2.0));
  float pylonSlit = smoothstep(0.982, 0.996, cos3) * smoothstep(0.65, 0.68, r) * (1.0 - smoothstep(0.82, 0.85, r));
  float metalBevel = 0.45 + 0.55 * smoothstep(pylonTaper, 0.995, cos3);

  float structMask = clamp(pylonBody + outerArcs * 0.88, 0.0, 1.0);
  vec3 structCol = mix(vec3(0.11, 0.055, 0.070), vec3(0.36, 0.18, 0.14), metalBevel)
                 + vec3(1.0, 0.74, 0.28) * (pylonTip * 1.35 + fineRing * 0.85)
                 + vec3(0.24, 0.94, 1.0) * pylonSlit * 1.45;

  // Outer coronal halo rays around the portal perimeter
  float outerHalo = exp(-max(0.0, r - 0.62) * 5.8) * smoothstep(1.0, 0.74, r) * 0.42;
  vec3 haloCol = vec3(1.0, 0.34, 0.20) * outerHalo;

  vec3 finalCol = mix(vortexCol + haloCol, structCol, structMask) + vec3(1.0, 0.76, 0.28) * fineRing * 0.60;
  float finalAlpha = clamp(max(vortexAlpha, max(structMask * 0.96, max(fineRing * 0.82, outerHalo))), 0.0, 1.0);
  gl_FragColor = vec4(finalCol * finalAlpha, finalAlpha);
}
`;

const PLASMA_RIBBON_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 uv = vTextureCoord;
  float a = uv.x * 6.2831853;
  vec2 cyc = vec2(cos(a), sin(a));

  float waveA = 0.50 + 0.14 * sin(a + 0.4) + 0.05 * cos(a * 2.0 - 0.8);
  float waveB = 0.50 - 0.11 * cos(a - 0.5) + 0.04 * sin(a * 2.0 + 1.1);

  float n1 = fbm5(vec2(cyc.x * 1.6, cyc.y * 1.6 + uv.y * 2.2));
  float n2 = fbm5(vec2(cyc.x * 3.0 + 2.1, cyc.y * 3.0 + uv.y * 4.4));

  float bandA = exp(-pow((uv.y - (waveA + (n1 - 0.5) * 0.10)) / 0.12, 2.0));
  float bandB = exp(-pow((uv.y - (waveB + (n2 - 0.5) * 0.08)) / 0.08, 2.0)) * 0.72;
  float silkyStreams = 0.52 + 0.48 * smoothstep(0.24, 0.84, n2);

  float edgeFade = smoothstep(0.0, 0.14, uv.y) * smoothstep(1.0, 0.86, uv.y);
  float intensity = clamp((bandA + bandB) * silkyStreams * edgeFade, 0.0, 1.0);

  vec3 col = mix(vec3(0.98, 0.42, 0.14), vec3(1.0, 0.90, 0.56), smoothstep(0.22, 0.85, intensity));
  float alpha = clamp(intensity * 0.76, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const SOLAR_BEAM_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 uv = vTextureCoord;
  float xFade = smoothstep(0.0, 0.20, uv.x) * (1.0 - smoothstep(0.54, 1.0, uv.x));
  float spread = mix(0.07, 0.45, uv.x);
  float yDist = abs(uv.y - 0.5) / max(0.02, spread);
  float cone = exp(-yDist * yDist * 3.0);
  float a = clamp(xFade * cone * 0.76, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.96, 0.82), vec3(1.0, 0.58, 0.18), uv.x);
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

export function isWorld2NormalStage(id?: string): id is World2StageId {
  return id === 'normal-2-1' || id === 'normal-2-2' || id === 'normal-2-3';
}

/**
 * Cohesive Continuous-Inward Space Director for World 2 Normal — Sector Helios (`2-1`, `2-2`, `2-3`).
 *
 * Unbroken forward trajectory plunging progressively deeper into Star Helios (zero backtracking, zero recycled World 1 tropes):
 *   • 2-1 Corriente de Viento Solar:  Leave Mercury behind -> Cross Dual Solar Wind Ribbons -> Reach Helios's Outer Limb & First Collector Sails
 *   • 2-2 Forja Orbital de Mercurio:  Graze Helios's Giant Boiling Photosphere Wall -> Fly Inside Upper/Lower Dyson Forge Girders & Vertical Plasma Siphons -> Thermal Crucible Convergence
 *   • 2-3 Portal de Eyección Coronal: Plunge Directly into the Roaring Chromosphere & Magnetic Flux Cathedral Arches -> Coronal Mass Ejection Storm -> Open Coronal Portal Gate Finale
 */
export class World2SpaceDirector {
  private parentContainer: PIXI.Container;
  private renderer: PIXI.IRenderer;
  private width: number;
  private height: number;
  private activeStageId: World2StageId;

  private root = new PIXI.Container();
  private starGroup = new PIXI.Container();
  private worldGroup = new PIXI.Container();
  private starAssembly = new PIXI.Container();
  private ribbonGroup = new PIXI.Container();
  private sailArrayGroup = new PIXI.Container();
  private siphonGroup = new PIXI.Container();
  private forgeTrenchGroup = new PIXI.Container();
  private chromoSurfaceGroup = new PIXI.Container();
  private fluxArchGroup = new PIXI.Container();
  private portalGroup = new PIXI.Container();
  private emberGroup = new PIXI.Container();
  private streakGroup = new PIXI.Container();

  private bakedTextures: Map<string, PIXI.RenderTexture> = new Map();
  private auxTextures: PIXI.Texture[] = [];

  private nebulaSprite!: PIXI.Sprite;
  private coronaSprite!: PIXI.Sprite;
  private prominenceA!: PIXI.Sprite;
  private prominenceB!: PIXI.Sprite;
  private heliosSprite!: PIXI.Sprite;
  private limbFlareSprite!: PIXI.Sprite;
  private mercurySprite!: PIXI.Sprite;
  private beamA!: PIXI.Sprite;
  private beamB!: PIXI.Sprite;
  private ribbonBack!: PIXI.TilingSprite;
  private ribbonFront!: PIXI.TilingSprite;
  private forgeTopFar!: PIXI.TilingSprite;
  private forgeTopNear!: PIXI.TilingSprite;
  private forgeBotFar!: PIXI.TilingSprite;
  private forgeBotNear!: PIXI.TilingSprite;
  private solarOceanFar!: PIXI.TilingSprite;
  private solarOceanNear!: PIXI.TilingSprite;
  private fluxArchFar!: PIXI.Sprite;
  private fluxArchMid!: PIXI.Sprite;
  private fluxArchNear!: PIXI.Sprite;
  private portalOuterSprite!: PIXI.Sprite;
  private portalInnerSprite!: PIXI.Sprite;
  private portalJetSprite!: PIXI.Sprite;
  private phaseVeilSprite!: PIXI.Sprite;
  private leftVeilSprite!: PIXI.Sprite;

  private stars: ParallaxStar[] = [];
  private emberMotes: EmberMote[] = [];
  private streaks: WindStreak[] = [];
  private collectorSails: CollectorSail[] = [];
  private siphonColumns: SiphonColumn[] = [];
  private lastClockTime: number = 0;

  constructor(
    parentContainer: PIXI.Container,
    renderer: PIXI.IRenderer,
    stageId: World2StageId = 'normal-2-1',
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

  public setStage(stageId: World2StageId): void {
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
    // 3 progressive solar-proximity skies: Heliosphere Approach -> Dyson Forge Trench -> Deep Solar Corona
    this.bakeTexture(
      'sky2_1',
      512,
      288,
      buildSolarSkyFrag('0.036, 0.014, 0.010', '0.095, 0.034, 0.015', '0.340, 0.135, 0.035', '0.580, 0.255, 0.055', '0.180, 0.580, 0.780', '0.4, -0.3', '0.55, 0.22, 0.05')
    );
    this.bakeTexture(
      'sky2_2',
      512,
      288,
      buildSolarSkyFrag('0.044, 0.014, 0.018', '0.125, 0.036, 0.022', '0.420, 0.125, 0.065', '0.680, 0.265, 0.065', '0.160, 0.620, 0.780', '2.7, 1.2', '0.88, 0.34, 0.08')
    );
    this.bakeTexture(
      'sky2_3',
      512,
      288,
      buildSolarSkyFrag('0.058, 0.010, 0.022', '0.165, 0.028, 0.034', '0.520, 0.085, 0.125', '0.780, 0.260, 0.060', '0.960, 0.660, 0.220', '-1.9, 2.4', '0.98, 0.32, 0.14')
    );

    this.bakeTexture('heliosStar', 512, 512, HELIOS_STAR_FRAG);
    this.bakeTexture('solarCorona', 512, 512, SOLAR_CORONA_STREAMERS_FRAG);
    this.bakeTexture('prominenceArc', 512, 512, PROMINENCE_ARC_FRAG);
    this.bakeTexture('mercuryPlanet', 384, 384, MERCURY_PLANET_FRAG);
    this.bakeTexture('limbFlare', 256, 256, LIMB_FLARE_FRAG);
    this.bakeTexture('forgeTruss', 512, 192, FORGE_TRUSS_DECK_FRAG);
    this.bakeTexture('dysonSail', 128, 192, DYSON_SAIL_FRAG);
    this.bakeTexture('siphonCol', 128, 256, PLASMA_SIPHON_COL_FRAG);
    this.bakeTexture('solarOcean', 512, 256, SOLAR_SURFACE_OCEAN_FRAG);
    this.bakeTexture('fluxArch', 512, 256, FLUX_CATHEDRAL_ARCH_FRAG);
    this.bakeTexture('coronalPortal', 512, 512, CORONAL_PORTAL_GATE_FRAG);
    this.bakeTexture('plasmaRibbon', 512, 192, PLASMA_RIBBON_FRAG);
    this.bakeTexture('solarBeam', 256, 128, SOLAR_BEAM_FRAG);
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
    grad.addColorStop(0, 'rgba(14, 4, 5, 0.92)');
    grad.addColorStop(0.55, 'rgba(14, 4, 5, 0.34)');
    grad.addColorStop(1, 'rgba(14, 4, 5, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 4);
    const t = PIXI.Texture.from(canvas);
    this.auxTextures.push(t);
    return t;
  }

  private buildSceneGraph(): void {
    // 1. Solar Proximity Sky Backdrop
    this.nebulaSprite = new PIXI.Sprite(this.tex('sky2_1'));
    this.nebulaSprite.anchor.set(0.5);
    this.nebulaSprite.position.set(this.width * 0.5, this.height * 0.5);
    this.root.addChild(this.nebulaSprite);

    // 2. Crisp Circular Parallax Starfield (124 stars — fade naturally as we plunge into Helios's bright corona!)
    const dotTex = this.tex('softDot');
    for (let i = 0; i < 124; i++) {
      const sprite = new PIXI.Sprite(dotTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      const tier = i % 3;
      const sz = tier === 0 ? 1.8 : tier === 1 ? 3.0 : 4.8;
      sprite.width = sz;
      sprite.height = sz;
      this.starGroup.addChild(sprite);
      this.stars.push({
        sprite,
        xNorm: seeded01(i, 1.5),
        yNorm: seeded01(i, 2.9),
        speed: tier === 0 ? 0.008 : tier === 1 ? 0.024 : 0.056,
        phase: seeded01(i, 4.3) * Math.PI * 2,
        twinkleRate: 1.5 + seeded01(i, 6.1) * 3.1,
        baseAlpha: tier === 0 ? 0.32 : tier === 1 ? 0.56 : 0.80,
        parallax: tier === 0 ? 6 : tier === 1 ? 15 : 28,
      });
    }
    this.root.addChild(this.starGroup);

    // 3. World Camera Group (Star Helios / Massive Photosphere Wall, Distant Mercury in 2-1, Volumetric Solar Beams)
    this.worldGroup.position.set(this.width * 0.5, this.height * 0.5);
    this.root.addChild(this.worldGroup);

    this.beamA = new PIXI.Sprite(this.tex('solarBeam'));
    this.beamA.anchor.set(0.05, 0.5);
    this.beamA.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.beamA);

    this.beamB = new PIXI.Sprite(this.tex('solarBeam'));
    this.beamB.anchor.set(0.05, 0.5);
    this.beamB.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.beamB);

    // Star Helios Assembly (scales continuously from distant sphere in 2-1 -> colossal burning curved wall in 2-2!)
    this.coronaSprite = new PIXI.Sprite(this.tex('solarCorona'));
    this.coronaSprite.anchor.set(0.5);
    this.coronaSprite.blendMode = PIXI.BLEND_MODES.ADD;

    this.prominenceA = new PIXI.Sprite(this.tex('prominenceArc'));
    this.prominenceA.anchor.set(0.5);
    this.prominenceA.blendMode = PIXI.BLEND_MODES.ADD;

    this.prominenceB = new PIXI.Sprite(this.tex('prominenceArc'));
    this.prominenceB.anchor.set(0.5);
    this.prominenceB.blendMode = PIXI.BLEND_MODES.ADD;

    this.heliosSprite = new PIXI.Sprite(this.tex('heliosStar'));
    this.heliosSprite.anchor.set(0.5);

    this.limbFlareSprite = new PIXI.Sprite(this.tex('limbFlare'));
    this.limbFlareSprite.anchor.set(0.5);
    this.limbFlareSprite.blendMode = PIXI.BLEND_MODES.ADD;

    this.starAssembly.addChild(
      this.coronaSprite,
      this.prominenceA,
      this.prominenceB,
      this.heliosSprite,
      this.limbFlareSprite
    );
    this.worldGroup.addChild(this.starAssembly);

    // Scorched Mercury — seen ONLY in early 2-1 as you leave its orbit behind heading toward the Sun!
    this.mercurySprite = new PIXI.Sprite(this.tex('mercuryPlanet'));
    this.mercurySprite.anchor.set(0.5);
    this.worldGroup.addChild(this.mercurySprite);

    // 4. Dual-Layer Flowing Solar Wind / Coronal Mass Ejection Plasma Ribbons (2-1 & 2-3)
    const ribbonTex = this.tex('plasmaRibbon');
    this.ribbonBack = new PIXI.TilingSprite(ribbonTex, this.width + 240, 260);
    this.ribbonBack.anchor.set(0, 0.5);
    this.ribbonBack.blendMode = PIXI.BLEND_MODES.ADD;
    this.ribbonBack.tileScale.set(1.65, 1.35);
    this.ribbonGroup.addChild(this.ribbonBack);

    this.ribbonFront = new PIXI.TilingSprite(ribbonTex, this.width + 240, 220);
    this.ribbonFront.anchor.set(0, 0.5);
    this.ribbonFront.blendMode = PIXI.BLEND_MODES.ADD;
    this.ribbonFront.tileScale.set(1.25, 1.15);
    this.ribbonGroup.addChild(this.ribbonFront);
    this.root.addChild(this.ribbonGroup);

    // 5. Stage 2-1 Phase 3 & Stage 2-2: Orderly Formation of Golden Dyson Solar Collector Sail Arrays
    const sailTex = this.tex('dysonSail');
    for (let i = 0; i < 14; i++) {
      const depthTier = i % 3; // 0 = far orbital row, 1 = mid collector line, 2 = near flyby wing
      const sprite = new PIXI.Sprite(sailTex);
      sprite.anchor.set(0.5);
      const laneY = depthTier === 0 ? 0.18 + (i % 5) * 0.16 : depthTier === 1 ? 0.22 + (i % 4) * 0.18 : 0.26 + (i % 3) * 0.24;
      const baseScale = depthTier === 0 ? 0.26 : depthTier === 1 ? 0.44 : 0.70;
      this.sailArrayGroup.addChild(sprite);
      this.collectorSails.push({
        sprite,
        xPos: (i / 14) * (this.width + 280) - 60,
        laneY,
        speedPx: depthTier === 0 ? 75 : depthTier === 1 ? 165 : 295,
        baseScale,
        parallax: depthTier === 0 ? 10 : depthTier === 1 ? 22 : 38,
        depthTier,
        tilt: -0.22 + (depthTier - 1) * 0.08,
        phase: i * 0.85,
      });
    }
    this.root.addChild(this.sailArrayGroup);

    // 6. Stage 2-2: Vertical Solar Plasma-Siphon Energy Columns harvesting plasma off Helios into the Forge Rails!
    const siphonTex = this.tex('siphonCol');
    for (let i = 0; i < 6; i++) {
      const sprite = new PIXI.Sprite(siphonTex);
      sprite.anchor.set(0.5, 0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      this.siphonGroup.addChild(sprite);
      this.siphonColumns.push({
        sprite,
        xPos: 120 + i * 210,
        speedPx: i % 2 === 0 ? 220 : 140,
        widthScale: i % 2 === 0 ? 0.72 : 0.48,
        heightScale: 2.35,
        phase: i * 1.15,
        isCyan: i % 3 === 1,
      });
    }
    this.root.addChild(this.siphonGroup);

    // 7. Stage 2-2 Phase 2 & 3: Upper & Lower Industrial Dyson Forge Megastructure Truss Trench Decks!
    // IMPORTANT: TilingSprite height MUST stay <= Math.floor(192 * tileScale.y) so the deck NEVER wraps vertically!
    const trussTex = this.tex('forgeTruss');
    this.forgeTopFar = new PIXI.TilingSprite(trussTex, this.width + 160, 138);
    this.forgeTopFar.tileScale.set(0.75, 0.76);
    this.forgeTopFar.tint = 0x996658;
    this.forgeTopFar.alpha = 0.58;
    this.forgeTrenchGroup.addChild(this.forgeTopFar);

    this.forgeTopNear = new PIXI.TilingSprite(trussTex, this.width + 160, 174);
    this.forgeTopNear.tileScale.set(1.15, 0.96);
    this.forgeTopNear.tint = 0xffe0cc;
    this.forgeTopNear.alpha = 0.94;
    this.forgeTrenchGroup.addChild(this.forgeTopNear);

    // Bottom mirrored decks (scale.y = -1 flips outer armored spine to bottom screen edge, trusses facing up!)
    this.forgeBotFar = new PIXI.TilingSprite(trussTex, this.width + 160, 138);
    this.forgeBotFar.tileScale.set(0.75, 0.76);
    this.forgeBotFar.scale.y = -1;
    this.forgeBotFar.tint = 0x996658;
    this.forgeBotFar.alpha = 0.58;
    this.forgeTrenchGroup.addChild(this.forgeBotFar);

    this.forgeBotNear = new PIXI.TilingSprite(trussTex, this.width + 160, 174);
    this.forgeBotNear.tileScale.set(1.15, 0.96);
    this.forgeBotNear.scale.y = -1;
    this.forgeBotNear.tint = 0xffe0cc;
    this.forgeBotNear.alpha = 0.94;
    this.forgeTrenchGroup.addChild(this.forgeBotNear);
    this.root.addChild(this.forgeTrenchGroup);

    // 8. Stage 2-3: Towering Solar Magnetic Flux Cathedral Arches erupting out of the chromosphere!
    const archTex = this.tex('fluxArch');
    this.fluxArchFar = new PIXI.Sprite(archTex);
    this.fluxArchFar.anchor.set(0.5, 1.0);
    this.fluxArchFar.blendMode = PIXI.BLEND_MODES.ADD;
    this.fluxArchGroup.addChild(this.fluxArchFar);

    this.fluxArchMid = new PIXI.Sprite(archTex);
    this.fluxArchMid.anchor.set(0.5, 1.0);
    this.fluxArchMid.blendMode = PIXI.BLEND_MODES.ADD;
    this.fluxArchGroup.addChild(this.fluxArchMid);

    this.fluxArchNear = new PIXI.Sprite(archTex);
    this.fluxArchNear.anchor.set(0.5, 1.0);
    this.fluxArchNear.blendMode = PIXI.BLEND_MODES.ADD;
    this.fluxArchGroup.addChild(this.fluxArchNear);
    this.root.addChild(this.fluxArchGroup);

    // 9. Stage 2-3 Finale: Open Coronal Portal Gate (Blazing Solar Vortex + 6 Containment Pylons + Plasma Jet!)
    this.portalJetSprite = new PIXI.Sprite(this.tex('solarBeam'));
    this.portalJetSprite.anchor.set(0.05, 0.5);
    this.portalJetSprite.blendMode = PIXI.BLEND_MODES.ADD;
    this.portalGroup.addChild(this.portalJetSprite);

    this.portalOuterSprite = new PIXI.Sprite(this.tex('coronalPortal'));
    this.portalOuterSprite.anchor.set(0.5);
    this.portalGroup.addChild(this.portalOuterSprite);

    this.portalInnerSprite = new PIXI.Sprite(this.tex('solarCorona'));
    this.portalInnerSprite.anchor.set(0.5);
    this.portalInnerSprite.blendMode = PIXI.BLEND_MODES.ADD;
    this.portalGroup.addChild(this.portalInnerSprite);
    this.root.addChild(this.portalGroup);

    // 10. Stage 2-3: Boiling Solar Chromosphere & Photosphere Ocean skimming along the bottom!
    const oceanTex = this.tex('solarOcean');
    this.solarOceanFar = new PIXI.TilingSprite(oceanTex, this.width + 160, 256);
    this.solarOceanFar.tileScale.set(1.75, 1.0);
    this.solarOceanFar.tint = 0xff8a66;
    this.solarOceanFar.alpha = 0.72;
    this.chromoSurfaceGroup.addChild(this.solarOceanFar);

    this.solarOceanNear = new PIXI.TilingSprite(oceanTex, this.width + 160, 256);
    this.solarOceanNear.tileScale.set(1.25, 1.0);
    this.solarOceanNear.tint = 0xffe4cc;
    this.solarOceanNear.alpha = 0.96;
    this.chromoSurfaceGroup.addChild(this.solarOceanNear);
    this.root.addChild(this.chromoSurfaceGroup);

    // 11. Drifting Ionized Embers / Solar Sparks (38 pooled)
    for (let i = 0; i < 38; i++) {
      const sprite = new PIXI.Sprite(dotTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      this.emberGroup.addChild(sprite);
      this.emberMotes.push({
        sprite,
        xPos: seeded01(i, 41.3) * (this.width + 160),
        yNorm: seeded01(i, 42.7),
        speedPx: 46 + seeded01(i, 43.4) * 98,
        driftPhase: seeded01(i, 44.2) * Math.PI * 2,
        baseAlpha: 0.16 + seeded01(i, 45.1) * 0.30,
        scale: 0.08 + seeded01(i, 46.1) * 0.18,
        parallax: 18 + seeded01(i, 46.9) * 26,
      });
    }
    this.root.addChild(this.emberGroup);

    // 12. Dynamic Solar Wind & Coronal Ejection Speedlines (42 pooled)
    const streakTex = this.tex('warpStreak');
    for (let i = 0; i < 42; i++) {
      const sprite = new PIXI.Sprite(streakTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      this.streakGroup.addChild(sprite);
      const widthPx = 78 + seeded01(i, 51.2) * 165;
      const heightPx = 1.4 + seeded01(i, 52.8) * 2.2;
      sprite.width = widthPx;
      sprite.height = heightPx;
      this.streaks.push({
        sprite,
        xPos: seeded01(i, 53.4) * (this.width + 260),
        yNorm: seeded01(i, 54.9),
        speedPx: 420 + seeded01(i, 55.7) * 560,
        baseAlpha: 0.12 + seeded01(i, 56.3) * 0.24,
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

    // 14. Left-Lane Contrast Vignette so player & bullets pop razor-clear even inside the Sun's corona!
    this.leftVeilSprite = new PIXI.Sprite(this.createLeftVeilTexture());
    this.leftVeilSprite.width = Math.round(this.width * 0.40);
    this.leftVeilSprite.height = this.height;
    this.leftVeilSprite.alpha = 0.28;
    this.root.addChild(this.leftVeilSprite);
  }

  private applyStagePalette(stageId: World2StageId): void {
    const starPalettes: Record<World2StageId, number[]> = {
      'normal-2-1': [0xffffff, 0xfde68a, 0xfb923c, 0x7dd3fc, 0xfffbeb],
      'normal-2-2': [0xffffff, 0xffd166, 0xff6b35, 0x38bdf8, 0xfecaca],
      'normal-2-3': [0xfffbeb, 0xffdd00, 0xff6b6b, 0xff9f43, 0xfde68a],
    };
    const emberPalettes: Record<World2StageId, number[]> = {
      'normal-2-1': [0xfbbf24, 0xf97316, 0x38bdf8, 0xfef3c7],
      'normal-2-2': [0xff6b35, 0xffd166, 0x22d3ee, 0xffedd5],
      'normal-2-3': [0xff4d6d, 0xffdd00, 0xff8800, 0xfff1f2],
    };
    const streakPalettes: Record<World2StageId, [number, number]> = {
      'normal-2-1': [0xfbbf24, 0x38bdf8],
      'normal-2-2': [0xff922b, 0x22d3ee],
      'normal-2-3': [0xff4d6d, 0xffdd55],
    };

    const skyKey = stageId === 'normal-2-2' ? 'sky2_2' : stageId === 'normal-2-3' ? 'sky2_3' : 'sky2_1';
    this.nebulaSprite.texture = this.tex(skyKey);

    const sp = starPalettes[stageId];
    for (let i = 0; i < this.stars.length; i++) {
      this.stars[i].sprite.tint = sp[i % sp.length];
    }

    const ep = emberPalettes[stageId];
    for (let i = 0; i < this.emberMotes.length; i++) {
      this.emberMotes[i].sprite.tint = ep[i % ep.length];
    }

    const [stA, stB] = streakPalettes[stageId];
    for (let i = 0; i < this.streaks.length; i++) {
      this.streaks[i].sprite.tint = i % 3 === 0 ? stB : stA;
      this.streaks[i].angle = stageId === 'normal-2-1' ? -0.05 : stageId === 'normal-2-3' ? -0.16 : 0;
      this.streaks[i].sprite.rotation = this.streaks[i].angle;
    }
  }

  public update(ctx: World2FrameContext): void {
    const t = Math.max(0, ctx.stageTime);
    const clk = ctx.clockTime;
    const dt = this.lastClockTime > 0 ? Math.min(0.1, Math.max(0, clk - this.lastClockTime)) : 1 / 60;
    this.lastClockTime = clk;

    const pxNorm = clamp01(ctx.playerX / Math.max(1, this.width)) - 0.5;
    const pyNorm = clamp01(ctx.playerY / Math.max(1, this.height)) - 0.5;
    const bossBoost = ctx.bossActive ? 1.0 : 0.0;

    // Cleanly reset optional layers before active stage choreography
    this.starAssembly.visible = false;
    this.mercurySprite.visible = false;
    this.ribbonGroup.visible = false;
    this.sailArrayGroup.visible = false;
    this.siphonGroup.visible = false;
    this.forgeTrenchGroup.visible = false;
    this.chromoSurfaceGroup.visible = false;
    this.fluxArchGroup.visible = false;
    this.portalGroup.visible = false;
    this.beamA.visible = false;
    this.beamB.visible = false;
    this.phaseVeilSprite.alpha = 0;

    if (this.activeStageId === 'normal-2-1') {
      this.updateStage2_1(t, clk, dt, pxNorm, pyNorm, bossBoost);
    } else if (this.activeStageId === 'normal-2-2') {
      this.updateStage2_2(t, clk, dt, pxNorm, pyNorm, bossBoost);
    } else {
      this.updateStage2_3(t, clk, dt, pxNorm, pyNorm, bossBoost);
    }
    this.phaseVeilSprite.visible = this.phaseVeilSprite.alpha > 0.005;
  }

  private updateCommonParticles(
    clk: number,
    dt: number,
    pxNorm: number,
    pyNorm: number,
    starSpeedMult: number,
    starVisMult: number,
    emberAlpha: number,
    streakAlpha: number,
    streakSpeedMult: number
  ): void {
    this.starGroup.visible = starVisMult > 0.02;
    if (this.starGroup.visible) {
      for (const s of this.stars) {
        s.xNorm = (s.xNorm - s.speed * starSpeedMult * dt + 1.0) % 1.0;
        s.sprite.position.set(
          s.xNorm * this.width - pxNorm * s.parallax,
          s.yNorm * this.height - pyNorm * s.parallax * 0.65
        );
        s.sprite.alpha = s.baseAlpha * starVisMult * (0.72 + 0.28 * Math.sin(clk * s.twinkleRate + s.phase));
      }
    }

    for (const e of this.emberMotes) {
      e.xPos -= e.speedPx * starSpeedMult * dt;
      if (e.xPos < -60) e.xPos = this.width + 60;
      e.sprite.position.set(
        e.xPos - pxNorm * e.parallax,
        e.yNorm * this.height + Math.sin(clk * 1.05 + e.driftPhase) * 16 - pyNorm * e.parallax
      );
      e.sprite.scale.set(e.scale);
      e.sprite.alpha = e.baseAlpha * emberAlpha;
    }

    this.streakGroup.visible = streakAlpha > 0.01;
    if (this.streakGroup.visible) {
      for (const st of this.streaks) {
        st.xPos -= st.speedPx * streakSpeedMult * dt;
        if (st.xPos < -st.widthPx) st.xPos = this.width + st.widthPx;
        const yOff = st.angle !== 0 ? (this.width - st.xPos) * Math.sin(st.angle) * 0.24 : 0;
        st.sprite.position.set(st.xPos, (((st.yNorm * this.height + yOff) % this.height) + this.height) % this.height);
        st.sprite.alpha = st.baseAlpha * streakAlpha;
      }
    }
  }

  /**
   * STAGE 2-1: Corriente de Viento Solar (138s + Boss)
   *   Phase 1 (0–46s):   Leaving Mercury's Orbit — Mercury recedes behind-left while Star Helios looms ahead!
   *   Phase 2 (46–96s):  Ionized Solar Wind Stream — Dual silky gold & cyan plasma ribbons + acceleration toward Helios!
   *   Phase 3 (96–138s+): Outer Corona & First Dyson Collector Sails — Helios fills the right horizon as golden collector arrays appear ahead (direct lead-in to 2-2!)
   */
  private updateStage2_1(t: number, clk: number, dt: number, pxNorm: number, pyNorm: number, bossBoost: number): void {
    const p2 = smoothstep(42, 52, t);
    const p3 = smoothstep(92, 104, t);
    const inStream = p2 * (1 - p3);
    const trans12 = pulseBell(t, 47, 5.5);
    const trans23 = pulseBell(t, 98, 6.0);

    this.nebulaSprite.x = this.width * 0.5 - pxNorm * 14 + Math.sin(clk * 0.06) * 18;
    this.nebulaSprite.y = this.height * 0.5 - pyNorm * 10 + Math.cos(clk * 0.05) * 10;
    const nebScale = 1.18 + p2 * 0.06 + p3 * 0.06;
    this.nebulaSprite.scale.set(
      (this.width * nebScale) / Math.max(1, this.nebulaSprite.texture.width),
      (this.height * nebScale) / Math.max(1, this.nebulaSprite.texture.height)
    );

    this.worldGroup.scale.set(lerp(0.84, 1.02, p2) + p3 * 0.18);
    this.worldGroup.rotation = lerp(0.015, -0.052, inStream) + p3 * 0.025 + Math.sin(clk * 0.24) * 0.012;
    this.worldGroup.position.set(this.width * 0.5 - pxNorm * 24, this.height * 0.5 - pyNorm * 16);

    // Continuity: Mercury starts behind-left and smoothly drifts OFF-SCREEN left as you plunge inward toward the Sun!
    const mercLeave = smoothstep(32, 92, t);
    this.mercurySprite.visible = mercLeave < 0.99;
    this.mercurySprite.position.set(lerp(-this.width * 0.26, -this.width * 0.68, mercLeave), lerp(this.height * 0.22, this.height * 0.34, mercLeave));
    this.mercurySprite.scale.set(lerp(0.32, 0.14, mercLeave));
    this.mercurySprite.alpha = (1.0 - mercLeave) * 0.92;

    // Star Helios continuously grows massive on the right — setting up 2-2's giant boiling solar wall!
    this.starAssembly.visible = true;
    const starX = lerp(this.width * 0.34, this.width * 0.32, p2) + p3 * 52;
    const starY = lerp(-this.height * 0.02, -this.height * 0.03, p2) + Math.sin(clk * 0.22) * 5;
    this.starAssembly.position.set(starX, starY);
    this.starAssembly.scale.set(lerp(0.84, 1.12, p2) + p3 * 0.42);

    this.heliosSprite.visible = true;
    this.heliosSprite.alpha = 1.0;
    this.heliosSprite.rotation = clk * 0.018;

    const coronaPulse = 1.0 + Math.sin(clk * 1.4) * 0.04 + bossBoost * 0.07;
    this.coronaSprite.visible = true;
    this.coronaSprite.scale.set((1.48 + p3 * 0.26) * coronaPulse);
    this.coronaSprite.rotation = clk * 0.032;
    this.coronaSprite.alpha = 0.54 + inStream * 0.14 + p3 * 0.22;
    this.coronaSprite.tint = 0xffcf70;

    this.prominenceA.visible = true;
    this.prominenceA.scale.set(1.06 + p3 * 0.08);
    this.prominenceA.rotation = clk * 0.095;
    this.prominenceA.alpha = 0.44 + p2 * 0.18 + p3 * 0.26;
    this.prominenceA.tint = 0xff8a2b;

    this.prominenceB.visible = true;
    this.prominenceB.scale.set(1.12 + p3 * 0.08);
    this.prominenceB.rotation = -clk * 0.072 + 1.8;
    this.prominenceB.alpha = 0.32 + p3 * 0.30;
    this.prominenceB.tint = 0xffd166;

    this.limbFlareSprite.visible = true;
    this.limbFlareSprite.position.set(-132, -104);
    this.limbFlareSprite.scale.set((0.86 + p3 * 0.34) * coronaPulse, (0.64 + p3 * 0.22) * coronaPulse);
    this.limbFlareSprite.alpha = 0.46 + inStream * 0.14 + p3 * 0.32;
    this.limbFlareSprite.tint = 0xfff3c4;

    // Volumetric Solar Wind & Flare Rays
    this.beamA.visible = p2 > 0.05;
    this.beamA.tint = 0x38bdf8;
    this.beamA.position.set(starX - 80, starY - 55);
    this.beamA.rotation = 2.86 + Math.sin(clk * 0.52) * 0.16;
    this.beamA.scale.set(3.2, 1.35);
    this.beamA.alpha = inStream * 0.30 + p3 * 0.24 + bossBoost * 0.10;

    this.beamB.visible = p3 > 0.05;
    this.beamB.tint = 0xfbbf24;
    this.beamB.position.set(starX - 65, starY + 45);
    this.beamB.rotation = 3.32 + Math.cos(clk * 0.44) * 0.14;
    this.beamB.scale.set(3.4, 1.45);
    this.beamB.alpha = p3 * (0.34 + bossBoost * 0.14);

    // Phase 2 Signature: Dual-Layer Flowing Gold & Cyan Solar Wind Ribbons
    const ribbonVis = clamp01(0.16 + inStream * 0.84 + p3 * 0.24);
    this.ribbonGroup.visible = ribbonVis > 0.02;
    if (this.ribbonGroup.visible) {
      const scrollMult = 1.0 + inStream * 1.45 + p3 * 0.55;
      this.ribbonBack.position.set(-100, this.height * 0.34 - pyNorm * 14);
      this.ribbonBack.rotation = -0.04;
      this.ribbonBack.tilePosition.x -= 210 * scrollMult * dt;
      this.ribbonBack.tint = 0x38bdf8;
      this.ribbonBack.alpha = ribbonVis * 0.34;

      this.ribbonFront.position.set(-100, this.height * 0.64 - pyNorm * 24);
      this.ribbonFront.rotation = 0.03;
      this.ribbonFront.tilePosition.x -= 340 * scrollMult * dt;
      this.ribbonFront.tint = 0xfbbf24;
      this.ribbonFront.alpha = ribbonVis * 0.44;
    }

    // Foreshadowing Stage 2-2: Distant orderly golden Dyson collector sails silhouette against the Sun in Phase 3!
    if (p3 > 0.08) {
      this.sailArrayGroup.visible = true;
      for (const sail of this.collectorSails) {
        if (sail.depthTier !== 0) {
          sail.sprite.visible = false;
          continue;
        }
        sail.sprite.visible = true;
        sail.xPos -= sail.speedPx * 1.15 * dt;
        if (sail.xPos < -120) sail.xPos = this.width + 120;
        sail.sprite.position.set(
          sail.xPos - pxNorm * sail.parallax,
          sail.laneY * this.height + Math.sin(clk * 0.8 + sail.phase) * 8 - pyNorm * sail.parallax * 0.5
        );
        sail.sprite.scale.set(sail.baseScale * 0.82);
        sail.sprite.rotation = sail.tilt;
        sail.sprite.alpha = p3 * 0.62;
        sail.sprite.tint = 0xffdfa0;
      }
    }

    this.phaseVeilSprite.tint = trans23 > trans12 ? 0xffd166 : 0x7dd3fc;
    this.phaseVeilSprite.alpha = Math.max(trans12 * 0.22, trans23 * 0.26);

    this.updateCommonParticles(
      clk,
      dt,
      pxNorm,
      pyNorm,
      1.1 + inStream * 1.55 + p3 * 0.65 + bossBoost * 0.32,
      1.0 - p3 * 0.22,
      0.56 + inStream * 0.44 + p3 * 0.32,
      0.20 + inStream * 0.82 + p3 * 0.36 + trans12 * 0.42 + bossBoost * 0.24,
      0.95 + inStream * 1.25 + p3 * 0.45
    );
  }

  /**
   * STAGE 2-2: Forja Orbital de Mercurio (156s + Boss)
   *   CONTINUOUS INWARD JOURNEY — You stay RIGHT BESIDE the colossal burning Sun (NO planet backtrack, NO World 1 copy!):
   *   Phase 1 (0–52s):    Muro Fotosférico y Enjambre Colector — Giant boiling curved solar wall fills the right edge while orderly golden Dyson collector sails glide past!
   *   Phase 2 (52–108s):  Trinchera de la Forja Dyson — Massive upper & lower scrolling industrial Dyson Foundry girders close in framing the arena + glowing vertical Plasma-Siphon energy columns harvesting fire off the Sun!
   *   Phase 3 (108–156s+): Crisol Termosolar — Diving even closer to the boiling solar limb inside the illuminated superstructure with converging cyan & gold collector beams leading straight into the Sun's corona (2-3)!
   */
  private updateStage2_2(t: number, clk: number, dt: number, pxNorm: number, pyNorm: number, bossBoost: number): void {
    const p2 = smoothstep(48, 58, t);
    const p3 = smoothstep(104, 116, t);
    const inTrench = p2 * (1 - p3);
    const trans12 = pulseBell(t, 53, 5.5);
    const trans23 = pulseBell(t, 110, 6.0);

    // Hot crimson-amber inner-corona foundry sky
    this.nebulaSprite.x = this.width * 0.5 - pxNorm * 14 + Math.sin(clk * 0.08) * 16;
    this.nebulaSprite.y = this.height * 0.5 - pyNorm * 10;
    const nebScale = 1.18 + p2 * 0.06 + p3 * 0.08;
    this.nebulaSprite.scale.set(
      (this.width * nebScale) / Math.max(1, this.nebulaSprite.texture.width),
      (this.height * nebScale) / Math.max(1, this.nebulaSprite.texture.height)
    );

    // Subtle kinetic trench roll (no disorienting spin)
    this.worldGroup.scale.set(1.0 + p3 * 0.10);
    this.worldGroup.rotation = lerp(-0.015, 0.025, inTrench) + Math.sin(clk * 0.25) * 0.008;
    this.worldGroup.position.set(this.width * 0.5 - pxNorm * 18, this.height * 0.5 - pyNorm * 12);

    // DIRECT CONTINUITY FROM 2-1 PHASE 3: Colossal curved boiling Photosphere Wall of Star Helios fills the right side!
    this.starAssembly.visible = true;
    const solarScale = lerp(2.15, 2.55, p2) + p3 * 0.55;
    const solarX = lerp(this.width * 0.66, this.width * 0.72, p2) - p3 * 36;
    const solarY = lerp(this.height * 0.08, this.height * 0.14, p3) + Math.sin(clk * 0.20) * 6;
    this.starAssembly.position.set(solarX, solarY);
    this.starAssembly.scale.set(solarScale);

    this.heliosSprite.visible = true;
    this.heliosSprite.alpha = 1.0;
    this.heliosSprite.rotation = clk * 0.012;

    const coronaPulse = 1.0 + Math.sin(clk * 1.5) * 0.035 + bossBoost * 0.06;
    this.coronaSprite.visible = true;
    this.coronaSprite.scale.set(1.42 * coronaPulse);
    this.coronaSprite.rotation = clk * 0.022;
    this.coronaSprite.alpha = 0.58 + p3 * 0.20;
    this.coronaSprite.tint = 0xffb347;

    this.prominenceA.visible = true;
    this.prominenceA.scale.set(1.06);
    this.prominenceA.rotation = clk * 0.065;
    this.prominenceA.alpha = 0.44 + p3 * 0.28;
    this.prominenceA.tint = 0xff6b35;

    this.prominenceB.visible = true;
    this.prominenceB.scale.set(1.12);
    this.prominenceB.rotation = -clk * 0.048 + 1.4;
    this.prominenceB.alpha = 0.28 + p3 * 0.30;
    this.prominenceB.tint = 0xffd166;

    // Blazing limb prominence flash tucked onto the visible left curve of the massive Sun!
    this.limbFlareSprite.visible = true;
    this.limbFlareSprite.position.set(-158, -56);
    this.limbFlareSprite.scale.set(0.62 * coronaPulse, 0.44 * coronaPulse);
    this.limbFlareSprite.alpha = 0.42 + p3 * 0.30;
    this.limbFlareSprite.tint = 0xfff0c2;

    // Orderly multi-depth Golden Dyson Collector Sails drifting past the solar wall (prominent in Phase 1 & 2!)
    this.sailArrayGroup.visible = true;
    const sailSpeedMult = 0.95 + inTrench * 0.90 + p3 * 0.45;
    for (const sail of this.collectorSails) {
      sail.sprite.visible = true;
      // In Phase 2/3 tuck sails cleanly between the upper & lower industrial forge girders (y = 0.26..0.74)
      const clampedY = lerp(sail.laneY, 0.28 + sail.laneY * 0.44, p2);
      sail.xPos -= sail.speedPx * sailSpeedMult * dt;
      if (sail.xPos < -140) sail.xPos = this.width + 140;

      const tierAlpha =
        sail.depthTier === 2
          ? (1.0 - p2 * 0.70) * 0.56
          : sail.depthTier === 1
            ? (0.62 - p3 * 0.22)
            : 0.44;
      sail.sprite.position.set(
        sail.xPos - pxNorm * sail.parallax,
        clampedY * this.height + Math.sin(clk * 0.9 + sail.phase) * 9 - pyNorm * sail.parallax * 0.5
      );
      sail.sprite.scale.set(sail.baseScale * 0.92);
      sail.sprite.rotation = sail.tilt * 0.55 + Math.sin(clk * 0.5 + sail.phase) * 0.03;
      sail.sprite.alpha = tierAlpha;
      sail.sprite.tint = sail.depthTier === 0 ? 0xd99b66 : 0xffe4a8;
    }

    // Phase 2 & 3 SIGNATURE SET-PIECE #1: Vertical Solar Plasma-Siphon Columns pulling fire straight off the Sun!
    const siphonVis = smoothstep(46, 58, t);
    if (siphonVis > 0.01) {
      this.siphonGroup.visible = true;
      const colSpeedMult = 1.0 + inTrench * 0.65 + p3 * 0.45;
      for (const col of this.siphonColumns) {
        col.xPos -= col.speedPx * colSpeedMult * dt;
        if (col.xPos < -110) col.xPos = this.width + 130;
        const pulse = 0.72 + 0.28 * Math.sin(clk * 3.4 + col.phase);
        col.sprite.position.set(col.xPos - pxNorm * 26, this.height * 0.5);
        col.sprite.scale.set(col.widthScale * (0.85 + p3 * 0.25), col.heightScale);
        col.sprite.rotation = 0.09; // Slightly angled toward the Sun on the right!
        col.sprite.tint = col.isCyan ? 0x38bdf8 : 0xffaa33;
        col.sprite.alpha = siphonVis * pulse * (col.isCyan ? 0.34 : 0.42 + bossBoost * 0.10);
      }
    }

    // Phase 2 & 3 SIGNATURE SET-PIECE #2: Giant Upper & Lower Industrial Dyson Forge Megastructure Girders!
    // In Phase 3 the trench smoothly widens outward as the colossal boiling solar limb & first magnetic prominence arch emerge!
    const trenchVis = smoothstep(46, 58, t);
    if (trenchVis > 0.01) {
      this.forgeTrenchGroup.visible = true;
      const scrollSpd = 1.0 + inTrench * 0.75 + p3 * 0.40;
      const topNearY = lerp(-180, -14 - p3 * 52, trenchVis);
      const topFarY = lerp(-150, 12 - p3 * 46, trenchVis);
      const botNearY = lerp(this.height + 180, this.height + 14 + p3 * 52, trenchVis);
      const botFarY = lerp(this.height + 150, this.height - 12 + p3 * 46, trenchVis);

      this.forgeTopFar.position.set(-80, topFarY - pyNorm * 10);
      this.forgeTopFar.tilePosition.x -= 130 * scrollSpd * dt;
      this.forgeTopFar.alpha = trenchVis * (0.58 - p3 * 0.16);

      this.forgeTopNear.position.set(-80, topNearY - pyNorm * 22);
      this.forgeTopNear.tilePosition.x -= 290 * scrollSpd * dt;
      this.forgeTopNear.alpha = trenchVis * (0.94 - p3 * 0.12);

      this.forgeBotFar.position.set(-80, botFarY - pyNorm * 10);
      this.forgeBotFar.tilePosition.x -= 130 * scrollSpd * dt;
      this.forgeBotFar.alpha = trenchVis * (0.58 - p3 * 0.16);

      this.forgeBotNear.position.set(-80, botNearY - pyNorm * 22);
      this.forgeBotNear.tilePosition.x -= 290 * scrollSpd * dt;
      this.forgeBotNear.alpha = trenchVis * (0.94 - p3 * 0.12);
    }

    // Foreshadowing Stage 2-3: First towering magnetic prominence arch rises off the solar limb in Phase 3!
    if (p3 > 0.08) {
      this.fluxArchGroup.visible = true;
      this.fluxArchFar.visible = false;
      this.fluxArchNear.visible = false;
      this.fluxArchMid.visible = true;
      this.fluxArchMid.position.set(this.width * 0.76 - pxNorm * 22, this.height + 28);
      this.fluxArchMid.scale.set(1.45, 1.35);
      this.fluxArchMid.rotation = -0.35;
      this.fluxArchMid.tint = 0xff7b38;
      this.fluxArchMid.alpha = p3 * 0.56;
    }

    // Phase 3 Converging Crucible Collector Beams (cyan coolant + molten gold firing across the trench!)
    this.beamA.visible = p3 > 0.05;
    this.beamA.tint = 0x22d3ee;
    this.beamA.position.set(this.width * 0.32, -this.height * 0.32);
    this.beamA.rotation = 2.62 + Math.sin(clk * 0.5) * 0.12;
    this.beamA.scale.set(3.4, 1.15);
    this.beamA.alpha = p3 * (0.30 + bossBoost * 0.14);

    this.beamB.visible = p3 > 0.05;
    this.beamB.tint = 0xff922b;
    this.beamB.position.set(this.width * 0.34, this.height * 0.28);
    this.beamB.rotation = 3.58 + Math.cos(clk * 0.44) * 0.12;
    this.beamB.scale.set(3.5, 1.35);
    this.beamB.alpha = p3 * (0.36 + bossBoost * 0.14);

    // Subtle ember/cyan phase transition shimmer
    this.phaseVeilSprite.tint = trans23 > trans12 ? 0xff7b38 : 0x67e8f9;
    this.phaseVeilSprite.alpha = Math.max(trans12 * 0.22, trans23 * 0.24);

    this.updateCommonParticles(
      clk,
      dt,
      pxNorm,
      pyNorm,
      1.15 + inTrench * 1.35 + p3 * 0.65 + bossBoost * 0.30,
      0.58 - p3 * 0.28, // Stars dim naturally as Helios's blinding glow dominates!
      0.66 + inTrench * 0.44 + p3 * 0.34,
      0.22 + inTrench * 0.72 + p3 * 0.38 + trans12 * 0.42 + bossBoost * 0.24,
      1.0 + inTrench * 1.15 + p3 * 0.45
    );
  }

  /**
   * STAGE 2-3: Portal de Eyección Coronal (90s + Boss)
   *   FINAL INWARD PLUNGE — Directly INSIDE Star Helios's Chromosphere & Erupting Corona (NEVER pops back out to space!):
   *   Phase 1 (0–30s):  Bóveda Cromosférica — Boiling golden-crimson solar photosphere ocean roils along the bottom while towering Magnetic Flux Cathedral Arches loom ahead!
   *   Phase 2 (30–62s): Tormenta de Eyección Coronal — Violent CME surge! Sweeping diagonal ruby-gold plasma curtains, surging arches & fierce coronal embers!
   *   Phase 3 (62–90s+): Portal Coronal — Inside the roaring eruption opens the monumental Architectural Coronal Portal Gate (6 solar containment pylons + blazing golden plasma vortex + coronal jet)!
   */
  private updateStage2_3(t: number, clk: number, dt: number, pxNorm: number, pyNorm: number, bossBoost: number): void {
    const p2 = smoothstep(26, 35, t);
    const p3 = smoothstep(58, 68, t);
    const inCme = p2 * (1 - p3);
    const trans12 = pulseBell(t, 30.5, 4.5);
    const trans23 = pulseBell(t, 63, 5.0);

    // Deep blazing crimson-gold coronal atmosphere (no cold empty space!)
    this.nebulaSprite.x = this.width * 0.5 - pxNorm * 14 + Math.sin(clk * 0.08) * 16;
    this.nebulaSprite.y = this.height * 0.5 - pyNorm * 10;
    const nebScale = 1.20 + p2 * 0.06 + p3 * 0.06;
    this.nebulaSprite.scale.set(
      (this.width * nebScale) / Math.max(1, this.nebulaSprite.texture.width),
      (this.height * nebScale) / Math.max(1, this.nebulaSprite.texture.height)
    );

    this.worldGroup.scale.set(1.0 + p2 * 0.06);
    this.worldGroup.rotation = lerp(0.0, -0.04, inCme) + Math.sin(clk * 0.26) * 0.010;
    this.worldGroup.position.set(this.width * 0.5 - pxNorm * 18, this.height * 0.5 - pyNorm * 12);

    // 1. Towering Magnetic Flux Cathedral Arches rising straight out of the boiling solar ocean!
    this.fluxArchGroup.visible = true;
    this.fluxArchFar.visible = true;
    this.fluxArchMid.visible = true;
    this.fluxArchNear.visible = true;
    const archSurgeY = this.height - 64 + p3 * 22;

    this.fluxArchFar.position.set(this.width * 0.36 - pxNorm * 12 + Math.sin(clk * 0.28) * 28, archSurgeY + 12);
    this.fluxArchFar.scale.set(1.35 + inCme * 0.25, 1.25 + inCme * 0.30);
    this.fluxArchFar.rotation = -0.14;
    this.fluxArchFar.tint = 0xff4d6d;
    this.fluxArchFar.alpha = 0.42 + inCme * 0.24 - p3 * 0.10;

    this.fluxArchMid.position.set(this.width * 0.72 - pxNorm * 22 + Math.cos(clk * 0.34) * 22, archSurgeY + 24);
    this.fluxArchMid.scale.set(1.55 + inCme * 0.28, 1.48 + inCme * 0.32);
    this.fluxArchMid.rotation = 0.08;
    this.fluxArchMid.tint = 0xff9f43;
    this.fluxArchMid.alpha = 0.54 + inCme * 0.26 - p3 * 0.14;

    this.fluxArchNear.position.set(this.width * 0.16 - pxNorm * 32, archSurgeY + 34);
    this.fluxArchNear.scale.set(1.15 + inCme * 0.22, 1.05 + inCme * 0.28);
    this.fluxArchNear.rotation = -0.22;
    this.fluxArchNear.tint = 0xffd166;
    this.fluxArchNear.alpha = 0.28 + inCme * 0.34;

    // 2. Phase 2 Signature: Diagonal Coronal Mass Ejection Plasma Curtains roaring upward from the chromosphere!
    const cmeVis = clamp01(0.22 + inCme * 0.78 + p3 * 0.26);
    this.ribbonGroup.visible = cmeVis > 0.02;
    if (this.ribbonGroup.visible) {
      const scrollMult = 1.2 + inCme * 1.55 + p3 * 0.50;
      this.ribbonBack.position.set(-100, this.height * 0.26 - pyNorm * 14);
      this.ribbonBack.rotation = -0.14;
      this.ribbonBack.tilePosition.x -= 260 * scrollMult * dt;
      this.ribbonBack.tint = 0xff3b5c;
      this.ribbonBack.alpha = cmeVis * 0.42;

      this.ribbonFront.position.set(-100, this.height * 0.58 - pyNorm * 24);
      this.ribbonFront.rotation = -0.18;
      this.ribbonFront.tilePosition.x -= 390 * scrollMult * dt;
      this.ribbonFront.tint = 0xffae34;
      this.ribbonFront.alpha = cmeVis * 0.48;
    }

    // 3. Phase 3 FINALE SIGNATURE: Monumental Open Coronal Portal Gate framed cleanly above the boiling solar ocean!
    const portalAppear = smoothstep(50, 68, t);
    if (portalAppear > 0.01) {
      this.portalGroup.visible = true;
      const pX = lerp(this.width * 0.88, this.width * 0.73, portalAppear) - pxNorm * 22;
      const pY = this.height * 0.43 - pyNorm * 14 + Math.sin(clk * 0.36) * 5;
      this.portalGroup.position.set(pX, pY);

      const pulse = 1.0 + Math.sin(clk * 1.8) * 0.035 + bossBoost * 0.06;
      this.portalOuterSprite.scale.set(lerp(0.52, 0.86, portalAppear) * pulse);
      this.portalOuterSprite.rotation = clk * 0.14;
      this.portalOuterSprite.alpha = portalAppear * 0.96;

      this.portalInnerSprite.scale.set(lerp(0.70, 1.20, portalAppear) * pulse);
      this.portalInnerSprite.rotation = -clk * 0.22;
      this.portalInnerSprite.tint = 0xffb84d;
      this.portalInnerSprite.alpha = portalAppear * (0.48 + bossBoost * 0.14);

      // Blazing coronal plasma jet streaming leftward out of the Portal aperture!
      this.portalJetSprite.position.set(-20, 0);
      this.portalJetSprite.rotation = Math.PI + Math.sin(clk * 0.45) * 0.06;
      this.portalJetSprite.scale.set(3.8 * portalAppear, 1.40 + bossBoost * 0.22);
      this.portalJetSprite.tint = 0xffb84d;
      this.portalJetSprite.alpha = portalAppear * (0.38 + bossBoost * 0.14);
    }

    // Sweeping coronal cathedral rays in Phase 3
    this.beamA.visible = p3 > 0.05;
    this.beamA.tint = 0xff4d6d;
    this.beamA.position.set(this.width * 0.22, -this.height * 0.18);
    this.beamA.rotation = 2.66 + Math.sin(clk * 0.48) * 0.15;
    this.beamA.scale.set(3.3, 1.35);
    this.beamA.alpha = p3 * (0.30 + bossBoost * 0.14);

    this.beamB.visible = p3 > 0.05;
    this.beamB.tint = 0xffdd55;
    this.beamB.position.set(this.width * 0.24, this.height * 0.16);
    this.beamB.rotation = 3.48 + Math.cos(clk * 0.42) * 0.15;
    this.beamB.scale.set(3.2, 1.25);
    this.beamB.alpha = p3 * (0.28 + bossBoost * 0.14);

    // 4. Continuous Boiling Solar Chromosphere & Photosphere Ocean roiling beneath you across ALL of 2-3!
    this.chromoSurfaceGroup.visible = true;
    const oceanSpeed = 1.0 + inCme * 0.85 + p3 * 0.30;
    const farY = this.height - 216 + p3 * 24;
    const nearY = this.height - 156 + p3 * 26;

    this.solarOceanFar.position.set(-80, farY - pyNorm * 12);
    this.solarOceanFar.tilePosition.x -= 165 * oceanSpeed * dt;
    this.solarOceanFar.alpha = 0.74;

    this.solarOceanNear.position.set(-80, nearY - pyNorm * 24);
    this.solarOceanNear.tilePosition.x -= 310 * oceanSpeed * dt;
    this.solarOceanNear.alpha = 0.96;

    // Warm ruby-gold phase-transition shimmer
    this.phaseVeilSprite.tint = trans23 > trans12 ? 0xffdd70 : 0xff4d6d;
    this.phaseVeilSprite.alpha = Math.max(trans12 * 0.24, trans23 * 0.26);

    this.updateCommonParticles(
      clk,
      dt,
      pxNorm,
      pyNorm,
      1.20 + inCme * 1.55 + p3 * 0.65 + bossBoost * 0.36,
      0.16, // Deep inside the solar corona — almost no background stars, pure atmospheric plasma & embers!
      0.66 + inCme * 0.48 + p3 * 0.36,
      0.28 + inCme * 0.82 + p3 * 0.40 + trans12 * 0.46 + bossBoost * 0.28,
      1.05 + inCme * 1.30 + p3 * 0.48
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

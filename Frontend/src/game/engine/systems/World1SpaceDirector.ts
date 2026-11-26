import * as PIXI from 'pixi.js';

export type World1StageId = 'normal-1-1' | 'normal-1-2' | 'normal-1-3';

export interface World1FrameContext {
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

interface DustMote {
  sprite: PIXI.Sprite;
  xPos: number;
  yNorm: number;
  speedPx: number;
  driftPhase: number;
  baseAlpha: number;
  scale: number;
  parallax: number;
}

interface FlightStreak {
  sprite: PIXI.Sprite;
  xPos: number;
  yNorm: number;
  speedPx: number;
  baseAlpha: number;
  widthPx: number;
  heightPx: number;
  angle: number;
}

interface DebrisPiece {
  sprite: PIXI.Sprite;
  xPos: number;
  yNorm: number;
  speedPx: number;
  vyPx: number;
  rotSpeed: number;
  baseScale: number;
  parallax: number;
  depthTier: number; // 0 = far, 1 = mid, 2 = near
  isPanel: boolean;
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

function buildNebulaFrag(
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

  vec2 q = vec2(fbm5(p * 2.1 + vec2(0.4, -0.8)), fbm5(p * 2.1 + vec2(5.2, 1.3)));
  float n1 = fbm5(p * 2.5 + q * 1.45);
  float n2 = fbm5(p * 4.6 - q * 1.05 + vec2(3.1, -2.4));
  float dustLane = smoothstep(0.36, 0.74, fbm5(p * 3.2 + vec2(-1.4, 2.3)));

  vec3 deepSpace = mix(vec3(${topRGB}), vec3(${botRGB}), smoothstep(0.0, 1.0, uv.y));
  vec3 cA = vec3(${cloudARgb}) * pow(n1, 1.5) * 0.92;
  vec3 cB = vec3(${cloudBRgb}) * smoothstep(0.46, 0.86, n2) * (1.0 - dustLane * 0.62) * 0.54;
  vec3 wisp = vec3(${wispRgb}) * smoothstep(0.60, 0.92, n2 * n1 * 1.55) * 0.36;

  float bandDist = abs((uv.y - 0.5) * 0.85 + (uv.x - 0.5) * 0.42);
  float band = exp(-bandDist * bandDist * 8.0) * (0.42 + 0.58 * n1);
  vec3 bandCol = mix(vec3(${cloudARgb}), vec3(${cloudBRgb}), 0.45) * band * 0.35;

  gl_FragColor = vec4(deepSpace + cA + cB + wisp + bandCol, 1.0);
}
`.trim();
}

const DISTANT_GALAXY_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float c = cos(0.42), s = sin(0.42);
  vec2 q = mat2(c, -s, s, c) * p;
  q.y *= 2.45;
  float r = length(q);
  float ang = atan(q.y, q.x);

  float spiralA = sin(ang * 2.0 - r * 7.5 + fbm5(q * 3.5) * 2.2) * 0.5 + 0.5;
  float arms = pow(spiralA, 2.2) * exp(-r * 2.6) * smoothstep(0.06, 0.28, r);
  float core = exp(-r * r * 14.0);
  float halo = exp(-r * 3.2) * 0.35;

  vec3 col = vec3(1.0, 0.94, 0.82) * core * 1.1
           + vec3(0.32, 0.68, 1.0) * arms * 0.85
           + vec3(0.18, 0.34, 0.72) * halo;

  float alpha = clamp((core + arms * 0.85 + halo) * smoothstep(1.0, 0.55, r), 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const EXOPLANET_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float sphereR = 0.78;

  float outerDist = max(0.0, r - sphereR);
  vec2 sunDir2D = normalize(vec2(0.72, -0.46));
  float sunSide = clamp(dot(normalize(p + vec2(0.0001)), sunDir2D) * 0.5 + 0.5, 0.0, 1.0);
  float outerGlow = exp(-outerDist * 14.5) * (0.28 + 0.72 * pow(sunSide, 1.6)) * smoothstep(1.0, 0.82, r);

  if (r > sphereR) {
    vec3 glowCol = mix(vec3(0.12, 0.52, 0.96), vec3(0.78, 0.95, 1.0), pow(sunSide, 2.4));
    float a = clamp(outerGlow * 0.88, 0.0, 1.0);
    gl_FragColor = vec4(glowCol * a, a);
    return;
  }

  vec2 sp = p / sphereR;
  float nz = sqrt(max(0.0001, 1.0 - dot(sp, sp)));
  vec3 N = normalize(vec3(sp.x, sp.y, nz));
  vec3 L = normalize(vec3(0.70, -0.44, 0.56));
  vec3 V = vec3(0.0, 0.0, 1.0);

  float lon = atan(N.x, N.z);
  float lat = asin(clamp(N.y, -1.0, 1.0));
  vec2 mapUv = vec2(lon * 1.15, lat * 2.15);

  float landNoise = fbm5(mapUv * 1.65 + vec2(2.3, -1.1));
  float landMask = smoothstep(0.51, 0.58, landNoise);
  vec3 oceanCol = mix(vec3(0.03, 0.14, 0.36), vec3(0.06, 0.34, 0.62), smoothstep(0.25, 0.52, landNoise));
  vec3 landCol = mix(vec3(0.09, 0.32, 0.38), vec3(0.26, 0.44, 0.42), smoothstep(0.56, 0.78, landNoise));
  vec3 iceCap = vec3(0.84, 0.93, 0.99);
  float polarMask = smoothstep(0.68, 0.88, abs(N.y) + (landNoise - 0.5) * 0.22);

  vec3 surfaceCol = mix(oceanCol, landCol, landMask);
  surfaceCol = mix(surfaceCol, iceCap, polarMask * 0.75);

  vec2 cloudWarp = vec2(fbm5(mapUv * 2.6 + vec2(0.0, 3.4)), fbm5(mapUv * 2.6 + vec2(4.2, 1.1)));
  float clouds = fbm5(mapUv * vec2(2.2, 3.8) + cloudWarp * 0.95);
  float cloudMask = smoothstep(0.46, 0.74, clouds);
  surfaceCol = mix(surfaceCol, vec3(0.92, 0.96, 1.0), cloudMask * 0.78);

  vec3 H = normalize(L + V);
  float spec = pow(max(0.0, dot(N, H)), 28.0) * (1.0 - landMask) * (1.0 - cloudMask * 0.85);

  float ndl = dot(N, L);
  float dayLight = smoothstep(-0.14, 0.38, ndl);
  float twilight = smoothstep(-0.22, 0.05, ndl) * (1.0 - smoothstep(0.02, 0.28, ndl));

  vec3 litSurface = surfaceCol * (0.045 + dayLight * 1.05);
  litSurface += vec3(0.88, 0.45, 0.18) * twilight * 0.28;
  litSurface += vec3(0.95, 0.92, 0.82) * spec * 0.48 * dayLight;

  float nightMask = smoothstep(0.04, -0.26, ndl) * landMask * (1.0 - cloudMask * 0.65);
  float citySpark = smoothstep(0.74, 0.92, fbm5(mapUv * 12.5)) * smoothstep(0.55, 0.82, vnoise(mapUv * 28.0));
  litSurface += vec3(1.0, 0.78, 0.36) * citySpark * nightMask * 1.15;

  float fresnel = pow(1.0 - nz, 3.0);
  vec3 atmoRim = mix(vec3(0.10, 0.56, 1.0), vec3(0.80, 0.96, 1.0), dayLight);
  litSurface += atmoRim * fresnel * (0.28 + 0.95 * dayLight);

  float edgeAlpha = smoothstep(sphereR, sphereR - 0.012, r);
  float finalAlpha = clamp(max(edgeAlpha, outerGlow * 0.85), 0.0, 1.0);
  gl_FragColor = vec4(litSurface * finalAlpha, finalAlpha);
}
`;

function buildPlanetRingFrag(isFrontHalf: boolean): string {
  const halfTest = isFrontHalf ? 'smoothstep(-0.02, 0.03, p.y)' : 'smoothstep(0.02, -0.03, p.y)';
  return `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);

  float halfMask = ${halfTest};
  if (halfMask <= 0.001) { gl_FragColor = vec4(0.0); return; }

  float band = smoothstep(0.45, 0.50, r) * (1.0 - smoothstep(0.90, 0.97, r));
  if (band <= 0.001) { gl_FragColor = vec4(0.0); return; }

  float cassiniGap = 1.0 - 0.86 * exp(-pow((r - 0.74) / 0.024, 2.0));
  float enckeGap = 1.0 - 0.65 * exp(-pow((r - 0.86) / 0.011, 2.0));
  float fineRings = 0.55 + 0.45 * sin(r * 135.0) * 0.5 + 0.35 * sin(r * 62.0 + 1.4);
  float ang = atan(p.y, p.x);
  float iceShimmer = 0.82 + 0.18 * vnoise(vec2(ang * 9.0, r * 32.0));

  float shadowMask = 1.0;
  ${isFrontHalf ? '' : 'shadowMask = 1.0 - 0.78 * smoothstep(-0.08, -0.45, p.x) * smoothstep(0.0, -0.35, p.y);'}

  vec3 col = mix(vec3(0.45, 0.76, 0.98), vec3(0.84, 0.92, 1.00), smoothstep(0.48, 0.72, r));
  col = mix(col, vec3(0.94, 0.82, 0.62), smoothstep(0.76, 0.93, r));

  float density = band * cassiniGap * enckeGap * clamp(fineRings, 0.25, 1.0) * iceShimmer;
  col *= (0.68 + 0.42 * iceShimmer) * shadowMask;

  float alpha = clamp(density * halfMask * 0.80, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`.trim();
}

const LUNAR_MOON_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float rad = 0.82;
  if (r > rad) {
    float rimGlow = exp(-(r - rad) * 16.0) * 0.36 * smoothstep(1.0, 0.84, r);
    vec3 gc = vec3(0.66, 0.82, 1.0) * rimGlow;
    gl_FragColor = vec4(gc, rimGlow);
    return;
  }

  vec2 sp = p / rad;
  float nz = sqrt(max(0.0001, 1.0 - dot(sp, sp)));
  vec3 N = normalize(vec3(sp.x, sp.y, nz));
  vec3 L = normalize(vec3(0.74, -0.38, 0.54));

  float craters = fbm5(sp * 5.6 + vec2(1.4, 2.8));
  float micro = vnoise(sp * 16.0);
  float maria = smoothstep(0.42, 0.62, fbm5(sp * 2.3 + vec2(-0.8, 0.5)));
  vec3 rock = mix(vec3(0.44, 0.48, 0.58), vec3(0.82, 0.87, 0.95), maria) * (0.78 + 0.26 * craters + 0.08 * micro);

  float ndl = dot(N, L);
  float lit = smoothstep(-0.08, 0.36, ndl);
  float rim = pow(1.0 - nz, 3.0) * (0.25 + 0.78 * lit);

  vec3 col = rock * (0.05 + lit * 0.98) + vec3(0.72, 0.88, 1.0) * rim * 0.7;
  float a = smoothstep(rad, rad - 0.02, r);
  gl_FragColor = vec4(col * a, a);
}
`;

const SOLAR_BLOOM_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float core = exp(-r * r * 38.0);
  float halo = exp(-r * 4.8) * 0.42;
  float anamorphic = exp(-abs(p.y) * 38.0) * exp(-abs(p.x) * 1.9) * 0.68;
  float crossRay = exp(-abs(p.x) * 42.0) * exp(-abs(p.y) * 5.8) * 0.24;

  vec3 col = vec3(1.0, 0.96, 0.86) * core * 0.90
           + vec3(1.0, 0.72, 0.34) * halo
           + vec3(0.36, 0.86, 1.0) * anamorphic
           + vec3(0.85, 0.95, 1.0) * crossRay;

  float a = clamp((core + halo + anamorphic + crossRay) * smoothstep(1.0, 0.42, r), 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

const SHIPYARD_GATE_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Full 360-degree Lagrange Orbital Docking Ring Gate with trusses & glowing bay beacons
  float outerRim = smoothstep(0.86, 0.875, r) * (1.0 - smoothstep(0.92, 0.935, r));
  float innerRim = smoothstep(0.76, 0.775, r) * (1.0 - smoothstep(0.805, 0.82, r));
  float strutBand = smoothstep(0.775, 0.79, r) * (1.0 - smoothstep(0.87, 0.885, r));
  float struts = smoothstep(0.80, 0.95, abs(cos(ang * 16.0))) * strutBand;
  float dockingPylons = smoothstep(0.955, 0.99, abs(cos(ang * 4.0))) * smoothstep(0.68, 0.72, r) * (1.0 - smoothstep(0.92, 0.96, r));

  float frame = clamp(outerRim + innerRim + struts * 0.9 + dockingPylons, 0.0, 1.0);
  float metallicShade = 0.55 + 0.45 * cos(ang + 0.7);

  float cyanBeacons = smoothstep(0.96, 0.995, cos(ang * 16.0)) * exp(-pow((r - 0.84) / 0.020, 2.0));
  float amberBeacons = smoothstep(0.98, 0.998, cos(ang * 8.0 + 0.39)) * exp(-pow((r - 0.90) / 0.016, 2.0));
  float innerGlow = exp(-pow((r - 0.77) / 0.025, 2.0)) * 0.36;

  vec3 col = vec3(0.16, 0.30, 0.52) * frame * metallicShade
           + vec3(0.18, 0.92, 1.0) * (cyanBeacons * 1.5 + innerGlow)
           + vec3(1.0, 0.76, 0.30) * amberBeacons * 1.45;

  float alpha = clamp(frame * 0.82 + cyanBeacons * 0.95 + amberBeacons * 0.95 + innerGlow, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

function buildAsteroidFrag(seedX: string, seedY: string): string {
  return `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float ang = atan(p.y, p.x);
  vec2 dir = vec2(cos(ang), sin(ang));
  // Irregular natural stony asteroid silhouette driven by smooth periodic fbm (no clover lobes!)
  float radNoise = fbm5(dir * 1.45 + vec2(${seedX}, ${seedY}));
  float shapeWarp = 0.56 + radNoise * 0.34;
  float r = length(p);
  if (r > shapeWarp) { gl_FragColor = vec4(0.0); return; }

  vec2 sp = p / max(0.01, shapeWarp);
  float nz = sqrt(max(0.01, 1.0 - clamp(dot(sp, sp), 0.0, 0.98)));
  float ridgeH = fbm5(sp * 3.8 + vec2(${seedX}, ${seedY}));
  float crater = smoothstep(0.28, 0.65, vnoise(sp * 6.5 + vec2(${seedY}, ${seedX})));

  // Perturbed rocky surface normal for crisp 3D facets
  vec3 N = normalize(vec3(sp.x + (ridgeH - 0.5) * 0.45, sp.y + (crater - 0.5) * 0.35, nz));
  vec3 L = normalize(vec3(0.75, -0.45, 0.48));

  float lit = smoothstep(-0.18, 0.68, dot(N, L));
  float rim = pow(1.0 - nz, 2.5) * lit;

  vec3 darkRock = vec3(0.16, 0.15, 0.21);
  vec3 sunlitRock = vec3(0.58, 0.45, 0.36);
  vec3 rock = mix(darkRock, sunlitRock, clamp(ridgeH * 0.72 + crater * 0.28, 0.0, 1.0));
  vec3 col = rock * (0.14 + lit * 0.96) + vec3(1.0, 0.72, 0.40) * rim * 0.85;
  float a = smoothstep(shapeWarp, shapeWarp - 0.04, r);
  gl_FragColor = vec4(col * a, a);
}
`.trim();
}

const WRECKAGE_PANEL_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  // Broken satellite solar array wing silhouette
  float body = step(abs(p.x), 0.78) * step(abs(p.y), 0.28);
  // Diagonal fracture notch on one corner
  float notch = step(0.62, p.x + p.y * 0.9);
  float mask = body * (1.0 - notch);
  if (mask <= 0.01) { gl_FragColor = vec4(0.0); return; }

  float gridX = smoothstep(0.86, 0.96, abs(cos(p.x * 22.0)));
  float gridY = smoothstep(0.82, 0.96, abs(cos(p.y * 28.0)));
  float frame = max(step(0.70, abs(p.x)), step(0.22, abs(p.y)));
  float glint = smoothstep(0.2, 0.9, p.x * 0.6 - p.y * 0.8);

  vec3 solarBlue = mix(vec3(0.06, 0.22, 0.42), vec3(0.18, 0.56, 0.82), glint);
  vec3 metal = vec3(0.46, 0.50, 0.56) * (0.65 + 0.35 * glint);
  vec3 col = mix(solarBlue, metal, clamp(frame + gridX * 0.35 + gridY * 0.35, 0.0, 1.0));

  // Damaged glowing amber/cyan conduit spark along fracture edge
  float spark = exp(-pow((p.x + p.y * 0.9 - 0.56) / 0.055, 2.0)) * body;
  col += vec3(1.0, 0.62, 0.20) * spark * 1.15;

  gl_FragColor = vec4(col * mask, mask);
}
`;

const LUNAR_HORIZON_FRAG = `
precision highp float;
varying vec2 vTextureCoord;
${GLSL_NOISE}

void main(void) {
  vec2 uv = vTextureCoord;
  float a = uv.x * 6.2831853;
  vec2 cyc = vec2(cos(a), sin(a));

  // Broad, realistic gently rolling lunar plains & shallow crater rims (NO sawtooth spikes!)
  float macroHill = 0.065 * sin(a + 0.4) + 0.042 * cos(a * 2.0 - 0.9);
  float craterBowl = -0.055 * exp(-pow((uv.x - 0.32) / 0.11, 2.0))
                     + 0.032 * exp(-pow((abs(uv.x - 0.32) - 0.12) / 0.035, 2.0))
                     - 0.042 * exp(-pow((uv.x - 0.76) / 0.085, 2.0))
                     + 0.024 * exp(-pow((abs(uv.x - 0.76) - 0.095) / 0.028, 2.0));
  float fineRegolith = (fbm5(cyc * 2.4 + vec2(3.4, 1.2)) - 0.5) * 0.048;
  float ridge = 0.50 + macroHill + craterBowl + fineRegolith;

  // Sleek illuminated lunar observatory dome silhouette tucked into a crater rim
  float dxDome = (uv.x - 0.55) / 0.048;
  float dyDome = (uv.y - (ridge + 0.015)) / 0.085;
  float domeDist = length(vec2(dxDome, min(0.0, dyDome)));
  float domeMask = (1.0 - smoothstep(0.92, 1.0, domeDist)) * step(uv.y, ridge + 0.02);

  float terrainY = uv.y - ridge;
  float ground = smoothstep(-0.014, 0.014, terrainY);
  float mask = clamp(max(ground, domeMask), 0.0, 1.0);

  if (mask <= 0.001) {
    float airGlow = exp(-max(0.0, -terrainY) * 14.0) * 0.36;
    vec3 gc = vec3(0.42, 0.64, 0.96) * airGlow;
    gl_FragColor = vec4(gc, airGlow);
    return;
  }

  float surfNoise = fbm5(vec2(cyc.x * 3.2 + uv.y * 1.8, cyc.y * 3.2 + uv.y * 4.5));
  float microCrater = smoothstep(0.32, 0.76, vnoise(vec2(cyc.x * 8.0, uv.y * 12.0)));
  vec3 baseLunar = mix(vec3(0.055, 0.075, 0.145), vec3(0.20, 0.26, 0.40), surfNoise * 0.68 + microCrater * 0.32);

  float rimLight = exp(-max(0.0, terrainY) * 24.0) * 0.82;
  vec3 col = baseLunar + vec3(0.64, 0.82, 1.0) * rimLight;

  // Soft glowing observatory dome windows & top cyan beacon
  if (domeMask > 0.1) {
    float domeRim = smoothstep(0.55, 0.96, domeDist);
    vec3 domeCol = mix(vec3(0.14, 0.22, 0.38), vec3(0.55, 0.82, 1.0), domeRim * 0.65);
    float beacon = exp(-pow(dxDome * 3.2, 2.0) - pow((dyDome + 0.95) * 4.5, 2.0));
    col = mix(col, domeCol + vec3(0.30, 0.95, 1.0) * beacon * 1.4, domeMask);
  }

  gl_FragColor = vec4(col * mask, mask);
}
`;

const LUNAR_TELEMETRY_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 p = (vTextureCoord - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Ultra-refined hairline orbital astrometry rings & delicate radial ticks
  float ring1 = exp(-pow((r - 0.88) / 0.0045, 2.0));
  float ring2 = exp(-pow((r - 0.68) / 0.0035, 2.0)) * 0.72;
  float ring3 = exp(-pow((r - 0.48) / 0.0030, 2.0)) * 0.48;
  float ticks = smoothstep(0.95, 0.995, cos(ang * 48.0)) * smoothstep(0.855, 0.865, r) * (1.0 - smoothstep(0.895, 0.905, r));
  float fineAxis = smoothstep(0.994, 0.999, abs(cos(ang * 4.0))) * smoothstep(0.48, 0.50, r) * (1.0 - smoothstep(0.88, 0.90, r)) * 0.55;

  float halo = exp(-pow((r - 0.76) / 0.14, 2.0)) * 0.16;
  float intensity = clamp(ring1 + ring2 + ring3 + ticks * 0.85 + fineAxis + halo, 0.0, 1.0);

  vec3 col = mix(vec3(0.48, 0.76, 1.0), vec3(0.86, 0.80, 1.0), smoothstep(0.45, 0.92, r)) * intensity;
  gl_FragColor = vec4(col * intensity, intensity);
}
`;

const ORBITAL_BEAM_FRAG = `
precision highp float;
varying vec2 vTextureCoord;

void main(void) {
  vec2 uv = vTextureCoord;
  // Sleek volumetric orbital searchlight / atmospheric aurora curtain
  float xFade = smoothstep(0.0, 0.22, uv.x) * (1.0 - smoothstep(0.55, 1.0, uv.x));
  float spread = mix(0.08, 0.46, uv.x);
  float yDist = abs(uv.y - 0.5) / max(0.02, spread);
  float cone = exp(-yDist * yDist * 3.2);
  float a = clamp(xFade * cone * 0.75, 0.0, 1.0);
  vec3 col = mix(vec3(0.85, 0.96, 1.0), vec3(0.28, 0.78, 1.0), uv.x);
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

export function isWorld1NormalStage(id?: string): id is World1StageId {
  return id === 'normal-1-1' || id === 'normal-1-2' || id === 'normal-1-3';
}

/**
 * Cohesive Multi-Phase Space Director for World 1 Normal (`1-1`, `1-2`, `1-3`).
 *
 * Bakes all high-detail GLSL space textures ONCE at World 1 init, then renders
 * dynamic 3-phase orbital choreography per stage at 60+ FPS with zero black holes:
 *   • 1-1 Astillero Lagrange: Deep Approach -> 3D Docking Ring-Gate Flythrough -> Low-Orbit Sunrise
 *   • 1-2 Cinturón Kessler:   Twilight Edge (Planet behind) -> Tumbling Debris & Meteor Storm -> Orbital Clearing (Moon rises)
 *   • 1-3 Bastión Selene:     Lunar Descent (Planet small in sky) -> Low-Altitude Crater Skim -> Moonbow Bastion Finale
 */
export class World1SpaceDirector {
  private parentContainer: PIXI.Container;
  private renderer: PIXI.IRenderer;
  private width: number;
  private height: number;
  private activeStageId: World1StageId;

  private root = new PIXI.Container();
  private starGroup = new PIXI.Container();
  private worldGroup = new PIXI.Container();
  private planetGroup = new PIXI.Container();
  private ringBackTilt = new PIXI.Container();
  private ringFrontTilt = new PIXI.Container();
  private gateTunnelGroup = new PIXI.Container();
  private debrisGroup = new PIXI.Container();
  private lunarSurfaceGroup = new PIXI.Container();
  private dustGroup = new PIXI.Container();
  private streakGroup = new PIXI.Container();

  private bakedTextures: Map<string, PIXI.RenderTexture> = new Map();
  private auxTextures: PIXI.Texture[] = [];

  private nebulaSprite!: PIXI.Sprite;
  private galaxySprite!: PIXI.Sprite;
  private moonSprite!: PIXI.Sprite;
  private ringBackSprite!: PIXI.Sprite;
  private planetSprite!: PIXI.Sprite;
  private ringFrontSprite!: PIXI.Sprite;
  private solarBloomSprite!: PIXI.Sprite;
  private beamA!: PIXI.Sprite;
  private beamB!: PIXI.Sprite;
  private telemetryA!: PIXI.Sprite;
  private telemetryB!: PIXI.Sprite;
  private gateRings: PIXI.Sprite[] = [];
  private lunarFarTiling!: PIXI.TilingSprite;
  private lunarNearTiling!: PIXI.TilingSprite;
  private phaseVeilSprite!: PIXI.Sprite;
  private leftVeilSprite!: PIXI.Sprite;

  private stars: ParallaxStar[] = [];
  private dustMotes: DustMote[] = [];
  private streaks: FlightStreak[] = [];
  private debrisPieces: DebrisPiece[] = [];
  private lastClockTime: number = 0;

  constructor(
    parentContainer: PIXI.Container,
    renderer: PIXI.IRenderer,
    stageId: World1StageId = 'normal-1-1',
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

  public setStage(stageId: World1StageId): void {
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
    // 3 distinct cohesive World 1 skies (Sapphire Orbital -> Amber-Indigo Kessler -> Silver-Indigo Lunar)
    this.bakeTexture(
      'nebula1',
      512,
      288,
      buildNebulaFrag('0.010, 0.018, 0.055', '0.025, 0.048, 0.120', '0.055, 0.195, 0.440', '0.050, 0.480, 0.700', '0.760, 0.540, 0.240', '0.0, 0.0')
    );
    this.bakeTexture(
      'nebula2',
      512,
      288,
      buildNebulaFrag('0.022, 0.020, 0.055', '0.075, 0.038, 0.042', '0.240, 0.125, 0.260', '0.580, 0.270, 0.110', '0.220, 0.580, 0.740', '2.4, -1.3')
    );
    this.bakeTexture(
      'nebula3',
      512,
      288,
      buildNebulaFrag('0.012, 0.015, 0.042', '0.036, 0.044, 0.108', '0.130, 0.165, 0.360', '0.320, 0.440, 0.720', '0.620, 0.520, 0.880', '-1.8, 2.7')
    );

    this.bakeTexture('galaxy', 256, 256, DISTANT_GALAXY_FRAG);
    this.bakeTexture('planet', 512, 512, EXOPLANET_FRAG);
    this.bakeTexture('ringBack', 512, 512, buildPlanetRingFrag(false));
    this.bakeTexture('ringFront', 512, 512, buildPlanetRingFrag(true));
    this.bakeTexture('moon', 256, 256, LUNAR_MOON_FRAG);
    this.bakeTexture('solarBloom', 256, 256, SOLAR_BLOOM_FRAG);
    this.bakeTexture('shipyardGate', 512, 512, SHIPYARD_GATE_FRAG);
    this.bakeTexture('asteroidA', 160, 160, buildAsteroidFrag('1.7', '3.4'));
    this.bakeTexture('asteroidB', 160, 160, buildAsteroidFrag('6.2', '-2.1'));
    this.bakeTexture('wreckPanel', 160, 160, WRECKAGE_PANEL_FRAG);
    this.bakeTexture('lunarHorizon', 512, 256, LUNAR_HORIZON_FRAG);
    this.bakeTexture('telemetry', 512, 512, LUNAR_TELEMETRY_FRAG);
    this.bakeTexture('orbitalBeam', 256, 128, ORBITAL_BEAM_FRAG);
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
    grad.addColorStop(0, 'rgba(2, 5, 16, 0.92)');
    grad.addColorStop(0.55, 'rgba(2, 5, 16, 0.30)');
    grad.addColorStop(1, 'rgba(2, 5, 16, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 4);
    const t = PIXI.Texture.from(canvas);
    this.auxTextures.push(t);
    return t;
  }

  private buildSceneGraph(): void {
    // 1. Sky Nebula Backdrop
    this.nebulaSprite = new PIXI.Sprite(this.tex('nebula1'));
    this.nebulaSprite.anchor.set(0.5);
    this.nebulaSprite.position.set(this.width * 0.5, this.height * 0.5);
    this.root.addChild(this.nebulaSprite);

    // 2. Crisp Circular Parallax Starfield (132 stars)
    const dotTex = this.tex('softDot');
    for (let i = 0; i < 132; i++) {
      const sprite = new PIXI.Sprite(dotTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      const tier = i % 3;
      const sz = tier === 0 ? 1.8 : tier === 1 ? 3.2 : 5.2;
      sprite.width = sz;
      sprite.height = sz;
      this.starGroup.addChild(sprite);
      this.stars.push({
        sprite,
        xNorm: seeded01(i, 1.3),
        yNorm: seeded01(i, 2.7),
        speed: tier === 0 ? 0.007 : tier === 1 ? 0.022 : 0.052,
        phase: seeded01(i, 4.1) * Math.PI * 2,
        twinkleRate: 1.4 + seeded01(i, 5.9) * 3.0,
        baseAlpha: tier === 0 ? 0.36 : tier === 1 ? 0.62 : 0.86,
        parallax: tier === 0 ? 6 : tier === 1 ? 15 : 28,
      });
    }
    this.root.addChild(this.starGroup);

    // 3. World Camera Group (Galaxy, Moon, Ringed Exoplanet, Telemetry Rings, Volumetric Light Sweeps)
    this.worldGroup.position.set(this.width * 0.5, this.height * 0.5);
    this.root.addChild(this.worldGroup);

    this.galaxySprite = new PIXI.Sprite(this.tex('galaxy'));
    this.galaxySprite.anchor.set(0.5);
    this.galaxySprite.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.galaxySprite);

    // Volumetric orbital light beams / aurora sweeps
    this.beamA = new PIXI.Sprite(this.tex('orbitalBeam'));
    this.beamA.anchor.set(0.05, 0.5);
    this.beamA.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.beamA);

    this.beamB = new PIXI.Sprite(this.tex('orbitalBeam'));
    this.beamB.anchor.set(0.05, 0.5);
    this.beamB.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.beamB);

    // Counter-rotating orbital / lunar telemetry rings
    this.telemetryA = new PIXI.Sprite(this.tex('telemetry'));
    this.telemetryA.anchor.set(0.5);
    this.telemetryA.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.telemetryA);

    this.telemetryB = new PIXI.Sprite(this.tex('telemetry'));
    this.telemetryB.anchor.set(0.5);
    this.telemetryB.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldGroup.addChild(this.telemetryB);

    this.moonSprite = new PIXI.Sprite(this.tex('moon'));
    this.moonSprite.anchor.set(0.5);
    this.worldGroup.addChild(this.moonSprite);

    // Giant Ringed Exoplanet Assembly with true 3D Back/Front ring occlusion
    this.ringBackTilt.rotation = -0.26;
    this.ringBackSprite = new PIXI.Sprite(this.tex('ringBack'));
    this.ringBackSprite.anchor.set(0.5);
    this.ringBackSprite.scale.set(1.24, 0.36);
    this.ringBackTilt.addChild(this.ringBackSprite);

    this.planetSprite = new PIXI.Sprite(this.tex('planet'));
    this.planetSprite.anchor.set(0.5);
    this.planetSprite.scale.set(0.68);

    this.ringFrontTilt.rotation = -0.26;
    this.ringFrontSprite = new PIXI.Sprite(this.tex('ringFront'));
    this.ringFrontSprite.anchor.set(0.5);
    this.ringFrontSprite.scale.set(1.24, 0.36);
    this.ringFrontTilt.addChild(this.ringFrontSprite);

    this.solarBloomSprite = new PIXI.Sprite(this.tex('solarBloom'));
    this.solarBloomSprite.anchor.set(0.5);
    this.solarBloomSprite.blendMode = PIXI.BLEND_MODES.ADD;

    this.planetGroup.addChild(
      this.ringBackTilt,
      this.planetSprite,
      this.ringFrontTilt,
      this.solarBloomSprite
    );
    this.worldGroup.addChild(this.planetGroup);

    // 4. Stage 1-1 Phase 2: 3D Lagrange Shipyard Docking Ring-Gate Tunnel (4 staggered rings)
    this.gateTunnelGroup.position.set(this.width * 0.5, this.height * 0.5);
    const gateTex = this.tex('shipyardGate');
    for (let i = 0; i < 4; i++) {
      const gate = new PIXI.Sprite(gateTex);
      gate.anchor.set(0.5);
      this.gateTunnelGroup.addChild(gate);
      this.gateRings.push(gate);
    }
    this.root.addChild(this.gateTunnelGroup);

    // 5. Stage 1-2: Multi-Depth Tumbling Kessler Debris Belt (2 distinct natural rock shapes + broken satellite panels)
    const rockTexA = this.tex('asteroidA');
    const rockTexB = this.tex('asteroidB');
    const panelTex = this.tex('wreckPanel');
    for (let i = 0; i < 20; i++) {
      const isPanel = i % 5 === 0 || i % 5 === 3;
      const depthTier = i % 3; // 0=far, 1=mid, 2=near
      const sprite = new PIXI.Sprite(isPanel ? panelTex : i % 2 === 0 ? rockTexA : rockTexB);
      sprite.anchor.set(0.5);
      const baseScale = depthTier === 0 ? 0.16 + seeded01(i, 21) * 0.10 : depthTier === 1 ? 0.30 + seeded01(i, 22) * 0.16 : 0.48 + seeded01(i, 23) * 0.24;
      this.debrisGroup.addChild(sprite);
      this.debrisPieces.push({
        sprite,
        xPos: seeded01(i, 24) * (this.width + 260) - 80,
        yNorm: 0.08 + seeded01(i, 25) * 0.84,
        speedPx: depthTier === 0 ? 68 : depthTier === 1 ? 155 : 275,
        vyPx: (seeded01(i, 26) - 0.5) * 32,
        rotSpeed: (seeded01(i, 27) - 0.5) * (isPanel ? 1.15 : 1.5),
        baseScale,
        parallax: depthTier === 0 ? 10 : depthTier === 1 ? 22 : 38,
        depthTier,
        isPanel,
      });
    }
    this.root.addChild(this.debrisGroup);

    // 6. Stage 1-3: Broad, Gently Rolling Cratered Lunar Horizon (Far & Near Ridges)
    const lunarTex = this.tex('lunarHorizon');
    this.lunarFarTiling = new PIXI.TilingSprite(lunarTex, this.width + 128, 256);
    this.lunarFarTiling.tileScale.set(1.9, 1.0);
    this.lunarFarTiling.tint = 0x7b96cc;
    this.lunarFarTiling.alpha = 0.72;
    this.lunarSurfaceGroup.addChild(this.lunarFarTiling);

    this.lunarNearTiling = new PIXI.TilingSprite(lunarTex, this.width + 128, 256);
    this.lunarNearTiling.tileScale.set(1.45, 1.0);
    this.lunarNearTiling.tint = 0xdce8ff;
    this.lunarNearTiling.alpha = 0.96;
    this.lunarSurfaceGroup.addChild(this.lunarNearTiling);
    this.root.addChild(this.lunarSurfaceGroup);

    // 7. Drifting Orbital Dust / Spark Motes (36 pooled)
    for (let i = 0; i < 36; i++) {
      const sprite = new PIXI.Sprite(dotTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      this.dustGroup.addChild(sprite);
      this.dustMotes.push({
        sprite,
        xPos: seeded01(i, 8.3) * (this.width + 160),
        yNorm: seeded01(i, 9.7),
        speedPx: 36 + seeded01(i, 10.4) * 86,
        driftPhase: seeded01(i, 11.2) * Math.PI * 2,
        baseAlpha: 0.16 + seeded01(i, 12.1) * 0.30,
        scale: 0.08 + seeded01(i, 13.1) * 0.18,
        parallax: 18 + seeded01(i, 13.9) * 26,
      });
    }
    this.root.addChild(this.dustGroup);

    // 8. Dynamic Orbital Speedlines & Meteor Streaks (40 pooled)
    const streakTex = this.tex('warpStreak');
    for (let i = 0; i < 40; i++) {
      const sprite = new PIXI.Sprite(streakTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      this.streakGroup.addChild(sprite);
      const widthPx = 70 + seeded01(i, 14.2) * 155;
      const heightPx = 1.4 + seeded01(i, 15.8) * 2.1;
      sprite.width = widthPx;
      sprite.height = heightPx;
      this.streaks.push({
        sprite,
        xPos: seeded01(i, 16.4) * (this.width + 260),
        yNorm: seeded01(i, 17.9),
        speedPx: 380 + seeded01(i, 18.7) * 520,
        baseAlpha: 0.12 + seeded01(i, 19.3) * 0.24,
        widthPx,
        heightPx,
        angle: 0,
      });
    }
    this.root.addChild(this.streakGroup);

    // 9. Smooth Internal Phase-Transition Shimmer Veil (ADD)
    this.phaseVeilSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.phaseVeilSprite.width = this.width;
    this.phaseVeilSprite.height = this.height;
    this.phaseVeilSprite.blendMode = PIXI.BLEND_MODES.ADD;
    this.phaseVeilSprite.alpha = 0;
    this.root.addChild(this.phaseVeilSprite);

    // 10. Left-lane readability gradient so player & bullets stay crystal clear
    this.leftVeilSprite = new PIXI.Sprite(this.createLeftVeilTexture());
    this.leftVeilSprite.width = Math.round(this.width * 0.34);
    this.leftVeilSprite.height = this.height;
    this.leftVeilSprite.alpha = 0.18;
    this.root.addChild(this.leftVeilSprite);
  }

  private applyStagePalette(stageId: World1StageId): void {
    const starPalettes: Record<World1StageId, number[]> = {
      'normal-1-1': [0xffffff, 0xbfeaff, 0x7dd3fc, 0xffdf9e, 0xc4b5fd],
      'normal-1-2': [0xffffff, 0xffd29d, 0xfb923c, 0x7dd3fc, 0xfef08a],
      'normal-1-3': [0xffffff, 0xe2e8f0, 0x93c5fd, 0xc4b5fd, 0xbae6fd],
    };
    const dustPalettes: Record<World1StageId, number[]> = {
      'normal-1-1': [0x9ae6ff, 0xffffff, 0xffe4b5, 0x60a5fa],
      'normal-1-2': [0xffb86c, 0xf97316, 0x7dd3fc, 0xffe8cc],
      'normal-1-3': [0xdbeafe, 0xc4b5fd, 0xffffff, 0x7dd3fc],
    };
    const streakPalettes: Record<World1StageId, [number, number]> = {
      'normal-1-1': [0x7dd3fc, 0xffe6b3],
      'normal-1-2': [0xfb923c, 0xbae6fd],
      'normal-1-3': [0xc4b5fd, 0xe0f2fe],
    };

    const nebKey = stageId === 'normal-1-2' ? 'nebula2' : stageId === 'normal-1-3' ? 'nebula3' : 'nebula1';
    this.nebulaSprite.texture = this.tex(nebKey);

    const sp = starPalettes[stageId];
    for (let i = 0; i < this.stars.length; i++) {
      this.stars[i].sprite.tint = sp[i % sp.length];
    }

    const dp = dustPalettes[stageId];
    for (let i = 0; i < this.dustMotes.length; i++) {
      this.dustMotes[i].sprite.tint = dp[i % dp.length];
    }

    const [stA, stB] = streakPalettes[stageId];
    for (let i = 0; i < this.streaks.length; i++) {
      this.streaks[i].sprite.tint = i % 3 === 0 ? stB : stA;
      this.streaks[i].angle = stageId === 'normal-1-2' ? 0.14 : 0;
      this.streaks[i].sprite.rotation = this.streaks[i].angle;
    }
  }

  public update(ctx: World1FrameContext): void {
    const t = Math.max(0, ctx.stageTime);
    const clk = ctx.clockTime;
    const dt = this.lastClockTime > 0 ? Math.min(0.1, Math.max(0, clk - this.lastClockTime)) : 1 / 60;
    this.lastClockTime = clk;

    const pxNorm = clamp01(ctx.playerX / Math.max(1, this.width)) - 0.5;
    const pyNorm = clamp01(ctx.playerY / Math.max(1, this.height)) - 0.5;
    const bossBoost = ctx.bossActive ? 1.0 : 0.0;

    // Reset optional layer visibility cleanly before stage-specific update
    this.gateTunnelGroup.visible = false;
    this.debrisGroup.visible = false;
    this.lunarSurfaceGroup.visible = false;
    this.telemetryA.visible = false;
    this.telemetryB.visible = false;
    this.beamA.visible = false;
    this.beamB.visible = false;
    this.phaseVeilSprite.alpha = 0;

    if (this.activeStageId === 'normal-1-1') {
      this.updateStage1_1(t, clk, dt, pxNorm, pyNorm, bossBoost);
    } else if (this.activeStageId === 'normal-1-2') {
      this.updateStage1_2(t, clk, dt, pxNorm, pyNorm, bossBoost);
    } else {
      this.updateStage1_3(t, clk, dt, pxNorm, pyNorm, bossBoost);
    }
  }

  private updateCommonParticles(
    clk: number,
    dt: number,
    pxNorm: number,
    pyNorm: number,
    starSpeedMult: number,
    dustAlpha: number,
    streakAlpha: number,
    streakSpeedMult: number
  ): void {
    // Parallax starfield
    for (const s of this.stars) {
      s.xNorm = (s.xNorm - s.speed * starSpeedMult * dt + 1.0) % 1.0;
      s.sprite.position.set(
        s.xNorm * this.width - pxNorm * s.parallax,
        s.yNorm * this.height - pyNorm * s.parallax * 0.65
      );
      s.sprite.alpha = s.baseAlpha * (0.72 + 0.28 * Math.sin(clk * s.twinkleRate + s.phase));
    }

    // Drifting orbital dust / embers
    for (const d of this.dustMotes) {
      d.xPos -= d.speedPx * starSpeedMult * dt;
      if (d.xPos < -60) d.xPos = this.width + 60;
      d.sprite.position.set(
        d.xPos - pxNorm * d.parallax,
        d.yNorm * this.height + Math.sin(clk * 0.85 + d.driftPhase) * 14 - pyNorm * d.parallax
      );
      d.sprite.scale.set(d.scale);
      d.sprite.alpha = d.baseAlpha * dustAlpha;
    }

    // Dynamic flight / meteor speedlines
    this.streakGroup.visible = streakAlpha > 0.01;
    if (this.streakGroup.visible) {
      for (const st of this.streaks) {
        st.xPos -= st.speedPx * streakSpeedMult * dt;
        if (st.xPos < -st.widthPx) st.xPos = this.width + st.widthPx;
        const yOff = st.angle !== 0 ? (this.width - st.xPos) * Math.sin(st.angle) * 0.22 : 0;
        st.sprite.position.set(st.xPos, ((st.yNorm * this.height + yOff) % this.height + this.height) % this.height);
        st.sprite.alpha = st.baseAlpha * streakAlpha;
      }
    }
  }

  /**
   * STAGE 1-1: Astillero Lagrange (132s + Boss)
   *   Phase 1 (0–44s):   Deep Orbital Approach
   *   Phase 2 (44–90s):  3D Lagrange Shipyard Docking Ring-Gate Flythrough!
   *   Phase 3 (90–132s+): Low-Orbit Planetary Sunrise & Aurora Sweeps
   */
  private updateStage1_1(t: number, clk: number, dt: number, pxNorm: number, pyNorm: number, bossBoost: number): void {
    const p2 = smoothstep(40, 50, t);
    const p3 = smoothstep(86, 98, t);
    const inTunnel = p2 * (1 - p3);
    const trans12 = pulseBell(t, 45, 5.5);
    const trans23 = pulseBell(t, 92, 6.0);

    // Nebula camera drift & slight zoom across acts
    this.nebulaSprite.x = this.width * 0.5 - pxNorm * 14 + Math.sin(clk * 0.06) * 18;
    this.nebulaSprite.y = this.height * 0.5 - pyNorm * 10 + Math.cos(clk * 0.05) * 10;
    const nebScale = 1.18 + p2 * 0.06 + p3 * 0.06;
    this.nebulaSprite.scale.set(
      (this.width * nebScale) / Math.max(1, this.nebulaSprite.texture.width),
      (this.height * nebScale) / Math.max(1, this.nebulaSprite.texture.height)
    );

    // World Camera Glide & Banking Roll
    const camScale = lerp(0.72, 1.02, p2) + p3 * 0.24;
    this.worldGroup.scale.set(camScale);
    this.worldGroup.rotation = lerp(-0.02, -0.065, inTunnel) + p3 * 0.032 + Math.sin(clk * 0.22) * 0.012;
    this.worldGroup.position.set(this.width * 0.5 - pxNorm * 24, this.height * 0.5 - pyNorm * 16);

    // Distant Spiral Galaxy (lower-left) & Crescent Moon Selene (upper-left)
    this.galaxySprite.visible = true;
    this.galaxySprite.position.set(-this.width * 0.34 - p2 * 26, this.height * 0.22);
    this.galaxySprite.scale.set(0.74);
    this.galaxySprite.rotation = 0.08 + clk * 0.01;
    this.galaxySprite.alpha = 0.78 * (1 - p3 * 0.45);

    this.moonSprite.visible = true;
    this.moonSprite.position.set(lerp(-this.width * 0.08, -this.width * 0.28, p2) - p3 * 36, lerp(-this.height * 0.28, -this.height * 0.22, p2));
    this.moonSprite.scale.set(lerp(0.28, 0.38, p2));
    this.moonSprite.alpha = 0.94;

    // Giant Ringed Exoplanet Lagrange Prime
    this.planetGroup.visible = true;
    const planetX = lerp(this.width * 0.30, this.width * 0.20, p2) + p3 * 12;
    const planetY = lerp(this.height * 0.06, this.height * 0.03, p2) + Math.sin(clk * 0.25) * 5;
    this.planetGroup.position.set(planetX, planetY);
    this.planetGroup.scale.set(lerp(0.82, 1.0, p2) + p3 * 0.14);

    // Sleek Sunrise Corona Flare (builds dramatically in Phase 3!)
    const sunPulse = 1.0 + Math.sin(clk * 1.5) * 0.05 + bossBoost * 0.08;
    this.solarBloomSprite.position.set(116, -92);
    this.solarBloomSprite.scale.set((0.88 + p3 * 0.38) * sunPulse, (0.68 + p3 * 0.22) * sunPulse);
    this.solarBloomSprite.alpha = 0.40 + p2 * 0.14 + p3 * 0.34;

    // Volumetric Orbital Searchlights / Low-Orbit Aurora Beams (Phase 2 & 3!)
    this.beamA.visible = p2 > 0.05;
    this.beamA.tint = 0x38bdf8;
    this.beamA.position.set(planetX - 60, planetY - 90);
    this.beamA.rotation = 2.65 + Math.sin(clk * 0.55) * 0.18;
    this.beamA.scale.set(2.8, 1.45);
    this.beamA.alpha = (inTunnel * 0.28 + p3 * 0.36 + bossBoost * 0.12);

    this.beamB.visible = p3 > 0.05;
    this.beamB.tint = 0xffd166;
    this.beamB.position.set(planetX + 95, planetY - 82);
    this.beamB.rotation = 2.38 + Math.cos(clk * 0.42) * 0.12;
    this.beamB.scale.set(3.2, 1.15);
    this.beamB.alpha = p3 * (0.34 + bossBoost * 0.14);

    // Phase 2 Dynamic Set-Piece: 3D Lagrange Shipyard Docking Ring-Gate Tunnel Flythrough!
    if (inTunnel > 0.01) {
      this.gateTunnelGroup.visible = true;
      this.gateTunnelGroup.position.set(this.width * 0.54 - pxNorm * 34, this.height * 0.5 - pyNorm * 22);
      const gateCycleSpeed = 0.28;
      for (let i = 0; i < this.gateRings.length; i++) {
        const g = this.gateRings[i];
        const zProg = (clk * gateCycleSpeed + i / this.gateRings.length) % 1.0; // 0 = far, 1 = rushing past camera
        const perspectiveScale = 0.34 + Math.pow(zProg, 2.35) * 2.45;
        const fadeIn = smoothstep(0.0, 0.22, zProg);
        const fadeOut = 1.0 - smoothstep(0.76, 1.0, zProg);
        g.position.set(lerp(150, -180, zProg), Math.sin(zProg * Math.PI + i) * 18);
        g.scale.set(perspectiveScale * 0.72, perspectiveScale);
        g.rotation = (i % 2 === 0 ? 1 : -1) * (clk * 0.18 + i * 0.7);
        g.alpha = fadeIn * fadeOut * inTunnel * 0.74;
        g.tint = zProg > 0.65 ? 0xbfeaff : 0x7dd3fc;
      }
    }

    // Subtle Phase-Transition Shimmer Pulse
    const transPulse = Math.max(trans12 * 0.22, trans23 * 0.26);
    this.phaseVeilSprite.tint = trans23 > trans12 ? 0xffe4b5 : 0x7dd3fc;
    this.phaseVeilSprite.alpha = transPulse;

    this.updateCommonParticles(
      clk,
      dt,
      pxNorm,
      pyNorm,
      1.0 + inTunnel * 1.45 + p3 * 0.65 + bossBoost * 0.35,
      0.55 + inTunnel * 0.45 + p3 * 0.3,
      0.16 + inTunnel * 0.78 + p3 * 0.35 + trans12 * 0.45 + bossBoost * 0.25,
      0.85 + inTunnel * 1.15 + p3 * 0.4
    );
  }

  /**
   * STAGE 1-2: Cinturón Kessler (148s + Boss)
   *   Phase 1 (0–50s):    Twilight Edge — Lagrange Prime visible behind/lower-left, first debris drifts
   *   Phase 2 (50–102s):  Kessler Debris & Meteoroid Storm — multi-depth tumbling rocks, broken panels & golden streaks!
   *   Phase 3 (102–148s+): Eye of the Orbital Graveyard — backlit debris halo + Moon Selene rising ahead!
   */
  private updateStage1_2(t: number, clk: number, dt: number, pxNorm: number, pyNorm: number, bossBoost: number): void {
    const p2 = smoothstep(46, 56, t);
    const p3 = smoothstep(98, 110, t);
    const inStorm = p2 * (1 - p3);
    const trans12 = pulseBell(t, 51, 5.5);
    const trans23 = pulseBell(t, 104, 6.0);

    // Copper-indigo twilight nebula pan
    this.nebulaSprite.x = this.width * 0.5 - pxNorm * 16 + Math.sin(clk * 0.08) * 20;
    this.nebulaSprite.y = this.height * 0.5 - pyNorm * 12;
    const nebScale = 1.2 + inStorm * 0.06;
    this.nebulaSprite.scale.set(
      (this.width * nebScale) / Math.max(1, this.nebulaSprite.texture.width),
      (this.height * nebScale) / Math.max(1, this.nebulaSprite.texture.height)
    );

    // Camera banking into debris field
    this.worldGroup.scale.set(lerp(0.95, 1.06, p2));
    this.worldGroup.rotation = lerp(0.015, 0.055, inStorm) - p3 * 0.02 + Math.sin(clk * 0.32) * 0.014;
    this.worldGroup.position.set(this.width * 0.5 - pxNorm * 22, this.height * 0.5 - pyNorm * 14);

    // Continuity: Lagrange Prime now behind us in the lower-left twilight horizon!
    this.planetGroup.visible = true;
    this.planetGroup.position.set(lerp(-this.width * 0.32, -this.width * 0.44, p2) - p3 * 45, this.height * 0.42 + p3 * 36);
    this.planetGroup.scale.set(lerp(0.86, 0.62, p2));
    this.solarBloomSprite.position.set(112, -92);
    this.solarBloomSprite.scale.set(0.75, 0.55);
    this.solarBloomSprite.alpha = 0.42 * (1 - p3 * 0.5);

    this.galaxySprite.visible = true;
    this.galaxySprite.position.set(this.width * 0.14, -this.height * 0.32);
    this.galaxySprite.scale.set(0.58);
    this.galaxySprite.alpha = 0.45;

    // Foreshadowing Stage 1-3: Moon Selene grows prominently on the upper-right horizon in Phase 3!
    this.moonSprite.visible = true;
    this.moonSprite.position.set(lerp(this.width * 0.36, this.width * 0.25, p3), lerp(-this.height * 0.30, -this.height * 0.12, p3));
    this.moonSprite.scale.set(lerp(0.24, 0.56, p3));
    this.moonSprite.alpha = 0.55 + p3 * 0.45;

    // Orbital wreckage searchlights in Phase 3 clearing
    this.beamA.visible = p3 > 0.05;
    this.beamA.tint = 0xfb923c;
    this.beamA.position.set(this.width * 0.32, this.height * 0.30);
    this.beamA.rotation = 3.45 + Math.sin(clk * 0.6) * 0.24;
    this.beamA.scale.set(3.1, 1.35);
    this.beamA.alpha = p3 * (0.34 + bossBoost * 0.14);

    this.beamB.visible = p3 > 0.05;
    this.beamB.tint = 0x38bdf8;
    this.beamB.position.set(this.width * 0.30, -this.height * 0.26);
    this.beamB.rotation = 2.68 + Math.cos(clk * 0.48) * 0.20;
    this.beamB.scale.set(2.9, 1.15);
    this.beamB.alpha = p3 * (0.28 + bossBoost * 0.12);

    // Multi-Depth Tumbling Kessler Debris Belt (Rocks + Fractured Satellite Solar Panels)
    this.debrisGroup.visible = true;
    const debrisSpeedMult = 0.65 + inStorm * 1.45 + p3 * 0.25;
    for (let i = 0; i < this.debrisPieces.length; i++) {
      const piece = this.debrisPieces[i];
      // In Phase 1 & 3 show mainly far/mid pieces; in Phase 2 unleash ALL 20 including dramatic foreground silhouettes!
      const tierVisibility = piece.depthTier === 2 ? smoothstep(0.08, 0.45, inStorm) : piece.depthTier === 1 ? 0.55 + inStorm * 0.45 : 0.85;
      piece.xPos -= piece.speedPx * debrisSpeedMult * dt;
      piece.yNorm += (piece.vyPx * dt) / this.height;
      if (piece.xPos < -130) {
        piece.xPos = this.width + 130 + seeded01(i, Math.floor(clk)) * 90;
        piece.yNorm = 0.06 + seeded01(i + 7, Math.floor(clk * 2)) * 0.88;
      }
      if (piece.yNorm < -0.1) piece.yNorm = 1.08;
      if (piece.yNorm > 1.1) piece.yNorm = -0.08;

      piece.sprite.position.set(piece.xPos - pxNorm * piece.parallax, piece.yNorm * this.height - pyNorm * piece.parallax * 0.6);
      piece.sprite.rotation += piece.rotSpeed * (0.8 + inStorm * 0.8) * dt;
      piece.sprite.scale.set(piece.baseScale);
      piece.sprite.alpha = tierVisibility * (piece.depthTier === 2 ? 0.62 : piece.depthTier === 1 ? 0.82 : 0.68);
      piece.sprite.tint = piece.depthTier === 0 ? 0x9aa8c8 : piece.isPanel ? 0xdbeafe : 0xffdfc2;
    }

    // Subtle amber phase-transition flash
    this.phaseVeilSprite.tint = trans23 > trans12 ? 0xbae6fd : 0xfb923c;
    this.phaseVeilSprite.alpha = Math.max(trans12 * 0.24, trans23 * 0.20);

    this.updateCommonParticles(
      clk,
      dt,
      pxNorm,
      pyNorm,
      1.1 + inStorm * 1.55 + p3 * 0.55 + bossBoost * 0.3,
      0.65 + inStorm * 0.55 + p3 * 0.25,
      0.24 + inStorm * 0.86 + p3 * 0.30 + trans12 * 0.45 + bossBoost * 0.22,
      1.0 + inStorm * 1.25 + p3 * 0.35
    );
  }

  /**
   * STAGE 1-3: Bastión Lunar Selene (90s + Boss)
   *   Phase 1 (0–32s):  Lunar Descent — Lagrange Prime small in distant upper-left sky, Moon Selene looms ahead!
   *   Phase 2 (32–64s): Low-Altitude Crater Skim — dual-layer scrolling Lunar Crater Horizon rises beneath you!
   *   Phase 3 (64–90s+): Plenilunio del Bastión — climbing above the observatory with silver-violet telemetry rings & moonbow!
   */
  private updateStage1_3(t: number, clk: number, dt: number, pxNorm: number, pyNorm: number, bossBoost: number): void {
    const p2 = smoothstep(28, 36, t);
    const p3 = smoothstep(60, 70, t);
    const inSkim = p2 * (1 - p3);
    const trans12 = pulseBell(t, 32, 4.5);
    const trans23 = pulseBell(t, 65, 5.0);

    // Silver-indigo deep lunar sky
    this.nebulaSprite.x = this.width * 0.5 - pxNorm * 14 + Math.sin(clk * 0.06) * 16;
    this.nebulaSprite.y = this.height * 0.5 - pyNorm * 10;
    const nebScale = 1.18 + p2 * 0.05 + p3 * 0.05;
    this.nebulaSprite.scale.set(
      (this.width * nebScale) / Math.max(1, this.nebulaSprite.texture.width),
      (this.height * nebScale) / Math.max(1, this.nebulaSprite.texture.height)
    );

    // Camera descent -> skim bank -> majestic ascent
    this.worldGroup.scale.set(lerp(0.92, 1.06, p2) + p3 * 0.06);
    this.worldGroup.rotation = lerp(0.0, 0.048, inSkim) + Math.sin(clk * 0.2) * 0.01;
    this.worldGroup.position.set(this.width * 0.5 - pxNorm * 20, this.height * 0.5 - pyNorm * 14);

    // Full-Circle Continuity: Earth-like Lagrange Prime hanging small & radiant in distant upper-left sky!
    this.planetGroup.visible = true;
    this.planetGroup.position.set(-this.width * 0.34, lerp(-this.height * 0.24, -this.height * 0.30, p2));
    this.planetGroup.scale.set(0.24);
    this.solarBloomSprite.position.set(112, -92);
    this.solarBloomSprite.scale.set(0.85, 0.65);
    this.solarBloomSprite.alpha = 0.52;

    this.galaxySprite.visible = true;
    this.galaxySprite.position.set(-this.width * 0.14, -this.height * 0.34);
    this.galaxySprite.scale.set(0.55);
    this.galaxySprite.alpha = 0.52;

    // Physical Continuity: Moon Selene looms in Phase 1, then smoothly yields as we descend onto its cratered surface in Phase 2 & 3!
    const moonExit = smoothstep(26, 36, t);
    this.moonSprite.visible = moonExit < 0.99;
    this.moonSprite.position.set(this.width * 0.24, lerp(this.height * 0.02, this.height * 0.65, moonExit));
    this.moonSprite.scale.set(lerp(0.88, 1.55, moonExit));
    this.moonSprite.alpha = 1.0 - moonExit;

    // Counter-Rotating Silver-Indigo Lunar Bastion Observatory Telemetry Rings (Subtle in Phase 1, Radiant in Phase 3 over lunar horizon!)
    const ringAlpha = 0.22 + p3 * 0.52 + bossBoost * 0.14;
    this.telemetryA.visible = ringAlpha > 0.02;
    this.telemetryA.position.set(this.width * 0.20, -24);
    this.telemetryA.scale.set(0.76 + p3 * 0.34);
    this.telemetryA.rotation = clk * 0.12;
    this.telemetryA.alpha = ringAlpha;
    this.telemetryA.tint = 0x93c5fd;

    this.telemetryB.visible = p3 > 0.05;
    this.telemetryB.position.set(this.width * 0.20, -24);
    this.telemetryB.scale.set(1.06 + p3 * 0.28);
    this.telemetryB.rotation = -clk * 0.09;
    this.telemetryB.alpha = p3 * (0.44 + bossBoost * 0.14);
    this.telemetryB.tint = 0xc4b5fd;

    // Silver-violet lunar bastion aurora beams in Phase 3
    this.beamA.visible = p3 > 0.05;
    this.beamA.tint = 0xa5b4fc;
    this.beamA.position.set(this.width * 0.20, -40);
    this.beamA.rotation = 2.85 + Math.sin(clk * 0.45) * 0.16;
    this.beamA.scale.set(3.2, 1.4);
    this.beamA.alpha = p3 * (0.34 + bossBoost * 0.14);

    this.beamB.visible = p3 > 0.05;
    this.beamB.tint = 0x7dd3fc;
    this.beamB.position.set(this.width * 0.20, 50);
    this.beamB.rotation = 3.42 + Math.cos(clk * 0.38) * 0.16;
    this.beamB.scale.set(3.0, 1.3);
    this.beamB.alpha = p3 * (0.28 + bossBoost * 0.12);

    // Phase 2 & 3 Dynamic Set-Piece: Scrolling Dual-Layer Cratered Lunar Surface Horizon!
    const horizonRise = smoothstep(26, 36, t);
    if (horizonRise > 0.01) {
      this.lunarSurfaceGroup.visible = true;
      const skimScrollMult = 1.0 + inSkim * 1.15;
      const farBaseY = lerp(this.height + 40, this.height - 235 + p3 * 72, horizonRise);
      const nearBaseY = lerp(this.height + 80, this.height - 178 + p3 * 64, horizonRise);

      this.lunarFarTiling.position.set(-64, farBaseY - pyNorm * 14);
      this.lunarFarTiling.tilePosition.x -= 165 * skimScrollMult * dt;
      this.lunarFarTiling.alpha = horizonRise * (0.68 - p3 * 0.12);

      this.lunarNearTiling.position.set(-64, nearBaseY - pyNorm * 26);
      this.lunarNearTiling.tilePosition.x -= 320 * skimScrollMult * dt;
      this.lunarNearTiling.alpha = horizonRise * (0.94 - p3 * 0.14);
    }

    // Crisp silver-cyan phase-transition pulse
    this.phaseVeilSprite.tint = trans23 > trans12 ? 0xc4b5fd : 0xbae6fd;
    this.phaseVeilSprite.alpha = Math.max(trans12 * 0.26, trans23 * 0.24);

    this.updateCommonParticles(
      clk,
      dt,
      pxNorm,
      pyNorm,
      1.05 + inSkim * 1.45 + p3 * 0.65 + bossBoost * 0.35,
      0.52 + inSkim * 0.42 + p3 * 0.38,
      0.18 + inSkim * 0.72 + p3 * 0.34 + trans12 * 0.45 + bossBoost * 0.26,
      0.9 + inSkim * 1.15 + p3 * 0.42
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

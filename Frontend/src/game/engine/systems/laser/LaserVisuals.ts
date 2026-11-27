import * as PIXI from 'pixi.js';
import type { LaserBeam } from '../../types';
import type { ParticleSystem } from '../ParticleSystem';

export interface LaserRenderLayers {
  baseGraphics: PIXI.Graphics;
  glowGraphics: PIXI.Graphics;
  addBeamGlowSprite: (
    x: number,
    y: number,
    length: number,
    height: number,
    tint: number,
    alpha: number,
    anchorX?: number
  ) => void;
  addMuzzleFlareSprite: (
    x: number,
    y: number,
    scaleX: number,
    scaleY: number,
    tint: number,
    alpha: number,
    rotation?: number
  ) => void;
}

function drawBellCone(
  g: PIXI.Graphics,
  sx: number,
  sy: number,
  endX: number,
  flareDist: number,
  r0: number,
  rFull: number,
  rightward: boolean,
  color: number,
  alpha: number
): void {
  const dir = rightward ? 1 : -1;
  const dist = Math.abs(endX - sx);
  const actualFlare = Math.min(dist, flareDist);
  const flareEndX = sx + dir * actualFlare;
  const ctrlX = sx + dir * (actualFlare * 0.42);

  g.beginFill(color, alpha);
  g.moveTo(sx, sy - r0);
  g.quadraticCurveTo(ctrlX, sy - rFull, flareEndX, sy - rFull);
  g.lineTo(endX, sy - rFull);
  g.lineTo(endX, sy + rFull);
  g.lineTo(flareEndX, sy + rFull);
  g.quadraticCurveTo(ctrlX, sy + rFull, sx, sy + r0);
  g.closePath();
  g.endFill();
}

function drawHelixRibbon(
  g: PIXI.Graphics,
  sx: number,
  sy: number,
  endX: number,
  amp: number,
  wavelength: number,
  phase: number,
  lineWidth: number,
  color: number,
  alpha: number,
  rightward: boolean
): void {
  const dir = rightward ? 1 : -1;
  const totalLen = Math.abs(endX - sx);
  if (totalLen < 20) return;

  const steps = Math.min(40, Math.max(12, Math.floor(totalLen / 24)));
  g.lineStyle(lineWidth, color, alpha);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const dist = t * totalLen;
    const x = sx + dir * dist;
    const envelope = Math.min(1, dist / 110);
    const y = sy + Math.sin(dist / wavelength - phase) * amp * envelope;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.lineStyle(0);
}

export function renderCharging(
  layers: LaserRenderLayers,
  laser: LaserBeam,
  endX: number,
  animTimer: number,
  isMasterSpark: boolean,
  isBossMegaStyle: boolean,
  particleSystem?: ParticleSystem
): void {
  const { baseGraphics, glowGraphics, addBeamGlowSprite, addMuzzleFlareSprite } = layers;
  const progress = Math.max(0, Math.min(1, laser.timer / Math.max(0.05, laser.chargeDuration)));
  const ease = 1 - Math.pow(1 - progress, 2);
  const sx = laser.sourceX;
  const sy = laser.sourceY;

  if (isMasterSpark) {
    const rot1 = animTimer * 7.5;
    const rot2 = -animTimer * 11.5;
    const runeRadius = 56 - ease * 14 + Math.sin(animTimer * 26) * 2.5;
    const beamLen = Math.max(10, endX - sx);

    // 1. Soft additive cosmic bloom & anamorphic lens flare at emitter
    addMuzzleFlareSprite(sx, sy, 0.9 + ease * 1.35, 0.9 + ease * 1.35, 0xa855f7, 0.42 + ease * 0.35, rot1 * 0.3);
    addMuzzleFlareSprite(sx, sy, 1.4 + ease * 2.4, 0.28 + ease * 0.24, 0x00f2fe, 0.55 + ease * 0.4, 0);
    addMuzzleFlareSprite(sx, sy, 0.45 + ease * 0.75, 0.45 + ease * 0.75, 0xffffff, 0.75 + ease * 0.25, -rot2 * 0.2);

    // 2. Converging prismatic sightline rails snapping inward toward firing axis
    const railSpread = (1 - ease) * 44 + 2;
    addBeamGlowSprite(sx, sy, beamLen, 8 + ease * 18, 0x00f2fe, 0.16 + ease * 0.34, 0);
    glowGraphics.lineStyle(1.4, 0xf472b6, 0.35 + ease * 0.45);
    glowGraphics.moveTo(sx, sy - railSpread);
    glowGraphics.lineTo(endX, sy - railSpread * 0.35);
    glowGraphics.moveTo(sx, sy + railSpread);
    glowGraphics.lineTo(endX, sy + railSpread * 0.35);

    const guidePulse = 0.55 + 0.45 * Math.sin(animTimer * 42);
    glowGraphics.lineStyle(1.5 + ease * 2.5, 0xffffff, guidePulse * (0.45 + ease * 0.55));
    glowGraphics.moveTo(sx, sy);
    glowGraphics.lineTo(endX, sy);
    glowGraphics.lineStyle(0);

    // 3. Foreshortened 3D Touhou Magic Circle + Twin Counter-Rotating Star Sigils
    glowGraphics.lineStyle(2.4, 0x00f2fe, 0.85);
    glowGraphics.drawEllipse(sx, sy, runeRadius * 0.42, runeRadius);
    glowGraphics.lineStyle(1.6, 0xe879f9, 0.78);
    glowGraphics.drawEllipse(sx, sy, runeRadius * 0.3, runeRadius * 0.74);

    // Rotating 6-point hexagram + 8-point starburst inscribed in the 3D ellipse
    glowGraphics.lineStyle(1.8, 0x00f2fe, 0.85);
    for (let s = 0; s < 6; s++) {
      const a1 = rot1 + (Math.PI / 3) * s;
      const a2 = rot1 + (Math.PI / 3) * (s + 2);
      glowGraphics.moveTo(sx + Math.cos(a1) * runeRadius * 0.4, sy + Math.sin(a1) * runeRadius * 0.94);
      glowGraphics.lineTo(sx + Math.cos(a2) * runeRadius * 0.4, sy + Math.sin(a2) * runeRadius * 0.94);
    }

    glowGraphics.lineStyle(1.8, 0xfef08a, 0.92);
    for (let s = 0; s < 8; s++) {
      const a1 = rot2 + (Math.PI / 4) * s;
      const a2 = rot2 + (Math.PI / 4) * (s + 3);
      glowGraphics.moveTo(sx + Math.cos(a1) * runeRadius * 0.28, sy + Math.sin(a1) * runeRadius * 0.68);
      glowGraphics.lineTo(sx + Math.cos(a2) * runeRadius * 0.28, sy + Math.sin(a2) * runeRadius * 0.68);
    }

    // 4. Inward energy suction streaks pulling ambient cosmic light into the core
    const streakCount = 10;
    for (let k = 0; k < streakCount; k++) {
      const ang = rot1 * 0.6 + (Math.PI * 2 * k) / streakCount;
      const outerR = (1 - ((progress * 2.2 + k * 0.17) % 1)) * 78 + 14;
      const innerR = Math.max(4, outerR - 22);
      const col = k % 3 === 0 ? 0x00f2fe : k % 3 === 1 ? 0xf472b6 : 0xfef08a;
      glowGraphics.lineStyle(2.0, col, 0.78);
      glowGraphics.moveTo(sx + Math.cos(ang) * outerR, sy + Math.sin(ang) * outerR);
      glowGraphics.lineTo(sx + Math.cos(ang) * innerR, sy + Math.sin(ang) * innerR);
    }
    glowGraphics.lineStyle(0);

    // 5. Condensed incandescent core
    const coreRad = 6 + ease * 20;
    baseGraphics.beginFill(0x00f2fe, 0.78);
    baseGraphics.drawCircle(sx, sy, coreRad * 1.25);
    baseGraphics.endFill();
    baseGraphics.beginFill(0xffffff, 1.0);
    baseGraphics.drawCircle(sx, sy, coreRad * 0.68);
    baseGraphics.endFill();

    if (particleSystem && Math.random() < 0.7) {
      const ang = Math.random() * Math.PI * 2;
      const r = 46 + Math.random() * 28;
      const palette = [0x00f2fe, 0xe879f9, 0xfef08a, 0xffffff];
      particleSystem.spawnSpark(
        sx + Math.cos(ang) * r,
        sy + Math.sin(ang) * r,
        -Math.cos(ang) * 210,
        -Math.sin(ang) * 210,
        palette[Math.floor(Math.random() * palette.length)],
        3.5 + Math.random() * 2,
        0.22,
        true
      );
    }
    return;
  }

  if (isBossMegaStyle) {
    const rot = -animTimer * 10;
    const chargeRad = 40 + ease * 20;
    addMuzzleFlareSprite(sx, sy, 1.0 + ease * 1.4, 1.0 + ease * 1.4, 0xff8800, 0.45 + ease * 0.4, rot * 0.3);
    addMuzzleFlareSprite(sx, sy, 1.6 + ease * 1.6, 0.25 + ease * 0.2, 0xffdd00, 0.65, 0);

    glowGraphics.lineStyle(2.4, 0xffdd00, 0.9);
    glowGraphics.drawEllipse(sx, sy, chargeRad * 0.42, chargeRad);
    for (let r = 0; r < 8; r++) {
      const angle = rot + (Math.PI / 4) * r;
      glowGraphics.moveTo(sx, sy);
      glowGraphics.lineTo(sx + Math.cos(angle) * chargeRad * 0.42, sy + Math.sin(angle) * chargeRad);
    }
    glowGraphics.lineStyle(1.8, 0xff4400, 0.5 + ease * 0.45);
    glowGraphics.moveTo(sx, sy);
    glowGraphics.lineTo(endX, laser.targetY);
    glowGraphics.lineStyle(0);
    return;
  }

  const guideAlpha = 0.3 + progress * 0.55;
  glowGraphics.lineStyle(2, laser.color, guideAlpha);
  glowGraphics.moveTo(sx, sy);
  glowGraphics.lineTo(endX, laser.targetY);
  glowGraphics.lineStyle(0);

  const chargeRadius = 4 + progress * 16;
  addMuzzleFlareSprite(sx, sy, 0.3 + progress * 0.55, 0.3 + progress * 0.55, laser.color, guideAlpha);
  baseGraphics.beginFill(laser.color, guideAlpha);
  baseGraphics.drawCircle(sx, sy, chargeRadius);
  baseGraphics.endFill();
  baseGraphics.beginFill(0xffffff, guideAlpha);
  baseGraphics.drawCircle(sx, sy, chargeRadius * 0.5);
  baseGraphics.endFill();
}

export function renderFiring(
  layers: LaserRenderLayers,
  laser: LaserBeam,
  endX: number,
  pulseWidth: number,
  animTimer: number,
  isMasterSpark: boolean,
  isBossMegaStyle: boolean,
  particleSystem?: ParticleSystem
): void {
  const { baseGraphics, glowGraphics, addBeamGlowSprite, addMuzzleFlareSprite } = layers;
  const sx = laser.sourceX;
  const sy = laser.sourceY;

  if (isMasterSpark) {
    const beamLen = Math.max(12, endX - sx);
    const breath = 1 + Math.sin(animTimer * 44) * 0.055;
    const outerR = pulseWidth * 1.18 * breath;
    const midR = pulseWidth * 0.78 * breath;
    const innerR = pulseWidth * 0.44 * breath;
    const coreR = pulseWidth * 0.24 * (1 + Math.sin(animTimer * 62) * 0.08);

    // 1. Feathered HDR-style additive spectral corona (prismatic Marisa Master Spark bloom!)
    addBeamGlowSprite(sx, sy, beamLen, outerR * 3.3, 0x7c3aed, 0.34, 0);
    addBeamGlowSprite(sx, sy - outerR * 0.14, beamLen, outerR * 2.25, 0xec4899, 0.36, 0);
    addBeamGlowSprite(sx, sy + outerR * 0.14, beamLen, outerR * 2.25, 0x00f2fe, 0.48, 0);
    addBeamGlowSprite(sx, sy, beamLen, midR * 1.85, 0x38bdf8, 0.62, 0);
    addBeamGlowSprite(sx, sy, beamLen, coreR * 2.2, 0xffffff, 0.85, 0);

    // 2. Sculpted conical Master Spark bell body (deep violet -> vivid cyan -> blinding starlight core)
    drawBellCone(baseGraphics, sx, sy, endX, 160, Math.min(outerR, 26), outerR * 0.76, true, 0x3b0764, 0.42);
    drawBellCone(glowGraphics, sx, sy, endX, 155, Math.min(midR, 22), midR * 0.84, true, 0x0284c7, 0.56);
    drawBellCone(glowGraphics, sx, sy, endX, 145, Math.min(innerR, 16), innerR * 0.92, true, 0x00f2fe, 0.78);
    drawBellCone(baseGraphics, sx, sy, endX, 125, Math.min(coreR, 11), coreR, true, 0xffffff, 0.98);

    // 3. Prismatic edge highlights (magenta top rim, golden-cyan bottom rim)
    const rimFlareX = Math.min(endX, sx + 150);
    glowGraphics.lineStyle(3.2, 0xf472b6, 0.78);
    glowGraphics.moveTo(sx, sy - Math.min(midR, 18));
    glowGraphics.quadraticCurveTo(sx + 65, sy - midR * 0.85, rimFlareX, sy - midR * 0.85);
    glowGraphics.lineTo(endX, sy - midR * 0.85);

    glowGraphics.lineStyle(3.2, 0xfef08a, 0.72);
    glowGraphics.moveTo(sx, sy + Math.min(midR, 18));
    glowGraphics.quadraticCurveTo(sx + 65, sy + midR * 0.85, rimFlareX, sy + midR * 0.85);
    glowGraphics.lineTo(endX, sy + midR * 0.85);
    glowGraphics.lineStyle(0);

    // 4. Twin Counter-Spiraling Cosmic Plasma Helices racing down the beam
    drawHelixRibbon(glowGraphics, sx, sy, endX, midR * 0.76, 44, animTimer * 24, 3.6, 0x00f2fe, 0.86, true);
    drawHelixRibbon(glowGraphics, sx, sy, endX, midR * 0.72, 44, animTimer * 24 + Math.PI, 3.2, 0xf472b6, 0.82, true);
    drawHelixRibbon(glowGraphics, sx, sy, endX, innerR * 0.62, 29, animTimer * 32 + 1.1, 2.2, 0xfef08a, 0.78, true);

    // 5. High-frequency crackling energy arcs along the beam envelope
    glowGraphics.lineStyle(1.8, 0xffffff, 0.85);
    const arcCount = 4;
    for (let a = 0; a < arcCount; a++) {
      const startOff = ((animTimer * 740 + a * 230) % Math.max(80, beamLen - 40)) + 20;
      const segLen = Math.min(110, beamLen - startOff);
      if (segLen <= 18) continue;
      const side = a % 2 === 0 ? -1 : 1;
      const x0 = sx + startOff;
      const y0 = sy + side * (innerR * 0.55 + Math.sin(animTimer * 30 + a) * 10);
      const x1 = x0 + segLen * 0.35;
      const y1 = sy + side * (midR * 0.95 + Math.cos(animTimer * 52 + a * 2) * 14);
      const x2 = x0 + segLen * 0.72;
      const y2 = sy + side * (innerR * 0.4 + Math.sin(animTimer * 46 + a * 3) * 12);
      const x3 = x0 + segLen;
      const y3 = sy + side * (midR * 0.78);
      glowGraphics.moveTo(x0, y0);
      glowGraphics.lineTo(x1, y1);
      glowGraphics.lineTo(x2, y2);
      glowGraphics.lineTo(x3, y3);
    }

    // 6. Expanding 3D Foreshortened Shockwave Rings blasting forward along the barrel
    const ringCount = 5;
    for (let r = 0; r < ringCount; r++) {
      const travel = (animTimer * 560 + r * (Math.max(260, beamLen) / ringCount)) % Math.max(260, beamLen);
      if (travel > beamLen) continue;
      const frac = travel / Math.max(260, beamLen);
      const rx = sx + travel;
      const envelope = Math.min(1, travel / 95);
      const ringRy = (midR * 0.95 + frac * 22) * envelope;
      const ringRx = Math.max(6, ringRy * 0.28);
      const ringAlpha = (1 - frac * 0.78) * 0.78;
      const ringColor = r % 3 === 0 ? 0xffffff : r % 3 === 1 ? 0x00f2fe : 0xf472b6;
      glowGraphics.lineStyle(2.4, ringColor, ringAlpha);
      glowGraphics.drawEllipse(rx, sy, ringRx, ringRy);
    }

    // 7. Spinning Arcane Emitter Halo & Blinding Anamorphic Muzzle Core
    const muzzleRad = Math.min(outerR * 0.92, 72);
    const spin = animTimer * 10;
    glowGraphics.lineStyle(2.4, 0x00f2fe, 0.92);
    glowGraphics.drawEllipse(sx, sy, muzzleRad * 0.36, muzzleRad);
    glowGraphics.lineStyle(1.8, 0xfef08a, 0.88);
    for (let s = 0; s < 6; s++) {
      const a1 = spin + (Math.PI / 3) * s;
      const a2 = spin + (Math.PI / 3) * (s + 2);
      glowGraphics.moveTo(sx + Math.cos(a1) * muzzleRad * 0.34, sy + Math.sin(a1) * muzzleRad * 0.94);
      glowGraphics.lineTo(sx + Math.cos(a2) * muzzleRad * 0.34, sy + Math.sin(a2) * muzzleRad * 0.94);
    }
    glowGraphics.lineStyle(0);

    addMuzzleFlareSprite(sx + 6, sy, 2.35 * breath, 2.1 * breath, 0x00f2fe, 0.72, animTimer * 1.4);
    addMuzzleFlareSprite(sx + 6, sy, 3.2 * breath, 0.52 * breath, 0xf472b6, 0.65, 0);
    addMuzzleFlareSprite(sx + 4, sy, 1.25 * breath, 1.25 * breath, 0xffffff, 0.98, -animTimer * 2.2);

    baseGraphics.beginFill(0xffffff, 1.0);
    baseGraphics.drawEllipse(sx + 6, sy, Math.min(coreR * 1.15, 22), Math.min(coreR * 1.65, 34));
    baseGraphics.endFill();

    // 8. Streaming high-speed starlight sparks & shards roaring down the beam
    if (particleSystem) {
      const palette = [0xffffff, 0x00f2fe, 0xf472b6, 0xfef08a, 0xa855f7];
      for (let p = 0; p < 3; p++) {
        const along = Math.random() * Math.min(beamLen, 720);
        const spreadY = (Math.random() - 0.5) * midR * 1.9;
        particleSystem.spawnSpark(
          sx + along,
          sy + spreadY,
          520 + Math.random() * 480,
          (spreadY / Math.max(12, midR)) * 95 + (Math.random() - 0.5) * 65,
          palette[Math.floor(Math.random() * palette.length)],
          3.2 + Math.random() * 3.4,
          0.22 + Math.random() * 0.16,
          p === 0
        );
      }
      // Radial burst at the muzzle
      const mAng = (Math.random() - 0.5) * 2.2;
      particleSystem.spawnSpark(
        sx + 6,
        sy + (Math.random() - 0.5) * 18,
        Math.cos(mAng) * (320 + Math.random() * 260),
        Math.sin(mAng) * (240 + Math.random() * 220),
        0xfef08a,
        4.2,
        0.24,
        true
      );
    }
    return;
  }

  if (isBossMegaStyle) {
    const beamLen = Math.max(12, sx - endX);
    const breath = 1 + Math.sin(animTimer * 42) * 0.055;
    const outerR = pulseWidth * 1.15 * breath;
    const midR = pulseWidth * 0.78 * breath;
    const coreR = pulseWidth * 0.28 * breath;

    addBeamGlowSprite(sx, sy, beamLen, outerR * 3.0, 0xdc2626, 0.38, 1);
    addBeamGlowSprite(sx, sy, beamLen, midR * 2.1, 0xff8800, 0.54, 1);
    addBeamGlowSprite(sx, sy, beamLen, coreR * 2.2, 0xffdd00, 0.78, 1);

    drawBellCone(baseGraphics, sx, sy, endX, 150, Math.min(outerR, 24), outerR * 0.76, false, 0x991b1b, 0.52);
    drawBellCone(glowGraphics, sx, sy, endX, 145, Math.min(midR, 18), midR * 0.86, false, 0xff8800, 0.72);
    drawBellCone(baseGraphics, sx, sy, endX, 125, Math.min(coreR, 10), coreR, false, 0xffffff, 0.98);

    drawHelixRibbon(glowGraphics, sx, sy, endX, midR * 0.74, 42, animTimer * 22, 3.2, 0xffdd00, 0.85, false);
    drawHelixRibbon(glowGraphics, sx, sy, endX, midR * 0.68, 42, animTimer * 22 + Math.PI, 2.8, 0xff2b5b, 0.78, false);

    addMuzzleFlareSprite(sx - 6, sy, 2.2 * breath, 2.0 * breath, 0xff8800, 0.74, -animTimer * 1.6);
    addMuzzleFlareSprite(sx - 4, sy, 1.2 * breath, 1.2 * breath, 0xffffff, 0.95, animTimer * 2);

    if (particleSystem) {
      for (let p = 0; p < 2; p++) {
        const along = Math.random() * Math.min(beamLen, 620);
        const spreadY = (Math.random() - 0.5) * midR * 1.7;
        particleSystem.spawnSpark(
          sx - along,
          sy + spreadY,
          -(480 + Math.random() * 420),
          (Math.random() - 0.5) * 90,
          p === 0 ? 0xffdd00 : 0xff4400,
          3.4 + Math.random() * 2.4,
          0.2,
          p === 0
        );
      }
    }
    return;
  }

  // Standard pod/enemy beam with soft additive glow
  const isRightward = laser.direction === 'right';
  const beamLen = Math.max(8, Math.abs(endX - sx));
  addBeamGlowSprite(sx, sy, beamLen, pulseWidth * 2.4, laser.color, 0.52, isRightward ? 0 : 1);
  addMuzzleFlareSprite(sx, sy, 0.55, 0.55, laser.color, 0.75);

  glowGraphics.lineStyle(pulseWidth * 1.15, laser.color, 0.72);
  glowGraphics.moveTo(sx, sy);
  glowGraphics.lineTo(endX, laser.targetY);

  baseGraphics.lineStyle(pulseWidth * 0.42, 0xffffff, 0.96);
  baseGraphics.moveTo(sx, sy);
  baseGraphics.lineTo(endX, laser.targetY);
  glowGraphics.lineStyle(0);
  baseGraphics.lineStyle(0);
}

export function renderFading(
  layers: LaserRenderLayers,
  laser: LaserBeam,
  endX: number,
  isMasterSpark: boolean,
  isBossMegaStyle: boolean
): void {
  const { glowGraphics, addBeamGlowSprite, addMuzzleFlareSprite } = layers;
  const alpha = Math.max(0, Math.min(1, laser.alpha));
  const sx = laser.sourceX;
  const sy = laser.sourceY;

  if (isMasterSpark) {
    const beamLen = Math.max(12, endX - sx);
    const w = Math.max(18, laser.currentWidth * (1.2 + (1 - alpha) * 0.6));
    addBeamGlowSprite(sx, sy, beamLen, w * 2.6, 0xa855f7, alpha * 0.42, 0);
    addBeamGlowSprite(sx, sy, beamLen, w * 1.4, 0x00f2fe, alpha * 0.58, 0);
    addBeamGlowSprite(sx, sy, beamLen, w * 0.45, 0xffffff, alpha * 0.7, 0);
    addMuzzleFlareSprite(sx, sy, 1.4 * alpha + 0.4, 1.4 * alpha + 0.4, 0x00f2fe, alpha * 0.8);
    drawBellCone(glowGraphics, sx, sy, endX, 140, 10 * alpha, w * 0.55, true, 0x00f2fe, alpha * 0.34);
    return;
  }

  if (isBossMegaStyle) {
    const beamLen = Math.max(12, sx - endX);
    const w = Math.max(18, laser.currentWidth * (1.2 + (1 - alpha) * 0.5));
    addBeamGlowSprite(sx, sy, beamLen, w * 2.2, 0xff8800, alpha * 0.48, 1);
    addBeamGlowSprite(sx, sy, beamLen, w * 0.6, 0xffdd00, alpha * 0.62, 1);
    addMuzzleFlareSprite(sx, sy, 1.2 * alpha + 0.3, 1.2 * alpha + 0.3, 0xffdd00, alpha * 0.75);
    return;
  }

  glowGraphics.lineStyle(laser.currentWidth * alpha, laser.color, alpha * 0.55);
  glowGraphics.moveTo(sx, sy);
  glowGraphics.lineTo(endX, laser.targetY);
  glowGraphics.lineStyle(0);
}

export function renderClashVortex(
  layers: LaserRenderLayers,
  cx: number,
  cy: number,
  animTimer: number,
  particleSystem?: ParticleSystem
): void {
  const { baseGraphics, glowGraphics, addMuzzleFlareSprite } = layers;
  const pulse = Math.sin(animTimer * 40) * 10;
  const baseRad = 52 + pulse;

  // Soft additive collision bloom
  addMuzzleFlareSprite(cx - 8, cy, 2.8, 2.5, 0x00f2fe, 0.55, animTimer * 1.4);
  addMuzzleFlareSprite(cx + 8, cy, 2.8, 2.5, 0xffdd00, 0.58, -animTimer * 1.4);
  addMuzzleFlareSprite(cx, cy, 0.9, 3.6, 0xffffff, 0.78, 0);

  // Vertical plasma shearing plumes
  const plumeHeight = baseRad * 2.2 + Math.sin(animTimer * 50) * 18;
  const plumeWidth = 14 + Math.sin(animTimer * 30) * 4;

  glowGraphics.beginFill(0x00f2fe, 0.55);
  glowGraphics.drawEllipse(cx - 4, cy - plumeHeight * 0.5, plumeWidth, plumeHeight * 0.5);
  glowGraphics.drawEllipse(cx - 4, cy + plumeHeight * 0.5, plumeWidth, plumeHeight * 0.5);
  glowGraphics.endFill();

  glowGraphics.beginFill(0xffdd00, 0.55);
  glowGraphics.drawEllipse(cx + 4, cy - plumeHeight * 0.5, plumeWidth, plumeHeight * 0.5);
  glowGraphics.drawEllipse(cx + 4, cy + plumeHeight * 0.5, plumeWidth, plumeHeight * 0.5);
  glowGraphics.endFill();

  baseGraphics.beginFill(0xffffff, 0.96);
  baseGraphics.drawEllipse(cx, cy, plumeWidth * 0.7, plumeHeight * 0.82);
  baseGraphics.drawCircle(cx, cy, baseRad * 0.52);
  baseGraphics.endFill();

  // Expanding shockwave rings
  for (let r = 0; r < 3; r++) {
    const ringRad = ((animTimer * 165 + r * 45) % 118) + 12;
    const ringAlpha = Math.max(0, 1 - ringRad / 118);
    const ringColor = r % 2 === 0 ? 0x00f2fe : 0xffdd00;
    glowGraphics.lineStyle(2.5, ringColor, ringAlpha * 0.85);
    glowGraphics.drawCircle(cx, cy, ringRad);
    glowGraphics.lineStyle(1.4, 0xffffff, ringAlpha);
    glowGraphics.drawCircle(cx, cy, ringRad * 0.74);
  }

  // Spinning clash sigils
  const rot1 = animTimer * 12;
  const rot2 = -animTimer * 14;
  const runeRad = baseRad * 1.35;

  glowGraphics.lineStyle(2, 0x00f2fe, 0.8);
  for (let s = 0; s < 6; s++) {
    const a1 = rot1 + (Math.PI / 3) * s;
    const a2 = rot1 + (Math.PI / 3) * (s + 2);
    glowGraphics.moveTo(cx + Math.cos(a1) * runeRad, cy + Math.sin(a1) * runeRad);
    glowGraphics.lineTo(cx + Math.cos(a2) * runeRad, cy + Math.sin(a2) * runeRad);
  }

  glowGraphics.lineStyle(2, 0xffdd00, 0.85);
  for (let s = 0; s < 8; s++) {
    const a1 = rot2 + (Math.PI / 4) * s;
    const a2 = rot2 + (Math.PI / 4) * (s + 3);
    glowGraphics.moveTo(cx + Math.cos(a1) * (runeRad * 0.8), cy + Math.sin(a1) * (runeRad * 0.8));
    glowGraphics.lineTo(cx + Math.cos(a2) * (runeRad * 0.8), cy + Math.sin(a2) * (runeRad * 0.8));
  }

  // High-frequency lightning arcs
  const numLightning = 12;
  glowGraphics.lineStyle(2.2, 0xffffff, 0.92);
  for (let l = 0; l < numLightning; l++) {
    const angle = animTimer * 8 + (Math.PI * 2 * l) / numLightning + (Math.random() - 0.5) * 0.5;
    const len = baseRad * 1.6 + Math.random() * 45;
    const midLen = len * 0.5;
    const midAngle = angle + (Math.random() - 0.5) * 0.7;

    glowGraphics.moveTo(cx, cy);
    glowGraphics.lineTo(cx + Math.cos(midAngle) * midLen, cy + Math.sin(midAngle) * midLen);
    glowGraphics.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
  }
  glowGraphics.lineStyle(0);

  if (particleSystem) {
    const sparkCount = 3 + Math.floor(Math.random() * 3);
    for (let p = 0; p < sparkCount; p++) {
      const sparkAngle = Math.random() * Math.PI * 2;
      const sparkSpeed = 260 + Math.random() * 420;
      const palette = [0x00f2fe, 0xffdd00, 0xffffff, 0xf472b6];
      particleSystem.spawnSpark(
        cx + (Math.random() - 0.5) * 24,
        cy + (Math.random() - 0.5) * 24,
        Math.cos(sparkAngle) * sparkSpeed,
        Math.sin(sparkAngle) * sparkSpeed,
        palette[Math.floor(Math.random() * palette.length)],
        4.5 + Math.random() * 2.5,
        0.32,
        true
      );
    }
  }
}

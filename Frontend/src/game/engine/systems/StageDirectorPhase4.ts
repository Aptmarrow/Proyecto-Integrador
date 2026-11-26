import * as PIXI from 'pixi.js';

export type Phase4PresetId = 'bloom' | 'dimension' | 'nexus';

export interface Phase4RenderParams {
  preset: Phase4PresetId;
  t4: number;
  p4Elapsed: number;
  clockTime: number;
  animDt: number;
  pxNorm: number;
  pyNorm: number;
}

export interface Phase4SpeedlineFactor {
  speedMult: number;
  alphaMult: number;
  tiltAngle: number;
  inwardPull: number;
  jitterAmp: number;
  stretchMult: number;
  tintHex: number;
}

interface Phase4Mote {
  sprite: PIXI.Sprite;
  angle: number;
  radiusNorm: number;
  speed: number;
  phase: number;
  size: number;
  tintA: number;
  tintB: number;
}

interface StarburstBolt {
  sprite: PIXI.Sprite;
  angle: number;
  speed: number;
  phase: number;
  baseLen: number;
  baseThick: number;
}

export function isPhase4Preset(preset: string): preset is Phase4PresetId {
  return preset === 'bloom' || preset === 'dimension' || preset === 'nexus';
}

export function computePhase4SpeedlineFactor(
  preset: Phase4PresetId,
  t4: number
): Phase4SpeedlineFactor {
  const s = clamp01(t4);
  const smooth = s * s * (3 - 2 * s);

  if (preset === 'bloom') {
    const pull = smoothstep(0.0, 0.40, s);
    return {
      speedMult: 1 + 1.15 * pull,
      alphaMult: 1 - smoothstep(0.26, 0.46, s),
      tiltAngle: 0,
      inwardPull: pull,
      jitterAmp: 0,
      stretchMult: 1 - 0.30 * pull,
      tintHex: s > 0.24 ? 0xffffff : 0xeef3ff,
    };
  }

  if (preset === 'nexus') {
    const pull = smoothstep(0.0, 0.38, s);
    const tremor = Math.sin(clamp01((s - 0.14) / 0.36) * Math.PI);
    return {
      speedMult: 1 + 1.20 * pull,
      alphaMult: 1 - smoothstep(0.28, 0.56, s),
      tiltAngle: smooth * 0.10,
      inwardPull: pull * 0.72,
      jitterAmp: Math.max(0, tremor) * 11,
      stretchMult: 1 + 0.22 * pull,
      tintHex: tremor > 0.35 ? 0xf2b8ff : 0xffffff,
    };
  }

  const surge = smoothstep(0.0, 0.36, s);
  const shake = Math.sin(clamp01((s - 0.12) / 0.38) * Math.PI);
  return {
    speedMult: 1 + 1.25 * surge,
    alphaMult: 1 - smoothstep(0.30, 0.66, s),
    tiltAngle: smooth * 0.14,
    inwardPull: 0,
    jitterAmp: Math.max(0, shake) * 16,
    stretchMult: 1 + 0.55 * surge,
    tintHex: shake > 0.35 ? 0xe07aff : 0x8ef9ff,
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x >= e1 ? 1 : 0;
  const u = clamp01((x - e0) / (e1 - e0));
  return u * u * (3 - 2 * u);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function seeded(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Modular Pixi sprite compositor for Phase 4 cosmic presets.
 * Reuses fixed sprite pools with lazy texture binding for steady 60+ FPS.
 */
export class StageDirectorPhase4 {
  private readonly group = new PIXI.Container();
  private readonly focusGroup = new PIXI.Container();
  private readonly diskTiltGroup = new PIXI.Container();
  private readonly diskFlattenGroup = new PIXI.Container();
  private readonly getTex: (id: string, fallback?: PIXI.Texture) => PIXI.Texture;
  private readonly width: number;
  private readonly height: number;

  private veilBg: PIXI.Sprite;
  private worldA: PIXI.Sprite;
  private worldB: PIXI.Sprite;
  private worldC: PIXI.Sprite;
  private worldD: PIXI.Sprite;
  private overlayA: PIXI.Sprite;
  private overlayB: PIXI.Sprite;
  private echoA: PIXI.Sprite;
  private echoB: PIXI.Sprite;
  private echoC: PIXI.Sprite;

  private diskSpiralA: PIXI.Sprite;
  private diskSpiralB: PIXI.Sprite;
  private corridorA: PIXI.Sprite;
  private corridorB: PIXI.Sprite;
  private slashA: PIXI.Sprite;
  private slashB: PIXI.Sprite;
  private slashC: PIXI.Sprite;
  private coreGlow: PIXI.Sprite;
  private ringA: PIXI.Sprite;
  private ringB: PIXI.Sprite;
  private ringC: PIXI.Sprite;
  private transitionFlash: PIXI.Sprite;

  private starburstBolts: StarburstBolt[] = [];
  private motes: Phase4Mote[] = [];
  private boundPreset: Phase4PresetId | null = null;
  private rotA: number = 0;
  private rotB: number = 0;

  constructor(
    parent: PIXI.Container,
    getTex: (id: string, fallback?: PIXI.Texture) => PIXI.Texture,
    width: number,
    height: number
  ) {
    this.getTex = getTex;
    this.width = width;
    this.height = height;

    this.group.visible = false;
    parent.addChild(this.group);

    this.veilBg = this.makeCentered(PIXI.Texture.WHITE, PIXI.BLEND_MODES.NORMAL);
    this.worldA = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.worldB = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.worldC = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.worldD = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.NORMAL);
    this.echoA = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.echoB = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.echoC = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.overlayA = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.overlayB = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);

    this.group.addChild(
      this.veilBg,
      this.worldA,
      this.worldB,
      this.worldC,
      this.worldD,
      this.echoA,
      this.echoB,
      this.echoC,
      this.overlayA,
      this.overlayB
    );

    this.focusGroup.position.set(width * 0.64, height * 0.5);
    this.group.addChild(this.focusGroup);

    this.diskSpiralA = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.diskSpiralB = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.diskTiltGroup.rotation = -0.24;
    this.diskFlattenGroup.scale.set(1, 0.30);
    this.diskFlattenGroup.addChild(this.diskSpiralA, this.diskSpiralB);
    this.diskTiltGroup.addChild(this.diskFlattenGroup);

    this.corridorA = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.corridorB = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.slashA = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.slashB = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.slashC = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.coreGlow = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.ringA = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.ringB = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.ringC = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);
    this.transitionFlash = this.makeCentered(PIXI.Texture.EMPTY, PIXI.BLEND_MODES.ADD);

    for (let i = 0; i < 20; i++) {
      const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      sprite.visible = false;
      this.focusGroup.addChild(sprite);
      this.starburstBolts.push({
        sprite,
        angle: (i / 20) * Math.PI * 2 + (seeded(i, 3.1) - 0.5) * 0.18,
        speed: 0.42 + seeded(i, 5.7) * 0.55,
        phase: seeded(i, 7.9),
        baseLen: 140 + seeded(i, 9.2) * 180,
        baseThick: 8 + seeded(i, 11.4) * 12,
      });
    }

    this.focusGroup.addChild(
      this.diskTiltGroup,
      this.corridorA,
      this.corridorB,
      this.coreGlow,
      this.ringA,
      this.ringB,
      this.ringC,
      this.slashA,
      this.slashB,
      this.slashC,
      this.transitionFlash
    );

    const dotTex = this.getTex('softDot', PIXI.Texture.WHITE);
    for (let i = 0; i < 32; i++) {
      const sprite = new PIXI.Sprite(dotTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      this.group.addChild(sprite);
      this.motes.push({
        sprite,
        angle: seeded(i, 1.4) * Math.PI * 2,
        radiusNorm: seeded(i, 2.7),
        speed: 0.14 + seeded(i, 4.1) * 0.34,
        phase: seeded(i, 6.3) * Math.PI * 2,
        size: 5 + seeded(i, 8.9) * 11,
        tintA: 0x62ebff,
        tintB: 0xffd166,
      });
    }
  }

  private makeCentered(tex: PIXI.Texture, blendMode: PIXI.BLEND_MODES): PIXI.Sprite {
    const s = new PIXI.Sprite(tex);
    s.anchor.set(0.5);
    s.blendMode = blendMode;
    return s;
  }

  private resetLayerVisuals(): void {
    this.diskTiltGroup.visible = false;
    const all = [
      this.veilBg,
      this.worldA,
      this.worldB,
      this.worldC,
      this.worldD,
      this.echoA,
      this.echoB,
      this.echoC,
      this.overlayA,
      this.overlayB,
      this.diskSpiralA,
      this.diskSpiralB,
      this.corridorA,
      this.corridorB,
      this.slashA,
      this.slashB,
      this.slashC,
      this.coreGlow,
      this.ringA,
      this.ringB,
      this.ringC,
      this.transitionFlash,
    ];
    for (const s of all) {
      s.visible = false;
      s.alpha = 0;
      s.rotation = 0;
      s.tint = 0xffffff;
    }
    for (const b of this.starburstBolts) {
      b.sprite.visible = false;
      b.sprite.alpha = 0;
    }
  }

  private bindPresetTextures(preset: Phase4PresetId): void {
    if (this.boundPreset === preset) return;
    this.boundPreset = preset;

    this.veilBg.texture = this.getTex('hawkingVeil', PIXI.Texture.WHITE);
    this.veilBg.blendMode = PIXI.BLEND_MODES.NORMAL;
    this.worldA.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldB.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldC.blendMode = PIXI.BLEND_MODES.ADD;
    this.worldD.blendMode = PIXI.BLEND_MODES.NORMAL;
    this.echoA.blendMode = PIXI.BLEND_MODES.ADD;
    this.echoB.blendMode = PIXI.BLEND_MODES.ADD;
    this.echoC.blendMode = PIXI.BLEND_MODES.ADD;
    this.overlayA.blendMode = PIXI.BLEND_MODES.ADD;
    this.overlayB.blendMode = PIXI.BLEND_MODES.ADD;

    const ringTex = this.getTex('shockRing', PIXI.Texture.EMPTY);
    this.ringA.texture = ringTex;
    this.ringB.texture = ringTex;
    this.ringC.texture = ringTex;

    const slashTex = this.getTex('horizonSlash', PIXI.Texture.EMPTY);
    this.slashA.texture = slashTex;
    this.slashB.texture = slashTex;
    this.slashC.texture = slashTex;
    for (const bolt of this.starburstBolts) {
      bolt.sprite.texture = slashTex;
    }

    this.transitionFlash.texture = this.getTex('whiteHoleCore', PIXI.Texture.EMPTY);

    if (preset === 'bloom') {
      this.worldA.texture = this.getTex('whiteHoleEjecta');
      this.worldB.texture = this.getTex('whiteHoleEjecta');
      this.worldC.texture = this.getTex('whiteHoleCorona');
      this.worldD.texture = this.getTex('whiteHoleCorona');
      this.worldD.blendMode = PIXI.BLEND_MODES.ADD;
      this.echoA.texture = this.getTex('whiteHoleCorona');
      this.overlayA.texture = this.getTex('whiteHoleEjecta');
      this.diskSpiralA.texture = this.getTex('whiteHoleCorona');
      this.diskSpiralB.texture = this.getTex('whiteHoleEjecta');
      this.corridorA.texture = this.getTex('whiteHoleCorona');
      this.corridorB.texture = this.getTex('whiteHoleEjecta');
      this.coreGlow.texture = this.getTex('whiteHoleCore');
    } else if (preset === 'nexus') {
      // Combinacion: Agujero Blanco dentro de la Ruptura dimensional
      this.worldA.texture = this.getTex('dimLuminousRift');
      this.worldB.texture = this.getTex('whiteHoleCorona');
      this.worldC.texture = this.getTex('dimCrystalScales');
      this.worldC.blendMode = PIXI.BLEND_MODES.NORMAL;
      this.worldD.texture = this.getTex('dimCrystalScales');
      this.worldD.blendMode = PIXI.BLEND_MODES.NORMAL;
      this.echoA.texture = this.getTex('dimVoidSpines');
      this.echoA.blendMode = PIXI.BLEND_MODES.NORMAL;
      this.echoB.texture = this.getTex('whiteHoleEjecta');
      this.echoC.texture = this.getTex('whiteHoleEjecta');
      this.overlayA.texture = this.getTex('dimShatterGlass');
      this.overlayB.texture = this.getTex('dimShatterGlass');
      this.diskSpiralA.texture = this.getTex('whiteHoleCorona');
      this.diskSpiralB.texture = this.getTex('whiteHoleEjecta');
      this.corridorA.texture = this.getTex('whiteHoleCorona');
      this.corridorB.texture = this.getTex('whiteHoleEjecta');
      this.coreGlow.texture = this.getTex('whiteHoleCore');
    } else {
      this.worldA.texture = this.getTex('dimLuminousRift');
      this.worldB.texture = this.getTex('dimLuminousRift');
      this.worldC.texture = this.getTex('dimCrystalScales');
      this.worldC.blendMode = PIXI.BLEND_MODES.NORMAL;
      this.worldD.texture = this.getTex('dimCrystalScales');
      this.worldD.blendMode = PIXI.BLEND_MODES.NORMAL;
      this.echoA.texture = this.getTex('dimVoidSpines');
      this.echoA.blendMode = PIXI.BLEND_MODES.NORMAL;
      this.echoB.texture = this.getTex('dimVoidSpines');
      this.echoB.blendMode = PIXI.BLEND_MODES.NORMAL;
      this.echoC.texture = this.getTex('dimCrystalScales');
      this.echoC.blendMode = PIXI.BLEND_MODES.ADD;
      this.overlayA.texture = this.getTex('dimShatterGlass');
      this.overlayB.texture = this.getTex('dimShatterGlass');
      this.coreGlow.texture = this.getTex('whiteHoleCore');
    }
  }

  public hide(): void {
    this.group.visible = false;
  }

  public update(params: Phase4RenderParams): void {
    const { preset, t4, p4Elapsed, clockTime, animDt, pxNorm, pyNorm } = params;
    if (t4 <= 0.002) {
      this.hide();
      return;
    }

    this.bindPresetTextures(preset);
    this.resetLayerVisuals();
    this.group.visible = true;

    this.rotA += animDt * 0.08;
    this.rotB -= animDt * 0.13;

    const parX = (pxNorm - 0.22) * this.height * 0.085;
    const parY = (pyNorm - 0.50) * this.height * 0.085;
    const focusX = this.width * 0.64 + parX;
    const focusY = this.height * 0.50 + parY;
    this.focusGroup.position.set(focusX, focusY);

    if (preset === 'bloom') {
      this.renderBloom(t4, p4Elapsed, clockTime, focusX, focusY, parX, parY);
    } else if (preset === 'nexus') {
      this.renderNexus(t4, p4Elapsed, clockTime, focusX, focusY, parX, parY);
    } else {
      this.renderDimension(t4, p4Elapsed, clockTime, focusX, focusY, parX, parY);
    }
  }

  private renderWhiteHoleAssembly(opts: {
    t4: number;
    p4Elapsed: number;
    clockTime: number;
    implosionT: number;
    burstFlash: number;
    coronaRebound: number;
    coreRebound: number;
    ejectaEnter: number;
    pulseEnter: number;
    ringSecondaryTint: number;
    polarWidthMult?: number;
  }): void {
    const w = this.width;
    const h = this.height;
    const {
      t4,
      p4Elapsed,
      clockTime,
      implosionT,
      burstFlash,
      coronaRebound,
      coreRebound,
      ejectaEnter,
      pulseEnter,
      ringSecondaryTint,
      polarWidthMult = 1.0,
    } = opts;
    const diskTilt = -0.24;
    const blastProgA = clamp01((t4 - 0.34) / 0.43);
    const blastProgB = clamp01((t4 - 0.39) / 0.45);

    // Tilted 3D relativistic repulsion disk (true elliptical foreshortening, no yellow/blue wash)
    if (coronaRebound > 0.01) {
      this.diskTiltGroup.visible = true;
      this.diskTiltGroup.rotation = diskTilt;

      this.diskSpiralA.visible = true;
      const diskDia = h * lerp(0.70, 1.84, coronaRebound);
      this.diskSpiralA.width = diskDia;
      this.diskSpiralA.height = diskDia;
      this.diskSpiralA.rotation = -p4Elapsed * 0.45;
      this.diskSpiralA.tint = 0xffffff;
      this.diskSpiralA.alpha = coronaRebound * 0.90;

      if (ejectaEnter > 0.01) {
        const diskWave = (p4Elapsed * 0.28) % 1;
        const waveDia = h * lerp(0.38, 2.08, diskWave * 0.72 + diskWave * diskWave * 0.28);
        this.diskSpiralB.visible = true;
        this.diskSpiralB.width = waveDia;
        this.diskSpiralB.height = waveDia;
        this.diskSpiralB.rotation = p4Elapsed * 0.22;
        this.diskSpiralB.tint = 0xf4f7ff;
        this.diskSpiralB.alpha = ejectaEnter * Math.sin(diskWave * Math.PI) * 0.56;
      }
    }

    // Circular upper/lower Einstein photon arch wrapping over the blinding sphere
    if (ejectaEnter > 0.01) {
      this.corridorA.visible = true;
      this.corridorA.position.set(0, 0);
      const archDia = h * 0.96 * (1 + 0.025 * Math.sin(clockTime * 1.9));
      this.corridorA.width = archDia;
      this.corridorA.height = archDia;
      this.corridorA.rotation = this.rotA * 0.18;
      this.corridorA.tint = 0xf8fbff;
      this.corridorA.alpha = ejectaEnter * 0.44;

      this.corridorB.visible = true;
      this.corridorB.position.set(0, 0);
      this.corridorB.width = h * 0.94;
      this.corridorB.height = h * 0.94;
      this.corridorB.rotation = this.rotB * 0.28 + 0.4;
      this.corridorB.tint = 0xe8efff;
      this.corridorB.alpha = ejectaEnter * 0.14;
    }

    // Solid blinding pure-white Kerr Anti-Event-Horizon sphere & thin silver halo
    const seedDia = lerp(0.22, 0.46, implosionT);
    const steadyDia = 0.90 * (0.97 + 0.05 * Math.sin(clockTime * 1.9));
    const coreDia = h * lerp(seedDia, steadyDia, coreRebound);
    this.coreGlow.visible = true;
    this.coreGlow.position.set(0, 0);
    this.coreGlow.width = coreDia;
    this.coreGlow.height = coreDia;
    this.coreGlow.rotation = Math.sin(clockTime * 0.20) * 0.05;
    this.coreGlow.tint = 0xffffff;
    this.coreGlow.alpha = Math.max(smoothstep(0.0, 0.22, t4) * 0.85, burstFlash * 0.96, ejectaEnter * 0.98);

    // Slender polar relativistic jets strictly perpendicular to the tilted disk
    const polarRot = diskTilt + Math.PI * 0.5;
    this.slashA.visible = t4 > 0.02;
    this.slashA.position.set(0, 0);
    this.slashA.width = w * polarWidthMult * (0.48 + 0.65 * Math.max(coreRebound, burstFlash) + 0.35 * burstFlash);
    this.slashA.height = h * (0.024 + 0.042 * burstFlash + 0.008 * coreRebound);
    this.slashA.rotation = polarRot + Math.sin(clockTime * 0.25) * 0.02;
    this.slashA.tint = 0xf6f9ff;
    this.slashA.alpha = Math.max(implosionT * 0.24, ejectaEnter * 0.48, burstFlash * 0.88);

    if (t4 >= 0.33) {
      this.slashB.visible = true;
      this.slashB.position.set(0, 0);
      this.slashB.width = w * (0.85 + 0.35 * burstFlash);
      this.slashB.height = h * (0.015 + 0.020 * burstFlash);
      this.slashB.rotation = diskTilt;
      this.slashB.tint = 0xffffff;
      this.slashB.alpha = Math.max(ejectaEnter * 0.34, burstFlash * 0.68);
    }

    if (t4 < 0.36) {
      this.ringA.visible = true;
      this.ringA.position.set(0, 0);
      const shrinkA = h * lerp(1.46, 0.05, implosionT * implosionT);
      this.ringA.width = shrinkA;
      this.ringA.height = shrinkA;
      this.ringA.tint = 0xffffff;
      this.ringA.alpha = Math.sin(implosionT * Math.PI * 0.92) * 0.86;

      this.ringB.visible = true;
      this.ringB.position.set(0, 0);
      const shrinkB = h * lerp(1.66, 0.12, implosionT);
      this.ringB.width = shrinkB;
      this.ringB.height = shrinkB;
      this.ringB.tint = 0xdce4f5;
      this.ringB.alpha = Math.sin(implosionT * Math.PI * 0.88) * 0.44;
    } else {
      if (blastProgA > 0.01 && blastProgA < 0.98) {
        this.ringA.visible = true;
        this.ringA.position.set(0, 0);
        const blastDiaA = h * lerp(0.06, 2.20, Math.sqrt(blastProgA));
        this.ringA.width = blastDiaA;
        this.ringA.height = blastDiaA;
        this.ringA.tint = 0xffffff;
        this.ringA.alpha = (1 - blastProgA) * 0.92;
      }
      if (blastProgB > 0.01 && blastProgB < 0.98) {
        this.ringB.visible = true;
        this.ringB.position.set(0, 0);
        const blastDiaB = h * lerp(0.08, 1.98, Math.sqrt(blastProgB));
        this.ringB.width = blastDiaB;
        this.ringB.height = blastDiaB;
        this.ringB.tint = ringSecondaryTint;
        this.ringB.alpha = (1 - blastProgB) * 0.64;
      }
    }

    if (burstFlash > 0.01) {
      this.transitionFlash.visible = true;
      this.transitionFlash.position.set(0, 0);
      const fDia = h * lerp(0.45, 1.85, burstFlash);
      this.transitionFlash.width = fDia;
      this.transitionFlash.height = fDia;
      this.transitionFlash.tint = 0xffffff;
      this.transitionFlash.alpha = burstFlash * 0.68;
    }

    if (pulseEnter > 0.01) {
      const pulseC = (p4Elapsed * 0.34) % 1;
      this.ringC.visible = true;
      this.ringC.position.set(0, 0);
      const pulseDia = h * lerp(0.16, 1.85, pulseC);
      this.ringC.width = pulseDia;
      this.ringC.height = pulseDia;
      this.ringC.tint = 0xeef4ff;
      this.ringC.alpha = pulseEnter * (1 - pulseC) * 0.22;
    }
  }

  private renderBloom(
    t4: number,
    p4Elapsed: number,
    clockTime: number,
    focusX: number,
    focusY: number,
    parX: number,
    parY: number
  ): void {
    const w = this.width;
    const h = this.height;

    const implosionT = clamp01(t4 / 0.36);
    const burstFlash = Math.sin(clamp01((t4 - 0.34) / 0.30) * Math.PI);
    const coronaRebound = smoothstep(0.30, 0.68, t4);
    const coreRebound = smoothstep(0.32, 0.72, t4);
    const ejectaEnter = smoothstep(0.36, 0.90, t4);
    const pulseEnter = smoothstep(0.50, 0.88, t4);
    const breath = 1 + 0.035 * Math.sin(clockTime * 1.30);

    // Abyssal neutral near-black space so pure blinding white light contrasts cleanly
    this.veilBg.visible = true;
    this.veilBg.position.set(w * 0.5, h * 0.5);
    this.veilBg.width = w * 1.06;
    this.veilBg.height = h * 1.06;
    this.veilBg.tint = 0x04050a;
    this.veilBg.alpha = smoothstep(0.0, 0.45, t4) * 0.62;

    // Subtle monochrome silver-white distant lensing starfield & filaments
    const primaryCoronaScale = lerp(lerp(1.38, 0.58, implosionT), 1.82 * breath, coronaRebound);
    this.worldC.visible = true;
    this.worldC.position.set(focusX + parX * 0.25, focusY + parY * 0.18);
    this.worldC.width = h * primaryCoronaScale;
    this.worldC.height = h * primaryCoronaScale;
    this.worldC.rotation = this.rotA * 0.24;
    this.worldC.tint = 0xeff4ff;
    this.worldC.alpha = lerp(0.16 + 0.22 * implosionT, 0.26, coronaRebound);

    if (coronaRebound > 0.01) {
      this.worldD.visible = true;
      this.worldD.position.set(focusX - parX * 0.22, focusY - parY * 0.16);
      const secDia = h * 1.56 * (2 - breath);
      this.worldD.width = secDia;
      this.worldD.height = secDia;
      this.worldD.rotation = this.rotB * 0.20 + 0.85;
      this.worldD.tint = 0xdbe5fa;
      this.worldD.alpha = coronaRebound * 0.16;
    }

    if (ejectaEnter > 0.01) {
      this.echoA.visible = true;
      this.echoA.position.set(focusX - w * 0.12 - parX * 0.34, focusY + parY * 0.22);
      this.echoA.width = h * 2.10;
      this.echoA.height = h * 2.10;
      this.echoA.rotation = this.rotA * 0.12 + 2.1;
      this.echoA.tint = 0xeef3ff;
      this.echoA.alpha = ejectaEnter * 0.12;

      // Delicate monochrome white spacetime shockwaves expanding smoothly into deep dark void
      const ejectaWaves = [
        { s: this.worldA, offset: 0.0, rot: this.rotA * 0.18, tint: 0xf6f9ff, gain: 0.28 },
        { s: this.worldB, offset: 0.5, rot: this.rotB * 0.15 + 1.05, tint: 0xe2ebff, gain: 0.22 },
      ];
      for (const ew of ejectaWaves) {
        const cyc = (p4Elapsed * 0.20 + ew.offset) % 1;
        const expand = lerp(0.42, 2.45, cyc * 0.72 + cyc * cyc * 0.28);
        const dia = h * expand;
        ew.s.visible = true;
        ew.s.position.set(focusX - parX * 0.10, focusY - parY * 0.08);
        ew.s.width = dia;
        ew.s.height = dia;
        ew.s.rotation = ew.rot;
        ew.s.tint = ew.tint;
        ew.s.alpha = ejectaEnter * Math.sin(cyc * Math.PI) * ew.gain;
      }
    }

    this.renderWhiteHoleAssembly({
      t4,
      p4Elapsed,
      clockTime,
      implosionT,
      burstFlash,
      coronaRebound,
      coreRebound,
      ejectaEnter,
      pulseEnter,
      ringSecondaryTint: 0xe2ebff,
    });

    if (t4 >= 0.34) {
      this.updateStarburstBolts(p4Elapsed, ejectaEnter, burstFlash, h, 0xffffff, 0xdbe4f5, 0.38);
    }

    this.updateOutwardMotes(
      Math.max(implosionT * 0.18, burstFlash * 0.65, ejectaEnter),
      p4Elapsed,
      focusX,
      focusY,
      0xffffff,
      0xdbe6ff,
      0.78
    );
  }

  private renderNexus(
    t4: number,
    p4Elapsed: number,
    clockTime: number,
    focusX: number,
    focusY: number,
    parX: number,
    parY: number
  ): void {
    const w = this.width;
    const h = this.height;

    // Beat 1 (t4: 0.00..0.34): Instant reality fracture glass + inward gravitational compression
    const implosionT = clamp01(t4 / 0.34);
    const glassAProg = clamp01(t4 / 0.56);
    const glassBProg = clamp01((t4 - 0.14) / 0.54);
    // Beat 2 (t4: 0.30..0.60): Shatter-Supernova detonation
    const burstFlash = Math.sin(clamp01((t4 - 0.30) / 0.30) * Math.PI);
    const jolt = burstFlash > 0.05 ? Math.sin(clockTime * 72) * 6 * burstFlash : 0;
    // Beat 3 (t4 >= 0.26): Pure White Hole blazing inside the ruptured crystal dimension
    const insideEnter = smoothstep(0.24, 0.84, t4);
    const coronaRebound = smoothstep(0.28, 0.68, t4);
    const coreRebound = smoothstep(0.30, 0.70, t4);
    const ejectaEnter = smoothstep(0.34, 0.88, t4);
    const pulseEnter = smoothstep(0.48, 0.86, t4);
    const breath = 1 + 0.04 * Math.sin(clockTime * 1.25);

    this.veilBg.visible = true;
    this.veilBg.position.set(w * 0.5, h * 0.5);
    this.veilBg.width = w * 1.06;
    this.veilBg.height = h * 1.06;
    this.veilBg.tint = 0x0a0618;
    this.veilBg.alpha = Math.max(smoothstep(0.0, 0.32, t4) * 0.34, insideEnter * 0.52);

    // 1) Ruptura luminous diagonal chasm softened so the pure white 3D White Hole dominates focus
    this.worldA.visible = insideEnter > 0.01;
    this.worldA.position.set(
      focusX + w * 0.04 + Math.sin(p4Elapsed * 0.16) * 22 - parX * 0.24 + jolt,
      focusY - h * 0.05 + Math.cos(p4Elapsed * 0.14) * 16 - parY * 0.22
    );
    this.worldA.width = w * 1.22 * breath;
    this.worldA.height = h * 1.50 * breath;
    this.worldA.rotation = 0.08 + Math.sin(clockTime * 0.14) * 0.04;
    this.worldA.tint = 0xe6e0ff;
    this.worldA.alpha = insideEnter * 0.42;

    // 2) Monochrome silver-white lensing starfield
    const coronaScale = lerp(lerp(1.36, 0.58, implosionT), 1.78 * breath, coronaRebound);
    this.worldB.visible = true;
    this.worldB.position.set(focusX + parX * 0.22 + jolt * 0.5, focusY + parY * 0.18);
    this.worldB.width = h * coronaScale;
    this.worldB.height = h * coronaScale;
    this.worldB.rotation = this.rotA * 0.24;
    this.worldB.tint = 0xeef4ff;
    this.worldB.alpha = lerp(0.16 + 0.20 * implosionT, 0.24, coronaRebound);

    // 3) Outer crystal reefs & encroaching obsidian void spines framing the torn universe
    this.worldC.visible = insideEnter > 0.01;
    this.worldC.position.set(w * 0.16 + parX * 0.35 + Math.sin(p4Elapsed * 0.14) * 18, h * 0.50 + parY * 0.28);
    this.worldC.width = w * 0.86;
    this.worldC.height = h * 1.48;
    this.worldC.rotation = -0.18 + Math.sin(clockTime * 0.12) * 0.04;
    this.worldC.tint = 0xf2d0ff;
    this.worldC.alpha = insideEnter * 0.64;

    this.worldD.visible = insideEnter > 0.01;
    this.worldD.position.set(w * 0.90 - parX * 0.45, h * 0.86 - parY * 0.35);
    this.worldD.width = h * 1.24;
    this.worldD.height = h * 1.24;
    this.worldD.rotation = this.rotB * 0.20 + 0.75;
    this.worldD.tint = 0xebd0ff;
    this.worldD.alpha = insideEnter * 0.68;

    const spineEnter = smoothstep(0.36, 0.88, t4);
    this.echoA.visible = spineEnter > 0.01;
    this.echoA.position.set(w * 0.76 - parX * 0.55, h * 0.24 - parY * 0.45);
    this.echoA.width = w * 0.82;
    this.echoA.height = h * 0.98;
    this.echoA.rotation = 0.04 + Math.sin(p4Elapsed * 0.22) * 0.04;
    this.echoA.tint = 0xffffff;
    this.echoA.alpha = spineEnter * 0.88;

    // 4) Outward silver-white spacetime wave shells surging through the shattered cavern
    if (ejectaEnter > 0.01) {
      const waves = [
        { s: this.echoB, offset: 0.0, rot: this.rotA * 0.18, tint: 0xf4f8ff, gain: 0.24 },
        { s: this.echoC, offset: 0.5, rot: this.rotB * 0.15 + 1.05, tint: 0xe2ebff, gain: 0.18 },
      ];
      for (const ew of waves) {
        const cyc = (p4Elapsed * 0.20 + ew.offset) % 1;
        const dia = h * lerp(0.42, 2.40, cyc * 0.72 + cyc * cyc * 0.28);
        ew.s.visible = true;
        ew.s.position.set(focusX - parX * 0.10, focusY - parY * 0.08);
        ew.s.width = dia;
        ew.s.height = dia;
        ew.s.rotation = ew.rot;
        ew.s.tint = ew.tint;
        ew.s.alpha = ejectaEnter * Math.sin(cyc * Math.PI) * ew.gain;
      }
    }

    // 5) Foreground shattered glass zoom-past on impact + persistent broken-pane perimeter
    if (glassAProg > 0.01 && glassAProg < 0.99) {
      this.overlayA.visible = true;
      this.overlayA.position.set(focusX + jolt, focusY);
      const scaleA = lerp(0.86, 2.65, Math.pow(glassAProg, 1.35));
      this.overlayA.width = w * 1.18 * scaleA;
      this.overlayA.height = w * 1.18 * scaleA;
      this.overlayA.rotation = glassAProg * 0.06;
      this.overlayA.tint = 0xf0f6ff;
      const inA = smoothstep(0.0, 0.14, glassAProg);
      const outA = 1 - smoothstep(0.58, 0.99, glassAProg);
      this.overlayA.alpha = inA * outA * 0.90;
    } else if (insideEnter > 0.2) {
      this.overlayA.visible = true;
      this.overlayA.position.set(focusX + parX * 0.45, focusY + parY * 0.35);
      this.overlayA.width = w * 1.62;
      this.overlayA.height = w * 1.62;
      this.overlayA.rotation = 0.08 + Math.sin(clockTime * 0.18) * 0.02;
      this.overlayA.tint = 0xe4edff;
      this.overlayA.alpha = insideEnter * 0.20;
    }

    if (glassBProg > 0.01 && glassBProg < 0.99) {
      this.overlayB.visible = true;
      this.overlayB.position.set(focusX - 20 - jolt, focusY + 10);
      const scaleB = lerp(0.65, 2.45, Math.pow(glassBProg, 1.25));
      this.overlayB.width = w * 1.12 * scaleB;
      this.overlayB.height = w * 1.12 * scaleB;
      this.overlayB.rotation = -0.26 - glassBProg * 0.05;
      this.overlayB.tint = 0xf4a8ff;
      const inB = smoothstep(0.0, 0.18, glassBProg);
      const outB = 1 - smoothstep(0.55, 0.99, glassBProg);
      this.overlayB.alpha = inB * outB * 0.78;
    } else if (insideEnter > 0.3) {
      const shimmerCyc = (p4Elapsed * 0.09) % 1;
      this.overlayB.visible = true;
      this.overlayB.position.set(focusX + parX * 0.65, focusY + parY * 0.45);
      const scaleDrift = lerp(1.18, 2.10, shimmerCyc);
      this.overlayB.width = h * 1.42 * scaleDrift;
      this.overlayB.height = h * 1.42 * scaleDrift;
      this.overlayB.rotation = -0.24 + shimmerCyc * 0.12;
      this.overlayB.tint = 0xf0a6ff;
      this.overlayB.alpha = insideEnter * Math.sin(shimmerCyc * Math.PI) * 0.18;
    }

    // 6) Full 3D relativistic pure-white White Hole inside the reality tear + diagonal magenta fissure slash
    this.renderWhiteHoleAssembly({
      t4,
      p4Elapsed,
      clockTime,
      implosionT,
      burstFlash,
      coronaRebound,
      coreRebound,
      ejectaEnter,
      pulseEnter,
      ringSecondaryTint: 0xf08cff,
    });

    if (t4 >= 0.30) {
      this.slashC.visible = true;
      this.slashC.position.set(0, 0);
      this.slashC.width = w * (0.90 + 0.38 * burstFlash);
      this.slashC.height = h * (0.022 + 0.036 * burstFlash);
      this.slashC.rotation = 0.58;
      this.slashC.tint = 0xf270ff;
      this.slashC.alpha = Math.max(ejectaEnter * 0.28, burstFlash * 0.72);
    }

    if (t4 >= 0.31) {
      this.updateStarburstBolts(p4Elapsed, ejectaEnter, burstFlash, h, 0xffffff, 0xf28cff, 0.42);
    }

    this.updateOutwardMotes(
      Math.max(implosionT * 0.22, burstFlash * 0.68, ejectaEnter),
      p4Elapsed,
      focusX,
      focusY,
      0xffffff,
      0xf2a0ff,
      0.78
    );
  }

  private renderDimension(
    t4: number,
    p4Elapsed: number,
    clockTime: number,
    focusX: number,
    focusY: number,
    parX: number,
    parY: number
  ): void {
    const w = this.width;
    const h = this.height;

    // Beat 1 (t4: 0.00..0.34): Instant reality impact stamps 3D perspective shattered glass onto the void
    const crackImpact = Math.sin(clamp01(t4 / 0.34) * Math.PI);
    const glassAProg = clamp01(t4 / 0.58);
    const glassBProg = clamp01((t4 - 0.18) / 0.58);
    // Beat 2->3 (t4 >= 0.24): Tunnel through flying broken panes into the blinding Super-Dimension
    const insideEnter = smoothstep(0.24, 0.86, t4);
    const riftPulse = 1 + 0.06 * Math.sin(clockTime * 1.15);

    this.veilBg.visible = true;
    this.veilBg.position.set(w * 0.5, h * 0.5);
    this.veilBg.width = w * 1.06;
    this.veilBg.height = h * 1.06;
    this.veilBg.tint = 0x160728;
    this.veilBg.alpha = Math.max(smoothstep(0.0, 0.32, t4) * 0.30, insideEnter * 0.42);

    // 1) Back sky: blinding turquoise / mint-white / violet dimensional chasm (open diagonal sky!)
    this.worldA.visible = insideEnter > 0.01;
    this.worldA.position.set(
      focusX + w * 0.05 + Math.sin(p4Elapsed * 0.18) * 26 - parX * 0.25,
      focusY - h * 0.06 + Math.cos(p4Elapsed * 0.15) * 18 - parY * 0.25
    );
    this.worldA.width = w * 1.24 * riftPulse;
    this.worldA.height = h * 1.56 * riftPulse;
    this.worldA.rotation = 0.08 + Math.sin(clockTime * 0.14) * 0.05;
    this.worldA.tint = 0xffffff;
    this.worldA.alpha = insideEnter * 0.96;

    this.worldB.visible = insideEnter > 0.01;
    this.worldB.position.set(
      focusX - w * 0.04 - parX * 0.4,
      focusY + h * 0.08 + parY * 0.35
    );
    this.worldB.width = w * 1.06;
    this.worldB.height = h * 1.32;
    this.worldB.rotation = -0.35 + this.rotA * 0.18;
    this.worldB.tint = 0xe2b8ff;
    this.worldB.alpha = insideEnter * 0.56;

    // 2) Mid reefs: bumpy iridescent violet-magenta-cyan crystal scales clinging to edges so bright sky opens wide
    this.worldC.visible = insideEnter > 0.01;
    this.worldC.position.set(
      w * 0.16 + parX * 0.35 + Math.sin(p4Elapsed * 0.14) * 20,
      h * 0.50 + parY * 0.28
    );
    this.worldC.width = w * 0.86;
    this.worldC.height = h * 1.48;
    this.worldC.rotation = -0.18 + Math.sin(clockTime * 0.12) * 0.04;
    this.worldC.tint = 0xffffff;
    this.worldC.alpha = insideEnter * 0.68;

    this.worldD.visible = insideEnter > 0.01;
    this.worldD.position.set(
      w * 0.90 - parX * 0.45,
      h * 0.86 - parY * 0.35
    );
    this.worldD.width = h * 1.24;
    this.worldD.height = h * 1.24;
    this.worldD.rotation = this.rotB * 0.20 + 0.75;
    this.worldD.tint = 0xf2d8ff;
    this.worldD.alpha = insideEnter * 0.72;

    this.echoC.visible = insideEnter > 0.05;
    this.echoC.position.set(
      w * 0.18 + parX * 0.35,
      h * 0.52 + parY * 0.28
    );
    this.echoC.width = w * 0.84;
    this.echoC.height = h * 1.42;
    this.echoC.rotation = -0.18;
    this.echoC.tint = 0xff70eb;
    this.echoC.alpha = insideEnter * 0.22;

    // 3) Mid-foreground tendrils: bold obsidian thorn claws framing top-right & bottom edges, leaving center chasm bright!
    const spineEnter = smoothstep(0.42, 0.92, t4);
    this.echoA.visible = spineEnter > 0.01;
    this.echoA.position.set(
      w * 0.76 - parX * 0.55,
      h * 0.24 - parY * 0.45
    );
    this.echoA.width = w * 0.82;
    this.echoA.height = h * 0.98;
    this.echoA.rotation = 0.04 + Math.sin(p4Elapsed * 0.22) * 0.04;
    this.echoA.tint = 0xffffff;
    this.echoA.alpha = spineEnter * 0.92;

    this.echoB.visible = spineEnter > 0.01;
    this.echoB.position.set(
      w * 0.74 + parX * 0.65,
      h * 0.84 + parY * 0.50
    );
    this.echoB.width = w * 0.80;
    this.echoB.height = h * 0.96;
    this.echoB.rotation = 2.62 - Math.cos(p4Elapsed * 0.18) * 0.04;
    this.echoB.tint = 0xffffff;
    this.echoB.alpha = spineEnter * 0.84;

    // 4) Beat 1->2 Shattered glass zoom-past transition (fills full frame edge-to-edge like Image 1!)
    if (glassAProg > 0.01 && glassAProg < 0.99) {
      this.overlayA.visible = true;
      this.overlayA.position.set(focusX, focusY);
      const scaleA = lerp(0.84, 2.85, Math.pow(glassAProg, 1.35));
      this.overlayA.width = w * 1.18 * scaleA;
      this.overlayA.height = w * 1.18 * scaleA;
      this.overlayA.rotation = glassAProg * 0.06;
      this.overlayA.tint = 0xe8f8ff;
      const inA = smoothstep(0.0, 0.14, glassAProg);
      const outA = 1 - smoothstep(0.58, 0.99, glassAProg);
      this.overlayA.alpha = inA * outA * 0.96;
    }

    if (glassBProg > 0.01 && glassBProg < 0.99) {
      this.overlayB.visible = true;
      this.overlayB.position.set(focusX - 24, focusY + 12);
      const scaleB = lerp(0.65, 2.55, Math.pow(glassBProg, 1.25));
      this.overlayB.width = w * 1.12 * scaleB;
      this.overlayB.height = w * 1.12 * scaleB;
      this.overlayB.rotation = -0.26 - glassBProg * 0.05;
      this.overlayB.tint = 0xf4b6ff;
      const inB = smoothstep(0.0, 0.18, glassBProg);
      const outB = 1 - smoothstep(0.55, 0.99, glassBProg);
      this.overlayB.alpha = inB * outB * 0.84;
    } else if (insideEnter > 0.3) {
      // Subtle drifting broken-mirror glints far in the foreground after entering
      const shimmerCyc = (p4Elapsed * 0.09) % 1;
      this.overlayB.visible = true;
      this.overlayB.position.set(focusX + parX * 0.7, focusY + parY * 0.5);
      const scaleDrift = lerp(1.15, 2.15, shimmerCyc);
      this.overlayB.width = h * 1.4 * scaleDrift;
      this.overlayB.height = h * 1.4 * scaleDrift;
      this.overlayB.rotation = 0.22 + shimmerCyc * 0.12;
      this.overlayB.tint = 0xb8f4ff;
      this.overlayB.alpha = insideEnter * Math.sin(shimmerCyc * Math.PI) * 0.14;
    }

    // Controlled impact flash so glass fracture lines & shard facets stay razor sharp
    if (crackImpact > 0.01) {
      this.coreGlow.visible = true;
      this.coreGlow.position.set(0, 0);
      const gDia = h * lerp(0.18, 0.74, crackImpact);
      this.coreGlow.width = gDia;
      this.coreGlow.height = gDia;
      this.coreGlow.tint = 0xdffbff;
      this.coreGlow.alpha = crackImpact * 0.44;

      const cuts = [
        { s: this.slashA, rot: 0.42, tint: 0x8ef9ff },
        { s: this.slashB, rot: -0.58, tint: 0xf47aff },
      ];
      for (const c of cuts) {
        c.s.visible = true;
        c.s.position.set(0, 0);
        c.s.width = w * (0.48 + 0.75 * crackImpact);
        c.s.height = h * (0.04 + 0.07 * crackImpact);
        c.s.rotation = c.rot;
        c.s.tint = c.tint;
        c.s.alpha = crackImpact * 0.45;
      }

      if (t4 < 0.45) {
        const ringProg = clamp01(t4 / 0.45);
        this.ringA.visible = true;
        this.ringA.position.set(0, 0);
        const rDia = h * lerp(0.08, 1.88, Math.sqrt(ringProg));
        this.ringA.width = rDia;
        this.ringA.height = rDia;
        this.ringA.tint = 0xa8f8ff;
        this.ringA.alpha = (1 - ringProg) * 0.85;
      }
    }

    // Outward flying prism shards & cosmic sparks
    if (t4 >= 0.22) {
      this.updateStarburstBolts(p4Elapsed, insideEnter * 0.55, crackImpact, h, 0x76f6ff, 0xf27aff, 0.72);
    }

    this.updateDriftMotes(Math.max(crackImpact * 0.5, insideEnter), clockTime, 0x72f6ff, 0xf67aff, 0.68);
  }

  private updateStarburstBolts(
    p4Elapsed: number,
    enter: number,
    burstBoost: number,
    heightPx: number,
    tintA: number,
    tintB: number,
    alphaScale: number
  ): void {
    const activity = Math.max(enter * 0.52, burstBoost * 0.95);
    const maxReach = heightPx * (0.98 + 0.35 * burstBoost);
    for (let i = 0; i < this.starburstBolts.length; i++) {
      const b = this.starburstBolts[i];
      const prog = (b.phase + p4Elapsed * b.speed * (0.34 + 0.45 * burstBoost)) % 1;
      const dist = lerp(heightPx * 0.06, maxReach, prog);
      const a = b.angle + prog * 0.12 * (i % 2 === 0 ? 1 : -1);
      b.sprite.visible = true;
      b.sprite.position.set(Math.cos(a) * dist, Math.sin(a) * dist);
      b.sprite.rotation = a;
      b.sprite.width = b.baseLen * (0.65 + 0.95 * prog);
      b.sprite.height = b.baseThick * (1.25 - 0.5 * prog);
      b.sprite.tint = i % 2 === 0 ? tintA : tintB;
      b.sprite.alpha = Math.sin(prog * Math.PI) * activity * alphaScale * 0.55;
    }
  }

  private updateDriftMotes(
    enter: number,
    clockTime: number,
    tintA: number,
    tintB: number,
    alphaScale: number
  ): void {
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      const xFrac = ((m.radiusNorm + clockTime * m.speed * 0.04) % 1.1) - 0.05;
      const yBase = 0.08 + seeded(i, 12.1) * 0.84;
      const sway = Math.sin(clockTime * 0.9 + m.phase) * 0.035;
      m.sprite.visible = true;
      m.sprite.position.set(xFrac * this.width, (yBase + sway) * this.height);
      m.sprite.width = m.size * 0.65;
      m.sprite.height = m.size * 0.65;
      m.sprite.tint = i % 2 === 0 ? tintA : tintB;
      m.sprite.alpha = enter * alphaScale * (0.45 + 0.45 * Math.sin(clockTime * 2.2 + m.phase));
    }
  }

  private updateOutwardMotes(
    enter: number,
    p4Elapsed: number,
    originX: number,
    originY: number,
    tintA: number,
    tintB: number,
    alphaScale: number
  ): void {
    const maxR = this.width * 0.95;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      const prog = (m.radiusNorm + p4Elapsed * m.speed * 0.55) % 1;
      const dist = 28 + Math.pow(prog, 1.15) * maxR;
      const curveAngle = m.angle + prog * 0.35 * (i % 2 === 0 ? 1 : -1);
      m.sprite.visible = true;
      m.sprite.position.set(originX + Math.cos(curveAngle) * dist, originY + Math.sin(curveAngle) * dist);
      const s = m.size * (0.45 + 0.85 * prog);
      m.sprite.width = s;
      m.sprite.height = s;
      m.sprite.tint = i % 3 === 0 ? tintB : tintA;
      const edgeFade = Math.sin(prog * Math.PI);
      m.sprite.alpha = enter * alphaScale * edgeFade * 0.78;
    }
  }

  public destroy(): void {
    if (this.group.parent) {
      this.group.parent.removeChild(this.group);
    }
    this.group.destroy({ children: true, texture: false, baseTexture: false });
    this.starburstBolts = [];
    this.motes = [];
  }
}

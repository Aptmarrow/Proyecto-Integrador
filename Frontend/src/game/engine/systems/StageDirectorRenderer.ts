import * as PIXI from 'pixi.js';
import {
  StageDirectorPhase4,
  Phase4PresetId,
  isPhase4Preset,
  computePhase4SpeedlineFactor,
} from './StageDirectorPhase4';

export interface StageBakeTextureSpec {
  id: string;
  width: number;
  height: number;
  fragmentSrc: string;
  lazy?: boolean;
}

export interface StageDirectorPhaseSpec {
  id: string;
  preset: 'approach' | 'vortex' | 'void' | Phase4PresetId;
  duration: number;
  transitionIn?: number;
  speedScale?: number;
  camera?: {
    startScale?: number;
    endScale?: number;
    orbitRadiusX?: number;
    orbitRadiusY?: number;
    orbitSpeed?: number;
    rollBase?: number;
    rollSwing?: number;
  };
  fx?: {
    galaxyFade?: boolean;
    stormStart?: number;
    stormEnd?: number;
    tint?: number;
  };
}

export interface StageDirectorPreviewVariant {
  key: string;
  label: string;
  preset: Phase4PresetId;
  jumpLeadSeconds?: number;
  transitionIn?: number;
}

export interface StageDirectorTimelineSpec {
  timeScale?: number;
  phases: StageDirectorPhaseSpec[];
}

export interface StageDirectorSpec {
  timeline: StageDirectorTimelineSpec;
  textures: StageBakeTextureSpec[];
  previewVariants?: StageDirectorPreviewVariant[];
}

export interface StageDirectorFrameContext {
  stageTime: number;
  clockTime: number;
  playerX: number;
  playerY: number;
}

interface ResolvedPhaseWindow {
  spec: StageDirectorPhaseSpec;
  start: number;
  end: number;
  duration: number;
  transitionIn: number;
}

interface StarNode {
  sprite: PIXI.Sprite;
  xNorm: number;
  yNorm: number;
  speed: number;
  phase: number;
  twinkleRate: number;
  baseAlpha: number;
}

interface SpeedlineNode {
  sprite: PIXI.Sprite;
  xPos: number;
  yNorm: number;
  tierSpeed: number;
  speedPx: number;
  fan: number;
  parallaxWeight: number;
  widthPx: number;
  heightPx: number;
  baseAlpha: number;
  baseTint: number;
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

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpTint(a: number, b: number, t: number): number {
  const k = clamp01(t);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

function seeded01(index: number, salt: number): number {
  const s = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Touhou-style multi-layer sprite stage renderer driven by a scalable phase timeline.
 * Bakes complex layer textures once at stage init, then animates lightweight Pixi sprites per frame.
 */
export class StageDirectorRenderer {
  private container: PIXI.Container;
  private renderer: PIXI.IRenderer;
  private width: number;
  private height: number;
  private spec: StageDirectorSpec;
  private windows: ResolvedPhaseWindow[] = [];

  private bakedTextures: Map<string, PIXI.RenderTexture> = new Map();
  private textureSpecs: Map<string, StageBakeTextureSpec> = new Map();
  private subTextures: PIXI.Texture[] = [];
  private boltFrames: PIXI.Texture[] = [];
  private phase4Composer: StageDirectorPhase4;

  private root: PIXI.Container = new PIXI.Container();
  private backdropVoid: PIXI.Sprite;
  private orangeWash: PIXI.Sprite;
  private starGroup: PIXI.Container = new PIXI.Container();
  private galaxySprite: PIXI.Sprite;

  private centerGroup: PIXI.Container = new PIXI.Container();
  private vortexSpaghettiA: PIXI.Sprite;
  private vortexSpaghettiB: PIXI.Sprite;
  private vortexRifts: PIXI.Sprite;
  private polarJet: PIXI.Sprite;
  private shockRingA: PIXI.Sprite;
  private shockRingB: PIXI.Sprite;
  private boltSpriteA: PIXI.Sprite;
  private boltSpriteB: PIXI.Sprite;

  private diskBackGroup: PIXI.Container = new PIXI.Container();
  private diskBackOuter: PIXI.Sprite;
  private diskBackInner: PIXI.Sprite;
  private lensingHalo: PIXI.Sprite;

  private shadowCore: PIXI.Sprite;
  private kerrCore: PIXI.Sprite;

  private diskFrontGroup: PIXI.Container = new PIXI.Container();
  private diskFrontMask: PIXI.Graphics = new PIXI.Graphics();
  private diskFrontOuter: PIXI.Sprite;
  private diskFrontInner: PIXI.Sprite;

  private photonRim: PIXI.Sprite;
  private causticSpotA: PIXI.Sprite;
  private causticSpotB: PIXI.Sprite;
  private singularityRing: PIXI.Sprite;

  private speedlineGroup: PIXI.Container = new PIXI.Container();
  private leftCalmVeil: PIXI.Sprite;

  private stars: StarNode[] = [];
  private speedlines: SpeedlineNode[] = [];
  private lastClockTime: number = 0;

  private previewAnchor: {
    targetStart: number;
    clockAtSelect: number;
    variantIndex: number;
  } | null = null;
  private defaultPhase4Preset: Phase4PresetId | null = null;
  private defaultPhase4Trans: number | null = null;
  private previewHudBg: PIXI.Sprite | null = null;
  private previewHudText: PIXI.Text | null = null;
  private lastHudString: string = '';
  private rotOuter: number = 0;
  private rotInner: number = 0;
  private rotVortexA: number = 0;
  private rotVortexB: number = 0;
  private rotRifts: number = 0;
  private rotCausticA: number = 0;
  private rotCausticB: number = 0;

  constructor(
    container: PIXI.Container,
    renderer: PIXI.IRenderer,
    spec: StageDirectorSpec,
    width: number = 1024,
    height: number = 576
  ) {
    this.container = container;
    this.renderer = renderer;
    this.spec = spec;
    this.width = width;
    this.height = height;

    this.resolveTimelineWindows(spec.timeline);
    this.bakeAllTextures(spec.textures);

    // Layer 0: Base dark backdrop + full-screen Phase 2 warm molten wash
    this.backdropVoid = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.backdropVoid.width = width;
    this.backdropVoid.height = height;
    this.backdropVoid.tint = 0x020205;
    this.root.addChild(this.backdropVoid);

    this.orangeWash = new PIXI.Sprite(this.tex('vortexWash', PIXI.Texture.WHITE));
    this.orangeWash.width = width;
    this.orangeWash.height = height;
    this.orangeWash.alpha = 0;
    this.root.addChild(this.orangeWash);

    // Layer 1: Starfield particles + Distant blue galaxy
    this.initStars();
    this.root.addChild(this.starGroup);

    this.galaxySprite = new PIXI.Sprite(this.tex('galaxy'));
    this.galaxySprite.anchor.set(0.5);
    this.root.addChild(this.galaxySprite);

    // Layer 2: Central body + orbital layers
    this.centerGroup.position.set(width * 0.5, height * 0.5);
    this.root.addChild(this.centerGroup);

    this.vortexSpaghettiA = this.centeredSprite('spaghettiA');
    this.vortexSpaghettiB = this.centeredSprite('spaghettiB', PIXI.BLEND_MODES.ADD);
    this.vortexRifts = this.centeredSprite('tidalRifts');
    this.polarJet = this.centeredSprite('polarJet', PIXI.BLEND_MODES.ADD);
    this.shockRingA = this.centeredSprite('shockRing', PIXI.BLEND_MODES.ADD);
    this.shockRingB = this.centeredSprite('shockRing', PIXI.BLEND_MODES.ADD);

    this.extractBoltFrames();
    this.boltSpriteA = new PIXI.Sprite(this.boltFrames[0] ?? PIXI.Texture.EMPTY);
    this.boltSpriteA.anchor.set(0.5);
    this.boltSpriteA.blendMode = PIXI.BLEND_MODES.ADD;
    this.boltSpriteA.tint = 0x45f2ff;

    this.boltSpriteB = new PIXI.Sprite(this.boltFrames[1] ?? this.boltFrames[0] ?? PIXI.Texture.EMPTY);
    this.boltSpriteB.anchor.set(0.5);
    this.boltSpriteB.blendMode = PIXI.BLEND_MODES.ADD;
    this.boltSpriteB.tint = 0xe855ff;

    this.centerGroup.addChild(
      this.vortexSpaghettiA,
      this.vortexRifts,
      this.vortexSpaghettiB,
      this.shockRingA,
      this.shockRingB,
      this.polarJet,
      this.boltSpriteA,
      this.boltSpriteB
    );

    // Phase 1 accretion disk (back half behind shadow) + Einstein lensing halo
    this.diskBackOuter = this.centeredSprite('diskOuter');
    this.diskBackInner = this.centeredSprite('diskInner', PIXI.BLEND_MODES.ADD);
    this.diskBackGroup.addChild(this.diskBackOuter, this.diskBackInner);

    this.lensingHalo = this.centeredSprite('lensingHalo');
    this.shadowCore = this.centeredSprite('shadowCore');
    this.kerrCore = this.centeredSprite('shadowKerr');

    // Phase 1 front equatorial half clipped below y=0 in Phase 1 local coordinates
    this.diskFrontOuter = this.centeredSprite('diskOuter');
    this.diskFrontInner = this.centeredSprite('diskInner', PIXI.BLEND_MODES.ADD);
    this.diskFrontGroup.addChild(this.diskFrontOuter, this.diskFrontInner);

    this.diskFrontMask.beginFill(0xffffff);
    this.diskFrontMask.drawRect(-1400, -4, 2800, 1400);
    this.diskFrontMask.endFill();
    this.centerGroup.addChild(this.diskFrontMask);
    this.diskFrontGroup.mask = this.diskFrontMask;

    this.photonRim = this.centeredSprite('shockRing', PIXI.BLEND_MODES.ADD);
    this.photonRim.tint = 0xffebb8;

    this.causticSpotA = this.centeredSprite('softDot', PIXI.BLEND_MODES.ADD);
    this.causticSpotA.tint = 0xffe49e;
    this.causticSpotB = this.centeredSprite('softDot', PIXI.BLEND_MODES.ADD);
    this.causticSpotB.tint = 0x66f6ff;

    this.centerGroup.addChild(
      this.diskBackGroup,
      this.lensingHalo,
      this.shadowCore,
      this.kerrCore,
      this.diskFrontGroup,
      this.photonRim,
      this.causticSpotA,
      this.causticSpotB
    );

    // Layer 3: Phase 4 Cosmic Variants + Phase 3 Speedline Pool + Singularity Ring
    this.phase4Composer = new StageDirectorPhase4(
      this.root,
      (id, fallback) => this.ensureTexture(id, fallback),
      width,
      height
    );

    this.initSpeedlines();
    this.speedlineGroup.pivot.set(width * 0.5, height * 0.5);
    this.speedlineGroup.position.set(width * 0.5, height * 0.5);
    this.speedlineGroup.visible = false;
    this.root.addChild(this.speedlineGroup);

    this.singularityRing = this.centeredSprite('shockRing', PIXI.BLEND_MODES.ADD);
    this.singularityRing.tint = 0x62ebff;
    this.centerGroup.addChild(this.singularityRing);

    // Layer 4: Subtle left-lane readability gradient + optional sandbox preview pill
    this.leftCalmVeil = new PIXI.Sprite(this.createLeftVeilTexture());
    this.leftCalmVeil.width = Math.round(width * 0.36);
    this.leftCalmVeil.height = height;
    this.leftCalmVeil.alpha = 0.14;
    this.root.addChild(this.leftCalmVeil);

    this.initPreviewHud();

    const w4Init = this.getPhase4Window();
    if (w4Init && isPhase4Preset(w4Init.spec.preset)) {
      this.defaultPhase4Preset = w4Init.spec.preset;
      this.defaultPhase4Trans = w4Init.transitionIn;
    }

    this.container.addChild(this.root);
    this.update({ stageTime: 0, clockTime: 0, playerX: 220, playerY: height * 0.5 });
  }

  private tex(id: string, fallback: PIXI.Texture = PIXI.Texture.EMPTY): PIXI.Texture {
    return this.bakedTextures.get(id) ?? fallback;
  }

  private ensureTexture(id: string, fallback: PIXI.Texture = PIXI.Texture.EMPTY): PIXI.Texture {
    const existing = this.bakedTextures.get(id);
    if (existing) return existing;
    const item = this.textureSpecs.get(id);
    if (!item) return fallback;
    return this.bakeSingleTexture(item) ?? fallback;
  }

  private centeredSprite(id: string, blendMode: PIXI.BLEND_MODES = PIXI.BLEND_MODES.NORMAL): PIXI.Sprite {
    const s = new PIXI.Sprite(this.tex(id));
    s.anchor.set(0.5);
    s.blendMode = blendMode;
    return s;
  }

  private resolveTimelineWindows(timeline: StageDirectorTimelineSpec): void {
    const scale = Math.max(0.05, timeline?.timeScale ?? 1.0);
    let cursor = 0;
    this.windows = (timeline?.phases ?? []).map((spec) => {
      const duration = Math.max(0.01, (spec.duration ?? 10) * scale);
      const transitionIn = Math.min(duration, Math.max(0, (spec.transitionIn ?? 0) * scale));
      const win: ResolvedPhaseWindow = {
        spec,
        start: cursor,
        end: cursor + duration,
        duration,
        transitionIn,
      };
      cursor = win.end;
      return win;
    });
  }

  private bakeSingleTexture(item: StageBakeTextureSpec): PIXI.RenderTexture | null {
    const webglRenderer = this.renderer as PIXI.Renderer;
    if (typeof webglRenderer?.render !== 'function' || !item?.id || !item.fragmentSrc) return null;

    const w = Math.max(8, Math.round(item.width));
    const h = Math.max(8, Math.round(item.height));

    const geo = new PIXI.Geometry()
      .addAttribute('aVertexPosition', [0, 0, w, 0, w, h, 0, h], 2)
      .addAttribute('aUvs', [0, 0, 1, 0, 1, 1, 0, 1], 2)
      .addIndex([0, 1, 2, 0, 2, 3]);

    const shader = PIXI.Shader.from(BAKE_VERTEX_SRC, item.fragmentSrc, {
      uTexSize: new Float32Array([w, h]),
    });

    const mesh = new PIXI.Mesh(geo, shader);
    const rt = PIXI.RenderTexture.create({
      width: w,
      height: h,
      resolution: 1,
      scaleMode: PIXI.SCALE_MODES.LINEAR,
    });

    webglRenderer.render(mesh, { renderTexture: rt, clear: true });
    this.bakedTextures.set(item.id, rt);

    mesh.destroy();
    shader.destroy();
    geo.destroy();
    return rt;
  }

  private bakeAllTextures(specs: StageBakeTextureSpec[]): void {
    this.textureSpecs.clear();
    for (const item of specs) {
      if (!item?.id || !item.fragmentSrc) continue;
      this.textureSpecs.set(item.id, item);
      if (!item.lazy) {
        this.bakeSingleTexture(item);
      }
    }
  }

  private extractBoltFrames(): void {
    const sheet = this.bakedTextures.get('lightningSheet');
    if (!sheet) return;
    const cellW = Math.floor(sheet.width / 2);
    const cellH = Math.floor(sheet.height / 2);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const frame = new PIXI.Texture(
          sheet.baseTexture,
          new PIXI.Rectangle(col * cellW, row * cellH, cellW, cellH)
        );
        this.subTextures.push(frame);
        this.boltFrames.push(frame);
      }
    }
  }

  private createLeftVeilTexture(): PIXI.Texture {
    if (typeof document === 'undefined') return PIXI.Texture.EMPTY;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 4;
    const ctx = canvas.getContext('2d');
    if (!ctx) return PIXI.Texture.EMPTY;
    const grad = ctx.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 4);
    const tex = PIXI.Texture.from(canvas);
    this.subTextures.push(tex);
    return tex;
  }

  private initStars(): void {
    const starTex = this.tex('softDot', PIXI.Texture.WHITE);
    const count = 46;
    for (let i = 0; i < count; i++) {
      const sprite = new PIXI.Sprite(starTex);
      sprite.anchor.set(0.5);
      sprite.blendMode = PIXI.BLEND_MODES.ADD;
      const warm = seeded01(i, 3.1) > 0.52;
      sprite.tint = warm ? 0xffe0ae : 0xb8dcff;
      const sizePx = 5 + seeded01(i, 7.7) * 9;
      sprite.width = sizePx;
      sprite.height = sizePx;
      this.starGroup.addChild(sprite);
      this.stars.push({
        sprite,
        xNorm: seeded01(i, 1.3),
        yNorm: seeded01(i, 2.9),
        speed: i % 2 === 0 ? 0.011 : 0.024,
        phase: seeded01(i, 4.4) * Math.PI * 2,
        twinkleRate: 1.4 + seeded01(i, 5.8) * 2.8,
        baseAlpha: 0.38 + seeded01(i, 8.2) * 0.45,
      });
    }
  }

  private initSpeedlines(): void {
    const streakTex = this.tex('speedStreak', PIXI.Texture.WHITE);
    const palette = [0x00f2ff, 0xff297a, 0xad4dff, 0xffd152, 0x38ff61, 0x3d8fff, 0xebf7ff];
    const tiers = [
      { count: 10, minW: 240, maxW: 440, minH: 1.8, maxH: 2.8, speed: 1550, fan: 0.13, pWeight: 0.24, alpha: 0.96 },
      { count: 12, minW: 160, maxW: 320, minH: 1.3, maxH: 2.0, speed: 1050, fan: 0.08, pWeight: 0.14, alpha: 0.85 },
      { count: 10, minW: 110, maxW: 230, minH: 1.0, maxH: 1.6, speed: 1850, fan: 0.14, pWeight: 0.19, alpha: 0.82 },
      { count: 10, minW: 70,  maxW: 150, minH: 0.8, maxH: 1.2, speed: 580,  fan: 0.03, pWeight: 0.04, alpha: 0.52 },
    ];

    let idx = 0;
    for (const tier of tiers) {
      for (let i = 0; i < tier.count; i++, idx++) {
        const s = new PIXI.Sprite(streakTex);
        s.anchor.set(0.0, 0.5);
        s.blendMode = PIXI.BLEND_MODES.ADD;
        const wPx = lerp(tier.minW, tier.maxW, seeded01(idx, 1.7));
        const hPx = lerp(tier.minH, tier.maxH, seeded01(idx, 3.3));
        s.width = wPx;
        s.height = hPx;
        const baseTint = palette[Math.floor(seeded01(idx, 6.1) * palette.length) % palette.length];
        s.tint = baseTint;
        const yNorm = seeded01(idx, 2.2);
        const initX = seeded01(idx, 9.5) * (this.width + wPx) - wPx;
        s.x = initX;
        this.speedlineGroup.addChild(s);
        this.speedlines.push({
          sprite: s,
          xPos: initX,
          yNorm,
          tierSpeed: tier.speed * (0.85 + 0.3 * seeded01(idx, 4.9)),
          speedPx: tier.speed,
          fan: tier.fan,
          parallaxWeight: tier.pWeight,
          widthPx: wPx,
          heightPx: hPx,
          baseAlpha: tier.alpha,
          baseTint,
        });
      }
    }
  }

  private initPreviewHud(): void {
    const variants = this.spec.previewVariants;
    if (!variants || variants.length === 0 || typeof document === 'undefined') return;

    const bg = new PIXI.Sprite(PIXI.Texture.WHITE);
    bg.anchor.set(1, 0);
    bg.position.set(this.width - 10, 8);
    bg.tint = 0x05050c;
    bg.alpha = 0.72;
    this.root.addChild(bg);
    this.previewHudBg = bg;

    const label = new PIXI.Text('', {
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 12,
      fill: 0xd8f3ff,
      align: 'right',
    });
    label.anchor.set(1, 0);
    label.position.set(this.width - 18, 14);
    this.root.addChild(label);
    this.previewHudText = label;
  }

  private getWindow(preset: StageDirectorPhaseSpec['preset']): ResolvedPhaseWindow | null {
    return this.windows.find((w) => w.spec.preset === preset) ?? null;
  }

  private getPhase4Window(): ResolvedPhaseWindow | null {
    return this.windows.find((w) => isPhase4Preset(w.spec.preset)) ?? null;
  }

  public hasPreviewVariants(): boolean {
    return Boolean(this.spec.previewVariants && this.spec.previewVariants.length > 0 && this.getPhase4Window());
  }

  public getPreviewVariants(): StageDirectorPreviewVariant[] {
    if (!this.hasPreviewVariants()) return [];
    return this.spec.previewVariants!.map((v) => ({ ...v }));
  }

  public getActivePreviewVariantIndex(): number {
    return this.previewAnchor ? this.previewAnchor.variantIndex : -1;
  }

  public selectPreviewVariant(index: number): boolean {
    const w4 = this.getPhase4Window();
    const variants = this.spec.previewVariants;
    if (!w4 || !variants || variants.length === 0) return false;

    if (index < 0) {
      this.previewAnchor = null;
      if (this.defaultPhase4Preset) w4.spec.preset = this.defaultPhase4Preset;
      if (this.defaultPhase4Trans !== null) w4.transitionIn = this.defaultPhase4Trans;
      return true;
    }

    if (index >= variants.length) return false;
    const chosen = variants[index];
    w4.spec.preset = chosen.preset;
    const scale = Math.max(0.05, this.spec.timeline?.timeScale ?? 1.0);
    if (typeof chosen.transitionIn === 'number') {
      w4.transitionIn = Math.min(w4.duration, Math.max(0, chosen.transitionIn * scale));
    } else if (this.defaultPhase4Trans !== null) {
      w4.transitionIn = this.defaultPhase4Trans;
    }

    const lead = Math.max(0.5, chosen.jumpLeadSeconds ?? 4.0);
    this.previewAnchor = {
      targetStart: Math.max(0, w4.start - lead),
      clockAtSelect: this.lastClockTime,
      variantIndex: index,
    };
    return true;
  }

  private updatePreviewHud(activePreset: Phase4PresetId, effectiveT: number, w4: ResolvedPhaseWindow): void {
    if (!this.previewHudText || !this.previewHudBg || !this.spec.previewVariants?.length) return;

    const variants = this.spec.previewVariants;
    const activeIdx =
      this.previewAnchor !== null
        ? this.previewAnchor.variantIndex
        : Math.max(0, variants.findIndex((v) => v.preset === activePreset));
    const current = variants[activeIdx] ?? variants[0];

    const w2 = this.getWindow('vortex');
    const w3 = this.getWindow('void');
    const delta = effectiveT - w4.start;
    let stageState = 'Fase 1';
    if (delta >= Math.max(0.01, w4.transitionIn)) {
      stageState = 'Fase 4 activa';
    } else if (delta >= 0) {
      stageState = `Transicion 3->4 (${((delta / Math.max(0.01, w4.transitionIn)) * 100).toFixed(0)}%)`;
    } else if (w3 && effectiveT >= w3.start) {
      stageState = `Fase 3 (${delta.toFixed(1)}s -> Transicion)`;
    } else if (w2 && effectiveT >= w2.start) {
      stageState = 'Fase 2';
    }

    const tabs = variants
      .map((v, idx) => {
        const keyLabel = v.key || String(idx + 1);
        return idx === activeIdx ? `[${keyLabel}*:${v.label}]` : `[${keyLabel}:${v.label}]`;
      })
      .join(' ');
    const nextText = `${tabs} | [0:Reset]\nActivo: ${current.label} — ${stageState}`;
    if (nextText !== this.lastHudString) {
      this.lastHudString = nextText;
      this.previewHudText.text = nextText;
      this.previewHudBg.width = Math.ceil(this.previewHudText.width + 18);
      this.previewHudBg.height = Math.ceil(this.previewHudText.height + 12);
    }
  }

  public update(ctx: StageDirectorFrameContext): void {
    const dt = Math.max(0, Math.min(0.1, ctx.clockTime - this.lastClockTime));
    this.lastClockTime = ctx.clockTime;
    const t = Math.max(
      0,
      this.previewAnchor
        ? this.previewAnchor.targetStart + Math.max(0, ctx.clockTime - this.previewAnchor.clockAtSelect)
        : ctx.stageTime
    );

    const w1 = this.getWindow('approach');
    const w2 = this.getWindow('vortex');
    const w3 = this.getWindow('void');
    const w4 = this.getPhase4Window();
    const p4Preset: Phase4PresetId = w4 && isPhase4Preset(w4.spec.preset) ? w4.spec.preset : 'bloom';

    // Normalized progress for every phase (automatically stretches when user edits durations or timeScale!)
    const p1Prog = w1 ? clamp01((t - w1.start) / w1.duration) : 1;
    const t2 = w2 ? smoothstep(w2.start, w2.start + Math.max(0.01, w2.transitionIn), t) : 0;
    const p2Prog = w2 ? clamp01((t - w2.start) / w2.duration) : 0;
    const t3 = w3 ? smoothstep(w3.start, w3.start + Math.max(0.01, w3.transitionIn), t) : 0;
    const t4 = w4 ? smoothstep(w4.start, w4.start + Math.max(0.01, w4.transitionIn), t) : 0;
    const p4Elapsed = w4 ? Math.max(0, t - w4.start) : 0;

    // Continuous time progression modulated per active phase speedScale
    const speedMult =
      t4 > 0.5
        ? (w4?.spec.speedScale ?? 1)
        : t3 > 0.5
          ? (w3?.spec.speedScale ?? 1)
          : t2 > 0.5
            ? (w2?.spec.speedScale ?? 1)
            : (w1?.spec.speedScale ?? 1);
    const animDt = dt * speedMult;

    this.rotOuter -= animDt * 0.42;
    this.rotInner -= animDt * 1.15;
    this.rotVortexA -= animDt * (0.45 + 0.30 * p2Prog);
    this.rotVortexB -= animDt * (0.95 + 0.45 * p2Prog);
    this.rotRifts += animDt * 0.24;
    this.rotCausticA += animDt * 1.15;
    this.rotCausticB -= animDt * 0.85;

    // Camera zoom + orbital drift + player parallax
    const p1Cam = w1?.spec.camera;
    const p2Cam = w2?.spec.camera;
    const easeApproach = Math.pow(p1Prog, 1.15);
    const scale1 = lerp(p1Cam?.startScale ?? 0.36, p1Cam?.endScale ?? 1.06, easeApproach);
    const p2Elapsed = w2 ? Math.max(0, t - w2.start) : 0;
    const orbitAngle = p2Elapsed * (p2Cam?.orbitSpeed ?? 0.48);
    const breath = 1.0 + 0.024 * Math.sin(p2Elapsed * 1.45) * t2;
    const scale2 = lerp(p2Cam?.startScale ?? 1.06, p2Cam?.endScale ?? 1.46, smoothstep(0, 1, p2Prog)) * breath;
    const holeScale = lerp(scale1, scale2, t2);

    const pxNorm = clamp01(ctx.playerX / Math.max(this.width, 1));
    const pyNorm = clamp01(ctx.playerY / Math.max(this.height, 1));
    const parallaxX = (pxNorm - 0.22) * this.height * lerp(0.035, 0.070, t2);
    const parallaxY = (pyNorm - 0.50) * this.height * lerp(0.035, 0.070, t2);

    const orbitBlend = smoothstep(0.0, 0.65, t2);
    const orbitDriftX = Math.sin(orbitAngle) * (p2Cam?.orbitRadiusX ?? 0.22) * this.height * orbitBlend * (1 - t3);
    const orbitDriftY = -(Math.cos(orbitAngle * 0.85) * (p2Cam?.orbitRadiusY ?? 0.10) - 0.03) * this.height * orbitBlend * (1 - t3);

    const cx1 = lerp(0.15, 0.03, easeApproach) * this.height;
    const cy1 = lerp(0.0, -0.01, easeApproach) * this.height;
    const cx2 = 0.01 * this.height + orbitDriftX;
    const cy2 = -0.02 * this.height + orbitDriftY;

    this.centerGroup.position.set(
      this.width * 0.5 + lerp(cx1, cx2, t2) + parallaxX,
      this.height * 0.5 + lerp(cy1, cy2, t2) + parallaxY
    );

    const roll2 = -(p2Cam?.rollBase ?? -0.32) - (p2Cam?.rollSwing ?? -0.22) * Math.cos(orbitAngle * 0.85);
    this.centerGroup.rotation = lerp(0, roll2, orbitBlend);

    // Space stars + orange engulfment + galaxy fadeout
    const orangeEngulf = smoothstep(0.0, 0.22, t2) * (1 - t3);
    const spaceVis = (1 - smoothstep(0.0, 0.16, t2)) * (1 - t3);
    this.orangeWash.visible = orangeEngulf > 0.002;
    this.orangeWash.alpha = orangeEngulf;
    this.backdropVoid.visible = t3 > 0.01 || spaceVis > 0.01;

    this.starGroup.visible = spaceVis > 0.002;
    if (this.starGroup.visible) {
      this.starGroup.alpha = spaceVis;
      const accel = 1 + t2 * 0.95;
      for (const st of this.stars) {
        const sx = (((st.xNorm - ctx.clockTime * st.speed * accel * 0.45) % 1) + 1) % 1;
        st.sprite.x = sx * this.width;
        st.sprite.y = st.yNorm * this.height;
        st.sprite.alpha = st.baseAlpha * (0.65 + 0.35 * Math.sin(ctx.clockTime * st.twinkleRate + st.phase));
      }
    }

    const galFade = (1 - smoothstep(0.48, 0.94, p1Prog)) * spaceVis;
    this.galaxySprite.visible = galFade > 0.002;
    if (this.galaxySprite.visible) {
      const galScale = lerp(0.85, 0.58, p1Prog);
      this.galaxySprite.position.set(
        this.width * 0.5 + (-0.56 - p1Prog * 0.66) * this.height,
        this.height * 0.5 - 0.08 * this.height
      );
      this.galaxySprite.scale.set(galScale, galScale);
      this.galaxySprite.alpha = galFade;
    }

    // Scaled reference diameters matching D = 2 * R_screen / rTexHole (exact 1:1 proportions across layers)
    const unitPx = this.height * holeScale;
    const shadowDiaPx = unitPx * (0.296 / 0.72); // rTexHole=0.72 in shadowCore tex
    const haloDiaPx = unitPx * (0.296 / 0.36);   // rTexHole=0.36 in lensingHalo tex
    const diskDiaPx = unitPx * (0.296 / 0.145);  // rTexHole=0.145 in diskOuter/diskInner

    // Phase 1 Disk & Einstein Halo (active while p1Weight > 0.002)
    const p1Weight = (1 - smoothstep(0.0, 0.68, t2)) * (1 - t3);
    const p1Active = p1Weight > 0.002;
    this.diskBackGroup.visible = p1Active;
    this.lensingHalo.visible = p1Active;
    const frontDiskFade = p1Weight * (1 - smoothstep(0.0, 0.45, t2));
    this.diskFrontGroup.visible = frontDiskFade > 0.002;

    if (p1Active) {
      const tiltFlatten = lerp(0.215, 0.68, t2);
      const diskAlpha = p1Weight * (1 - t2 * 0.35);

      this.diskBackGroup.scale.set(1, tiltFlatten);
      this.diskBackGroup.alpha = diskAlpha;
      this.diskBackOuter.width = diskDiaPx;
      this.diskBackOuter.height = diskDiaPx;
      this.diskBackOuter.rotation = this.rotOuter;
      this.diskBackInner.width = diskDiaPx * 0.92;
      this.diskBackInner.height = diskDiaPx * 0.92;
      this.diskBackInner.rotation = this.rotInner;

      this.lensingHalo.width = haloDiaPx;
      this.lensingHalo.height = haloDiaPx;
      this.lensingHalo.alpha = p1Weight * (1 - 0.65 * t2);

      if (this.diskFrontGroup.visible) {
        this.diskFrontGroup.scale.set(1, tiltFlatten);
        this.diskFrontGroup.alpha = frontDiskFade;
        this.diskFrontOuter.width = diskDiaPx;
        this.diskFrontOuter.height = diskDiaPx;
        this.diskFrontOuter.rotation = this.rotOuter;
        this.diskFrontInner.width = diskDiaPx * 0.92;
        this.diskFrontInner.height = diskDiaPx * 0.92;
        this.diskFrontInner.rotation = this.rotInner;
      }
    }

    // Phase 2 Orbital Vortex Layers (stormDrive ramps strictly on normalized p2Prog!)
    const stormStart = w2?.spec.fx?.stormStart ?? 0.14;
    const stormEnd = w2?.spec.fx?.stormEnd ?? 0.76;
    const transitionActive = smoothstep(0.0, 0.12, p2Prog + t2 * 0.10);
    const stormDrive = lerp(0.35, 1.40, smoothstep(stormStart, stormEnd, p2Prog)) * transitionActive;
    const v2Weight = smoothstep(0.0, 0.55, t2) * (1 - smoothstep(0.12, 0.88, t3));
    const v2Active = v2Weight > 0.002;

    this.vortexSpaghettiA.visible = v2Active;
    this.vortexSpaghettiB.visible = v2Active;
    this.vortexRifts.visible = v2Active && p2Prog > 0.12;
    this.polarJet.visible = v2Active && stormDrive > 0.05;
    this.shockRingA.visible = v2Active;
    this.shockRingB.visible = v2Active;
    this.boltSpriteA.visible = v2Active && stormDrive > 0.08;
    this.boltSpriteB.visible = v2Active && stormDrive > 0.08;
    this.photonRim.visible = v2Active;
    this.causticSpotA.visible = v2Active;
    this.causticSpotB.visible = v2Active;

    if (v2Active) {
      const vortexSpan = Math.max(this.width * 1.45, unitPx * 2.55);
      this.vortexSpaghettiA.width = vortexSpan;
      this.vortexSpaghettiA.height = vortexSpan;
      this.vortexSpaghettiA.rotation = this.rotVortexA;
      this.vortexSpaghettiA.alpha = v2Weight * 0.95;

      this.vortexSpaghettiB.width = vortexSpan * 0.94;
      this.vortexSpaghettiB.height = vortexSpan * 0.94;
      this.vortexSpaghettiB.rotation = this.rotVortexB;
      this.vortexSpaghettiB.alpha = v2Weight * 0.62;

      if (this.vortexRifts.visible) {
        const riftFade = smoothstep(0.14, 0.75, p2Prog);
        this.vortexRifts.width = vortexSpan * 0.96;
        this.vortexRifts.height = vortexSpan * 0.96;
        this.vortexRifts.rotation = this.rotRifts;
        this.vortexRifts.alpha = v2Weight * riftFade * 0.82;
      }

      if (this.polarJet.visible) {
        this.polarJet.width = unitPx * 0.55;
        this.polarJet.height = unitPx * 1.95;
        this.polarJet.rotation = -0.46;
        this.polarJet.alpha = clamp01(v2Weight * stormDrive * 0.68);
      }

      const shPhaseA = (ctx.clockTime * 0.24) % 1;
      const shPhaseB = (shPhaseA + 0.5) % 1;
      const ringSizeA = unitPx * (0.28 + Math.pow(shPhaseA, 0.85) * 1.65);
      const ringSizeB = unitPx * (0.28 + Math.pow(shPhaseB, 0.85) * 1.65);
      this.shockRingA.width = ringSizeA;
      this.shockRingA.height = ringSizeA;
      this.shockRingA.tint = 0xffbb52;
      this.shockRingA.alpha = v2Weight * (1 - shPhaseA) * 0.42 * clamp01(stormDrive * 0.8);

      this.shockRingB.width = ringSizeB;
      this.shockRingB.height = ringSizeB;
      this.shockRingB.tint = 0xd657ff;
      this.shockRingB.alpha = v2Weight * (1 - shPhaseB) * 0.36 * clamp01(stormDrive * 0.8);

      if (this.boltSpriteA.visible && this.boltFrames.length > 0) {
        const frameIdxA = Math.floor(ctx.clockTime * 11) % this.boltFrames.length;
        const frameIdxB = (Math.floor(ctx.clockTime * 9.5) + 2) % this.boltFrames.length;
        this.boltSpriteA.texture = this.boltFrames[frameIdxA];
        this.boltSpriteB.texture = this.boltFrames[frameIdxB];

        const boltSpan = unitPx * 1.35;
        this.boltSpriteA.width = boltSpan;
        this.boltSpriteA.height = boltSpan;
        this.boltSpriteA.rotation = Math.floor(ctx.clockTime * 5.5) * 1.27;
        this.boltSpriteA.alpha = clamp01(v2Weight * stormDrive * (0.45 + 0.45 * Math.sin(ctx.clockTime * 17)));

        this.boltSpriteB.width = boltSpan * 1.08;
        this.boltSpriteB.height = boltSpan * 1.08;
        this.boltSpriteB.rotation = -Math.floor(ctx.clockTime * 4.3) * 1.71;
        this.boltSpriteB.alpha = clamp01(v2Weight * stormDrive * (0.40 + 0.45 * Math.cos(ctx.clockTime * 14.5)));
      }

      const rimDia = unitPx * (0.356 / 0.62); // shockRing peak at rTex=0.62 -> 0.178*unitPx rim
      this.photonRim.width = rimDia;
      this.photonRim.height = rimDia;
      this.photonRim.alpha = v2Weight * 0.88;

      const rimR = unitPx * 0.178;
      this.causticSpotA.position.set(Math.cos(this.rotCausticA) * rimR, Math.sin(this.rotCausticA) * rimR);
      this.causticSpotA.width = unitPx * 0.18;
      this.causticSpotA.height = unitPx * 0.18;
      this.causticSpotA.alpha = v2Weight * 0.85;

      this.causticSpotB.position.set(Math.cos(this.rotCausticB) * rimR * 1.05, Math.sin(this.rotCausticB) * rimR * 1.05);
      this.causticSpotB.width = unitPx * 0.15;
      this.causticSpotB.height = unitPx * 0.15;
      this.causticSpotB.alpha = clamp01(v2Weight * stormDrive * 0.65);
    }

    // Event Horizon Core (Phase 1 round shadow -> Phase 2 Kerr cavity -> Phase 3 imploding void)
    const implosionScale = 1.0 + Math.pow(t3, 1.75) * 18.0;
    const hideShadowWhenVoid = t3 >= 0.995;
    this.shadowCore.visible = !hideShadowWhenVoid && (1 - t2) > 0.02;
    this.kerrCore.visible = !hideShadowWhenVoid && t2 > 0.002;

    if (this.shadowCore.visible) {
      this.shadowCore.width = shadowDiaPx * implosionScale;
      this.shadowCore.height = shadowDiaPx * implosionScale;
      this.shadowCore.alpha = 1 - t2;
    }
    if (this.kerrCore.visible) {
      const kerrDia = unitPx * (0.344 / 0.58) * implosionScale; // rTexKerr=0.58 -> 0.172*unitPx cavity
      this.kerrCore.width = kerrDia * (1.0 + 0.03 * Math.sin(ctx.clockTime * 1.6));
      this.kerrCore.height = kerrDia * 0.94;
      this.kerrCore.rotation = orbitAngle * 0.12;
      this.kerrCore.alpha = t2;
    }

    // Transition 2->3 Singularity Edge Flash + Phase 3 Hyper-Void Speedlines
    const ringFlash = t3 > 0.01 && t3 < 0.98 ? Math.sin(t3 * Math.PI) * (1 - smoothstep(0.75, 1.0, t3)) : 0;
    this.singularityRing.visible = ringFlash > 0.004;
    if (this.singularityRing.visible) {
      const sDia = unitPx * (0.356 / 0.62) * implosionScale;
      this.singularityRing.width = sDia;
      this.singularityRing.height = sDia;
      this.singularityRing.tint = Math.sin(ctx.clockTime * 3.0) >= 0 ? 0x47ebff : 0xdb5cff;
      this.singularityRing.alpha = clamp01(ringFlash);
    }

    // Phase 4 Cosmic Transition & Render (rendered behind morphing Phase 3 speedlines)
    if (w4 && t4 > 0.002) {
      this.phase4Composer.update({
        preset: p4Preset,
        t4,
        p4Elapsed,
        clockTime: ctx.clockTime,
        animDt,
        pxNorm,
        pyNorm,
      });
    } else {
      this.phase4Composer.hide();
    }

    const slFactor = t4 > 0.002
      ? computePhase4SpeedlineFactor(p4Preset, t4)
      : {
          speedMult: 1,
          alphaMult: 1,
          tiltAngle: 0,
          inwardPull: 0,
          jitterAmp: 0,
          stretchMult: 1,
          tintHex: 0xffffff,
        };

    const voidAlpha = smoothstep(0.15, 0.90, t3) * slFactor.alphaMult;
    this.speedlineGroup.visible = voidAlpha > 0.002;
    if (this.speedlineGroup.visible) {
      const pulse = 0.90 + 0.12 * Math.sin(t * 1.8);
      this.speedlineGroup.alpha = clamp01(voidAlpha * pulse);
      this.speedlineGroup.rotation = slFactor.tiltAngle;
      const pOffset = (pyNorm - 0.5) * 0.16 * this.height;
      const pull = slFactor.inwardPull;
      const tintBlend = smoothstep(0.05, 0.52, t4);
      const focusX = this.width * 0.64 + (pxNorm - 0.22) * this.height * 0.085;
      const focusY = this.height * 0.50 + (pyNorm - 0.50) * this.height * 0.085;

      for (const sl of this.speedlines) {
        let nx = sl.xPos - sl.tierSpeed * animDt * slFactor.speedMult;
        if (nx < -sl.widthPx) {
          nx += this.width + sl.widthPx + 40;
        }
        sl.xPos = nx;
        const xNorm = nx / Math.max(this.width, 1);
        const jitterY = slFactor.jitterAmp > 0.05
          ? Math.sin(ctx.clockTime * 68 + sl.yNorm * 41) * slFactor.jitterAmp
          : 0;
        const baseY =
          sl.yNorm * this.height +
          (sl.yNorm - 0.5) * (xNorm - 0.5) * sl.fan * this.height +
          pOffset * sl.parallaxWeight +
          jitterY;
        const stretchW = sl.widthPx * slFactor.stretchMult;

        let lineAlpha = sl.baseAlpha;
        if (pull > 0.002) {
          const rx = lerp(nx, focusX, pull * 0.85);
          const ry = lerp(baseY, focusY, pull * 0.85);
          const dx = focusX - rx;
          const dy = focusY - ry;
          const dist = Math.hypot(dx, dy);
          const slopeAngle = Math.max(-0.38, Math.min(0.38, Math.atan2(dy, Math.max(Math.abs(dx), 180))));
          sl.sprite.position.set(rx, ry);
          sl.sprite.rotation = slopeAngle * pull * (dx >= 0 ? -1 : 1);
          sl.sprite.width = stretchW * (1 - 0.58 * pull);
          sl.sprite.height = sl.heightPx;
          lineAlpha *= 1 - 0.72 * pull * (1 - smoothstep(35, 220, dist));
        } else {
          sl.sprite.position.set(nx, baseY);
          sl.sprite.rotation = 0;
          sl.sprite.width = stretchW;
          sl.sprite.height = sl.heightPx;
        }
        sl.sprite.tint = tintBlend > 0.01 ? lerpTint(sl.baseTint, slFactor.tintHex, tintBlend) : sl.baseTint;
        sl.sprite.alpha = lineAlpha;
      }
    }

    if (w4) {
      this.updatePreviewHud(p4Preset, t, w4);
    }

    // Gentle left-lane readability calm (brighter in orange vortex, lighter in dark Phase 3/4)
    this.leftCalmVeil.alpha = lerp(0.14, 0.04, t3);
  }

  public destroy(): void {
    this.phase4Composer.destroy();
    if (this.root.parent) {
      this.root.parent.removeChild(this.root);
    }
    this.root.destroy({ children: true, texture: false, baseTexture: false });
    for (const tex of this.subTextures) {
      tex.destroy(false);
    }
    this.subTextures = [];
    this.boltFrames = [];
    for (const rt of this.bakedTextures.values()) {
      rt.destroy(true);
    }
    this.bakedTextures.clear();
    this.textureSpecs.clear();
    this.stars = [];
    this.speedlines = [];
    this.previewHudBg = null;
    this.previewHudText = null;
  }
}

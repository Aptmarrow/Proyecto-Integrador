import * as PIXI from 'pixi.js';
import { StageDirectorRenderer, StageDirectorPreviewVariant, StageDirectorSpec } from './StageDirectorRenderer';
import { World1SpaceDirector, isWorld1NormalStage } from './World1SpaceDirector';
import type { SpaceThemeSpec } from '../../campaign/spaceCampaignCatalog';

interface StarParticle {
  x: number;
  y: number;
  size: number;
  speedFactor: number;
  color: number;
  alpha: number;
}

export interface LutStagePassVariant {
  minStageTime: number;
  maxStageTime: number;
  fragmentSrc: string;
}

export interface LutStagePassSpec {
  fragmentSrc?: string;
  variants?: LutStagePassVariant[];
  spriteDirector?: StageDirectorSpec;
  uniforms?: Record<string, number | number[]>;
}

export interface BackgroundFrameContext {
  stageTime?: number;
  playerX?: number;
  playerY?: number;
  bossActive?: boolean;
  bossPhase?: number;
  bossHpRatio?: number;
  speed?: number;
}

interface CompiledLutVariant {
  minStageTime: number;
  maxStageTime: number;
  shader: PIXI.Shader;
}

const DEFAULT_SPACE_THEME: SpaceThemeSpec = {
  id: 'default',
  skyTop: 0x040818,
  skyBottom: 0x0a1633,
  nebulaA: 0x102a5c,
  nebulaB: 0x005f88,
  gridColor: 0x1d3f72,
  accentColor: 0x00f2fe,
  feature: 'planet_ring',
  starColors: [0x00f2fe, 0x3b82f6, 0xffd166, 0xffffff],
  scrollSpeed: 135,
};

const STAGE_PASS_VERTEX_SRC = `
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

export class BackgroundRenderer {
  public bgScrollX: number = 0;
  private container: PIXI.Container;
  private renderer: PIXI.IRenderer | null;
  private baseGraphics: PIXI.Graphics = new PIXI.Graphics();
  private bgTilingSprite: PIXI.TilingSprite | null = null;
  private celestialGraphics: PIXI.Graphics = new PIXI.Graphics();
  private staticOverlayGraphics: PIXI.Graphics = new PIXI.Graphics();
  private gridColumnsGraphics: PIXI.Graphics = new PIXI.Graphics();
  private starContainer: PIXI.Container = new PIXI.Container();
  private starTexture: PIXI.Texture | null = null;
  private starSprites: PIXI.Sprite[] = [];
  private cachedWidth: number = 0;
  private cachedHeight: number = 0;
  private activeSpaceTheme: SpaceThemeSpec = DEFAULT_SPACE_THEME;
  private lutGeometry: PIXI.Geometry | null = null;
  private lutVariants: CompiledLutVariant[] = [];
  private lutMesh: PIXI.Mesh<PIXI.Shader> | null = null;
  private lutRenderTexture: PIXI.RenderTexture | null = null;
  private lutDisplaySprite: PIXI.Sprite | null = null;
  private lutSurface: PIXI.Sprite | null = null;
  private lutFilter: PIXI.Filter | null = null;
  private stageDirector: StageDirectorRenderer | null = null;
  private world1Director: World1SpaceDirector | null = null;
  private lutClock: number = 0;
  private stars: StarParticle[] = [];

  constructor(container: PIXI.Container, renderer?: PIXI.IRenderer) {
    this.container = container;
    this.renderer = renderer ?? null;
    this.container.addChild(this.baseGraphics);
    this.container.addChild(this.celestialGraphics);
    this.container.addChild(this.staticOverlayGraphics);
    this.container.addChild(this.gridColumnsGraphics);
    this.container.addChild(this.starContainer);

    const palette = this.activeSpaceTheme.starColors;
    for (let i = 0; i < 64; i++) {
      const seed = (i * 9301 + 49297) % 233280;
      const r1 = seed / 233280;
      const r2 = ((i * 433 + 1777) % 1000) / 1000;
      this.stars.push({
        x: r1 * 1024,
        y: 14 + r2 * 548,
        size: i % 6 === 0 ? 2.5 : i % 3 === 0 ? 1.7 : 1.15,
        speedFactor: 0.25 + (i % 5) * 0.24,
        color: palette[i % palette.length],
        alpha: 0.26 + (i % 4) * 0.16,
      });
    }

    this.initStarSprites();
    this.render();
  }

  private createStarTexture(): PIXI.Texture {
    if (typeof document === 'undefined') {
      return PIXI.Texture.WHITE;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return PIXI.Texture.WHITE;
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(8, 8, 6, 0, Math.PI * 2);
    ctx.fill();
    return PIXI.Texture.from(canvas);
  }

  private initStarSprites(): void {
    this.starTexture = this.createStarTexture();
    for (const star of this.stars) {
      const sprite = new PIXI.Sprite(this.starTexture);
      sprite.anchor.set(0.5);
      sprite.width = star.size * 2;
      sprite.height = star.size * 2;
      sprite.x = star.x;
      sprite.y = star.y;
      sprite.tint = star.color;
      sprite.alpha = star.alpha;
      this.starContainer.addChild(sprite);
      this.starSprites.push(sprite);
    }
  }

  private setNormalLayersVisible(visible: boolean): void {
    this.baseGraphics.visible = visible;
    this.celestialGraphics.visible = visible;
    this.staticOverlayGraphics.visible = visible;
    this.gridColumnsGraphics.visible = visible;
    this.starContainer.visible = visible;
    if (this.bgTilingSprite) {
      this.bgTilingSprite.visible = visible;
    }
  }

  private hasActiveLutStagePass(): boolean {
    return Boolean(this.stageDirector || this.lutMesh || (this.lutFilter && this.lutSurface));
  }

  private clearWorld1Director(): void {
    if (this.world1Director) {
      this.world1Director.destroy();
      this.world1Director = null;
    }
  }

  /**
   * Apply one of the 27 Space Sector backdrop themes (cached static WebGL geometry, 0 per-frame redraws).
   * World 1 Normal (`normal-1-1`, `normal-1-2`, `normal-1-3`) activates the cohesive multi-phase WebGL World1SpaceDirector.
   */
  public setSpaceTheme(theme?: SpaceThemeSpec | null): void {
    if (!theme || this.hasActiveLutStagePass()) return;
    const world1StageId = isWorld1NormalStage(theme.id) ? theme.id : null;
    const needsWorld1Init = world1StageId !== null && !this.world1Director;
    if (!needsWorld1Init && this.activeSpaceTheme.id === theme.id && this.cachedWidth > 0) return;
    this.activeSpaceTheme = theme;

    if (world1StageId !== null && this.renderer) {
      if (!this.world1Director) {
        try {
          this.world1Director = new World1SpaceDirector(
            this.container,
            this.renderer,
            world1StageId,
            this.cachedWidth || 1024,
            this.cachedHeight || 576
          );
          this.setNormalLayersVisible(false);
          return;
        } catch {
          this.clearWorld1Director();
        }
      } else {
        this.world1Director.setStage(world1StageId);
        this.setNormalLayersVisible(false);
        return;
      }
    } else if (this.world1Director) {
      this.clearWorld1Director();
      this.setNormalLayersVisible(true);
    }

    const palette = theme.starColors?.length ? theme.starColors : DEFAULT_SPACE_THEME.starColors;
    for (let i = 0; i < this.starSprites.length; i++) {
      const col = palette[i % palette.length];
      this.stars[i].color = col;
      this.starSprites[i].tint = col;
    }

    if (this.bgTilingSprite) {
      this.bgTilingSprite.tint = theme.nebulaA;
      this.bgTilingSprite.alpha = 0.22;
    }

    this.buildStaticLayers(this.cachedWidth || 1024, this.cachedHeight || 576);
  }

  public hasStagePreviewVariants(): boolean {
    return Boolean(this.stageDirector?.hasPreviewVariants());
  }

  public getStagePreviewVariants(): StageDirectorPreviewVariant[] {
    return this.stageDirector?.getPreviewVariants() ?? [];
  }

  public getActiveStagePreviewVariantIndex(): number {
    return this.stageDirector?.getActivePreviewVariantIndex() ?? -1;
  }

  public selectStagePreviewVariant(index: number): boolean {
    return Boolean(this.stageDirector?.selectPreviewVariant(index));
  }

  private createStagePassUniforms(
    spec: LutStagePassSpec,
    width: number,
    height: number
  ): Record<string, unknown> {
    const uniforms: Record<string, unknown> = {
      uSampler: PIXI.Texture.WHITE,
      inputSize: new Float32Array([width, height, 1 / Math.max(width, 1), 1 / Math.max(height, 1)]),
      outputFrame: new Float32Array([0, 0, width, height]),
      uTime: 0,
      uStageTime: 0,
      uScroll: 0,
      uResolution: new Float32Array([width, height]),
      uPlayerPos: new Float32Array([0.22, 0.5]),
      uBossState: new Float32Array([0, 1, 1]),
    };
    if (spec.uniforms && typeof spec.uniforms === 'object') {
      for (const [k, val] of Object.entries(spec.uniforms)) {
        uniforms[k] = Array.isArray(val) ? new Float32Array(val) : val;
      }
    }
    return uniforms;
  }

  private selectVariantShader(stageTime: number): PIXI.Shader | null {
    for (const variant of this.lutVariants) {
      if (stageTime >= variant.minStageTime && stageTime < variant.maxStageTime) {
        return variant.shader;
      }
    }
    return this.lutVariants.length > 0 ? this.lutVariants[this.lutVariants.length - 1].shader : null;
  }

  private syncShaderUniforms(
    uniforms: Record<string, any>,
    stageTime: number,
    ctx?: BackgroundFrameContext
  ): void {
    uniforms.uTime = this.lutClock;
    uniforms.uStageTime = stageTime;
    uniforms.uScroll = this.bgScrollX;
    if (uniforms.uPlayerPos) {
      uniforms.uPlayerPos[0] = Math.max(0, Math.min(1, (ctx?.playerX ?? 220) / 1024));
      uniforms.uPlayerPos[1] = Math.max(0, Math.min(1, (ctx?.playerY ?? 288) / 576));
    }
    if (uniforms.uBossState) {
      uniforms.uBossState[0] = ctx?.bossActive ? 1 : 0;
      uniforms.uBossState[1] = ctx?.bossPhase ?? 1;
      uniforms.uBossState[2] = Math.max(0, Math.min(1, ctx?.bossHpRatio ?? 1));
    }
  }

  public setTexture(texture: PIXI.Texture, width: number = 1024, height: number = 576): void {
    if (!texture || this.bgTilingSprite || this.hasActiveLutStagePass()) return;
    try {
      const tiling = new PIXI.TilingSprite(texture, width, height);
      tiling.tint = this.activeSpaceTheme.nebulaA;
      tiling.alpha = 0.22;
      this.bgTilingSprite = tiling;
      this.container.addChildAt(tiling, 1);
    } catch {
      // Fallback to procedural cosmic layers
    }
  }

  public setLutStagePass(spec?: LutStagePassSpec | null, width: number = 1024, height: number = 576): void {
    if (!spec?.spriteDirector && !spec?.fragmentSrc && !spec?.variants?.length) return;
    this.clearWorld1Director();
    this.clearLutStagePass();

    if (spec.spriteDirector && this.renderer) {
      try {
        this.stageDirector = new StageDirectorRenderer(
          this.container,
          this.renderer,
          spec.spriteDirector,
          width,
          height
        );
        this.setNormalLayersVisible(false);
        return;
      } catch {
        this.clearLutStagePass();
      }
    }

    const variantSpecs: LutStagePassVariant[] =
      Array.isArray(spec.variants) && spec.variants.length > 0
        ? spec.variants.filter((v) => typeof v?.fragmentSrc === 'string' && v.fragmentSrc.length > 0)
        : spec.fragmentSrc
          ? [{ minStageTime: -Infinity, maxStageTime: Infinity, fragmentSrc: spec.fragmentSrc }]
          : [];

    if (variantSpecs.length === 0) return;

    try {
      const geometry = new PIXI.Geometry()
        .addAttribute('aVertexPosition', [0, 0, width, 0, width, height, 0, height], 2)
        .addAttribute('aUvs', [0, 0, 1, 0, 1, 1, 0, 1], 2)
        .addIndex([0, 1, 2, 0, 2, 3]);

      const compiled: CompiledLutVariant[] = variantSpecs.map((variant) => ({
        minStageTime: typeof variant.minStageTime === 'number' ? variant.minStageTime : -Infinity,
        maxStageTime: typeof variant.maxStageTime === 'number' ? variant.maxStageTime : Infinity,
        shader: PIXI.Shader.from(
          STAGE_PASS_VERTEX_SRC,
          variant.fragmentSrc,
          this.createStagePassUniforms(spec, width, height)
        ),
      }));

      this.lutGeometry = geometry;
      this.lutVariants = compiled;
      const initialShader = this.selectVariantShader(0) ?? compiled[0].shader;
      const mesh = new PIXI.Mesh(geometry, initialShader);
      this.lutMesh = mesh;

      const canDecoupleHiDpi = Boolean(
        this.renderer &&
          this.renderer.resolution > 1.01 &&
          typeof (this.renderer as PIXI.Renderer).render === 'function'
      );

      if (canDecoupleHiDpi) {
        const rt = PIXI.RenderTexture.create({
          width,
          height,
          resolution: 1,
          scaleMode: PIXI.SCALE_MODES.LINEAR,
        });
        (this.renderer as PIXI.Renderer).render(mesh, { renderTexture: rt, clear: false });
        const sprite = new PIXI.Sprite(rt);
        sprite.width = width;
        sprite.height = height;
        this.lutRenderTexture = rt;
        this.lutDisplaySprite = sprite;
        this.container.addChild(sprite);
      } else {
        this.container.addChild(mesh);
      }

      this.setNormalLayersVisible(false);
      return;
    } catch {
      this.clearLutStagePass();
    }

    if (!spec.fragmentSrc) return;
    try {
      const uniforms = this.createStagePassUniforms(spec, width, height);
      const filter = new PIXI.Filter(undefined, spec.fragmentSrc, uniforms);
      filter.padding = 0;
      filter.multisample = PIXI.MSAA_QUALITY.NONE;

      const surface = new PIXI.Sprite(PIXI.Texture.WHITE);
      surface.width = width;
      surface.height = height;
      surface.filterArea = new PIXI.Rectangle(0, 0, width, height);
      surface.filters = [filter];

      this.lutFilter = filter;
      this.lutSurface = surface;
      this.container.addChild(surface);
      this.setNormalLayersVisible(false);
    } catch {
      this.clearLutStagePass();
    }
  }

  public clearLutStagePass(): void {
    if (this.stageDirector) {
      this.stageDirector.destroy();
      this.stageDirector = null;
    }
    if (this.lutDisplaySprite) {
      if (this.lutDisplaySprite.parent) {
        this.lutDisplaySprite.parent.removeChild(this.lutDisplaySprite);
      }
      this.lutDisplaySprite.destroy({ texture: false, baseTexture: false });
      this.lutDisplaySprite = null;
    }
    if (this.lutRenderTexture) {
      this.lutRenderTexture.destroy(true);
      this.lutRenderTexture = null;
    }
    if (this.lutMesh) {
      if (this.lutMesh.parent) {
        this.lutMesh.parent.removeChild(this.lutMesh);
      }
      this.lutMesh.destroy();
      this.lutMesh = null;
    }
    for (const variant of this.lutVariants) {
      variant.shader.destroy();
    }
    this.lutVariants = [];
    if (this.lutGeometry) {
      this.lutGeometry.destroy();
      this.lutGeometry = null;
    }

    if (this.lutSurface) {
      this.lutSurface.filters = null;
      if (this.lutSurface.parent) {
        this.lutSurface.parent.removeChild(this.lutSurface);
      }
      this.lutSurface.destroy({ texture: false, baseTexture: false });
      this.lutSurface = null;
    }
    this.lutFilter = null;

    this.setNormalLayersVisible(true);
  }

  public update(dt: number, speed?: number): void {
    this.updateWithContext(dt, { speed });
  }

  public updateWithContext(dt: number, ctx?: BackgroundFrameContext): void {
    const speed = ctx?.speed ?? this.activeSpaceTheme.scrollSpeed ?? 135;
    this.bgScrollX += speed * dt;
    this.lutClock += dt;

    if (this.stageDirector) {
      this.stageDirector.update({
        stageTime: ctx?.stageTime ?? this.lutClock,
        clockTime: this.lutClock,
        playerX: ctx?.playerX ?? 220,
        playerY: ctx?.playerY ?? 288,
      });
      return;
    }

    if (this.world1Director) {
      this.world1Director.update({
        stageTime: ctx?.stageTime ?? this.lutClock,
        clockTime: this.lutClock,
        playerX: ctx?.playerX ?? 220,
        playerY: ctx?.playerY ?? 288,
        bossActive: ctx?.bossActive,
        bossPhase: ctx?.bossPhase,
      });
      return;
    }

    if (this.lutMesh && this.lutVariants.length > 0) {
      const stageTime = ctx?.stageTime ?? this.lutClock;
      const targetShader = this.selectVariantShader(stageTime);
      if (targetShader && this.lutMesh.shader !== targetShader) {
        this.lutMesh.shader = targetShader;
      }
      this.syncShaderUniforms(this.lutMesh.shader.uniforms as Record<string, any>, stageTime, ctx);
      if (this.lutRenderTexture && this.renderer && typeof (this.renderer as PIXI.Renderer).render === 'function') {
        (this.renderer as PIXI.Renderer).render(this.lutMesh, {
          renderTexture: this.lutRenderTexture,
          clear: false,
        });
      }
      return;
    }

    if (this.lutFilter && this.lutSurface) {
      const stageTime = ctx?.stageTime ?? this.lutClock;
      this.syncShaderUniforms(this.lutFilter.uniforms as Record<string, any>, stageTime, ctx);
      return;
    }

    if (this.bgTilingSprite) {
      this.bgTilingSprite.tilePosition.x = -this.bgScrollX * 0.48;
      this.bgTilingSprite.tilePosition.y = Math.sin(this.bgScrollX * 0.0018) * 14;
    }
    this.celestialGraphics.y = Math.sin(this.lutClock * 0.45) * 6;
    this.updateNormalLayerPositions();
  }

  public destroy(): void {
    this.clearWorld1Director();
    this.clearLutStagePass();
    this.starSprites = [];
    if (this.starTexture && this.starTexture !== PIXI.Texture.WHITE) {
      this.starTexture.destroy(true);
    }
    this.starTexture = null;
  }

  private drawCelestialLandmark(g: PIXI.Graphics, theme: SpaceThemeSpec, width: number, height: number): void {
    g.clear();
    const cx = width * 0.72;
    const cy = height * 0.48;
    const acc = theme.accentColor;
    const nebA = theme.nebulaA;
    const nebB = theme.nebulaB;

    switch (theme.feature) {
      case 'planet_ring': {
        g.beginFill(nebA, 0.72);
        g.drawCircle(cx, cy, 128);
        g.endFill();
        g.lineStyle(3, acc, 0.55);
        g.drawCircle(cx, cy, 128);
        g.lineStyle(7, acc, 0.34);
        g.drawEllipse(cx, cy + 8, 235, 44);
        g.lineStyle(2, 0xffffff, 0.42);
        g.drawEllipse(cx, cy + 8, 205, 36);
        break;
      }
      case 'debris_belt': {
        for (let i = 0; i < 18; i++) {
          const rx = 180 + ((i * 53) % 780);
          const ry = 70 + ((i * 89) % 430);
          const sz = 8 + (i % 4) * 7;
          g.beginFill(i % 2 === 0 ? nebB : nebA, 0.6);
          g.drawPolygon([rx - sz, ry, rx, ry - sz * 0.7, rx + sz, ry + 3, rx - 2, ry + sz * 0.8]);
          g.endFill();
          g.lineStyle(1.2, acc, 0.38);
          g.drawCircle(rx, ry, sz * 0.5);
          g.lineStyle(0);
        }
        break;
      }
      case 'lunar_halo': {
        g.lineStyle(2.5, acc, 0.35);
        g.drawCircle(cx + 30, cy - 20, 165);
        g.beginFill(0xcbd5e1, 0.22);
        g.drawCircle(cx + 30, cy - 20, 118);
        g.endFill();
        g.beginFill(theme.skyTop, 0.86);
        g.drawCircle(cx + 68, cy - 34, 108);
        g.endFill();
        break;
      }
      case 'solar_corona':
      case 'eclipse_gate': {
        const isEclipse = theme.feature === 'eclipse_gate';
        g.beginFill(acc, 0.18);
        g.drawCircle(cx + 60, cy, 195);
        g.endFill();
        g.beginFill(nebB, 0.42);
        g.drawCircle(cx + 60, cy, 142);
        g.endFill();
        if (isEclipse) {
          g.beginFill(0x060208, 0.92);
          g.drawCircle(cx + 60, cy, 106);
          g.endFill();
        }
        g.lineStyle(3.5, acc, 0.75);
        g.drawCircle(cx + 60, cy, 110);
        break;
      }
      case 'dyson_grid':
      case 'crystal_spire':
      case 'gamma_cathedral': {
        for (let r = 1; r <= 3; r++) {
          g.lineStyle(2, r % 2 === 0 ? acc : nebB, 0.38);
          const pts: number[] = [];
          const sides = theme.feature === 'gamma_cathedral' ? 8 : 6;
          const rad = r * 68;
          for (let k = 0; k <= sides; k++) {
            const a = (Math.PI * 2 * k) / sides;
            pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
          }
          g.drawPolygon(pts);
        }
        break;
      }
      case 'pulsar_beams':
      case 'quasar_jet': {
        g.beginFill(acc, 0.16);
        g.drawPolygon([cx, cy, cx - 540, cy - 165, cx - 540, cy - 55]);
        g.drawPolygon([cx, cy, cx + 290, cy + 55, cx + 290, cy + 165]);
        g.endFill();
        g.beginFill(0xffffff, 0.72);
        g.drawCircle(cx, cy, 22);
        g.endFill();
        g.lineStyle(3, acc, 0.65);
        g.drawCircle(cx, cy, 48);
        break;
      }
      case 'aurora_curtain':
      case 'shock_filament':
      case 'ion_nebula': {
        for (let band = 0; band < 5; band++) {
          g.lineStyle(12 - band * 1.8, band % 2 === 0 ? acc : nebB, 0.2);
          g.moveTo(0, 95 + band * 88);
          for (let x = 64; x <= width; x += 64) {
            g.lineTo(x, 95 + band * 88 + Math.sin(x * 0.009 + band) * 42);
          }
        }
        break;
      }
      case 'accretion_disk':
      case 'photon_ring':
      case 'zero_point':
      case 'eternity_horizon': {
        for (let r = 4; r >= 1; r--) {
          g.lineStyle(r * 2.2, r % 2 === 0 ? acc : nebB, 0.28);
          g.drawEllipse(cx, cy, r * 62, r * 24);
        }
        g.beginFill(0x030208, 0.95);
        g.drawCircle(cx, cy, 46);
        g.endFill();
        g.lineStyle(2.5, 0xffffff, 0.78);
        g.drawCircle(cx, cy, 48);
        break;
      }
      case 'galaxy_clash':
      case 'binary_stars': {
        for (const [ox, oy, col] of [[-75, -55, acc], [85, 65, nebB]] as Array<[number, number, number]>) {
          g.beginFill(col, 0.22);
          g.drawCircle(cx + ox, cy + oy, 76);
          g.endFill();
          g.beginFill(0xffffff, 0.7);
          g.drawCircle(cx + ox, cy + oy, 18);
          g.endFill();
          g.lineStyle(2, col, 0.48);
          g.drawEllipse(cx + ox, cy + oy, 128, 44);
        }
        break;
      }
      default: {
        for (let r = 1; r <= 4; r++) {
          g.lineStyle(2, r % 2 === 0 ? acc : nebA, 0.34);
          g.drawCircle(cx, cy, r * 46);
        }
        g.beginFill(acc, 0.22);
        g.drawCircle(cx, cy, 34);
        g.endFill();
        break;
      }
    }
  }

  private buildStaticLayers(width: number, height: number): void {
    this.cachedWidth = width;
    this.cachedHeight = height;
    const theme = this.activeSpaceTheme;

    this.baseGraphics.clear();
    this.baseGraphics.beginFill(theme.skyTop);
    this.baseGraphics.drawRect(0, 0, width, height);
    this.baseGraphics.endFill();

    this.baseGraphics.beginFill(theme.skyBottom, 0.75);
    this.baseGraphics.drawRect(0, height * 0.42, width, height * 0.58);
    this.baseGraphics.endFill();

    // Multi-band cosmic nebula washes
    this.baseGraphics.beginFill(theme.nebulaA, 0.46);
    this.baseGraphics.drawRect(0, height * 0.14, width, height * 0.68);
    this.baseGraphics.endFill();

    this.baseGraphics.beginFill(theme.nebulaB, 0.32);
    this.baseGraphics.drawRect(0, height * 0.3, width, height * 0.38);
    this.baseGraphics.endFill();

    this.drawCelestialLandmark(this.celestialGraphics, theme, width, height);

    this.staticOverlayGraphics.clear();
    this.staticOverlayGraphics.lineStyle(1, theme.gridColor, 0.36);
    for (let y = 48; y < height; y += 64) {
      this.staticOverlayGraphics.moveTo(0, y);
      this.staticOverlayGraphics.lineTo(width, y);
    }
    this.staticOverlayGraphics.lineStyle(1, theme.accentColor, 0.18);
    this.staticOverlayGraphics.moveTo(250, 0);
    this.staticOverlayGraphics.lineTo(250, height);

    this.gridColumnsGraphics.clear();
    this.gridColumnsGraphics.lineStyle(1, theme.gridColor, 0.34);
    for (let x = -64; x <= width + 64; x += 64) {
      this.gridColumnsGraphics.moveTo(x, 0);
      this.gridColumnsGraphics.lineTo(x, height);
    }
  }

  private updateNormalLayerPositions(width: number = this.cachedWidth || 1024): void {
    const offsetX = ((this.bgScrollX % 64) + 64) % 64;
    this.gridColumnsGraphics.x = -offsetX;

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      const sprite = this.starSprites[i];
      if (sprite) {
        sprite.x = (((star.x - this.bgScrollX * star.speedFactor) % width) + width) % width;
      }
    }
  }

  public render(width: number = 1024, height: number = 576): void {
    if (this.cachedWidth !== width || this.cachedHeight !== height) {
      this.buildStaticLayers(width, height);
    }
    this.updateNormalLayerPositions(width);
  }
}

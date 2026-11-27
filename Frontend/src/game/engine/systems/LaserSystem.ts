import * as PIXI from 'pixi.js';
import type { LaserBeam, Bullet, WallBarrier } from '../types';
import type { ParticleSystem } from './ParticleSystem';
import {
  renderCharging,
  renderFading,
  renderFiring,
  renderClashVortex,
  type LaserRenderLayers,
} from './laser/LaserVisuals';
import { clearEnemyBulletsInPlayerBeam, getBossHitDamage, shouldHitPlayer } from './laser/LaserCombat';

function createBeamGlowTexture(): PIXI.Texture {
  if (typeof document === 'undefined') return PIXI.Texture.WHITE;
  const w = 16;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return PIXI.Texture.WHITE;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
  grad.addColorStop(0.18, 'rgba(255, 255, 255, 0.14)');
  grad.addColorStop(0.36, 'rgba(255, 255, 255, 0.56)');
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.64, 'rgba(255, 255, 255, 0.56)');
  grad.addColorStop(0.82, 'rgba(255, 255, 255, 0.14)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  return PIXI.Texture.from(canvas);
}

function createMuzzleFlareTexture(): PIXI.Texture {
  if (typeof document === 'undefined') return PIXI.Texture.WHITE;
  const size = 128;
  const half = size * 0.5;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return PIXI.Texture.WHITE;

  const radial = ctx.createRadialGradient(half, half, 0, half, half, half);
  radial.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  radial.addColorStop(0.18, 'rgba(255, 255, 255, 0.82)');
  radial.addColorStop(0.45, 'rgba(255, 255, 255, 0.28)');
  radial.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, size, size);

  // Crisp 4-point anamorphic starburst rays
  ctx.save();
  ctx.translate(half, half);
  for (let i = 0; i < 2; i++) {
    ctx.rotate((Math.PI / 2) * i);
    const ray = ctx.createLinearGradient(-half, 0, half, 0);
    ray.addColorStop(0.0, 'rgba(255,255,255,0)');
    ray.addColorStop(0.38, 'rgba(255,255,255,0.28)');
    ray.addColorStop(0.5, 'rgba(255,255,255,0.92)');
    ray.addColorStop(0.62, 'rgba(255,255,255,0.28)');
    ray.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = ray;
    ctx.fillRect(-half, -2.5, size, 5);
  }
  ctx.restore();

  return PIXI.Texture.from(canvas);
}

export class LaserSystem {
  public lasers: LaserBeam[] = [];
  private wasEmpty: boolean = true;

  private beamGlowTex: PIXI.Texture;
  private muzzleFlareTex: PIXI.Texture;
  private glowSpriteContainer = new PIXI.Container();
  private glowGraphics = new PIXI.Graphics();
  private beamSpritePool: PIXI.Sprite[] = [];
  private flareSpritePool: PIXI.Sprite[] = [];
  private usedBeamSprites = 0;
  private usedFlareSprites = 0;
  private seenLaserStates = new Map<string, string>();

  constructor() {
    this.beamGlowTex = createBeamGlowTexture();
    this.muzzleFlareTex = createMuzzleFlareTexture();
    this.glowGraphics.blendMode = PIXI.BLEND_MODES.ADD;
  }

  private ensureLayersAttached(hostGraphics: PIXI.Graphics): void {
    if (this.glowSpriteContainer.parent !== hostGraphics) {
      hostGraphics.addChild(this.glowSpriteContainer);
      hostGraphics.addChild(this.glowGraphics);
    }
  }

  private resetGlowSprites(): void {
    for (let i = 0; i < this.usedBeamSprites; i++) {
      this.beamSpritePool[i].visible = false;
    }
    for (let i = 0; i < this.usedFlareSprites; i++) {
      this.flareSpritePool[i].visible = false;
    }
    this.usedBeamSprites = 0;
    this.usedFlareSprites = 0;
  }

  private createRenderLayers(baseGraphics: PIXI.Graphics): LaserRenderLayers {
    return {
      baseGraphics,
      glowGraphics: this.glowGraphics,
      addBeamGlowSprite: (x, y, length, height, tint, alpha, anchorX = 0) => {
        let sprite = this.beamSpritePool[this.usedBeamSprites];
        if (!sprite) {
          sprite = new PIXI.Sprite(this.beamGlowTex);
          sprite.blendMode = PIXI.BLEND_MODES.ADD;
          this.beamSpritePool.push(sprite);
          this.glowSpriteContainer.addChild(sprite);
        }
        sprite.anchor.set(anchorX, 0.5);
        sprite.position.set(x, y);
        sprite.width = Math.max(4, length);
        sprite.height = Math.max(4, height);
        sprite.tint = tint;
        sprite.alpha = Math.max(0, Math.min(1, alpha));
        sprite.visible = true;
        this.usedBeamSprites++;
      },
      addMuzzleFlareSprite: (x, y, scaleX, scaleY, tint, alpha, rotation = 0) => {
        let sprite = this.flareSpritePool[this.usedFlareSprites];
        if (!sprite) {
          sprite = new PIXI.Sprite(this.muzzleFlareTex);
          sprite.anchor.set(0.5);
          sprite.blendMode = PIXI.BLEND_MODES.ADD;
          this.flareSpritePool.push(sprite);
          this.glowSpriteContainer.addChild(sprite);
        }
        sprite.position.set(x, y);
        sprite.scale.set(scaleX, scaleY);
        sprite.rotation = rotation;
        sprite.tint = tint;
        sprite.alpha = Math.max(0, Math.min(1, alpha));
        sprite.visible = true;
        this.usedFlareSprites++;
      },
    };
  }

  public spawnLaser(
    sourceX: number,
    sourceY: number,
    targetY: number,
    options: Partial<LaserBeam> = {}
  ): LaserBeam {
    const laser: LaserBeam = {
      id: options.id || `laser-${Date.now()}-${Math.random()}`,
      ownerId: options.ownerId || 'boss',
      direction: options.direction || 'left',
      sourceX,
      sourceY,
      targetY,
      state: 'charging',
      timer: 0,
      chargeDuration: options.chargeDuration ?? 0.7,
      fireDuration: options.fireDuration ?? 1.0,
      fadeDuration: options.fadeDuration ?? 0.3,
      maxWidth: options.maxWidth ?? 34,
      currentWidth: 0,
      alpha: 1.0,
      color: options.color ?? 0xff2b5b,
      podType: options.podType ?? 'top',
    };
    this.lasers.push(laser);
    return laser;
  }

  public update(
    dt: number,
    animTimer: number,
    graphics: PIXI.Graphics,
    bullets: Bullet[],
    walls: WallBarrier[],
    playerPos: { x: number; y: number },
    bossPos: { x: number; y: number; hp: number },
    particleSystem?: ParticleSystem,
    callbacks?: {
      onPlayerHit?: () => void;
      onBossHit?: (dmg: number) => void;
      onShake?: (intensity: number) => void;
      onSound?: (soundPath: string, volume: number) => void;
      onClashActive?: (clashX: number, clashY: number) => void;
      resolveOwnerPos?: (ownerId: string) => { x: number; y: number } | null;
    },
    struggleState?: {
      active: boolean;
      isAligning?: boolean;
      balance: number; // 0 a 100
      clashX: number;
      clashY: number;
      playerTipX?: number;
      bossTipX?: number;
      vortexX?: number;
      vortexY?: number;
      winner: 'player' | 'boss' | null;
      resolutionTimer?: number;
    }
  ): void {
    this.ensureLayersAttached(graphics);

    if (this.lasers.length === 0) {
      if (!this.wasEmpty) {
        graphics.clear();
        this.glowGraphics.clear();
        this.resetGlowSprites();
        this.seenLaserStates.clear();
        this.wasEmpty = true;
      }
      return;
    }
    this.wasEmpty = false;
    graphics.clear();
    this.glowGraphics.clear();
    this.resetGlowSprites();

    const layers = this.createRenderLayers(graphics);

    // 1. Detectar si hay Choque de Rayos (Beam Struggle)
    const playerLaser = this.lasers.find((l) => l.ownerId !== 'boss');
    const bossMegaLaser = this.lasers.find((l) => l.ownerId === 'boss' && (l.isMegaBeam || l.maxWidth >= 68));
    const isAligning = !!(struggleState?.isAligning && playerLaser && bossMegaLaser);
    const isClashing = !!(struggleState?.active && playerLaser && bossMegaLaser);
    const isStruggleOngoing = isAligning || isClashing;

    const isSpellcardCharging = !isStruggleOngoing && this.lasers.some((l) => l.ownerId !== 'boss' && l.state === 'charging');

    const currentClashX = struggleState ? struggleState.clashX : 512;
    const currentClashY = struggleState?.clashY ?? 288;

    if (isClashing && callbacks?.onClashActive) {
      callbacks.onClashActive(currentClashX, currentClashY);
    }

    const resolvedBossPos = {
      x: (bossPos as any).pos?.x ?? bossPos.x,
      y: (bossPos as any).pos?.y ?? bossPos.y,
      hp: bossPos.hp,
    };

    const activeIds = new Set<string>();

    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const laser = this.lasers[i];
      activeIds.add(laser.id);
      const isRightward = laser.direction === 'right';
      const isMasterSpark = laser.ownerId !== 'boss';
      const isBossMegaStyle = laser.ownerId === 'boss' && (laser.isMegaBeam || (laser.color === 0xffdd00 && laser.maxWidth >= 68));
      let endX = isRightward ? 1040 : -16;

      // Trigger charge/fire SFX + screen shake reliably on backend state transitions
      const prevState = this.seenLaserStates.get(laser.id);
      if (prevState !== laser.state) {
        this.seenLaserStates.set(laser.id, laser.state);
        if (laser.state === 'charging' && isMasterSpark) {
          callbacks?.onSound?.('/assets/sounds/masterspark_charge.wav', 0.85);
        } else if (laser.state === 'firing') {
          callbacks?.onShake?.(isMasterSpark ? 0.65 : isBossMegaStyle ? 0.8 : 0.25);
          callbacks?.onSound?.(
            isMasterSpark ? '/assets/sounds/masterspark_fire.wav' : '/assets/sounds/gasterfire.wav',
            isMasterSpark ? 0.95 : 0.8
          );
        }
      }

      // El Master Spark sigue la posición de SU dueño (local o compañero en multijugador)
      if (isMasterSpark) {
        const ownerPos = (laser.ownerId ? callbacks?.resolveOwnerPos?.(laser.ownerId) : undefined) ?? playerPos;
        laser.sourceX = ownerPos.x + 22;
        laser.sourceY = ownerPos.y;
        laser.targetY = ownerPos.y;

        if (struggleState?.winner === 'player') {
          endX = 1040;
          laser.state = 'firing';
        } else if (struggleState?.winner === 'boss') {
          this.lasers.splice(i, 1);
          continue;
        } else if (isClashing) {
          endX = currentClashX;
          laser.state = 'firing';
        } else if (isAligning) {
          endX = struggleState.playerTipX ?? currentClashX;
          laser.state = 'firing';
        }
      }

      // El Mega Láser del jefe sigue la posición del jefe durante la alineación y choque
      if (isBossMegaStyle) {
        laser.sourceX = resolvedBossPos.x;
        laser.sourceY = resolvedBossPos.y;
        laser.targetY = resolvedBossPos.y;

        if (struggleState?.winner === 'boss') {
          endX = -20;
          laser.state = 'firing';
        } else if (struggleState?.winner === 'player') {
          this.lasers.splice(i, 1);
          continue;
        } else if (isClashing) {
          endX = currentClashX;
          laser.state = 'firing';
        } else if (isAligning) {
          endX = struggleState.bossTipX ?? currentClashX;
          laser.state = 'firing';
        }
      }

      const effectiveDt = isSpellcardCharging && !isMasterSpark ? 0 : dt;
      laser.timer += effectiveDt;

      // ── 1. ESTADO: CARGANDO ───────────────────────────────────────────────
      if (laser.state === 'charging') {
        renderCharging(layers, laser, endX, animTimer, isMasterSpark, isBossMegaStyle, particleSystem);

        if (laser.timer >= laser.chargeDuration) {
          laser.state = 'firing';
          laser.timer = 0;
          laser.currentWidth = laser.maxWidth;
          this.seenLaserStates.set(laser.id, 'firing');
          callbacks?.onShake?.(isMasterSpark ? 0.65 : isBossMegaStyle ? 0.8 : 0.25);
          callbacks?.onSound?.(
            isMasterSpark ? '/assets/sounds/masterspark_fire.wav' : '/assets/sounds/gasterfire.wav',
            isMasterSpark ? 0.95 : 0.8
          );
        }
      }

      // ── 2. ESTADO: DISPARANDO ─────────────────────────────────────────────
      else if (laser.state === 'firing') {
        let pulseWidth = isMasterSpark
          ? Math.max(76, laser.maxWidth * 1.18) + Math.sin(animTimer * 44) * 7
          : isBossMegaStyle
            ? Math.max(84, laser.maxWidth * 1.15) + Math.sin(animTimer * 40) * 8
            : Math.max(16, laser.maxWidth) + Math.sin(animTimer * 36) * 2.5;

        if (isStruggleOngoing && (isMasterSpark || isBossMegaStyle)) {
          pulseWidth = 115 + Math.sin(animTimer * 40) * 8;
        }

        if (struggleState?.winner === 'player' && isMasterSpark) {
          pulseWidth = 230 + Math.sin(animTimer * 30) * 12;
        } else if (struggleState?.winner === 'boss' && isBossMegaStyle) {
          pulseWidth = 230 + Math.sin(animTimer * 30) * 12;
        }

        if (struggleState?.winner && struggleState.resolutionTimer !== undefined && struggleState.resolutionTimer < 0.4) {
          const fadeRatio = Math.max(0, struggleState.resolutionTimer / 0.4);
          pulseWidth *= fadeRatio;
        }

        renderFiring(layers, laser, endX, pulseWidth, animTimer, isMasterSpark, isBossMegaStyle, particleSystem);

        if (isMasterSpark) {
          clearEnemyBulletsInPlayerBeam(laser, bullets, endX, pulseWidth);
        }

        if (shouldHitPlayer(laser, playerPos, pulseWidth, isClashing, effectiveDt, isStruggleOngoing, endX)) {
          callbacks?.onPlayerHit?.();
        }

        const bossDamage = getBossHitDamage(laser, resolvedBossPos, pulseWidth, dt, isClashing);
        if (bossDamage > 0) {
          callbacks?.onBossHit?.(bossDamage);
        }

        if (laser.timer >= laser.fireDuration && !isClashing) {
          laser.state = 'fading';
          laser.timer = 0;
        }
      }

      // ── 3. ESTADO: DESVANECIENDO ─────────────────────────────────────────
      else if (laser.state === 'fading') {
        const fadeProgress = Math.min(1, laser.timer / Math.max(0.05, laser.fadeDuration));
        laser.alpha = 1 - fadeProgress;
        laser.currentWidth = Math.max(laser.maxWidth, isMasterSpark ? 76 : laser.maxWidth) * (1 + fadeProgress * 0.45);
        renderFading(layers, laser, endX, isMasterSpark, isBossMegaStyle);

        if (laser.timer >= laser.fadeDuration) {
          this.lasers.splice(i, 1);
        }
      }
    }

    for (const seenId of [...this.seenLaserStates.keys()]) {
      if (!activeIds.has(seenId)) {
        this.seenLaserStates.delete(seenId);
      }
    }

    // ── 4. RENDERIZADO DEL VÓRTICE DE CHOQUE (CLASH VORTEX) ───────────────────
    if (isStruggleOngoing && !struggleState?.winner) {
      const vX = struggleState?.vortexX ?? currentClashX;
      const vY = struggleState?.vortexY ?? currentClashY;
      renderClashVortex(layers, vX, vY, animTimer, particleSystem);
    }
  }

  public clear(): void {
    this.lasers = [];
    this.seenLaserStates.clear();
    this.glowGraphics.clear();
    this.resetGlowSprites();
  }

  public destroy(): void {
    this.clear();
    if (this.beamGlowTex !== PIXI.Texture.WHITE) this.beamGlowTex.destroy(true);
    if (this.muzzleFlareTex !== PIXI.Texture.WHITE) this.muzzleFlareTex.destroy(true);
  }
}

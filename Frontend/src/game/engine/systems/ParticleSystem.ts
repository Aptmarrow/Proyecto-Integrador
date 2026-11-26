import * as PIXI from 'pixi.js';
import type { SparkParticle } from '../types';

const MAX_PARTICLES = 180;

function createSparkDotTexture(): PIXI.Texture {
  if (typeof document === 'undefined') return PIXI.Texture.WHITE;
  const size = 32;
  const half = size * 0.5;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return PIXI.Texture.WHITE;

  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.82)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.fill();
  return PIXI.Texture.from(canvas);
}

function createSparkStarTexture(): PIXI.Texture {
  if (typeof document === 'undefined') return PIXI.Texture.WHITE;
  const size = 32;
  const half = size * 0.5;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return PIXI.Texture.WHITE;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(2, half);
  ctx.lineTo(size - 2, half);
  ctx.moveTo(half, 2);
  ctx.lineTo(half, size - 2);
  ctx.stroke();

  const core = ctx.createRadialGradient(half, half, 0, half, half, 7);
  core.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  core.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(half, half, 7, 0, Math.PI * 2);
  ctx.fill();

  return PIXI.Texture.from(canvas);
}

export class ParticleSystem {
  public particles: SparkParticle[] = [];
  private spriteContainer = new PIXI.Container();
  private spritePool: PIXI.Sprite[] = [];
  private sparkDotTex: PIXI.Texture;
  private sparkStarTex: PIXI.Texture;

  constructor() {
    this.sparkDotTex = createSparkDotTexture();
    this.sparkStarTex = createSparkStarTexture();
  }

  public spawnSpark(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: number,
    size: number,
    maxLife: number,
    isStar: boolean = false
  ): void {
    if (this.particles.length >= MAX_PARTICLES) {
      // Recycle oldest slot in place to bound GPU & GC cost during intense bursts
      const p = this.particles[0];
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.size = size;
      p.color = color;
      p.alpha = 1.0;
      p.life = maxLife;
      p.maxLife = maxLife;
      p.isStar = isStar;
      return;
    }
    this.particles.push({
      x,
      y,
      vx,
      vy,
      size,
      color,
      alpha: 1.0,
      life: maxLife,
      maxLife,
      isStar,
    });
  }

  public spawnBurst(x: number, y: number, count: number, speed: number, colors: number[], isStar: boolean = true): void {
    const capped = Math.min(count, 24);
    for (let i = 0; i < capped; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.5 + Math.random() * 0.8);
      const color = colors[Math.floor(Math.random() * colors.length)];
      this.spawnSpark(
        x + (Math.random() - 0.5) * 12,
        y + (Math.random() - 0.5) * 12,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd,
        color,
        3 + Math.random() * 3,
        0.25 + Math.random() * 0.2,
        isStar
      );
    }
  }

  public update(dt: number, graphics: PIXI.Graphics): void {
    if (this.spriteContainer.parent !== graphics) {
      graphics.clear();
      graphics.addChild(this.spriteContainer);
    }

    let sIdx = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      if (p.life <= 0) {
        const last = this.particles.pop()!;
        if (i < this.particles.length) this.particles[i] = last;
        continue;
      }

      p.alpha = p.life / p.maxLife;
      let sprite = this.spritePool[sIdx];
      if (!sprite) {
        sprite = new PIXI.Sprite(this.sparkDotTex);
        sprite.anchor.set(0.5);
        sprite.blendMode = PIXI.BLEND_MODES.ADD;
        this.spritePool.push(sprite);
        this.spriteContainer.addChild(sprite);
      }

      const targetTex = p.isStar ? this.sparkStarTex : this.sparkDotTex;
      if (sprite.texture !== targetTex) {
        sprite.texture = targetTex;
      }

      const scale = (p.isStar ? Math.max(6, p.size * p.alpha * 4.2) : Math.max(4, p.size * 2.4)) / 32;
      sprite.position.set(p.x, p.y);
      sprite.scale.set(scale);
      sprite.tint = p.color;
      sprite.alpha = p.alpha;
      sprite.visible = true;
      sIdx++;
    }

    for (let i = sIdx; i < this.spritePool.length; i++) {
      const s = this.spritePool[i];
      if (!s.visible) break;
      s.visible = false;
    }
  }

  public clear(): void {
    this.particles.length = 0;
    for (let i = 0; i < this.spritePool.length; i++) {
      this.spritePool[i].visible = false;
    }
  }

  public destroy(): void {
    this.clear();
    if (this.sparkDotTex !== PIXI.Texture.WHITE) this.sparkDotTex.destroy(true);
    if (this.sparkStarTex !== PIXI.Texture.WHITE) this.sparkStarTex.destroy(true);
  }
}

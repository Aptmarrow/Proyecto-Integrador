import * as PIXI from 'pixi.js';
import type { ItemDrop, ItemType } from '../types';
import type { ParticleSystem } from './ParticleSystem';
import type { ServerItem } from '../../network/wsClient';

function createItemBadgeTexture(kind: 'power' | 'point' | 'star'): PIXI.Texture {
  if (typeof document === 'undefined') return PIXI.Texture.WHITE;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return PIXI.Texture.WHITE;

  const cx = size * 0.5;
  const cy = size * 0.5;

  if (kind === 'star') {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
    return PIXI.Texture.from(canvas);
  }

  ctx.fillStyle = kind === 'power' ? '#ff2b5b' : '#00a8ff';
  const r = 4;
  const x = 6;
  const y = 6;
  const w = 20;
  const h = 20;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  if (kind === 'power') {
    ctx.fillRect(cx - 3.5, cy - 5, 2.4, 10);
    ctx.beginPath();
    ctx.arc(cx + 0.5, cy - 2, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4.5);
    ctx.lineTo(cx + 4.5, cy);
    ctx.lineTo(cx, cy + 4.5);
    ctx.lineTo(cx - 4.5, cy);
    ctx.closePath();
    ctx.fill();
  }

  return PIXI.Texture.from(canvas);
}

export class ItemSystem {
  public items: ItemDrop[] = [];
  public graphics: PIXI.Graphics;
  private spriteContainer = new PIXI.Container();
  private spritePool: PIXI.Sprite[] = [];
  private textures: Record<'power' | 'point' | 'star', PIXI.Texture>;

  constructor(parentContainer?: PIXI.Container) {
    this.graphics = new PIXI.Graphics();
    this.textures = {
      power: createItemBadgeTexture('power'),
      point: createItemBadgeTexture('point'),
      star: createItemBadgeTexture('star'),
    };
    this.graphics.addChild(this.spriteContainer);
    if (parentContainer) {
      parentContainer.addChild(this.graphics);
    }
  }

  public applyBackendItems(serverItems: ServerItem[], scaleX: number, scaleY: number): void {
    const len = serverItems.length;
    this.items.length = len;
    for (let i = 0; i < len; i++) {
      const it = serverItems[i];
      const existing = this.items[i];
      if (existing) {
        existing.id = it.id;
        existing.x = it.x * scaleX;
        existing.y = it.y * scaleY;
        existing.type = it.type as ItemType;
        existing.value = it.type === 'power' ? 5 : it.type === 'point' ? 1000 : 5000;
      } else {
        this.items[i] = {
          id: it.id,
          x: it.x * scaleX,
          y: it.y * scaleY,
          vx: 0,
          vy: 0,
          type: it.type as ItemType,
          value: it.type === 'power' ? 5 : it.type === 'point' ? 1000 : 5000,
          magnetized: false,
        };
      }
    }
  }

  public spawnItem(x: number, y: number, type: ItemType = 'power'): ItemDrop {
    const item: ItemDrop = {
      id: `item_${Math.random().toString(36).slice(2, 11)}`,
      x,
      y,
      vx: (Math.random() - 0.5) * 60 - 30,
      vy: -150 - Math.random() * 80,
      type,
      value: type === 'power' ? 5 : type === 'point' ? 1000 : 5000,
      magnetized: false,
    };
    this.items.push(item);
    return item;
  }

  public spawnItemFountain(x: number, y: number, count: number = 6): void {
    for (let i = 0; i < count; i++) {
      const type: ItemType = i % 2 === 0 ? 'power' : 'point';
      this.spawnItem(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, type);
    }
  }

  public update(
    dt: number,
    animTimer: number,
    playerPos: { x: number; y: number },
    isFocus: boolean,
    particleSystem?: ParticleSystem,
    onCollected?: (type: ItemType, value: number) => void
  ): void {
    const isAtPoC = playerPos.x < 250;
    const focusRadSq = 240 * 240;
    const nearRadSq = 90 * 90;
    const collectRadSq = 24 * 24;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const dx = playerPos.x - it.x;
      const dy = playerPos.y - it.y;
      const distSq = dx * dx + dy * dy;

      if (isAtPoC || (isFocus && distSq < focusRadSq) || distSq < nearRadSq) {
        it.magnetized = true;
      }

      if (it.magnetized) {
        const dist = Math.sqrt(distSq) || 1;
        const magnetSpeed = 620;
        it.x += (dx / dist) * magnetSpeed * dt;
        it.y += (dy / dist) * magnetSpeed * dt;
      } else {
        it.vy = Math.min(180, it.vy + 380 * dt);
        it.x += it.vx * dt;
        it.y += it.vy * dt;
      }

      if (distSq < collectRadSq) {
        if (onCollected) onCollected(it.type, it.value);
        if (particleSystem) {
          const color = it.type === 'power' ? 0xff2b5b : it.type === 'point' ? 0x00f2fe : 0xffdd00;
          for (let p = 0; p < 5; p++) {
            particleSystem.spawnSpark(
              it.x,
              it.y,
              (Math.random() - 0.5) * 120,
              (Math.random() - 0.5) * 120,
              color,
              3,
              0.22,
              true
            );
          }
        }
        const last = this.items.pop()!;
        if (i < this.items.length) this.items[i] = last;
        continue;
      }

      if (it.y > 620 || it.x < -40) {
        const last = this.items.pop()!;
        if (i < this.items.length) this.items[i] = last;
      }
    }

    this.render(animTimer);
  }

  public render(animTimer: number): void {
    const pulseScale = 0.88 + Math.sin(animTimer * 10) * 0.08;
    const len = this.items.length;

    for (let i = 0; i < len; i++) {
      const it = this.items[i];
      let sprite = this.spritePool[i];
      if (!sprite) {
        sprite = new PIXI.Sprite(this.textures.power);
        sprite.anchor.set(0.5);
        this.spritePool.push(sprite);
        this.spriteContainer.addChild(sprite);
      }
      const tex =
        it.type === 'power' ? this.textures.power : it.type === 'point' ? this.textures.point : this.textures.star;
      if (sprite.texture !== tex) sprite.texture = tex;
      sprite.position.set(it.x, it.y);
      sprite.scale.set(pulseScale);
      sprite.visible = true;
    }

    for (let i = len; i < this.spritePool.length; i++) {
      const s = this.spritePool[i];
      if (!s.visible) break;
      s.visible = false;
    }
  }

  public clear(): void {
    this.items.length = 0;
    for (let i = 0; i < this.spritePool.length; i++) {
      this.spritePool[i].visible = false;
    }
  }

  public destroy(): void {
    this.clear();
    if (this.textures.power !== PIXI.Texture.WHITE) this.textures.power.destroy(true);
    if (this.textures.point !== PIXI.Texture.WHITE) this.textures.point.destroy(true);
    if (this.textures.star !== PIXI.Texture.WHITE) this.textures.star.destroy(true);
  }
}

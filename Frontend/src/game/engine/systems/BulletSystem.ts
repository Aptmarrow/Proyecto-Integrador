import * as PIXI from 'pixi.js';
import type { Bullet } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, OFFSCREEN_MARGIN } from '../physics/RenderConstants';

function createEnemyOrbOuterTexture(): PIXI.Texture {
  if (typeof document === 'undefined') return PIXI.Texture.WHITE;
  const size = 48;
  const half = size * 0.5;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return PIXI.Texture.WHITE;

  // Soft outer aura (radius ~1.42x normalized inside half=24 -> core radius ~16px)
  const outerGrad = ctx.createRadialGradient(half, half, 10, half, half, half);
  outerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
  outerGrad.addColorStop(0.64, 'rgba(255, 255, 255, 0.92)');
  outerGrad.addColorStop(0.72, 'rgba(255, 255, 255, 0.34)');
  outerGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.fill();

  return PIXI.Texture.from(canvas);
}

function createEnemyOrbCoreTexture(): PIXI.Texture {
  if (typeof document === 'undefined') return PIXI.Texture.WHITE;
  const size = 24;
  const half = size * 0.5;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return PIXI.Texture.WHITE;

  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.fill();

  return PIXI.Texture.from(canvas);
}

function normalizeBulletTypeKey(bulletType?: string): 'dps' | 'special_attack' | 'tank' | 'support' {
  if (!bulletType || bulletType === 'dps' || bulletType === 'attack' || bulletType === 'physical') return 'dps';
  if (bulletType === 'tank' || bulletType === 'defense') return 'tank';
  if (bulletType === 'support' || bulletType === 'healer') return 'support';
  if (bulletType === 'special_attack') return 'special_attack';
  const low = bulletType.toLowerCase();
  if (low === 'tank' || low === 'defense') return 'tank';
  if (low === 'support' || low === 'healer') return 'support';
  if (low === 'special_attack') return 'special_attack';
  return 'dps';
}

export class BulletSystem {
  public playerBullets: Bullet[] = [];
  public bullets: Bullet[] = [];
  public spriteContainer = new PIXI.Container();
  private enemyAuraContainer = new PIXI.Container();
  private enemyCoreContainer = new PIXI.Container();

  private spritePool: PIXI.Sprite[] = [];
  private enemySpritePool: PIXI.Sprite[] = [];
  private enemyAuraPool: PIXI.Sprite[] = [];
  private enemyCorePool: PIXI.Sprite[] = [];
  private bulletObjPool: Bullet[] = [];
  private difficultyBulletTint: number = 0xffffff;
  private difficultyMode: 'normal' | 'difficult' | 'no_mercy' = 'normal';

  private enemyOrbOuterTex: PIXI.Texture;
  private enemyOrbCoreTex: PIXI.Texture;

  public setDifficultyBulletTint(tint: number, difficulty: string = 'normal'): void {
    this.difficultyBulletTint = tint;
    this.difficultyMode = difficulty === 'no_mercy' ? 'no_mercy' : difficulty === 'difficult' ? 'difficult' : 'normal';
  }

  private shiftOrbColor(color: number): number {
    if (this.difficultyMode === 'normal') return color;
    const target = this.difficultyMode === 'difficult' ? 0xff5a5a : 0xb37aff;
    const blend = 0.28;
    const r = Math.round(((color >> 16) & 0xff) * (1 - blend) + ((target >> 16) & 0xff) * blend);
    const g = Math.round(((color >> 8) & 0xff) * (1 - blend) + ((target >> 8) & 0xff) * blend);
    const b = Math.round((color & 0xff) * (1 - blend) + (target & 0xff) * blend);
    return (r << 16) | (g << 8) | b;
  }

  private bulletTextures: Record<'dps' | 'special_attack' | 'tank' | 'support', PIXI.Texture> = {
    dps: PIXI.Texture.from('/assets/sprites/PhyAttackBulletpng.png'),
    special_attack: PIXI.Texture.from('/assets/sprites/SpeAttackBulletpng.png'),
    tank: PIXI.Texture.from('/assets/sprites/tankbulletpng.png'),
    support: PIXI.Texture.from('/assets/sprites/healerBulletpng.png'),
  };
  private enemyBulletTextures: Record<string, PIXI.Texture> = {
    '1EnemyBulletpng': PIXI.Texture.from('/assets/sprites/1EnemyBulletpng.png'),
    '2EnemyBulletpng': PIXI.Texture.from('/assets/sprites/2EnemyBulletpng.png'),
    '3EnemyBulletpng': PIXI.Texture.from('/assets/sprites/3EnemyBulletpng.png'),
    'GFGbullet1png': PIXI.Texture.from('/assets/sprites/GFGbullet1png.png'),
    'GFGbullet2png': PIXI.Texture.from('/assets/sprites/GFGbullet2png.png'),
    'GFGbullet3png': PIXI.Texture.from('/assets/sprites/GFGbullet3png.png'),
    'GFGbullet4png': PIXI.Texture.from('/assets/sprites/GFGbullet4png.png'),
    'GFGbullet5png': PIXI.Texture.from('/assets/sprites/GFGbullet5png.png'),
    'MObullet1png': PIXI.Texture.from('/assets/sprites/MObullet1png.png'),
    'MObullet3png': PIXI.Texture.from('/assets/sprites/MObullet3png.png'),
    'MObullet4png': PIXI.Texture.from('/assets/sprites/MObullet4png.png'),
  };

  constructor() {
    this.enemyOrbOuterTex = createEnemyOrbOuterTexture();
    this.enemyOrbCoreTex = createEnemyOrbCoreTexture();
  }

  private acquireBulletObj(): Bullet {
    const recycled = this.bulletObjPool.pop();
    if (recycled) return recycled;
    return { x: 0, y: 0, vx: 0, vy: 0, radius: 5, color: 0x00f2fe, isPlayerBullet: false };
  }

  public recycleAllForSnapshot(): void {
    for (let i = 0; i < this.playerBullets.length; i++) {
      this.bulletObjPool.push(this.playerBullets[i]);
    }
    this.playerBullets.length = 0;
    for (let i = 0; i < this.bullets.length; i++) {
      this.bulletObjPool.push(this.bullets[i]);
    }
    this.bullets.length = 0;
  }

  public spawnPlayerBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number = 5,
    color: number = 0x00f2fe,
    damage: number = 0.5,
    bulletType?: string
  ): Bullet {
    const b = this.acquireBulletObj();
    b.x = x;
    b.y = y;
    b.vx = vx;
    b.vy = vy;
    b.radius = radius;
    b.color = color;
    b.damage = damage;
    b.isPlayerBullet = true;
    b.bulletType = normalizeBulletTypeKey(bulletType);
    b.spriteType = undefined;
    b.angle = undefined;
    this.playerBullets.push(b);
    return b;
  }

  public spawnEnemyBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number = 6,
    color: number = 0xff2b5b,
    spriteType?: string,
    angle?: number
  ): Bullet {
    const b = this.acquireBulletObj();
    b.x = x;
    b.y = y;
    b.vx = vx;
    b.vy = vy;
    b.radius = radius;
    b.color = color;
    b.damage = undefined;
    b.isPlayerBullet = false;
    b.bulletType = undefined;
    b.spriteType = spriteType;
    b.angle = angle;
    this.bullets.push(b);
    return b;
  }

  public spawnEnemyFan(
    originX: number,
    originY: number,
    targetX: number,
    targetY: number,
    offsets: number[] = [-0.25, 0, 0.25],
    speed: number = 300,
    color: number = 0xff2b5b
  ): void {
    const baseAngle = Math.atan2(targetY - originY, targetX - originX);
    for (let i = 0; i < offsets.length; i++) {
      const angle = baseAngle + offsets[i];
      this.spawnEnemyBullet(originX, originY, Math.cos(angle) * speed, Math.sin(angle) * speed, 6, color);
    }
  }

  public update(
    dt: number,
    playerPos: { x: number; y: number },
    bossPos: { x: number; y: number; hp: number },
    callbacks?: {
      onPlayerHit?: () => void;
      onBossHit?: (dmg: number) => void;
      onPlayerBulletHit?: () => void;
    }
  ): void {
    const bossX = (bossPos as any).pos?.x ?? bossPos.x;
    const bossY = (bossPos as any).pos?.y ?? bossPos.y;
    const bossHp = bossPos.hp;
    const bossHitDistSq = 55 * 55;
    const maxX = CANVAS_WIDTH + OFFSCREEN_MARGIN;
    const maxY = CANVAS_HEIGHT + OFFSCREEN_MARGIN;

    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const pb = this.playerBullets[i];
      pb.x += pb.vx * dt;
      pb.y += pb.vy * dt;

      if (pb.x > maxX || pb.x < -OFFSCREEN_MARGIN || pb.y < -OFFSCREEN_MARGIN || pb.y > maxY) {
        const last = this.playerBullets.pop()!;
        if (i < this.playerBullets.length) this.playerBullets[i] = last;
        this.bulletObjPool.push(pb);
        continue;
      }

      if (bossHp > 0) {
        const dx = pb.x - bossX;
        const dy = pb.y - bossY;
        if (dx * dx + dy * dy < bossHitDistSq) {
          if (callbacks?.onBossHit) callbacks.onBossHit(pb.damage ?? 0.5);
          if (callbacks?.onPlayerBulletHit) callbacks.onPlayerBulletHit();
          const last = this.playerBullets.pop()!;
          if (i < this.playerBullets.length) this.playerBullets[i] = last;
          this.bulletObjPool.push(pb);
        }
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < -OFFSCREEN_MARGIN || b.x > maxX || b.y < -OFFSCREEN_MARGIN || b.y > maxY) {
        const last = this.bullets.pop()!;
        if (i < this.bullets.length) this.bullets[i] = last;
        this.bulletObjPool.push(b);
        continue;
      }

      const dx = b.x - playerPos.x;
      const dy = b.y - playerPos.y;
      const hitR = b.radius + 3;
      if (dx * dx + dy * dy < hitR * hitR) {
        const last = this.bullets.pop()!;
        if (i < this.bullets.length) this.bullets[i] = last;
        this.bulletObjPool.push(b);
        if (callbacks?.onPlayerHit) callbacks.onPlayerHit();
      }
    }
  }

  public render(graphics: PIXI.Graphics, animTimer: number = 0): void {
    // Attach GPU-batched sprite containers once (ZERO per-frame PIXI.Graphics tessellation!)
    if (this.spriteContainer.parent !== graphics) {
      graphics.clear();
      graphics.addChild(this.spriteContainer);
      graphics.addChild(this.enemyAuraContainer);
      graphics.addChild(this.enemyCoreContainer);
    }

    // 1. Player energy bolts using character bullet sprites
    let pIdx = 0;
    const pLen = this.playerBullets.length;
    for (let i = 0; i < pLen; i++) {
      const pb = this.playerBullets[i];
      if (pb.x < -36 || pb.x > CANVAS_WIDTH + 36 || pb.y < -36 || pb.y > CANVAS_HEIGHT + 36) {
        continue;
      }
      let sprite = this.spritePool[pIdx];
      if (!sprite) {
        sprite = new PIXI.Sprite();
        sprite.anchor.set(0.5);
        this.spritePool.push(sprite);
        this.spriteContainer.addChild(sprite);
      }

      const typeKey = (pb.bulletType as 'dps' | 'special_attack' | 'tank' | 'support') || 'dps';
      const tex = this.bulletTextures[typeKey] || this.bulletTextures.dps;
      if (sprite.texture !== tex) {
        sprite.texture = tex;
      }
      sprite.position.set(pb.x, pb.y);
      sprite.rotation = pb.vx !== 0 || pb.vy !== 0 ? Math.atan2(pb.vy, pb.vx) : 0;

      const scale = typeKey === 'tank' ? 0.35 : typeKey === 'dps' ? 0.75 : 0.55;
      sprite.scale.set(scale);
      sprite.visible = true;
      pIdx++;
    }
    for (let i = pIdx; i < this.spritePool.length; i++) {
      const s = this.spritePool[i];
      if (!s.visible) break;
      s.visible = false;
    }

    // 2. Enemy bullets: custom sprite pool when spriteType is set, otherwise GPU-batched Touhou orbs
    let eIdx = 0;
    let enemySpriteIdx = 0;
    const eLen = this.bullets.length;
    for (let i = 0; i < eLen; i++) {
      const b = this.bullets[i];
      if (b.x < -36 || b.x > CANVAS_WIDTH + 36 || b.y < -36 || b.y > CANVAS_HEIGHT + 36) {
        continue;
      }

      const customTex = b.spriteType ? this.enemyBulletTextures[b.spriteType] : undefined;
      if (customTex) {
        let es = this.enemySpritePool[enemySpriteIdx];
        if (!es) {
          es = new PIXI.Sprite(customTex);
          es.anchor.set(0.5);
          this.enemySpritePool.push(es);
          this.spriteContainer.addChild(es);
        } else if (es.texture !== customTex) {
          es.texture = customTex;
        }
        es.position.set(b.x, b.y);

        const baseAngle = b.angle !== undefined ? b.angle : Math.atan2(b.vy, b.vx);
        if (b.spriteType === 'MObullet4png') {
          es.rotation = baseAngle + animTimer * 3.8;
          es.scale.set(b.radius >= 10 ? 1.25 : 0.58);
        } else {
          // Sprite art faces left by default in PNGs, so + Math.PI aligns left-facing tip to flight vector
          es.rotation = baseAngle + Math.PI;
          if (b.spriteType === 'GFGbullet2png' || b.spriteType === 'MObullet1png') {
            es.scale.set(0.95);
          } else if (b.spriteType === '3EnemyBulletpng') {
            es.scale.set(0.9);
          } else {
            es.scale.set(0.82);
          }
        }
        es.tint = this.difficultyBulletTint;
        es.visible = true;
        enemySpriteIdx++;
        continue;
      }

      let auraSprite = this.enemyAuraPool[eIdx];
      let coreSprite = this.enemyCorePool[eIdx];
      if (!auraSprite) {
        auraSprite = new PIXI.Sprite(this.enemyOrbOuterTex);
        auraSprite.anchor.set(0.5);
        this.enemyAuraPool.push(auraSprite);
        this.enemyAuraContainer.addChild(auraSprite);

        coreSprite = new PIXI.Sprite(this.enemyOrbCoreTex);
        coreSprite.anchor.set(0.5);
        this.enemyCorePool.push(coreSprite);
        this.enemyCoreContainer.addChild(coreSprite);
      }

      const r = b.radius;
      const outerScale = (r * 2.95) / 48;
      const coreScale = Math.max(4.0, r * 1.18) / 24;

      auraSprite.position.set(b.x, b.y);
      auraSprite.scale.set(outerScale);
      auraSprite.tint = this.shiftOrbColor(b.color);
      auraSprite.visible = true;

      coreSprite.position.set(b.x, b.y);
      coreSprite.scale.set(coreScale);
      coreSprite.visible = true;
      eIdx++;
    }

    for (let i = eIdx; i < this.enemyAuraPool.length; i++) {
      const a = this.enemyAuraPool[i];
      if (!a.visible) break;
      a.visible = false;
      this.enemyCorePool[i].visible = false;
    }

    for (let i = enemySpriteIdx; i < this.enemySpritePool.length; i++) {
      const es = this.enemySpritePool[i];
      if (!es.visible) break;
      es.visible = false;
    }
  }

  public clear(): void {
    this.recycleAllForSnapshot();
    for (let i = 0; i < this.spritePool.length; i++) {
      this.spritePool[i].visible = false;
    }
    for (let i = 0; i < this.enemyAuraPool.length; i++) {
      this.enemyAuraPool[i].visible = false;
      this.enemyCorePool[i].visible = false;
    }
    for (const es of this.enemySpritePool) {
      es.visible = false;
    }
  }

  public destroy(): void {
    this.clear();
    if (this.enemyOrbOuterTex !== PIXI.Texture.WHITE) this.enemyOrbOuterTex.destroy(true);
    if (this.enemyOrbCoreTex !== PIXI.Texture.WHITE) this.enemyOrbCoreTex.destroy(true);
  }
}

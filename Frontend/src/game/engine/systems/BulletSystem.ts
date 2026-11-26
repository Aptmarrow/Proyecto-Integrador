import * as PIXI from 'pixi.js';
import type { Bullet } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, OFFSCREEN_MARGIN } from '../physics/RenderConstants';

export class BulletSystem {
  public playerBullets: Bullet[] = [];
  public bullets: Bullet[] = [];
  public spriteContainer = new PIXI.Container();
  private spritePool: PIXI.Sprite[] = [];
  private enemySpritePool: PIXI.Sprite[] = [];
  private bulletTextures: Record<string, PIXI.Texture> = {
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
    const b: Bullet = {
      x,
      y,
      vx,
      vy,
      radius,
      color,
      damage,
      isPlayerBullet: true,
      bulletType,
    };
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
    const b: Bullet = {
      x,
      y,
      vx,
      vy,
      radius,
      color,
      isPlayerBullet: false,
      spriteType,
      angle,
    };
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
    for (const offset of offsets) {
      const angle = baseAngle + offset;
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

    for (let i = this.playerBullets.length - 1; i >= 0; i--) {
      const pb = this.playerBullets[i];
      pb.x += pb.vx * dt;
      pb.y += pb.vy * dt;

      if (
        pb.x > CANVAS_WIDTH + OFFSCREEN_MARGIN ||
        pb.x < -OFFSCREEN_MARGIN ||
        pb.y < -OFFSCREEN_MARGIN ||
        pb.y > CANVAS_HEIGHT + OFFSCREEN_MARGIN
      ) {
        this.playerBullets.splice(i, 1);
        continue;
      }

      if (bossHp > 0 && Math.hypot(pb.x - bossX, pb.y - bossY) < 55) {
        if (callbacks?.onBossHit) callbacks.onBossHit(pb.damage ?? 0.5);
        if (callbacks?.onPlayerBulletHit) callbacks.onPlayerBulletHit();
        this.playerBullets.splice(i, 1);
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (
        b.x < -OFFSCREEN_MARGIN ||
        b.x > CANVAS_WIDTH + OFFSCREEN_MARGIN ||
        b.y < -OFFSCREEN_MARGIN ||
        b.y > CANVAS_HEIGHT + OFFSCREEN_MARGIN
      ) {
        this.bullets.splice(i, 1);
        continue;
      }

      if (Math.hypot(b.x - playerPos.x, b.y - playerPos.y) < b.radius + 3) {
        this.bullets.splice(i, 1);
        if (callbacks?.onPlayerHit) callbacks.onPlayerHit();
      }
    }
  }

  public render(graphics: PIXI.Graphics, animTimer: number = 0): void {
    graphics.clear();

    if (this.spriteContainer.parent !== graphics) {
      graphics.addChild(this.spriteContainer);
    }

    // 1. Player energy bolts using character bullet sprites
    let spriteIndex = 0;
    for (const pb of this.playerBullets) {
      let sprite = this.spritePool[spriteIndex];
      if (!sprite) {
        sprite = new PIXI.Sprite();
        this.spritePool.push(sprite);
        this.spriteContainer.addChild(sprite);
      }
      const rawKey = (pb.bulletType || 'dps').toLowerCase();
      const typeKey =
        rawKey === 'attack' || rawKey === 'physical'
          ? 'dps'
          : rawKey === 'defense'
            ? 'tank'
            : rawKey === 'healer'
              ? 'support'
              : rawKey;

      const tex = this.bulletTextures[typeKey] || this.bulletTextures.dps;
      if (sprite.texture !== tex) {
        sprite.texture = tex;
      }
      sprite.anchor.set(0.5);
      sprite.position.set(pb.x, pb.y);
      sprite.rotation = Math.atan2(pb.vy, pb.vx);

      if (typeKey === 'tank') {
        sprite.scale.set(0.35);
      } else if (typeKey === 'dps') {
        sprite.scale.set(0.75);
      } else {
        sprite.scale.set(0.55);
      }

      sprite.visible = true;
      spriteIndex++;
    }

    // Ocultar sprites no usados del pool
    for (let i = spriteIndex; i < this.spritePool.length; i++) {
      this.spritePool[i].visible = false;
    }

    // 2. Enemy bullets (sprites when spriteType is present, otherwise Touhou procedural orbs)
    let enemySpriteIdx = 0;
    for (const b of this.bullets) {
      const tex = b.spriteType ? this.enemyBulletTextures[b.spriteType] : undefined;
      if (tex) {
        let es = this.enemySpritePool[enemySpriteIdx];
        if (!es) {
          es = new PIXI.Sprite();
          this.enemySpritePool.push(es);
          this.spriteContainer.addChild(es);
        }
        if (es.texture !== tex) es.texture = tex;
        es.anchor.set(0.5);
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
        es.visible = true;
        enemySpriteIdx++;
        continue;
      }

      const r = b.radius;
      graphics.beginFill(b.color, 0.28);
      graphics.drawCircle(b.x, b.y, r * 1.42);
      graphics.endFill();

      graphics.beginFill(b.color, 0.95);
      graphics.drawCircle(b.x, b.y, r);
      graphics.endFill();

      graphics.beginFill(0xffffff, 0.92);
      graphics.drawCircle(b.x, b.y, Math.max(1.8, r * 0.52));
      graphics.endFill();
    }

    for (let i = enemySpriteIdx; i < this.enemySpritePool.length; i++) {
      this.enemySpritePool[i].visible = false;
    }
  }

  public clear(): void {
    this.playerBullets = [];
    this.bullets = [];
    for (const s of this.spritePool) {
      s.visible = false;
    }
    for (const es of this.enemySpritePool) {
      es.visible = false;
    }
  }
}

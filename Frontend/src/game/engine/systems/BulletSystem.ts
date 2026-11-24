import * as PIXI from 'pixi.js';
import type { Bullet } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, OFFSCREEN_MARGIN } from '../physics/RenderConstants';

export class BulletSystem {
  public playerBullets: Bullet[] = [];
  public bullets: Bullet[] = [];

  public spawnPlayerBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number = 5,
    color: number = 0x00f2fe,
    damage: number = 0.5
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
    };
    this.playerBullets.push(b);
    return b;
  }

  public spawnEnemyBullet(x: number, y: number, vx: number, vy: number, radius: number = 6, color: number = 0xff2b5b): Bullet {
    const b: Bullet = {
      x,
      y,
      vx,
      vy,
      radius,
      color,
      isPlayerBullet: false,
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

  public render(graphics: PIXI.Graphics): void {
    graphics.clear();

    // 1. Player energy bolts (luminous plasma lance + bright white core)
    for (const pb of this.playerBullets) {
      const col = pb.color || 0x00f2fe;
      graphics.beginFill(col, 0.35);
      graphics.drawRoundedRect(pb.x - 2, pb.y - 4, 24, 8, 4);
      graphics.endFill();
      graphics.beginFill(col, 0.95);
      graphics.drawRoundedRect(pb.x, pb.y - 2.5, 20, 5, 2.5);
      graphics.endFill();
      graphics.beginFill(0xffffff, 0.9);
      graphics.drawRect(pb.x + 3, pb.y - 1, 13, 2);
      graphics.endFill();
    }

    // 2. Touhou-style Space Danmaku Orbs (outer colored aura + saturated rim + crisp white core)
    for (const b of this.bullets) {
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
  }

  public clear(): void {
    this.playerBullets = [];
    this.bullets = [];
  }
}

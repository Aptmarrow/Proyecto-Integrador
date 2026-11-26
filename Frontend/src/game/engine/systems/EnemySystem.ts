import * as PIXI from 'pixi.js';
import { Enemy, type EnemyConfig } from '../entities/Enemy';
import type { BulletSystem } from './BulletSystem';
import type { LaserSystem } from './LaserSystem';
import type { ItemType } from '../types';
import type { ServerEnemy } from '../../network/wsClient';

const ENEMY_SPRITE_URLS: Record<string, string> = {
  first_enemy: '/assets/sprites/FirstEnemypng.png',
  second_enemy: '/assets/sprites/SecondEnemypng.png',
  third_enemy: '/assets/sprites/ThirdEnemypng.png',
  fb_mini1: '/assets/sprites/FBmini1png.png',
  fb_mini2: '/assets/sprites/FBmini2png.png',
  gfg_enemy1: '/assets/sprites/GFGEnemy1png.png',
  gfg_enemy2: '/assets/sprites/GFGEnemy2png.png',
  gfg_enemy3: '/assets/sprites/GFGEnemy3png.png',
  gfg_mini1: '/assets/sprites/GFGMini1png.png',
  gfg_mini2: '/assets/sprites/GFGMini2png.png',
  mo_enemy1: '/assets/sprites/MOenemy1png.png',
  mo_enemy2: '/assets/sprites/MOenemy2png.png',
  mo_enemy3: '/assets/sprites/MOenemy3png.png',
  mo_mini1: '/assets/sprites/MOmini1png.png',
  mo_mini2: '/assets/sprites/MOmini2png.png',
};

export interface KamikazeExplosionFx {
  x: number;
  y: number;
  timer: number;
  duration: number;
  maxRadius: number;
  armed: boolean;
  blobs: Array<{ angle: number; distFactor: number; size: number; color: number }>;
}

export class EnemySystem {
  public enemies: Enemy[] = [];
  public container: PIXI.Container;
  public onKamikazeExplode?: (x: number, y: number, armed: boolean) => void;
  private textures: Record<string, PIXI.Texture> = {};
  private enemyMap = new Map<string, Enemy>();
  private activeIds = new Set<string>();
  private customTextures: Record<string, PIXI.Texture> = {};
  private enemyFuseMap = new Map<string, number>();
  private enemyAngleMap = new Map<string, number>();
  private explosions: KamikazeExplosionFx[] = [];
  private explosionGraphics = new PIXI.Graphics();
  private difficultyTint: number = 0xffffff;
  private difficultyFilter: PIXI.Filter | null = null;

  constructor(parentContainer?: PIXI.Container) {
    this.container = new PIXI.Container();
    if (parentContainer) {
      parentContainer.addChild(this.container);
    }
    this.container.addChild(this.explosionGraphics);
    for (const [key, url] of Object.entries(ENEMY_SPRITE_URLS)) {
      this.customTextures[key] = PIXI.Texture.from(url);
    }
  }

  public setTextures(textures: Record<string, PIXI.Texture>): void {
    this.textures = textures;
  }

  public setDifficultyTint(tint: number): void {
    if (this.difficultyTint === tint) return;
    this.difficultyTint = tint;
    for (const enemy of this.enemies) {
      enemy.setDifficultyTint(tint);
    }
  }

  public setDifficultyFilter(filter: PIXI.Filter | null): void {
    if (this.difficultyFilter === filter) return;
    this.difficultyFilter = filter;
    for (const enemy of this.enemies) {
      enemy.setDifficultyFilter(filter);
    }
  }

  private resolveTextureForType(type: string, spriteOverride?: string): PIXI.Texture | undefined {
    if (spriteOverride) {
      if (!this.customTextures[spriteOverride]) {
        this.customTextures[spriteOverride] = PIXI.Texture.from(spriteOverride);
      }
      return this.customTextures[spriteOverride];
    }
    if (this.customTextures[type]) return this.customTextures[type];
    if (type === 'green_fairy') return this.textures.fairyGreen;
    if (type === 'red_fairy') return this.textures.fairyRed;
    if (type === 'big_fairy') return this.textures.fairyBig;
    return undefined;
  }

  public applyBackendEnemies(serverEnemies: ServerEnemy[], scaleX: number, scaleY: number): void {
    this.activeIds.clear();
    for (let i = 0; i < serverEnemies.length; i++) {
      this.activeIds.add(serverEnemies[i].id);
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!this.activeIds.has(e.id)) {
        const fuseVal = this.enemyFuseMap.get(e.id) ?? 0;
        if (e.type === 'mo_enemy2') {
          const armed = fuseVal > 0.03;
          this.spawnKamikazeExplosion(e.pos.x, e.pos.y, armed);
          this.onKamikazeExplode?.(e.pos.x, e.pos.y, armed);
        }
        this.enemyMap.delete(e.id);
        this.enemyFuseMap.delete(e.id);
        this.enemyAngleMap.delete(e.id);
        e.destroy();
        const last = this.enemies.pop()!;
        if (i < this.enemies.length) this.enemies[i] = last;
      }
    }

    for (let i = 0; i < serverEnemies.length; i++) {
      const se = serverEnemies[i];
      let existing = this.enemyMap.get(se.id);
      const targetX = se.x * scaleX;
      const targetY = se.y * scaleY;
      if (!existing) {
        const tex = this.resolveTextureForType(se.type, se.sprite);

        existing = new Enemy(this.container, {
          id: se.id,
          type: se.type as any,
          startX: targetX,
          startY: targetY,
          hp: se.hp,
          radius: se.radius * scaleX,
          isMiniboss: Boolean(se.isMiniboss),
          difficultyTint: this.difficultyTint,
          difficultyFilter: this.difficultyFilter,
          texture: tex,
        });
        this.enemies.push(existing);
        this.enemyMap.set(se.id, existing);
      }
      existing.pos.x += (targetX - existing.pos.x) * 0.45;
      existing.pos.y += (targetY - existing.pos.y) * 0.45;
      existing.hp = se.hp;
      existing.maxHp = se.maxHp;
      if (typeof se.fuseProgress === 'number') {
        this.enemyFuseMap.set(se.id, se.fuseProgress);
      }
      if (typeof se.angle === 'number') {
        this.enemyAngleMap.set(se.id, se.angle);
      }
      existing.container.position.set(existing.pos.x, existing.pos.y);
    }
  }

  public spawnKamikazeExplosion(x: number, y: number, armed: boolean = true): void {
    const palette = [0xffffff, 0xfef08a, 0xf97316, 0xff2b5b, 0xdc2626];
    const blobs = [];
    const count = armed ? 12 : 8;
    for (let i = 0; i < count; i++) {
      blobs.push({
        angle: (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35,
        distFactor: 0.45 + Math.random() * 0.55,
        size: (armed ? 14 : 9) + Math.random() * (armed ? 14 : 9),
        color: palette[i % palette.length],
      });
    }
    this.explosions.push({
      x,
      y,
      timer: 0,
      duration: armed ? 0.58 : 0.4,
      maxRadius: armed ? 84 : 52,
      armed,
      blobs,
    });
    // Keep explosion overlay above active enemy sprites
    this.container.addChild(this.explosionGraphics);
  }

  private updateExplosions(dt: number): void {
    const g = this.explosionGraphics;
    g.clear();
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.timer += dt;
      const p = Math.min(1, ex.timer / ex.duration);
      if (p >= 1) {
        this.explosions.splice(i, 1);
        continue;
      }

      const easeOut = 1 - Math.pow(1 - p, 3);
      const fade = Math.max(0, 1 - p);

      // 1. Bright core flash during initial detonation
      if (p < 0.36) {
        const flashRatio = 1 - p / 0.36;
        g.beginFill(0xffffff, 0.9 * flashRatio);
        g.drawCircle(ex.x, ex.y, ex.maxRadius * (0.18 + (p / 0.36) * 0.48));
        g.endFill();
      }

      // 2. Outer crimson shockwave + inner plasma ring
      const outerR = ex.maxRadius * (0.24 + easeOut * 0.92);
      g.lineStyle(Math.max(1.2, 5.5 * fade), ex.armed ? 0xff2b5b : 0xf97316, 0.88 * fade);
      g.drawCircle(ex.x, ex.y, outerR);

      const innerR = ex.maxRadius * (0.14 + easeOut * 0.65);
      g.lineStyle(Math.max(1, 3.2 * fade), 0xfef08a, 0.85 * fade);
      g.drawCircle(ex.x, ex.y, innerR);
      g.lineStyle(0);

      // 3. Sharp radial blast rays
      if (p < 0.68) {
        const rayAlpha = (1 - p / 0.68) * 0.9;
        g.lineStyle(2.2, 0xfef08a, rayAlpha);
        for (let rIdx = 0; rIdx < 10; rIdx++) {
          const ra = (Math.PI * 2 * rIdx) / 10 + (ex.armed ? 0.12 : 0);
          const rStart = outerR * 0.35;
          const rEnd = outerR * 1.08;
          g.moveTo(ex.x + Math.cos(ra) * rStart, ex.y + Math.sin(ra) * rStart);
          g.lineTo(ex.x + Math.cos(ra) * rEnd, ex.y + Math.sin(ra) * rEnd);
        }
        g.lineStyle(0);
      }

      // 4. Radial fireball & smoke plumes
      for (const blob of ex.blobs) {
        const dist = ex.maxRadius * blob.distFactor * easeOut;
        const bx = ex.x + Math.cos(blob.angle) * dist;
        const by = ex.y + Math.sin(blob.angle) * dist;
        const blobScale = p < 0.35 ? 0.6 + (p / 0.35) * 0.5 : Math.max(0.1, 1.1 - ((p - 0.35) / 0.65));
        const col = p > 0.62 ? 0x451a03 : blob.color;
        g.beginFill(col, 0.72 * fade);
        g.drawCircle(bx, by, blob.size * blobScale);
        g.endFill();
      }
    }
  }

  public syncRemoteVisuals(animTimer: number, playerPos?: { x: number; y: number }, dt: number = 1 / 60): void {
    for (const enemy of this.enemies) {
      enemy.syncRemoteVisuals(animTimer, this.enemyFuseMap.get(enemy.id), this.enemyAngleMap.get(enemy.id), playerPos);
    }
    this.updateExplosions(dt);
  }

  public spawnEnemy(config: EnemyConfig): Enemy {
    let tex = config.texture;
    if (!tex && config.type) {
      if (config.type === 'green_fairy') tex = this.textures.fairyGreen;
      else if (config.type === 'red_fairy') tex = this.textures.fairyRed;
      else if (config.type === 'big_fairy') tex = this.textures.fairyBig;
    }

    const enemy = new Enemy(this.container, {
      ...config,
      difficultyTint: config.difficultyTint ?? this.difficultyTint,
      difficultyFilter: config.difficultyFilter !== undefined ? config.difficultyFilter : this.difficultyFilter,
      texture: tex,
    });
    this.enemies.push(enemy);
    return enemy;
  }

  /**
   * OLEADA 1: Fila senoidal de hadas verdes volando hacia la izquierda
   */
  public spawnSineWave(count: number = 5, startY: number = 180, amp: number = 70, delayBetween: number = 0.35): void {
    for (let i = 0; i < count; i++) {
      this.spawnEnemy({
        type: 'green_fairy',
        trajectory: 'sine',
        attackPattern: 'aimed_single',
        startX: 1060 + i * (delayBetween * 160),
        startY,
        speed: 160,
        hp: 12,
        itemDrop: i % 2 === 0 ? 'power' : 'point',
        customParams: { freq: 2.8, amp, phase: i * 0.4 },
      });
    }
  }

  /**
   * OLEADA 1: Doble Hélice Senoidal (Hadas verdes y amarillas entrelazadas)
   */
  public spawnDoubleHelixWave(countPerLine: number = 5): void {
    for (let i = 0; i < countPerLine; i++) {
      // Línea Superior
      this.spawnEnemy({
        type: 'green_fairy',
        trajectory: 'double_helix',
        attackPattern: 'aimed_single',
        startX: 1060 + i * 80,
        startY: 200,
        speed: 170,
        hp: 14,
        itemDrop: i % 2 === 0 ? 'power' : 'point',
        customParams: { freq: 3.2, amp: 85, phase: i * 0.4 },
      });

      // Línea Inferior en contrafase
      this.spawnEnemy({
        type: 'yellow_fairy',
        trajectory: 'double_helix',
        attackPattern: 'helix_stream',
        startX: 1060 + i * 80,
        startY: 376,
        speed: 170,
        hp: 16,
        itemDrop: 'power',
        customParams: { freq: 3.2, amp: 85, phase: i * 0.4 + Math.PI },
      });
    }
  }

  /**
   * OLEADA 2: Pinza Carmesí Avanzada (Abanicos florales pentagonales)
   */
  public spawnPincerWave(countPerSide: number = 3): void {
    for (let i = 0; i < countPerSide; i++) {
      // Pinza Superior
      this.spawnEnemy({
        type: 'red_fairy',
        trajectory: 'hover_retreat',
        attackPattern: 'flower_burst',
        startX: 1060 + i * 90,
        startY: 120 + i * 25,
        speed: 190,
        hp: 28,
        itemDrop: 'power',
        shootInterval: 1.1,
        customParams: { hoverX: 740 - i * 40, hoverTime: 3.8 },
      });

      // Pinza Inferior
      this.spawnEnemy({
        type: 'red_fairy',
        trajectory: 'hover_retreat',
        attackPattern: 'flower_burst',
        startX: 1060 + i * 90,
        startY: 440 - i * 25,
        speed: 190,
        hp: 28,
        itemDrop: 'point',
        shootInterval: 1.1,
        customParams: { hoverX: 740 - i * 40, hoverTime: 3.8 },
      });
    }
  }

  /**
   * OLEADA 3: Mini-Jefe / Gran Hada Comandante + Escoltas en espiral
   */
  public spawnCommanderWave(startX: number = 1080, startY: number = 288): void {
    // Gran Hada Comandante
    this.spawnEnemy({
      type: 'big_fairy',
      trajectory: 'hover_retreat',
      attackPattern: 'star_rings',
      startX,
      startY,
      speed: 80,
      hp: 130,
      radius: 30,
      scoreValue: 1200,
      itemDrop: 'life_frag',
      shootInterval: 0.75,
      customParams: { hoverX: 680, hoverTime: 7.5 },
    });

    // 4 Escoltas en espiral cuádruple
    for (let k = 0; k < 4; k++) {
      const phase = (Math.PI / 2) * k;
      this.spawnEnemy({
        type: k % 2 === 0 ? 'red_fairy' : 'purple_fairy',
        trajectory: 'spiral',
        attackPattern: 'cross_spread',
        startX: startX + 40,
        startY: startY + (k % 2 === 0 ? -120 : 120),
        speed: 140,
        hp: 35,
        itemDrop: k % 2 === 0 ? 'power' : 'bomb_frag',
        shootInterval: 0.95,
        customParams: { phase },
      });
    }
  }

  /**
   * OLEADA 4: Asalto Pesado Púrpura (Formación de 4 hadas pesadas)
   */
  public spawnPurpleAssaultWave(): void {
    const yPositions = [140, 240, 340, 440];
    for (let i = 0; i < yPositions.length; i++) {
      this.spawnEnemy({
        type: 'purple_fairy',
        trajectory: 'hover_retreat',
        attackPattern: 'ring_burst',
        startX: 1060 + i * 50,
        startY: yPositions[i],
        speed: 150,
        hp: 38,
        itemDrop: i % 2 === 0 ? 'power' : 'point',
        shootInterval: 0.9,
        customParams: { hoverX: 710 - (i % 2) * 50, hoverTime: 4.2 },
      });
    }
  }

  /**
   * OLEADA 5: Cortina de Fuego Cruzado en Zigzag
   */
  public spawnCrossfireWave(count: number = 8): void {
    for (let i = 0; i < count; i++) {
      const isTop = i % 2 === 0;
      this.spawnEnemy({
        type: 'green_fairy',
        trajectory: isTop ? 'cross_top' : 'cross_bottom',
        attackPattern: 'needle_stream',
        startX: 1050 + i * 65,
        startY: isTop ? 40 : 530,
        speed: 230,
        hp: 18,
        itemDrop: i % 3 === 0 ? 'power' : 'point',
        shootInterval: 0.8,
        shootDelay: 0.15 + i * 0.1,
      });
    }
  }

  public clear(): void {
    for (const enemy of this.enemies) {
      enemy.destroy();
    }
    this.enemies = [];
    this.enemyMap.clear();
    this.enemyFuseMap.clear();
    this.enemyAngleMap.clear();
    this.explosions = [];
    this.explosionGraphics.clear();
  }

  public update(
    dt: number,
    animTimer: number,
    playerPos: { x: number; y: number },
    bulletSystem: BulletSystem,
    onEnemyDefeated?: (x: number, y: number, score: number, itemDrop: ItemType) => void,
    onEnemyHit?: (damage: number) => void
  ): void {
    // 1. Actualizar enemigos y limpiar muertos / fuera de pantalla
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(dt, animTimer, playerPos, bulletSystem);

      if (enemy.isOffscreen) {
        enemy.destroy();
        this.enemies.splice(i, 1);
        continue;
      }
    }

    // 2. Colisión Proyectiles de Jugador -> Enemigos
    for (let i = bulletSystem.playerBullets.length - 1; i >= 0; i--) {
      const pb = bulletSystem.playerBullets[i];
      let bulletHit = false;

      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const enemy = this.enemies[j];
        if (enemy.isDead) continue;

        const dist = Math.hypot(pb.x - enemy.pos.x, pb.y - enemy.pos.y);
        if (dist < enemy.radius + 6) {
          bulletHit = true;
          const isKilled = enemy.takeDamage(1.5);
          if (onEnemyHit) {
            onEnemyHit(1.5);
          }

          if (isKilled) {
            if (onEnemyDefeated) {
              onEnemyDefeated(enemy.pos.x, enemy.pos.y, enemy.scoreValue, enemy.itemDrop);
            }
            enemy.destroy();
            this.enemies.splice(j, 1);
          }
          break;
        }
      }

      if (bulletHit) {
        bulletSystem.playerBullets.splice(i, 1);
      }
    }
  }

  public checkLaserHits(
    laserSystem: LaserSystem,
    onEnemyDefeated?: (x: number, y: number, score: number, itemDrop: ItemType) => void
  ): void {
    for (const laser of laserSystem.lasers) {
      if (laser.state !== 'firing' || laser.ownerId !== 'player') continue;

      const beamHalfWidth = laser.currentWidth / 2;
      const laserY = laser.sourceY;

      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const enemy = this.enemies[j];
        if (enemy.isDead) continue;

        // Comprobar si el enemigo está en el rango horizontal del rayo y en su ancho vertical
        if (enemy.pos.x >= laser.sourceX && Math.abs(enemy.pos.y - laserY) < beamHalfWidth + enemy.radius) {
          const isKilled = enemy.takeDamage(8.0);
          if (isKilled) {
            if (onEnemyDefeated) {
              onEnemyDefeated(enemy.pos.x, enemy.pos.y, enemy.scoreValue, enemy.itemDrop);
            }
            enemy.destroy();
            this.enemies.splice(j, 1);
          }
        }
      }
    }
  }

  public get activeCount(): number {
    return this.enemies.length;
  }
}

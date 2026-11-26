import * as PIXI from 'pixi.js';
import type { BulletSystem } from '../systems/BulletSystem';
import type { LaserSystem } from '../systems/LaserSystem';
import type { BossPhase } from '../types';

export interface BossPhaseDef {
  phase: BossPhase;
  name: string;
  isSpellCard: boolean;
  maxHp: number;
}

export const BOSS_PHASES: BossPhaseDef[] = [
  { phase: 1, name: 'Phase 1 "Vanguard Barrage"', isSpellCard: false, maxHp: 110 },
  { phase: 2, name: 'Core Surge "Crimson Vortex"', isSpellCard: true, maxHp: 140 },
  { phase: 3, name: 'Phase 3 "Crossfire Storm"', isSpellCard: false, maxHp: 130 },
  { phase: 4, name: 'Overload Protocol "Prism Cage"', isSpellCard: true, maxHp: 160 },
  { phase: 5, name: 'Final Protocol "Eclipse Ray"', isSpellCard: true, maxHp: 200 },
];

export class Boss {
  public pos = { x: 1100, y: 288 };
  public targetPos = { x: 760, y: 288 };
  public hp = 110;
  public maxHp = 110;
  public phase: BossPhase = 1;
  public remainingStocks: number = 4; // 4 vidas restantes adicionales (5 fases en total)
  public spellcardName = BOSS_PHASES[0].name;
  public isSpellCard: boolean = false;
  public isActive: boolean = false;
  public isDefeated: boolean = false;

  // Estados de Recarga y Transición
  public isInvulnerable: boolean = false;
  public isRefilling: boolean = false;
  public isLockedForBeam: boolean = false;
  public refillTimer: number = 0;
  public displayHpPercent: number = 100;

  // Extensiones de Campaña Normal (Boss Dinámico, Minijefe HUD y M.O)
  public bossId: string = 'first_boss';
  public currentSpriteUrl: string = '/assets/sprites/FirstBoss.png';
  public difficultyTint: number = 0xffffff;
  public angle: number = Math.PI;
  private displayAngle: number = Math.PI;
  public renderHudOnly: boolean = false;
  public isMinibossHud: boolean = false;
  public moIntroActive: boolean = false;
  public moIntroProgress: number = 0;
  public moDashState: string = 'idle';
  public moDashLines: Array<{ x1: number; y1: number; x2: number; y2: number; progress: number; active: boolean; completed?: boolean; isReturn?: boolean }> = [];
  public moLineGraphics = new PIXI.Graphics();

  public get x(): number {
    return this.pos.x;
  }
  public set x(val: number) {
    this.pos.x = val;
  }

  public get y(): number {
    return this.pos.y;
  }
  public set y(val: number) {
    this.pos.y = val;
  }

  public setPosition(x: number, y: number): void {
    this.pos.x = x;
    this.pos.y = y;
    this.targetPos.x = x;
    this.targetPos.y = y;
    this.container.position.set(x, y);
  }

  public sprite!: PIXI.Sprite | PIXI.Graphics;
  public magicCircleGraphics = new PIXI.Graphics();
  public auraGraphics = new PIXI.Graphics();
  public container = new PIXI.Container();

  private shootTimer = 0;
  private laserTimer = 0;
  private specialTimer = 0;
  private darkOrbTimer = 0;
  private megaLaserTimer = 0;
  private animTimer = 0;
  private introProgress = 0;

  public onPhaseChange?: (newPhase: BossPhase, spellName: string, isSpellCard: boolean) => void;
  public onDefeated?: () => void;

  constructor(
    parentContainer: PIXI.Container,
    spriteUrl: string = '/assets/sprites/FirstBoss.png',
    initialHp: number = 110
  ) {
    this.hp = initialHp;
    this.maxHp = initialHp;
    this.currentSpriteUrl = spriteUrl;
    parentContainer.addChild(this.moLineGraphics);
    parentContainer.addChild(this.container);
    this.container.addChild(this.auraGraphics);
    this.container.addChild(this.magicCircleGraphics);
    this.initSprite(spriteUrl);
    this.container.visible = false;
  }

  public setDifficultyTint(tint: number): void {
    this.difficultyTint = tint;
    if (this.sprite instanceof PIXI.Sprite) {
      this.sprite.tint = tint;
    }
  }

  public setSpriteUrl(spriteUrl: string): void {
    if (!spriteUrl || spriteUrl === this.currentSpriteUrl) return;
    this.currentSpriteUrl = spriteUrl;
    const tex = PIXI.Texture.from(spriteUrl);
    if (this.sprite instanceof PIXI.Sprite) {
      this.sprite.texture = tex;
      this.sprite.scale.set(0.42);
      this.sprite.tint = this.difficultyTint;
    } else {
      if (this.sprite && this.sprite.parent) {
        this.sprite.parent.removeChild(this.sprite);
      }
      const next = new PIXI.Sprite(tex);
      next.anchor.set(0.5);
      next.scale.set(0.42);
      next.tint = this.difficultyTint;
      next.position.set(0, 0);
      this.sprite = next;
      this.container.addChild(next);
    }
  }

  private initSprite(spriteUrl: string): void {
    PIXI.Texture.fromURL(spriteUrl).then((tex) => {
      const sprite = new PIXI.Sprite(tex);
      sprite.anchor.set(0.5);
      sprite.scale.set(0.42);
      sprite.tint = this.difficultyTint;
      sprite.position.set(0, 0);
      this.sprite = sprite;
      this.container.addChild(sprite);
    }).catch(() => {
      const fallback = new PIXI.Graphics();
      fallback.beginFill(0xff2b5b);
      fallback.drawCircle(0, 0, 32);
      fallback.endFill();
      fallback.lineStyle(2, 0xffffff, 0.9);
      fallback.drawCircle(0, 0, 32);
      fallback.lineStyle(0);
      fallback.position.set(0, 0);
      this.sprite = fallback;
      this.container.addChild(fallback);
    });
  }

  public spawn(targetX: number = 760, targetY: number = 288): void {
    this.isActive = true;
    this.container.visible = true;
    this.pos.x = 1100;
    this.pos.y = targetY;
    this.targetPos = { x: targetX, y: targetY };
    this.introProgress = 0;
    this.phase = 1;
    this.remainingStocks = 4;
    this.hp = BOSS_PHASES[0].maxHp;
    this.maxHp = BOSS_PHASES[0].maxHp;
    this.spellcardName = BOSS_PHASES[0].name;
    this.isSpellCard = BOSS_PHASES[0].isSpellCard;
    this.isDefeated = false;
    this.isInvulnerable = true;
    this.isRefilling = true;
    this.refillTimer = 1.3;
    this.displayHpPercent = 0;
  }

  public reset(initialHp: number = 110): void {
    this.phase = 1;
    this.remainingStocks = 4;
    this.hp = BOSS_PHASES[0].maxHp;
    this.maxHp = BOSS_PHASES[0].maxHp;
    this.spellcardName = BOSS_PHASES[0].name;
    this.isSpellCard = false;
    this.isActive = false;
    this.isDefeated = false;
    this.isInvulnerable = false;
    this.isRefilling = false;
    this.renderHudOnly = false;
    this.isMinibossHud = false;
    this.moIntroActive = false;
    this.moIntroProgress = 0;
    this.moDashState = 'idle';
    this.moDashLines = [];
    this.angle = Math.PI;
    this.displayAngle = Math.PI;
    if (this.sprite instanceof PIXI.Sprite) {
      this.sprite.rotation = 0;
      this.sprite.scale.set(0.42, 0.42);
    }
    this.container.visible = false;
    this.pos = { x: 1100, y: 288 };
    this.magicCircleGraphics.clear();
    this.auraGraphics.clear();
    this.moLineGraphics.clear();
  }

  public syncVisuals(dt: number, animTimer: number, scaleX: number = 1.28, scaleY: number = 0.96): void {
    this.moLineGraphics.clear();
    const visible = this.isActive && !this.isDefeated && !this.renderHudOnly;
    this.container.visible = visible;
    this.displayHpPercent = this.maxHp > 0 ? Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100)) : 0;

    if (!visible) {
      this.magicCircleGraphics.clear();
      this.auraGraphics.clear();
      return;
    }

    this.container.position.set(this.pos.x, this.pos.y);

    // Smooth orientation tracking (M.O follows dash line angle; bosses otherwise track players)
    const angleDiff = Math.atan2(Math.sin(this.angle - this.displayAngle), Math.cos(this.angle - this.displayAngle));
    const turnSpeed = this.moDashState === 'dashing' ? 28 : 14;
    this.displayAngle += angleDiff * Math.min(1, dt * turnSpeed);
    if (this.sprite instanceof PIXI.Sprite) {
      if (Math.cos(this.displayAngle) > 0) {
        this.sprite.scale.set(-0.42, 0.42);
        this.sprite.rotation = this.displayAngle;
      } else {
        this.sprite.scale.set(0.42, 0.42);
        this.sprite.rotation = Math.atan2(
          Math.sin(this.displayAngle - Math.PI),
          Math.cos(this.displayAngle - Math.PI)
        );
      }
    }

    if (this.isRefilling) {
      const progress = this.displayHpPercent / 100;
      this.renderRefillAura(animTimer, progress);
      if (this.sprite instanceof PIXI.Sprite) this.sprite.tint = this.difficultyTint;
    } else if (this.bossId === 'mo' && this.moIntroActive) {
      this.renderMoIntroAura(animTimer, this.moIntroProgress);
      if (this.sprite instanceof PIXI.Sprite) {
        this.sprite.tint = this.moIntroProgress >= 0.7 && this.moIntroProgress <= 0.84 ? 0xfef08a : this.difficultyTint;
      }
    } else {
      this.auraGraphics.clear();
      if (this.sprite instanceof PIXI.Sprite) this.sprite.tint = this.difficultyTint;
    }

    if (this.bossId === 'mo' && this.moDashLines.length > 0) {
      this.renderMoDashLines(animTimer, scaleX, scaleY);
    }

    this.renderMagicCircle(animTimer);
  }

  private renderMoDashLines(animTimer: number, scaleX: number, scaleY: number): void {
    const g = this.moLineGraphics;
    const isDash = this.moDashState === 'dashing';
    const pulse = 0.65 + Math.sin(animTimer * 28) * 0.35;

    for (let idx = 0; idx < this.moDashLines.length; idx++) {
      const line = this.moDashLines[idx];
      if (line.completed) continue;
      const x1 = line.x1 * scaleX;
      const y1 = line.y1 * scaleY;
      const x2 = line.x2 * scaleX;
      const y2 = line.y2 * scaleY;

      const isActiveLine = isDash && line.active;
      const isReturn = Boolean(line.isReturn);
      const outerColor = isReturn ? 0x00f2fe : 0xff2b5b;
      const outerAlpha = isActiveLine ? 0.5 : isReturn ? 0.16 * pulse : 0.24 * pulse;
      const outerWidth = isActiveLine ? 22 : isReturn ? 7 : 11 + line.progress * 6;
      const coreAlpha = isActiveLine ? 0.96 : isReturn ? 0.48 * pulse : 0.68 * pulse;
      const coreWidth = isActiveLine ? 5 : isReturn ? 1.8 : 2.5;

      g.lineStyle(outerWidth, outerColor, outerAlpha);
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);

      g.lineStyle(coreWidth, isReturn ? 0xfef08a : 0xffffff, coreAlpha);
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);

      if (isReturn) {
        g.lineStyle(2, 0x00f2fe, 0.85);
        g.drawCircle(x2, y2, 16 * (0.85 + Math.sin(animTimer * 8) * 0.15));
      }
    }
    g.lineStyle(0);

    // High-speed afterimage trail while M.O dashes along the active line
    const activeLine = this.moDashLines.find((l) => l.active);
    if (isDash && activeLine) {
      const sx = activeLine.x1 * scaleX;
      const sy = activeLine.y1 * scaleY;
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        const ax = sx + (this.pos.x - sx) * t;
        const ay = sy + (this.pos.y - sy) * t;
        g.beginFill(activeLine.isReturn ? 0x00f2fe : 0xff2b5b, 0.18 * t);
        g.drawCircle(ax, ay, 24 * t);
        g.endFill();
      }
    }
  }

  public update(
    dt: number,
    playerPos: { x: number; y: number },
    bulletSystem: BulletSystem,
    laserSystem: LaserSystem,
    scaleX: number = 1.28,
    scaleY: number = 0.96
  ): void {
    if (!this.isActive || this.isDefeated) return;

    this.animTimer += dt;

    // 1. Animación de Entrada
    if (this.introProgress < 1.0) {
      this.introProgress = Math.min(1.0, this.introProgress + dt * 0.9);
      const ease = 1 - Math.pow(1 - this.introProgress, 3);
      this.pos.x = 1100 + (this.targetPos.x - 1100) * ease;
      this.pos.y = this.targetPos.y;
      this.container.position.set(this.pos.x, this.pos.y);
      return;
    }

    // 2. Animación de Recarga de Barra de Vida / Transición
    if (this.isRefilling) {
      this.refillTimer -= dt;
      const progress = 1 - Math.max(0, this.refillTimer / 1.2);
      this.displayHpPercent = Math.min(100, progress * 100);

      // Aura de recarga resplandeciente
      this.renderRefillAura(this.animTimer, progress);

      if (this.refillTimer <= 0) {
        this.isRefilling = false;
        this.isInvulnerable = false;
        this.displayHpPercent = (this.hp / this.maxHp) * 100;
        this.auraGraphics.clear();
      }
      this.container.position.set(this.pos.x, this.pos.y);
      return;
    } else {
      this.displayHpPercent = (this.hp / this.maxHp) * 100;
    }

    // 3. Movimiento Flotante Armónico según Fase (Bloqueado durante disparo de Mega Láser / Pugna)
    if (this.isLockedForBeam) {
      this.pos.x = this.targetPos.x;
      this.pos.y = this.targetPos.y;
    } else if (this.phase === 1) {
      // Oscilación vertical suave
      this.pos.y = this.targetPos.y + Math.sin(this.animTimer * 2.2) * 50;
      this.pos.x = this.targetPos.x + Math.cos(this.animTimer * 1.1) * 15;
    } else if (this.phase === 2) {
      // Movimiento en 8 infinito horizontal
      this.pos.x = this.targetPos.x + Math.cos(this.animTimer * 1.8) * 45;
      this.pos.y = this.targetPos.y + Math.sin(this.animTimer * 3.6) * 60;
    } else if (this.phase === 3) {
      // Deriva lateral rápida con retroceso
      this.pos.x = this.targetPos.x + Math.sin(this.animTimer * 3.0) * 35;
      this.pos.y = this.targetPos.y + Math.cos(this.animTimer * 2.0) * 75;
    } else if (this.phase === 4) {
      // Posición de anclaje firme con vibración
      this.pos.x = this.targetPos.x + Math.sin(this.animTimer * 5.0) * 15;
      this.pos.y = this.targetPos.y + Math.cos(this.animTimer * 2.8) * 40;
    } else {
      // FASE 5 (FINAL): Vórtice central agresivo
      this.pos.x = this.targetPos.x + Math.cos(this.animTimer * 2.5) * 55;
      this.pos.y = this.targetPos.y + Math.sin(this.animTimer * 2.5) * 75;
    }

    this.container.position.set(this.pos.x, this.pos.y);

    // 4. Renderizar Círculo Mágico de Spell Card (Phases 2, 4, 5)
    this.renderMagicCircle(this.animTimer);

    // Si el Jefe está cargando/disparando el Mega Láser o en Beam Struggle, NO disparar Danmaku ni lásers secundarios
    if (this.isLockedForBeam) {
      this.shootTimer = 0;
      this.laserTimer = 0;
      this.specialTimer = 0;
      this.darkOrbTimer = 0;
      return;
    }

    // 5. Temporizadores de Danmaku
    this.shootTimer += dt;
    this.laserTimer += dt;
    this.specialTimer += dt;
    this.darkOrbTimer += dt;

    // 6. Patrones Danmaku de las 5 Fases
    switch (this.phase) {
      case 1: {
        // FASE 1 (NON-SPELL 1): "Twilight Flutter"
        if (this.shootTimer >= 0.38) {
          this.shootTimer = 0;
          bulletSystem.spawnEnemyFan(
            this.pos.x - 30,
            this.pos.y,
            playerPos.x,
            playerPos.y,
            [-0.35, -0.18, 0, 0.18, 0.35],
            270,
            0xff3366
          );
        }

        if (this.specialTimer >= 1.6) {
          this.specialTimer = 0;
          bulletSystem.spawnEnemyFan(
            this.pos.x - 30,
            this.pos.y,
            playerPos.x,
            playerPos.y,
            [-0.5, 0.5],
            320,
            0x00f2fe
          );
        }

        if (this.laserTimer >= 5.0) {
          this.laserTimer = 0;
          this.triggerRhombusLasers(laserSystem, playerPos, scaleX, scaleY, 'targeted');
        }
        break;
      }

      case 2: {
        // FASE 2 (SPELL CARD 1): Moon Sign "Moonlight Ray"
        if (this.shootTimer >= 0.3) {
          this.shootTimer = 0;
          bulletSystem.spawnEnemyFan(
            this.pos.x - 30,
            this.pos.y,
            playerPos.x,
            playerPos.y,
            [-0.22, 0.22],
            330,
            0x00f2fe
          );
        }

        // Anillos expansivos de estrellas
        if (this.specialTimer >= 1.4) {
          this.specialTimer = 0;
          const count = 18;
          const speed = 200;
          const baseAngle = this.animTimer * 1.8;
          for (let i = 0; i < count; i++) {
            const a = baseAngle + (Math.PI * 2 * i) / count;
            bulletSystem.spawnEnemyBullet(
              this.pos.x,
              this.pos.y,
              Math.cos(a) * speed,
              Math.sin(a) * speed,
              6,
              0xffdd00
            );
          }
        }

        if (this.laserTimer >= 3.8) {
          this.laserTimer = 0;
          this.triggerRhombusLasers(laserSystem, playerPos, scaleX, scaleY, 'targeted');
        }

        this.megaLaserTimer += dt;
        if (this.megaLaserTimer >= 6.5) {
          this.megaLaserTimer = 0;
          this.triggerMegaGoldLaser(laserSystem);
        }
        break;
      }

      case 3: {
        // FASE 3 (NON-SPELL 2): "Midnight Petal Barrage"
        if (this.shootTimer >= 0.22) {
          this.shootTimer = 0;
          const angle = Math.atan2(playerPos.y - this.pos.y, playerPos.x - this.pos.x);
          const wave = Math.sin(this.animTimer * 9) * 0.45;
          bulletSystem.spawnEnemyBullet(
            this.pos.x - 25,
            this.pos.y,
            Math.cos(angle + wave) * 280,
            Math.sin(angle + wave) * 280,
            5.5,
            0xff00aa
          );
          bulletSystem.spawnEnemyBullet(
            this.pos.x - 25,
            this.pos.y,
            Math.cos(angle - wave) * 280,
            Math.sin(angle - wave) * 280,
            5.5,
            0x00f2fe
          );
        }

        if (this.specialTimer >= 1.1) {
          this.specialTimer = 0;
          bulletSystem.spawnEnemyFan(
            this.pos.x - 30,
            this.pos.y,
            playerPos.x,
            playerPos.y,
            [-0.3, 0, 0.3],
            340,
            0xffffff
          );
        }
        break;
      }

      case 4: {
        // FASE 4 (SPELL CARD 2): Night Sign "Midnight Gaster Cage"
        if (this.shootTimer >= 0.16) {
          this.shootTimer = 0;
          // Tormenta espiral continua de 6 brazos
          const rot = this.animTimer * 5.5;
          for (let arm = 0; arm < 6; arm++) {
            const a = rot + (Math.PI / 3) * arm;
            bulletSystem.spawnEnemyBullet(
              this.pos.x - 20,
              this.pos.y,
              Math.cos(a) * 240,
              Math.sin(a) * 240,
              5.5,
              arm % 2 === 0 ? 0xff2b5b : 0x9900ff
            );
          }
        }

        // Rayos Paralelos Continuos
        if (this.laserTimer >= 3.2) {
          this.laserTimer = 0;
          this.triggerRhombusLasers(laserSystem, playerPos, scaleX, scaleY, 'both');
        }

        this.megaLaserTimer += dt;
        if (this.megaLaserTimer >= 6.0) {
          this.megaLaserTimer = 0;
          this.triggerMegaGoldLaser(laserSystem);
        }
        break;
      }

      case 5: {
        // FASE 5 (FINAL SPELL CARD): Darkness Sign "Demarcation of the Dark Forest"
        // 1. Espiral densa de estrellas de 8 brazos
        if (this.shootTimer >= 0.14) {
          this.shootTimer = 0;
          const rot = this.animTimer * 4.2;
          for (let arm = 0; arm < 8; arm++) {
            const a = rot + (Math.PI / 4) * arm;
            bulletSystem.spawnEnemyBullet(
              this.pos.x,
              this.pos.y,
              Math.cos(a) * 220,
              Math.sin(a) * 220,
              6,
              arm % 2 === 0 ? 0xffea00 : 0xff3366
            );
          }
        }

        // 2. Orbes Oscuros Expansivos en Cruz
        if (this.darkOrbTimer >= 1.5) {
          this.darkOrbTimer = 0;
          const count = 12;
          const baseA = this.animTimer * 2.0;
          for (let i = 0; i < count; i++) {
            const a = baseA + (Math.PI * 2 * i) / count;
            bulletSystem.spawnEnemyBullet(
              this.pos.x,
              this.pos.y,
              Math.cos(a) * 160,
              Math.sin(a) * 160,
              7,
              0x00f2fe
            );
          }
        }

        // 3. Rayos Láser Frecuentes
        if (this.laserTimer >= 3.0) {
          this.laserTimer = 0;
          this.triggerRhombusLasers(laserSystem, playerPos, scaleX, scaleY, 'both');
        }

        this.megaLaserTimer += dt;
        if (this.megaLaserTimer >= 5.5) {
          this.megaLaserTimer = 0;
          this.triggerMegaGoldLaser(laserSystem);
        }
        break;
      }
    }
  }

  public triggerMegaGoldLaser(laserSystem: LaserSystem): void {
    this.isLockedForBeam = true;
    this.pos.x = 940;
    this.targetPos.x = 940;
    this.targetPos.y = this.pos.y;

    // Rumia carga un rayo dorado colosal con origen exacto en su centro (mismo ancho de 96px que el Master Spark)
    laserSystem.spawnLaser(this.pos.x, this.pos.y, this.pos.y, {
      ownerId: 'boss',
      direction: 'left',
      chargeDuration: 1.25,
      fireDuration: 1.8,
      fadeDuration: 0.4,
      maxWidth: 96,
      color: 0xffdd00,
      isMegaBeam: true,
    });
  }

  public loseFullHealthBar(): void {
    if (!this.isActive || this.isDefeated) return;
    this.isInvulnerable = false;
    this.isRefilling = false;
    this.takeDamage(this.hp + 999);
  }

  private renderMoIntroAura(animTimer: number, progress: number): void {
    const g = this.auraGraphics;
    g.clear();
    const p = Math.max(0, Math.min(1, progress));
    const fade = p < 0.12 ? p / 0.12 : p > 0.9 ? Math.max(0, (1 - p) / 0.1) : 1;

    // 1. Deep Seraphic Crimson-Gold Core Glow
    const baseRad = 68 + p * 66 + Math.sin(animTimer * 18) * 7;
    g.beginFill(0x991b1b, 0.28 * fade);
    g.drawCircle(0, 0, baseRad * 1.25);
    g.endFill();
    g.beginFill(0xfde047, 0.22 * fade);
    g.drawCircle(0, 0, baseRad * 0.72);
    g.endFill();

    // 2. Six radiating Seraph Light Rays
    const raySpin = animTimer * 1.65;
    const lockFlare = p >= 0.7 ? Math.sin(Math.min(1, (p - 0.7) / 0.3) * Math.PI) : 0;
    const rayLen = baseRad * (1.55 + lockFlare * 1.2);
    for (let k = 0; k < 6; k++) {
      const a = raySpin + (Math.PI * 2 * k) / 6;
      const spread = 0.12 + lockFlare * 0.08;
      g.beginFill(k % 2 === 0 ? 0xfde047 : 0xff2b5b, (0.16 + lockFlare * 0.28) * fade);
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a - spread) * rayLen, Math.sin(a - spread) * rayLen);
      g.lineTo(Math.cos(a + spread) * rayLen, Math.sin(a + spread) * rayLen);
      g.closePath();
      g.endFill();
    }

    // 3. Outer rotating Ophanim Wheel & 8 Sacred Eye Sigils
    const wheelR = 88 + p * 44;
    g.lineStyle(2.8, 0xff2b5b, 0.85 * fade);
    g.drawCircle(0, 0, wheelR);
    g.lineStyle(1.4, 0xfde047, 0.75 * fade);
    g.drawCircle(0, 0, wheelR * 0.86);
    g.lineStyle(0);

    for (let e = 0; e < 8; e++) {
      const ea = animTimer * 2.1 + (Math.PI * 2 * e) / 8;
      const ex = Math.cos(ea) * wheelR;
      const ey = Math.sin(ea) * wheelR;
      g.beginFill(0xfef08a, 0.9 * fade);
      g.drawCircle(ex, ey, 4.5 + Math.sin(animTimer * 12 + e) * 1.5);
      g.endFill();
    }

    // 4. Counter-rotating Inner 6-Point Star Polygon
    const starR = wheelR * 0.72;
    const cRot = -animTimer * 2.8;
    g.lineStyle(2, 0xfacc15, 0.82 * fade);
    for (let tri = 0; tri < 2; tri++) {
      const offset = (tri * Math.PI) / 3;
      for (let v = 0; v < 3; v++) {
        const a1 = cRot + offset + (Math.PI * 2 * v) / 3;
        const a2 = cRot + offset + (Math.PI * 2 * ((v + 1) % 3)) / 3;
        g.moveTo(Math.cos(a1) * starR, Math.sin(a1) * starR);
        g.lineTo(Math.cos(a2) * starR, Math.sin(a2) * starR);
      }
    }

    // 5. Imploding Compression Ring (0.42..0.70) -> Exploding Lock Shockwave (0.70..0.98)
    if (p >= 0.42 && p < 0.7) {
      const imp = (p - 0.42) / 0.28;
      g.lineStyle(3, 0xffffff, 0.85 * imp);
      g.drawCircle(0, 0, (1 - imp) * 210 + 36);
    } else if (p >= 0.7) {
      const exp = (p - 0.7) / 0.28;
      const shockFade = Math.max(0, 1 - exp);
      g.lineStyle(Math.max(1.5, 6 * shockFade), 0xfef08a, 0.95 * shockFade);
      g.drawCircle(0, 0, 42 + exp * 220);
      g.lineStyle(Math.max(1, 3.5 * shockFade), 0xff2b5b, 0.85 * shockFade);
      g.drawCircle(0, 0, 24 + exp * 165);
    }
    g.lineStyle(0);
  }

  private renderRefillAura(animTimer: number, progress: number): void {
    this.auraGraphics.clear();
    const rad = 45 + Math.sin(animTimer * 20) * 8 + progress * 25;
    this.auraGraphics.beginFill(0x00f2fe, 0.25 * (1 - progress * 0.5));
    this.auraGraphics.drawCircle(0, 0, rad);
    this.auraGraphics.endFill();

    this.auraGraphics.lineStyle(2, 0xffffff, 0.9);
    this.auraGraphics.drawCircle(0, 0, rad * 0.85);
    this.auraGraphics.lineStyle(0);
  }

  private renderMagicCircle(animTimer: number): void {
    this.magicCircleGraphics.clear();

    // Solo mostrar círculo mágico en fases de Spell Card normales cuando no está en Mega Láser / Struggle
    if (this.phase === 1 || this.phase === 3 || this.isLockedForBeam) return;

    const rot = animTimer * 2.2;
    const circleColor = this.phase === 5 ? 0xffdd00 : (this.phase === 4 ? 0xff2b5b : 0x00f2fe);
    const radius = 68 + Math.sin(animTimer * 6) * 5;

    // Anillo Exterior
    this.magicCircleGraphics.lineStyle(2.5, circleColor, 0.8);
    this.magicCircleGraphics.drawCircle(0, 0, radius);
    this.magicCircleGraphics.lineStyle(1.2, 0xffffff, 0.6);
    this.magicCircleGraphics.drawCircle(0, 0, radius * 0.78);

    // Runas / Polígonos Sagrados Giratorios
    this.magicCircleGraphics.lineStyle(1.5, circleColor, 0.7);
    const points = this.phase === 5 ? 8 : 6;
    for (let i = 0; i < points; i++) {
      const a1 = rot + (Math.PI * 2 * i) / points;
      const a2 = rot + (Math.PI * 2 * (i + 2)) / points;
      const x1 = Math.cos(a1) * radius;
      const y1 = Math.sin(a1) * radius;
      const x2 = Math.cos(a2) * radius;
      const y2 = Math.sin(a2) * radius;
      this.magicCircleGraphics.moveTo(x1, y1);
      this.magicCircleGraphics.lineTo(x2, y2);
    }
    this.magicCircleGraphics.lineStyle(0);
  }

  public triggerRhombusLasers(
    laserSystem: LaserSystem,
    playerPos: { x: number; y: number },
    scaleX: number,
    scaleY: number,
    pattern: 'both' | 'targeted' = 'both'
  ): void {
    const podX = 665 * scaleX;
    const topPodY = 252 * scaleY;
    const bottomPodY = 348 * scaleY;

    if (pattern === 'both') {
      laserSystem.spawnLaser(podX, topPodY, topPodY, {
        ownerId: 'boss',
        direction: 'left',
        chargeDuration: 0.6,
        fireDuration: 1.0,
        fadeDuration: 0.3,
        maxWidth: 38,
        color: this.phase >= 4 ? 0xff2b5b : 0xff3366,
        podType: 'top',
      });

      laserSystem.spawnLaser(podX, bottomPodY, bottomPodY, {
        ownerId: 'boss',
        direction: 'left',
        chargeDuration: 0.6,
        fireDuration: 1.0,
        fadeDuration: 0.3,
        maxWidth: 38,
        color: this.phase >= 4 ? 0xff2b5b : 0xff3366,
        podType: 'bottom',
      });
    } else {
      const podY = playerPos.y < this.pos.y ? topPodY : bottomPodY;
      laserSystem.spawnLaser(podX, podY, playerPos.y, {
        ownerId: 'boss',
        direction: 'left',
        chargeDuration: 0.5,
        fireDuration: 1.0,
        fadeDuration: 0.3,
        maxWidth: 46,
        color: 0x00f2fe,
        podType: playerPos.y < this.pos.y ? 'top' : 'bottom',
      });
    }
  }

  public takeDamage(amount: number): void {
    if (!this.isActive || this.isDefeated || this.isInvulnerable || this.isRefilling) return;

    this.hp = Math.max(0, Number((this.hp - amount).toFixed(1)));

    // Si la barra actual llega a 0 HP
    if (this.hp <= 0) {
      if (this.phase < 5) {
        // Transición a la siguiente barra de vida
        const nextPhaseIndex = this.phase; // 1 -> index 1 (phase 2)
        const nextDef = BOSS_PHASES[nextPhaseIndex];
        this.phase = nextDef.phase;
        this.remainingStocks = 5 - this.phase;
        this.spellcardName = nextDef.name;
        this.isSpellCard = nextDef.isSpellCard;
        this.hp = nextDef.maxHp;
        this.maxHp = nextDef.maxHp;

        // Activar invulnerabilidad y animación de recarga
        this.isInvulnerable = true;
        this.isRefilling = true;
        this.refillTimer = 1.2;

        if (this.onPhaseChange) {
          this.onPhaseChange(this.phase, this.spellcardName, this.isSpellCard);
        }
      } else if (!this.isDefeated) {
        // Derrota final del Jefe
        this.isDefeated = true;
        this.isActive = false;
        this.container.visible = false;
        if (this.onDefeated) {
          this.onDefeated();
        }
      }
    }
  }
}



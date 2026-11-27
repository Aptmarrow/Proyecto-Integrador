import * as PIXI from 'pixi.js';
import type { CharacterClass } from '../types';
import type { BulletSystem } from '../systems/BulletSystem';
import type { WallSystem } from '../systems/WallSystem';
import type { LaserSystem } from '../systems/LaserSystem';
import type { ParticleSystem } from '../systems/ParticleSystem';
import { getCharacterStats, type CharacterCombatStats } from '../CharacterStats';
import { SCALE_X, SCALE_Y, CANVAS_WIDTH, CANVAS_HEIGHT } from '../physics/RenderConstants';

// Exact 1:1 match with Backend physics.js (375 * 1.28 = 480 px/s X, 500 * 0.96 = 480 px/s Y)
const PLAYER_CANVAS_SPEED = 480;
const FOCUS_SPEED_MULT = 0.40;
const BOUND_PAD_X = 10 * SCALE_X;
const BOUND_PAD_Y = 10 * SCALE_Y;
const MAX_PENDING_INPUTS = 90;

interface PredictedInput {
  seq: number;
  dx: number;
  dy: number;
  focus: boolean;
  dt: number;
}

function integrateCanvasStep(
  x: number,
  y: number,
  dx: number,
  dy: number,
  focus: boolean,
  dt: number
): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len > 0.01) {
    const speed = PLAYER_CANVAS_SPEED * (focus ? FOCUS_SPEED_MULT : 1.0);
    x = Math.max(BOUND_PAD_X, Math.min(CANVAS_WIDTH - BOUND_PAD_X, x + (dx / len) * speed * dt));
    y = Math.max(BOUND_PAD_Y, Math.min(CANVAS_HEIGHT - BOUND_PAD_Y, y + (dy / len) * speed * dt));
  }
  return { x, y };
}

export class Player {
  public pos = { x: 100, y: 300 };
  public targetPos = { x: 100, y: 300 };
  public characterClassId: CharacterClass = 'DPS';
  public isFocus: boolean = false;
  public stats: CharacterCombatStats;
  public hp: number;
  public sp: number;

  public container = new PIXI.Container();
  private sprite: PIXI.Sprite | PIXI.Graphics = new PIXI.Graphics();
  private focusRingOuter = new PIXI.Graphics();
  private focusRingInner = new PIXI.Graphics();
  private hitbox = new PIXI.Graphics();
  private focusAlpha = 0;

  private pendingInputs: PredictedInput[] = [];
  private reconciledTarget: { x: number; y: number } | null = null;
  private hasAckedSeq = false;

  private baseScale = 0.25;
  private shootTimer = 0;
  private skillCooldownTimer = 0;

  constructor(parentContainer: PIXI.Container, initialClass: CharacterClass = 'DPS') {
    this.stats = getCharacterStats(initialClass);
    this.hp = this.stats.hpMax;
    this.sp = 0;
    this.initGraphics();
    parentContainer.addChild(this.container);
    this.setCharacterClass(initialClass);
  }

  public get maxHp(): number {
    return this.stats.hpMax;
  }

  public get maxSp(): number {
    return this.stats.spMax;
  }

  public get defensePercent(): number {
    return this.stats.defensePercent;
  }

  public get bombDamage(): number {
    return this.stats.bombDamage;
  }

  public isBombReady(): boolean {
    return this.sp >= this.maxSp;
  }

  public resetCombatResources(): void {
    this.hp = this.maxHp;
    this.sp = 0;
  }

  public gainSp(amount: number): void {
    if (amount <= 0) return;
    this.sp = Math.min(this.maxSp, this.sp + amount);
  }

  public consumeBombGauge(): boolean {
    if (!this.isBombReady()) return false;
    this.sp = 0;
    return true;
  }

  public applyIncomingDamage(rawDamage: number, ignoreDefense: boolean = false): number {
    const mitigation = ignoreDefense ? 0 : Math.max(0, Math.min(1, this.defensePercent / 100));
    const finalDamage = rawDamage * (1 - mitigation);
    this.hp = Math.max(0, this.hp - finalDamage);
    return finalDamage;
  }

  public heal(amount: number): void {
    if (amount <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  private buildFocusVisuals(): void {
    // Classic Touhou counter-rotating arcane focus rings + crystal-clear red-rimmed hitbox core
    this.focusRingOuter.clear();
    this.focusRingOuter.lineStyle(1.4, 0xff5577, 0.72);
    this.focusRingOuter.drawCircle(0, 0, 27);
    this.focusRingOuter.lineStyle(1, 0x00f2fe, 0.52);
    for (let i = 0; i < 6; i++) {
      const a1 = (Math.PI / 3) * i;
      const a2 = (Math.PI / 3) * (i + 2);
      this.focusRingOuter.moveTo(Math.cos(a1) * 26, Math.sin(a1) * 26);
      this.focusRingOuter.lineTo(Math.cos(a2) * 26, Math.sin(a2) * 26);
    }
    this.focusRingOuter.lineStyle(1.4, 0xffffff, 0.65);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      this.focusRingOuter.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
      this.focusRingOuter.lineTo(Math.cos(a) * 30, Math.sin(a) * 30);
    }
    this.focusRingOuter.blendMode = PIXI.BLEND_MODES.ADD;
    this.focusRingOuter.alpha = 0;
    this.focusRingOuter.visible = false;

    this.focusRingInner.clear();
    this.focusRingInner.lineStyle(1.2, 0xff88aa, 0.75);
    this.focusRingInner.drawCircle(0, 0, 16);
    for (let i = 0; i < 4; i++) {
      const a1 = (Math.PI / 2) * i;
      const a2 = (Math.PI / 2) * (i + 1);
      this.focusRingInner.moveTo(Math.cos(a1) * 16, Math.sin(a1) * 16);
      this.focusRingInner.lineTo(Math.cos(a2) * 16, Math.sin(a2) * 16);
    }
    this.focusRingInner.blendMode = PIXI.BLEND_MODES.ADD;
    this.focusRingInner.alpha = 0;
    this.focusRingInner.visible = false;

    this.hitbox.clear();
    this.hitbox.beginFill(0xff2b5b, 0.32);
    this.hitbox.drawCircle(0, 0, 9.5);
    this.hitbox.endFill();
    this.hitbox.beginFill(0xff2b5b, 0.95);
    this.hitbox.drawCircle(0, 0, 5.6);
    this.hitbox.endFill();
    this.hitbox.beginFill(0xffffff, 1.0);
    this.hitbox.drawCircle(0, 0, 3.6);
    this.hitbox.endFill();
    this.hitbox.alpha = 0;
    this.hitbox.visible = false;
  }

  private initGraphics(): void {
    const defaultGraphic = new PIXI.Graphics();
    defaultGraphic.beginFill(0xff2b5b);
    defaultGraphic.drawCircle(0, 0, 16);
    defaultGraphic.endFill();
    this.sprite = defaultGraphic;

    this.buildFocusVisuals();

    this.container.addChild(this.focusRingOuter);
    this.container.addChild(this.focusRingInner);
    this.container.addChild(this.sprite);
    this.container.addChild(this.hitbox);
    this.container.position.set(this.pos.x, this.pos.y);
  }

  public setPosition(x: number, y: number): void {
    this.pos.x = x;
    this.pos.y = y;
    this.targetPos.x = x;
    this.targetPos.y = y;
    this.reconciledTarget = { x, y };
    this.pendingInputs.length = 0;
    this.container.position.set(x, y);
  }

  public clearPendingInputs(): void {
    this.pendingInputs.length = 0;
    this.reconciledTarget = null;
    this.hasAckedSeq = false;
  }

  public recordPredictedInput(seq: number, dx: number, dy: number, focus: boolean, dt: number): void {
    if (seq < 0 || dt <= 0) return;
    this.pendingInputs.push({ seq, dx, dy, focus, dt });
    if (this.pendingInputs.length > MAX_PENDING_INPUTS) {
      this.pendingInputs.splice(0, this.pendingInputs.length - MAX_PENDING_INPUTS);
    }
  }

  public reconcileAuthoritative(serverX: number, serverY: number, lastProcessedSeq?: number): void {
    this.targetPos.x = serverX;
    this.targetPos.y = serverY;

    if (typeof lastProcessedSeq === 'number' && lastProcessedSeq >= 0) {
      this.hasAckedSeq = true;
      let dropCount = 0;
      while (dropCount < this.pendingInputs.length && this.pendingInputs[dropCount].seq <= lastProcessedSeq) {
        dropCount++;
      }
      if (dropCount > 0) {
        this.pendingInputs.splice(0, dropCount);
      }

      // Replay still-in-flight inputs from the server's authoritative state to get present-time truth
      let rx = serverX;
      let ry = serverY;
      for (let i = 0; i < this.pendingInputs.length; i++) {
        const p = this.pendingInputs[i];
        const next = integrateCanvasStep(rx, ry, p.dx, p.dy, p.focus, p.dt);
        rx = next.x;
        ry = next.y;
      }
      this.reconciledTarget = { x: rx, y: ry };
    } else {
      this.reconciledTarget = null;
    }
  }

  public setCharacterClass(classId: CharacterClass): void {
    this.characterClassId = classId;
    this.stats = getCharacterStats(classId);
    this.hp = this.stats.hpMax;
    this.sp = 0;
    this.shootTimer = 0;
    const spritePath = this.getSpriteUrl(classId);

    try {
      const texture = PIXI.Texture.from(spritePath);
      this.container.removeChildren();

      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(this.baseScale);
      sprite.rotation = 0;

      this.sprite = sprite;
      this.container.addChild(this.focusRingOuter);
      this.container.addChild(this.focusRingInner);
      this.container.addChild(sprite);
      this.container.addChild(this.hitbox);
    } catch {
      // Fallback a gráficos vectoriales si no carga
    }
  }

  private getSpriteUrl(classId: string): string {
    const id = (classId || '').toLowerCase();
    switch (id) {
      case 'tank':
      case 'defense': return '/assets/sprites/defence.png';
      case 'support':
      case 'healer': return '/assets/sprites/healer.png';
      case 'dps':
      case 'physical': return '/assets/sprites/physicalattack.png';
      case 'special_attack':
      case 'attack':
      default: return '/assets/sprites/specialattack.png';
    }
  }

  public update(
    dt: number,
    animTimer: number,
    keys: Record<string, boolean>,
    moveVec?: { dx: number; dy: number },
    isBackendControlled: boolean = true
  ): { dx: number; dy: number } {
    this.shootTimer += dt;
    this.skillCooldownTimer = Math.max(0, this.skillCooldownTimer - dt);

    this.isFocus = !!(
      keys['ShiftLeft'] ||
      keys['ShiftRight'] ||
      keys['Shift'] ||
      keys['focus'] ||
      (keys as any).isFocus
    );

    const rawDx = this.hp > 0 ? (moveVec?.dx ?? 0) : 0;
    const rawDy = this.hp > 0 ? (moveVec?.dy ?? 0) : 0;
    const inputLen = Math.hypot(rawDx, rawDy);
    const hasInput = inputLen > 0.01;

    // 0ms client-side prediction matching authoritative isotropic velocity
    if (hasInput) {
      const next = integrateCanvasStep(this.pos.x, this.pos.y, rawDx, rawDy, this.isFocus, dt);
      this.pos.x = next.x;
      this.pos.y = next.y;

      // Advance reconciled reference in lockstep between incoming server snapshots
      if (this.reconciledTarget) {
        const nextRef = integrateCanvasStep(
          this.reconciledTarget.x,
          this.reconciledTarget.y,
          rawDx,
          rawDy,
          this.isFocus,
          dt
        );
        this.reconciledTarget.x = nextRef.x;
        this.reconciledTarget.y = nextRef.y;
      }
    }

    if (isBackendControlled) {
      const ref = this.reconciledTarget ?? this.targetPos;
      const errX = ref.x - this.pos.x;
      const errY = ref.y - this.pos.y;
      const errDist = Math.hypot(errX, errY);

      if (errDist > 220) {
        // Hard snap only on real server teleports (stage restart / beam struggle alignment)
        this.pos.x = ref.x;
        this.pos.y = ref.y;
        this.pendingInputs.length = 0;
      } else if (this.hasAckedSeq) {
        if (this.pendingInputs.length === 0 && !hasInput) {
          // Server has acknowledged our stop input: settle any sub-tick offset imperceptibly
          if (errDist < 0.4) {
            this.pos.x = ref.x;
            this.pos.y = ref.y;
          } else {
            const settle = 1 - Math.exp(-10 * dt);
            this.pos.x += errX * settle;
            this.pos.y += errY * settle;
          }
        } else if (errDist > 16) {
          // Ignore ±2 ticks of network arrival jitter completely; softly bleed only excess drift
          const excessRatio = (errDist - 16) / errDist;
          const blend = 1 - Math.exp(-6.5 * dt);
          this.pos.x += errX * excessRatio * blend;
          this.pos.y += errY * excessRatio * blend;
        }
      } else if (!hasInput) {
        // Fallback if server/worker has not sent a sequence ack yet
        if (errDist < 1.0) {
          this.pos.x = ref.x;
          this.pos.y = ref.y;
        } else {
          const settle = 1 - Math.exp(-10 * dt);
          this.pos.x += errX * settle;
          this.pos.y += errY * settle;
        }
      } else if (errDist > 140) {
        const drift = 1 - Math.exp(-4.5 * dt);
        this.pos.x += errX * drift;
        this.pos.y += errY * drift;
      }
    }

    const dx = hasInput ? Math.sign(rawDx) : 0;
    const dy = hasInput ? Math.sign(rawDy) : 0;

    this.container.position.set(this.pos.x, this.pos.y);

    // Smooth Touhou focus ring & hitbox core reveal
    const targetFocusAlpha = this.isFocus && this.hp > 0 ? 1 : 0;
    this.focusAlpha += (targetFocusAlpha - this.focusAlpha) * Math.min(1, 18 * dt);
    const showFocus = this.focusAlpha > 0.02;
    this.focusRingOuter.visible = showFocus;
    this.focusRingInner.visible = showFocus;
    this.hitbox.visible = showFocus;
    if (showFocus) {
      const pulse = 1 + Math.sin(animTimer * 10) * 0.04;
      this.focusRingOuter.alpha = this.focusAlpha * 0.9;
      this.focusRingOuter.rotation += 1.65 * dt;
      this.focusRingOuter.scale.set((0.88 + this.focusAlpha * 0.12) * pulse);

      this.focusRingInner.alpha = this.focusAlpha * 0.85;
      this.focusRingInner.rotation -= 2.4 * dt;
      this.focusRingInner.scale.set(0.86 + this.focusAlpha * 0.14);

      this.hitbox.alpha = this.focusAlpha;
      this.hitbox.scale.set(0.95 + Math.sin(animTimer * 16) * 0.08);
    }

    if (this.sprite) {
      this.sprite.alpha = this.hp <= 0 ? 0.25 : 1 - this.focusAlpha * 0.18;
    }

    this.applySquashAndStretch(dt, animTimer, dx, dy);

    return { dx, dy };
  }

  private applySquashAndStretch(dt: number, animTimer: number, dx: number, dy: number): void {
    if (!(this.sprite instanceof PIXI.Sprite)) return;

    let targetScaleX = this.baseScale;
    let targetScaleY = this.baseScale;
    let targetRotation = 0;

    if (dx !== 0 || dy !== 0) {
      const leanMult = this.isFocus ? 0.45 : 1.0;
      if (dx > 0) {
        targetScaleX = this.baseScale * (1 + 0.07 * leanMult);
        targetScaleY = this.baseScale * (1 - 0.06 * leanMult);
        targetRotation = 0.09 * leanMult;
      } else if (dx < 0) {
        targetScaleX = this.baseScale * (1 - 0.06 * leanMult);
        targetScaleY = this.baseScale * (1 + 0.06 * leanMult);
        targetRotation = -0.09 * leanMult;
      }

      if (dy < 0) {
        targetScaleY *= 1 + 0.05 * leanMult;
        targetScaleX *= 1 - 0.04 * leanMult;
        targetRotation -= 0.06 * leanMult;
      } else if (dy > 0) {
        targetScaleY *= 1 - 0.05 * leanMult;
        targetScaleX *= 1 + 0.04 * leanMult;
        targetRotation += 0.06 * leanMult;
      }
    } else {
      const breath = Math.sin(animTimer * 4.5) * 0.003;
      targetScaleX = this.baseScale + breath;
      targetScaleY = this.baseScale - breath;
      targetRotation = 0;
    }

    const lerpSpeed = Math.min(1, 30 * dt);
    this.sprite.scale.x += (targetScaleX - this.sprite.scale.x) * lerpSpeed;
    this.sprite.scale.y += (targetScaleY - this.sprite.scale.y) * lerpSpeed;
    this.sprite.rotation += (targetRotation - this.sprite.rotation) * lerpSpeed;
  }

  public shoot(bulletSystem: BulletSystem, targetPos: { x: number; y: number }): void {
    const shootInterval = 1 / Math.max(0.1, this.stats.shotsPerSecond);
    if (this.shootTimer < shootInterval) return;
    this.shootTimer = 0;

    const normClass = (this.characterClassId || '').toLowerCase();

    if (normClass === 'support' || normClass === 'healer') {
      // Support: Autoaim dirigido al objetivo más cercano (hadas o jefe)
      const angle = Math.atan2(targetPos.y - this.pos.y, targetPos.x - this.pos.x);
      bulletSystem.spawnPlayerBullet(
        this.pos.x + 20,
        this.pos.y,
        Math.cos(angle) * 1100,
        Math.sin(angle) * 1100,
        6,
        0xff00ff,
        this.stats.bulletDamage,
        'support'
      );
    } else if (normClass === 'tank' || normClass === 'defense') {
      // Tank: Disparo pesado
      bulletSystem.spawnPlayerBullet(
        this.pos.x + 20,
        this.pos.y,
        950,
        0,
        7,
        0x00ff88,
        this.stats.bulletDamage,
        'tank'
      );
    } else if (normClass === 'special_attack' || normClass === 'attack') {
      // SP.ATK: Disparo mágico místico
      bulletSystem.spawnPlayerBullet(
        this.pos.x + 20,
        this.pos.y,
        1200,
        0,
        6,
        0xa855f7,
        this.stats.bulletDamage,
        'special_attack'
      );
    } else {
      // DPS: Fuego rápido físico
      bulletSystem.spawnPlayerBullet(
        this.pos.x + 20,
        this.pos.y,
        1200,
        0,
        5,
        0xef4444,
        this.stats.bulletDamage,
        'dps'
      );
    }
  }

  public triggerSkill(
    wallSystem: WallSystem,
    laserSystem: LaserSystem,
    particleSystem: ParticleSystem,
    bulletSystem: BulletSystem,
    bossPos: { x: number; y: number },
    onSound?: (path: string, volume: number) => void
  ): boolean {
    if (this.skillCooldownTimer > 0) return false;
    if (!this.consumeBombGauge()) return false;
    this.skillCooldownTimer = 1.0;

    const normClass = (this.characterClassId || '').toLowerCase();

    if (normClass === 'tank' || normClass === 'defense') {
      // Tank: Despliega Muro de 25 HP con 2.5s de duración
      wallSystem.spawnWall(this.pos.x + 35, this.pos.y, 45, 0, 18, 64, 25, 2.5);
      particleSystem.spawnBurst(this.pos.x + 35, this.pos.y, 12, 90, [0x00ff88, 0x88ffcc], false);
      if (onSound) onSound('/assets/sounds/powerup.wav', 0.6);
      return true;
    }

    if (normClass === 'special_attack' || normClass === 'attack') {
      // SP.ATK: MARISA KIRISAME MASTER SPARK (1.0s de acumulación y congelamiento)
      laserSystem.spawnLaser(this.pos.x + 22, this.pos.y, this.pos.y, {
        ownerId: 'player',
        direction: 'right',
        chargeDuration: 1.0,
        fireDuration: 1.25,
        fadeDuration: 0.35,
        maxWidth: 96,
        color: 0x00f2fe,
      });

      if (onSound) onSound('/assets/sounds/masterspark_charge.wav', 0.95);
      return true;
    }

    if (normClass === 'support' || normClass === 'healer') {
      // Support: Ráfaga Super Autoaim
      for (let i = 0; i < 6; i++) {
        const angle = Math.atan2(bossPos.y - this.pos.y, bossPos.x - this.pos.x) + (i - 2.5) * 0.14;
        bulletSystem.spawnPlayerBullet(
          this.pos.x + 20,
          this.pos.y,
          Math.cos(angle) * 1100,
          Math.sin(angle) * 1100,
          6,
          0xff00ff,
          undefined,
          'support'
        );
      }
      if (onSound) onSound('/assets/sounds/powerup.wav', 0.5);
      return true;
    }

    // DPS: Turbo Stream
    for (let i = 0; i < 4; i++) {
      bulletSystem.spawnPlayerBullet(
        this.pos.x + 15 + i * 15,
        this.pos.y + (i % 2 === 0 ? -10 : 10),
        1300,
        0,
        5,
        0x00f2fe,
        undefined,
        'dps'
      );
    }
    if (onSound) onSound('/assets/sounds/powerup.wav', 0.5);
    return true;
  }
}

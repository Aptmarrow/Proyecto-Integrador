/**
 * Predictive Touhou Superplay Autopilot Bot (Dev Boss Lab / Showcase Recorder only).
 *
 * Runs at 60Hz with exact ground-truth knowledge of bullet physics (including M.O.'s
 * suspended wake `holdTag`, `turnAfter`/`turnAbsAngle` 90° folds, `freezeAfter`/`snapToPlayer`
 * lock-on snipers, `angularVel` galaxy spirals, physical `moDashLines` tackle corridors,
 * kamikaze enemies, and boss lasers) to produce smooth, human-looking near-0-hit runs.
 */

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const PLAYER_SPEED_X = 375;
const PLAYER_SPEED_Y = 500;
const FOCUS_MULT = 0.4;
const HIT_RADIUS_NORMAL = 10;
const HIT_RADIUS_FOCUS = 5;

// Multi-step lookahead timestamps (seconds ahead) — dense near-term + far-term fold/snap vision
const HORIZON_TIMES = [0.025, 0.065, 0.12, 0.19, 0.28, 0.40, 0.56, 0.74];
const NUM_STEPS = HORIZON_TIMES.length;
const MAX_TRACKED_BULLETS = 340;

export interface BotBulletView {
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  ttl: number;
  age?: number;
  delay?: number;
  holdTag?: number | null;
  turnAfter?: number;
  turnAngle?: number;
  turnAbsAngle?: number | null;
  turnSpeedMult?: number;
  turned?: boolean;
  angularVel?: number;
  freezeAfter?: number;
  freezeDur?: number;
  snapToPlayer?: boolean;
  snapOffset?: number;
  snapSpeed?: number;
  freezePhase?: number;
  freezeTimer?: number;
  accel?: number;
  expAccel?: number;
  maxSpeed?: number;
  homeRate?: number;
  homeTime?: number;
  splitOnImpact?: boolean;
}

export interface BotEnemyView {
  x: number;
  y: number;
  radius: number;
  speed: number;
  angle?: number;
  type?: string;
  trajectory?: string;
  fuseProgress?: number;
}

export interface BotLaserView {
  ownerId: string;
  direction: 'left' | 'right';
  sourceX: number;
  sourceY: number;
  state: 'charging' | 'firing' | 'fading';
  maxWidth: number;
  currentWidth: number;
}

export interface BotBossView {
  isActive: boolean;
  isDefeated: boolean;
  bossId: string;
  x: number;
  y: number;
  phase: number;
  moDashState: string;
  moDashLines: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    progress: number;
    active: boolean;
    completed?: boolean;
    isReturn?: boolean;
  }>;
}

export interface BotDecision {
  dx: number;
  dy: number;
  focus: boolean;
  action: 'shoot' | 'struggle_push' | null;
}

interface CandidateProfile {
  dx: number;
  dy: number;
  focus: boolean;
  stopAfter: number; // Infinity = sustained glide; >0 = tap-and-hold in Focus
  stopFocus: boolean;
}

// Precompute 33 authentic 8-way keyboard (WASD/Arrows) + Focus tap-and-hold candidate trajectories
// so movement looks 100% indistinguishable from a top human player on keyboard!
const CANDIDATES: CandidateProfile[] = (() => {
  const list: CandidateProfile[] = [];
  // 0: Hold position in pinpoint Focus (5px hitbox)
  list.push({ dx: 0, dy: 0, focus: true, stopAfter: Infinity, stopFocus: true });

  const DIRS_8: Array<[number, number]> = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  for (const [rx, ry] of DIRS_8) {
    const len = Math.hypot(rx, ry);
    const dx = rx / len;
    const dy = ry / len;
    // Focus sustained micro-glide (Shift + WASD)
    list.push({ dx, dy, focus: true, stopAfter: Infinity, stopFocus: true });
    // Focus short micro-tap -> hold pinpoint Focus inside pocket
    list.push({ dx, dy, focus: true, stopAfter: 0.14, stopFocus: true });
    // Full-speed macro escape (WASD without Shift)
    list.push({ dx, dy, focus: false, stopAfter: Infinity, stopFocus: false });
    // Fast burst -> immediate Shift Focus stop inside tight safe pocket
    list.push({ dx, dy, focus: false, stopAfter: 0.15, stopFocus: true });
  }
  return list;
})();

/**
 * Minimum squared distance from point (px, py) to segment (x1, y1)-(x2, y2).
 */
function distSqPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const lenSq = sx * sx + sy * sy;
  if (lenSq <= 1e-6) {
    const dx = px - x1;
    const dy = py - y1;
    return dx * dx + dy * dy;
  }
  let t = ((px - x1) * sx + (py - y1) * sy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const projX = x1 + sx * t;
  const projY = y1 + sy * t;
  const dx = px - projX;
  const dy = py - projY;
  return dx * dx + dy * dy;
}

/**
 * Closest squared distance between two linearly moving points over a time interval,
 * expressed as relative start offset (rx0, ry0) -> relative end offset (rx1, ry1).
 * Eliminates fast-bullet tunneling between lookahead steps!
 */
function minRelDistSq(rx0: number, ry0: number, rx1: number, ry1: number): number {
  const vx = rx1 - rx0;
  const vy = ry1 - ry0;
  const vLenSq = vx * vx + vy * vy;
  if (vLenSq <= 1e-6) return rx0 * rx0 + ry0 * ry0;
  let t = -(rx0 * vx + ry0 * vy) / vLenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = rx0 + vx * t;
  const cy = ry0 + vy * t;
  return cx * cx + cy * cy;
}

export class TouhouAutoplayBot {
  // Flat pre-allocated trajectory buffers: [bulletIdx * (NUM_STEPS + 1) + step] (step 0 = t=0)
  private readonly bTrajX = new Float32Array(MAX_TRACKED_BULLETS * (NUM_STEPS + 1));
  private readonly bTrajY = new Float32Array(MAX_TRACKED_BULLETS * (NUM_STEPS + 1));
  private readonly bTrajActive = new Uint8Array(MAX_TRACKED_BULLETS * (NUM_STEPS + 1));
  private readonly bRadius = new Float32Array(MAX_TRACKED_BULLETS);
  private readonly bIsHeld = new Uint8Array(MAX_TRACKED_BULLETS);

  private prevDx = 0;
  private prevDy = 0;
  private prevFocus = true;
  private commitTimer = 0;
  private focusHoldTimer = 0;

  public reset(): void {
    this.prevDx = 0;
    this.prevDy = 0;
    this.prevFocus = true;
    this.commitTimer = 0;
    this.focusHoldTimer = 0;
  }

  public computeInput(
    px: number,
    py: number,
    bullets: BotBulletView[],
    enemies: BotEnemyView[],
    lasers: BotLaserView[],
    boss: BotBossView,
    struggleActive: boolean,
    dt: number = 1 / 60
  ): BotDecision {
    if (struggleActive) {
      return { dx: 0, dy: 0, focus: false, action: 'struggle_push' };
    }

    this.commitTimer = Math.max(0, this.commitTimer - dt);
    this.focusHoldTimer = Math.max(0, this.focusHoldTimer - dt);

    // 1. Pre-predict every relevant enemy bullet across all 7 lookahead timestamps (exact physics!)
    let bCount = 0;
    const stride = NUM_STEPS + 1;
    const bTrajX = this.bTrajX;
    const bTrajY = this.bTrajY;
    const bTrajActive = this.bTrajActive;
    const bRadius = this.bRadius;
    const bIsHeld = this.bIsHeld;

    for (let i = 0; i < bullets.length && bCount < MAX_TRACKED_BULLETS; i++) {
      const b = bullets[i];
      if (b.ownerId !== 'boss') continue;

      // Fast distance cull for bullets far away on the opposite side of the arena
      const distX = b.x - px;
      const distY = b.y - py;
      if (distX * distX + distY * distY > 560 * 560) continue;

      const idx = bCount++;
      const base = idx * stride;
      const held = b.holdTag !== null && b.holdTag !== undefined;
      bIsHeld[idx] = held ? 1 : 0;
      bRadius[idx] = (b.radius || 5) + (b.splitOnImpact ? 6 : 0);

      let x = b.x;
      let y = b.y;
      let vx = b.vx;
      let vy = b.vy;
      let delay = b.delay || 0;
      let age = b.age || 0;
      let freezePhase = b.freezePhase || 0;
      let freezeTimer = b.freezeTimer || 0;
      let turned = Boolean(b.turned);
      let homeTime = b.homeTime || 0;
      let ttl = b.ttl;

      const turnAfter = b.turnAfter || 0;
      const turnAbsAngle = b.turnAbsAngle !== undefined && b.turnAbsAngle !== null ? b.turnAbsAngle : null;
      const turnAngle = b.turnAngle || 0;
      const turnSpeedMult = b.turnSpeedMult || 1;
      const angularVel = b.angularVel || 0;
      const freezeAfter = b.freezeAfter || 0;
      const freezeDur = b.freezeDur || 0.3;
      const snapToPlayer = Boolean(b.snapToPlayer);
      const snapOffset = b.snapOffset || 0;
      const snapSpeed = b.snapSpeed || 0;
      const accel = b.accel || 0;
      const expAccel = b.expAccel || 0;
      const maxSpeed = b.maxSpeed || 0;
      const homeRate = b.homeRate || 0;

      // Step 0 (t = 0): delay <= 0 is live lethal (1); ANY pending wake/delay > 0 is frozen warning (2)!
      bTrajX[base] = x;
      bTrajY[base] = y;
      bTrajActive[base] = delay <= 0 ? 1 : 2;

      let prevT = 0;
      for (let s = 0; s < NUM_STEPS; s++) {
        const curT = HORIZON_TIMES[s];
        const stepDt = curT - prevT;
        prevT = curT;

        // Subdivide larger horizons into <=0.045s micro-steps for accurate angularVel / freeze transitions
        const subCount = stepDt > 0.06 ? 3 : stepDt > 0.035 ? 2 : 1;
        const subDt = stepDt / subCount;

        for (let sub = 0; sub < subCount; sub++) {
          if (ttl <= 0) break;
          if (delay > 0) {
            delay = Math.max(0, delay - subDt);
            continue;
          }

          if (freezeAfter > 0 && freezePhase < 2) {
            if (freezePhase === 0 && age >= freezeAfter) {
              freezePhase = 1;
              freezeTimer = freezeDur;
              continue;
            }
            if (freezePhase === 1) {
              freezeTimer -= subDt;
              if (freezeTimer <= 0) {
                freezePhase = 2;
                turned = true;
                const baseSpd = snapSpeed > 0 ? snapSpeed : Math.hypot(vx, vy) * (turnSpeedMult || 1.55);
                const aim = snapToPlayer
                  ? Math.atan2(py - y, px - x) + snapOffset
                  : turnAbsAngle !== null
                    ? turnAbsAngle
                    : Math.atan2(vy, vx) + turnAngle;
                vx = Math.cos(aim) * baseSpd;
                vy = Math.sin(aim) * baseSpd;
              } else {
                continue;
              }
            }
          }

          age += subDt;

          if (!turned && freezeAfter <= 0 && turnAfter > 0 && age >= turnAfter) {
            turned = true;
            const spd = Math.hypot(vx, vy) * turnSpeedMult;
            const nextA = turnAbsAngle !== null ? turnAbsAngle : Math.atan2(vy, vx) + turnAngle;
            vx = Math.cos(nextA) * spd;
            vy = Math.sin(nextA) * spd;
          }

          if (angularVel !== 0) {
            const spd = Math.hypot(vx, vy);
            if (spd > 0.001) {
              const nextA = Math.atan2(vy, vx) + angularVel * subDt;
              vx = Math.cos(nextA) * spd;
              vy = Math.sin(nextA) * spd;
            }
          }

          if (expAccel !== 0) {
            const spd = Math.hypot(vx, vy);
            if (spd > 0.001) {
              const nextSpd = maxSpeed > 0
                ? Math.min(maxSpeed, spd * Math.exp(expAccel * subDt))
                : spd * Math.exp(expAccel * subDt);
              const f = nextSpd / spd;
              vx *= f;
              vy *= f;
            }
          } else if (accel !== 0) {
            const spd = Math.hypot(vx, vy);
            if (spd > 0.001) {
              const nextSpd = maxSpeed > 0 ? Math.min(maxSpeed, spd + accel * subDt) : spd + accel * subDt;
              const f = nextSpd / spd;
              vx *= f;
              vy *= f;
            }
          }

          if (homeRate > 0 && homeTime > 0) {
            homeTime -= subDt;
            const spd = Math.hypot(vx, vy);
            if (spd > 0.001) {
              const curA = Math.atan2(vy, vx);
              const aimA = Math.atan2(py - y, px - x);
              const diff = Math.atan2(Math.sin(aimA - curA), Math.cos(aimA - curA));
              const step = Math.max(-homeRate * subDt, Math.min(homeRate * subDt, diff));
              vx = Math.cos(curA + step) * spd;
              vy = Math.sin(curA + step) * spd;
            }
          }

          x += vx * subDt;
          y += vy * subDt;
          ttl -= subDt;
        }

        const outOfBounds = ttl <= 0 || x < -35 || x > WORLD_WIDTH + 35 || y < -35 || y > WORLD_HEIGHT + 35;
        bTrajX[base + s + 1] = x;
        bTrajY[base + s + 1] = y;
        bTrajActive[base + s + 1] = outOfBounds ? 0 : delay <= 0 ? 1 : 2;
      }
    }

    // 2. Gather active M.O. tackle segments & boss body threat
    const bossActive = boss.isActive && !boss.isDefeated;
    const isMo = bossActive && boss.bossId === 'mo';
    const dashLines = isMo && (boss.moDashState === 'telegraph' || boss.moDashState === 'dashing')
      ? boss.moDashLines.filter((l) => !l.completed && !l.isReturn)
      : [];
    const isDashingNow = isMo && boss.moDashState === 'dashing';

    // 3. Dynamic Touhou superplay combat anchor (actively lines up horizontal shots with boss/enemies!)
    let idealX = 165;
    let idealY = 300;
    if (bossActive) {
      idealY = Math.max(92, Math.min(508, boss.y));
      // Stay cleanly to the left of the boss so horizontal primary shots continuously hit!
      if (isMo) {
        if (boss.x < 260) {
          // M.O. is diving deep left: shift smoothly into open midfield rather than corner-hugging
          idealX = 290;
        } else {
          idealX = Math.max(115, Math.min(240, boss.x - 280));
        }
      } else {
        idealX = 185;
      }
    } else if (enemies.length > 0) {
      let closestE = enemies[0];
      let bestD = Infinity;
      for (const e of enemies) {
        const d = Math.abs(e.y - py) + Math.abs(e.x - px) * 0.35;
        if (d < bestD) {
          bestD = d;
          closestE = e;
        }
      }
      idealY = Math.max(90, Math.min(510, closestE.y));
      idealX = 175;
    }

    // 4. Score all 57 candidate trajectories across all 7 lookahead horizons
    let bestScore = Infinity;
    let bestCand = CANDIDATES[0];

    for (let cIdx = 0; cIdx < CANDIDATES.length; cIdx++) {
      const cand = CANDIDATES[cIdx];
      let score = 0;
      let cxPrev = px;
      let cyPrev = py;
      let prevT = 0;

      for (let s = 0; s < NUM_STEPS; s++) {
        const curT = HORIZON_TIMES[s];
        const stepDt = curT - prevT;
        const moving = prevT < cand.stopAfter;
        const focusNow = moving ? cand.focus : cand.stopFocus;
        const hitR = focusNow ? HIT_RADIUS_FOCUS : HIT_RADIUS_NORMAL;
        const mult = focusNow ? FOCUS_MULT : 1.0;

        let cx = cxPrev;
        let cy = cyPrev;
        if (moving) {
          const activeDt = Math.min(stepDt, Math.max(0, cand.stopAfter - prevT));
          cx = Math.max(22, Math.min(WORLD_WIDTH - 22, cxPrev + cand.dx * PLAYER_SPEED_X * mult * activeDt));
          cy = Math.max(22, Math.min(WORLD_HEIGHT - 22, cyPrev + cand.dy * PLAYER_SPEED_Y * mult * activeDt));
        }

        // Time urgency weight: near-term survival matters exponentially more than far-term
        const timeWeight = 1.0 / (0.07 + curT * 1.45);

        // 4A. Swept bullet collision & smooth graze-clearance gradient
        for (let bi = 0; bi < bCount; bi++) {
          const base = bi * stride;
          const act1 = bTrajActive[base + s + 1];
          if (act1 === 0) continue;

          const bx1 = bTrajX[base + s + 1];
          const by1 = bTrajY[base + s + 1];

          // Fast AABB reject (skips >90% of bullets in 2 compares!)
          const ddx = bx1 - cx;
          const ddy = by1 - cy;
          if (ddx > 88 || ddx < -88 || ddy > 88 || ddy < -88) continue;

          const br = bRadius[bi];
          const act0 = bTrajActive[base + s];

          let dSq: number;
          if (act0 === 1 && act1 === 1) {
            // Swept relative closest approach (impossible for fast darts to tunnel!)
            const bx0 = bTrajX[base + s];
            const by0 = bTrajY[base + s];
            dSq = minRelDistSq(bx0 - cxPrev, by0 - cyPrev, ddx, ddy);
          } else {
            dSq = ddx * ddx + ddy * ddy;
          }

          if (act1 === 2) {
            // Pending / suspended M.O. wake bead about to launch: keep clear so it never wakes inside our hitbox!
            const heldSafe = hitR + br + 12;
            if (dSq < heldSafe * heldSafe) {
              const pen = heldSafe - Math.sqrt(dSq);
              score += (65000 + pen * pen * 2200) * timeWeight;
            }
            continue;
          }

          // Two-tier precision hitbox:
          //  - Tier 1 (trueLethalR): real hitbox + 2.4px -> impossible-to-accept collision (1e8)
          //  - Tier 2 (comfortR): real hitbox + 7.5px -> avoids tight grazes when open space exists,
          //    WITHOUT panicking into walls when a clean narrow Touhou gap is available!
          const trueLethalR = hitR + br + 2.4;
          const comfortR = hitR + br + 7.5;
          const warnR = comfortR + 16;

          if (dSq < trueLethalR * trueLethalR) {
            const pen = trueLethalR - Math.sqrt(dSq);
            score += (1.0e8 + pen * 5.0e6) * timeWeight;
          } else if (dSq < comfortR * comfortR) {
            const pen = comfortR - Math.sqrt(dSq);
            score += (2.4e5 + pen * 4.0e4) * timeWeight;
          } else if (dSq < warnR * warnR) {
            const gap = warnR - Math.sqrt(dSq);
            score += gap * gap * 20 * timeWeight;
          }
        }

        // 4B. M.O. physical tackle corridors (`moDashLines`) + boss body + endpoint burst avoidance
        if (dashLines.length > 0) {
          // Physical contact radius is 46px (38+8) regardless of Focus -> Tier 1 hard 56px, Tier 2 comfort 76px!
          const dashHardR = 56;
          const dashComfortR = 78;
          for (let li = 0; li < dashLines.length; li++) {
            const l = dashLines[li];
            const segDSq = distSqPointToSegment(cx, cy, l.x1, l.y1, l.x2, l.y2);
            const urgency = isDashingNow ? (l.active ? 2.6 : 1.5) : (0.9 + l.progress * 1.1);
            if (segDSq < dashHardR * dashHardR) {
              const pen = dashHardR - Math.sqrt(segDSq);
              score += (2.2e7 + pen * 8.0e5) * urgency * timeWeight;
            } else if (segDSq < dashComfortR * dashComfortR) {
              const gap = dashComfortR - Math.sqrt(segDSq);
              score += (4.5e4 + gap * gap * 45) * urgency * timeWeight;
            }
          }
          // Stay clear of M.O.'s wall-slam endpoint where the 5/7-way aimed burst spawns (never get corner-pinned!)
          const endSeg = dashLines[dashLines.length - 1];
          const endDx = endSeg.x2 - cx;
          const endDy = endSeg.y2 - cy;
          const endDistSq = endDx * endDx + endDy * endDy;
          const endSafeR = 132;
          if (endDistSq < endSafeR * endSafeR) {
            const pen = endSafeR - Math.sqrt(endDistSq);
            score += (2.8e5 + pen * pen * 60) * timeWeight;
          }
        }

        if (bossActive) {
          const bdx = boss.x - cx;
          const bdy = boss.y - cy;
          const bossDistSq = bdx * bdx + bdy * bdy;
          const bossHardR = isMo ? 58 : 54;
          const bossComfortR = isMo ? 76 : 70;
          if (bossDistSq < bossHardR * bossHardR) {
            const pen = bossHardR - Math.sqrt(bossDistSq);
            score += (4.0e7 + pen * 1.2e6) * timeWeight;
          } else if (bossDistSq < bossComfortR * bossComfortR) {
            const gap = bossComfortR - Math.sqrt(bossDistSq);
            score += gap * gap * 90 * timeWeight;
          }
        }

        // 4C. Enemies & Kamikaze drones (MOenemy2 blast radius!)
        for (let ei = 0; ei < enemies.length; ei++) {
          const e = enemies[ei];
          let ex = e.x;
          let ey = e.y;
          if (e.trajectory === 'kamikaze_homing' || e.type === 'mo_enemy2') {
            const a = Math.atan2(py - ey, px - ex);
            ex += Math.cos(a) * e.speed * curT;
            ey += Math.sin(a) * e.speed * curT;
          } else {
            const a = e.angle ?? Math.PI;
            ex += Math.cos(a) * e.speed * curT;
            ey += Math.sin(a) * e.speed * curT;
          }
          const edx = ex - cx;
          const edy = ey - cy;
          const eDistSq = edx * edx + edy * edy;
          const isKamikaze = e.type === 'mo_enemy2' || e.trajectory === 'kamikaze_homing';
          const isArmedKamikaze = isKamikaze && (e.fuseProgress || 0) > 0.15;
          const eHardR = isArmedKamikaze ? 118 : isKamikaze ? 72 : e.radius + hitR + 18;
          if (eDistSq < eHardR * eHardR) {
            const pen = eHardR - Math.sqrt(eDistSq);
            score += (3.5e7 + pen * 1.0e6) * timeWeight;
          }
        }

        // 4D. Boss Lasers (charging or firing)
        for (let li = 0; li < lasers.length; li++) {
          const l = lasers[li];
          if (l.ownerId !== 'boss' || l.state === 'fading') continue;
          const inX = l.direction === 'left' ? cx <= l.sourceX + 20 : cx >= l.sourceX - 20;
          if (inX) {
            const halfW = Math.max(l.maxWidth, l.currentWidth) * 0.5 + hitR + 24;
            const dyL = Math.abs(cy - l.sourceY);
            if (dyL < halfW) {
              const pen = halfW - dyL;
              score += (l.state === 'firing' ? 6.0e7 : 1.5e7 + pen * 4e5) * timeWeight;
            }
          }
        }

        // 4E. Virtual Arena Fence (stronger than Tier-2 comfort graze so bot NEVER flees into a corner trap!)
        const wallSoft = 96;
        const wallFence = 48;
        const wallRightSoft = 450;
        const wallRightFence = 540;
        if (cx < wallFence) {
          const d = wallFence - cx;
          score += (7.5e5 + d * d * 450) * timeWeight;
        } else if (cx < wallSoft) {
          const d = wallSoft - cx;
          score += d * d * 28;
        }
        if (cx > wallRightFence) {
          const d = cx - wallRightFence;
          score += (7.5e5 + d * d * 450) * timeWeight;
        } else if (cx > wallRightSoft) {
          const d = cx - wallRightSoft;
          score += d * d * 14;
        }
        if (cy < wallFence) {
          const d = wallFence - cy;
          score += (7.5e5 + d * d * 450) * timeWeight;
        } else if (cy < wallSoft) {
          const d = wallSoft - cy;
          score += d * d * 28;
        }
        if (cy > WORLD_HEIGHT - wallFence) {
          const d = cy - (WORLD_HEIGHT - wallFence);
          score += (7.5e5 + d * d * 450) * timeWeight;
        } else if (cy > WORLD_HEIGHT - wallSoft) {
          const d = cy - (WORLD_HEIGHT - wallSoft);
          score += d * d * 28;
        }

        // 4F. Aggressive Touhou Boss-Lineup Positioning (continuously deals DPS when safe!)
        if (s === NUM_STEPS - 1) {
          const toIdealX = cx - idealX;
          const toIdealY = cy - idealY;
          score += toIdealX * toIdealX * 0.14 + toIdealY * toIdealY * 0.34;
          // Extra crisp lineup reward when directly firing into boss hitbox
          if (bossActive && cx < boss.x - 45 && Math.abs(cy - boss.y) < 38) {
            score -= 2200;
          }
        }

        // Early pruning if this candidate already hit something much worse than bestScore
        if (score > bestScore + 1e6) break;

        cxPrev = cx;
        cyPrev = cy;
        prevT = curT;
      }

      // 5. Smooth human-like continuity (anti-jitter keyboard hold + natural Shift Focus rhythm)
      const dirDiffSq = (cand.dx - this.prevDx) ** 2 + (cand.dy - this.prevDy) ** 2;
      score += dirDiffSq * (this.commitTimer > 0 ? 220 : 85);
      if (cand.focus !== this.prevFocus) {
        score += this.focusHoldTimer > 0 ? 480 : 35;
      }
      if (cand.focus) {
        score -= 18;
      }
      if (cand.dx === 0 && cand.dy === 0) {
        score -= 12;
      }

      if (score < bestScore) {
        bestScore = score;
        bestCand = cand;
      }
    }

    // Small human-like hold hysteresis so direction & Shift don't flicker frame-to-frame
    const switchedHard = (bestCand.dx - this.prevDx) ** 2 + (bestCand.dy - this.prevDy) ** 2 > 1.2;
    if (switchedHard && bestScore < 50000) {
      this.commitTimer = 0.08;
    }
    if (bestCand.focus !== this.prevFocus) {
      this.focusHoldTimer = 0.14;
    }

    this.prevDx = bestCand.dx;
    this.prevDy = bestCand.dy;
    this.prevFocus = bestCand.focus;

    return {
      dx: bestCand.dx,
      dy: bestCand.dy,
      focus: bestCand.focus,
      action: 'shoot',
    };
  }
}

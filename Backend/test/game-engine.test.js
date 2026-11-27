'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { acquireBullet, releaseBullet } = require('../src/game/entities/Bullet');
const { BulletSystem } = require('../src/game/systems/BulletSystem');
const { LaserSystem } = require('../src/game/systems/LaserSystem');
const { WallSystem } = require('../src/game/systems/WallSystem');
const SpatialHash = require('../src/game/systems/SpatialHash');
const { spawnAutoAimBullet } = require('../src/game/autoAim');
const GameRoom = require('../src/game/GameRoom');
const { getStageConfig, hasNextStage, getNextStageIndices } = require('../src/game/campaign/stageConfigs');
const { validateClientMessage } = require('../src/ws/gameSecurity');

describe('Authoritative 60Hz Game Engine & Physics', () => {
  it('validates bullet defaults, pooling, and auto-aim targeting', () => {
    const b = acquireBullet('p1', 100, 100, 100, 0, 4, 3, 'normal');
    assert.equal(b.damage, 5);
    releaseBullet(b);

    const bulletSystem = new BulletSystem();
    const targets = [
      { x: 500, y: 300, hp: 100 },
      { x: 200, y: 200, hp: 100 },
    ];
    const auto = spawnAutoAimBullet(bulletSystem, 'p1', 100, 200, targets, 500);
    assert.ok(auto.vx > 0);
    assert.equal(Math.round(auto.vy), 0);
  });

  it('validates Tank wall blocking and Master Spark laser interactions', () => {
    const bulletSystem = new BulletSystem();
    const wallSystem = new WallSystem();
    const laserSystem = new LaserSystem();

    const wall = wallSystem.spawnWall('tank1', 200, 200, 40, 0, 14, 48, 25, 1.0);
    assert.equal(wall.hp, 25);
    bulletSystem.spawnBullet('boss', 195, 200, 200, 0, 4, 3, 'normal');
    const blocked = wallSystem.blockBullets(bulletSystem);
    assert.equal(blocked.length, 1);
    assert.equal(bulletSystem.active.length, 0);

    laserSystem.spawnLaser(700, 300, 300, {
      ownerId: 'boss',
      direction: 'left',
      chargeDuration: 0,
      fireDuration: 1.0,
      maxWidth: 40,
      dps: 50,
    });
    laserSystem.update(0.01);

    bulletSystem.spawnBullet('p1', 500, 305, 300, 0, 4, 3, 'normal');
    laserSystem.clearBulletsInPath(bulletSystem);
    assert.equal(bulletSystem.active.length, 0);

    const w1 = wallSystem.spawnWall('t1', 500, 300, 0, 0, 14, 48, 25, 2.0);
    const w2 = wallSystem.spawnWall('t2', 400, 300, 0, 0, 14, 48, 25, 2.0);
    for (let i = 0; i < 60; i++) {
      laserSystem.strikeWalls(wallSystem, 1 / 60);
      wallSystem.update(1 / 60);
    }
    assert.equal(w1.hp, 0);
    assert.equal(w2.hp, 0);
  });

  it('queries nearby entities via SpatialHash', () => {
    const hash = new SpatialHash(64);
    const near = { id: 'a', x: 100, y: 100 };
    const far = { id: 'b', x: 700, y: 500 };
    hash.insert(near);
    hash.insert(far);
    const found = hash.query(110, 110, 30);
    assert.ok(found.includes(near));
    assert.ok(!found.includes(far));
    hash.clear();
    assert.equal(hash.query(110, 110, 30).length, 0);
  });

  it('loads campaign configs across worlds, stages, and difficulties', () => {
    for (const diff of ['normal', 'difficult', 'no_mercy']) {
      for (const worldIdx of [0, 1, 2]) {
        for (const stageIdx of [0, 1, 2]) {
          const cfg = getStageConfig(diff, worldIdx, stageIdx);
          assert.ok(cfg, `Missing config for W${worldIdx + 1}-${stageIdx + 1} (${diff})`);
          assert.equal(cfg.world, worldIdx + 1);
          assert.equal(cfg.stage, stageIdx + 1);
        }
      }
    }
    assert.equal(hasNextStage(0, 0, 'normal'), true);
    assert.deepEqual(getNextStageIndices(0, 2, 'normal'), { worldIndex: 1, stageIndex: 0 });
    assert.equal(hasNextStage(2, 2, 'normal'), false);
    assert.equal(getNextStageIndices(2, 2, 'normal'), null);
  });

  it('simulates full 4-player GameRoom combat, boss spawn, and snapshot state', () => {
    const room = new GameRoom('sim-room', 'p1', { difficulty: 'normal', world: 1, stage: 1 });
    room.addPlayer('p1', 'Tank');
    room.addPlayer('p2', 'Support');
    room.addPlayer('p3', 'DPS');
    room.addPlayer('p4', 'Special_Attack');

    // All 4 players must spawn on the left side of the 800x600 arena
    const initialSnap = room.getState();
    for (const p of initialSnap.players) {
      assert.ok(p.x >= 50 && p.x <= 220, `Expected left-side spawn for ${p.id}, got x=${p.x}`);
    }

    room.setPlayerReady('p1', true);
    room.setPlayerReady('p2', true);
    room.setPlayerReady('p3', true);
    room.setPlayerReady('p4', true);
    room.phase = 'playing';

    room.setInput('p1', { dx: 1, dy: 0, action: 'wall' });
    room.setInput('p2', { dx: 0, dy: 1, action: 'shoot' });
    room.setInput('p3', { dx: 0, dy: -1, action: 'special' });
    room.setInput('p4', { dx: -1, dy: 0, action: 'laser' });

    for (let i = 0; i < 30; i++) {
      room.update(1 / 60);
    }

    const snap = room.getState();
    assert.equal(snap.type, 'snapshot');
    assert.equal(snap.players.length, 4);
    assert.ok(Array.isArray(snap.bullets));
    assert.ok(Array.isArray(snap.walls));
    assert.ok(Array.isArray(snap.lasers));
    assert.ok(snap.campaign);

    // Spawn boss and advance ticks
    room.spawnBossNow();
    for (let i = 0; i < 20; i++) {
      room.update(1 / 60);
    }
    const bossSnap = room.getState();
    assert.ok(bossSnap.boss);

    // Remove player and verify clean removal
    room.removePlayer('p4');
    assert.equal(room.getState().players.length, 3);
  });

  it('supports multiplayer custom calibration stages and leave-game validation', () => {
    assert.equal(validateClientMessage({ type: 'leave-game' }).ok, true);

    const calRoom = new GameRoom('cal-room', 'p1', { difficulty: 'custom_cal', world: 1, stage: 1 });
    calRoom.addPlayer('p1', 'DPS');
    calRoom.addPlayer('p2', 'Support');
    calRoom.phase = 'playing';

    calRoom.setInput('p1', { dx: 1, dy: 0, action: 'shoot' });
    calRoom.setInput('p2', { dx: 0, dy: 1, action: 'special' });
    calRoom.spawnBossNow();
    for (let i = 0; i < 30; i++) {
      calRoom.update(1 / 60);
    }

    const snap = calRoom.getState();
    assert.equal(snap.players.length, 2);
    assert.equal(snap.bullets.length, 0);
    assert.equal(snap.enemies.length, 0);
    assert.equal(snap.boss.isActive, false);
    assert.equal(snap.campaign.disableBoss, true);
    assert.equal(snap.campaign.disableWeapons, true);

    // Verify Planck maxTranslation is not capping player movement at 120 u/s:
    // After 0.5s: p1 moves ~187.5 in X (375 u/s) and p2 moves ~250 in Y (500 u/s)
    const p1 = snap.players.find((p) => p.id === 'p1');
    const p2 = snap.players.find((p) => p.id === 'p2');
    assert.ok(p1.x - 110 > 170 && p1.x - 110 < 205, `Expected p1 horizontal move ~187.5, got ${p1.x - 110}`);
    assert.ok(p2.y - 360 > 215 && p2.y - 360 < 260, `Expected p2 vertical move ~250 (clamped near wall), got ${p2.y - 360}`);
  });

  it('executes M.O. (Mechanical Ophanim) 5 distinct geometric shapes & bullet mechanics with zero safespots', () => {
    const moRoom = new GameRoom('room-mo-rework', 'p1', {
      initialPhase: 'playing',
      difficulty: 'normal',
      world: 3,
      stage: 3,
    });
    moRoom.addPlayer('p1', 'Special_Attack');
    const p1 = moRoom.players.get('p1');
    moRoom.spawnBossNow();
    assert.equal(moRoom.boss.bossId, 'mo');

    // Finish M.O. intro (~4s)
    for (let i = 0; i < 250; i++) moRoom.update(1 / 60);
    assert.equal(moRoom.boss.moIntroActive, false);
    assert.equal(moRoom.boss.moDashState, 'telegraph');

    // Verify all 5 distinct geometric shapes & purpose-built bullet behaviors across P1..P5:
    const seenShapes = new Set();
    const seenStates = new Set();
    let sawSinglePinballLine = false;
    let sawSmoothCurvePath = false;
    let sawAbsFoldBullet = false;
    let sawFreezeSnapBullet = false;
    let sawCurvedSpiralBullet = false;
    let stationaryPlayerHit = false;

    for (let targetPhase = 1; targetPhase <= 5; targetPhase++) {
      moRoom.boss.phase = targetPhase;
      p1.hp = p1.stats.hpMax;
      for (let i = 0; i < 360; i++) {
        moRoom.update(1 / 60);
        seenStates.add(moRoom.boss.moDashState);
        if (moRoom.boss.moDashState === 'telegraph') {
          const count = moRoom.boss.moDashLines.length;
          if (count === 1) sawSinglePinballLine = true;
          if (count >= 8) sawSmoothCurvePath = true;
        }
        if (moRoom.boss._moState?.shapeKind) {
          seenShapes.add(moRoom.boss._moState.shapeKind);
        }
        for (const b of moRoom.bulletSystem.active) {
          if (b._turned && b.turnAbsAngle !== null) sawAbsFoldBullet = true;
          if (b._freezePhase === 2 && b.snapToPlayer) sawFreezeSnapBullet = true;
          if (b.angularVel !== 0) sawCurvedSpiralBullet = true;
        }
        if (p1.hp < p1.stats.hpMax) {
          stationaryPlayerHit = true;
          p1.hp = p1.stats.hpMax; // revive to keep testing remaining phases
        }
      }
    }

    assert.deepEqual(
      [...seenShapes].sort(),
      ['crescent_arc', 'infinity_loop', 'ophanim_halo', 'pinball_snipe', 'sine_serpent'],
      'Expected all 5 distinct geometric tackle shapes'
    );
    assert.equal(sawSinglePinballLine, true, 'Expected single-line Pinball telegraph in P3');
    assert.equal(sawSmoothCurvePath, true, 'Expected smooth curved polyline telegraphs (☾, ∿, ∞, ◎)');
    assert.ok(seenStates.has('telegraph') && seenStates.has('dashing') && seenStates.has('resting'));
    assert.equal(stationaryPlayerHit, true, 'Standing still must NOT be a safespot');
    assert.equal(sawAbsFoldBullet, true, 'Expected deterministic 90° grid-fold / jaw bullets (turnAbsAngle)');
    assert.equal(sawFreezeSnapBullet, true, 'Expected Freeze -> Red Lock-On -> Snap-to-Player bullets');
    assert.equal(sawCurvedSpiralBullet, true, 'Expected continuous curved spiral bullets (angularVel)');
  });
});


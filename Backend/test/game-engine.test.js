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
});


'use strict';

const planck = require('planck');

// Planck/Box2D defaults maxTranslation to 2.0 units/step (120 u/s at 60Hz), which
// severely clamps pixel-space (800x600) worlds. Raise the ceiling for crisp Touhou movement.
planck.Settings.maxTranslation = 100;
planck.Settings.maxTranslationSquared = 100 * 100;

const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const PLAYER_RADIUS = 10;
// Isotropic visual speed on 1024x576 canvas (SCALE_X=1.28, SCALE_Y=0.96):
// 375 * 1.28 = 480 px/s horizontal, 500 * 0.96 = 480 px/s vertical
const PLAYER_SPEED_X = 375;
const PLAYER_SPEED_Y = 500;
const PLAYER_SPEED = 480;
const FOCUS_SPEED_MULTIPLIER = 0.40; // ~192 px/s pinpoint Touhou micro-dodge

/**
 * Create a Planck.js world with no gravity and non-bouncy boundary walls.
 */
function createWorld() {
  const world = planck.World({ gravity: planck.Vec2(0, 0) });

  // Static boundary walls: top, right, bottom, left
  const wallDefs = [
    [planck.Vec2(0, 0),            planck.Vec2(WORLD_WIDTH, 0)],
    [planck.Vec2(WORLD_WIDTH, 0),  planck.Vec2(WORLD_WIDTH, WORLD_HEIGHT)],
    [planck.Vec2(WORLD_WIDTH, WORLD_HEIGHT), planck.Vec2(0, WORLD_HEIGHT)],
    [planck.Vec2(0, WORLD_HEIGHT), planck.Vec2(0, 0)],
  ];

  for (const [p1, p2] of wallDefs) {
    const wall = world.createBody({ type: 'static' });
    wall.createFixture(planck.Edge(p1, p2), { friction: 0, restitution: 0 });
  }

  return world;
}

/**
 * Add a dynamic circular body for a player at the given spawn position.
 * Negative filterGroupIndex lets co-op teammates pass through each other cleanly.
 * @returns {planck.Body}
 */
function addPlayerBody(world, x, y) {
  const body = world.createBody({
    type: 'dynamic',
    position: planck.Vec2(x, y),
    fixedRotation: true,
    linearDamping: 0,
    bullet: true,
  });
  body.createFixture(planck.Circle(PLAYER_RADIUS), {
    density: 1.0,
    friction: 0,
    restitution: 0,
    filterGroupIndex: -1,
  });
  return body;
}

/**
 * Apply normalised directional input to a player body.
 * @param {planck.Body} body
 * @param {{ dx: number, dy: number, focus?: boolean }} input - components in [-1, 1]
 */
function applyInput(body, input) {
  const { dx = 0, dy = 0, focus = false } = input;
  const len = Math.sqrt(dx * dx + dy * dy);
  const mult = focus ? FOCUS_SPEED_MULTIPLIER : 1.0;
  if (len > 0) {
    const nx = dx / len;
    const ny = dy / len;
    body.setLinearVelocity(planck.Vec2(
      nx * PLAYER_SPEED_X * mult,
      ny * PLAYER_SPEED_Y * mult,
    ));
  } else {
    body.setLinearVelocity(planck.Vec2(0, 0));
  }
}

module.exports = {
  createWorld,
  addPlayerBody,
  applyInput,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_SPEED_X,
  PLAYER_SPEED_Y,
  FOCUS_SPEED_MULTIPLIER,
};

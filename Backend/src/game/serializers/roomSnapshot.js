'use strict';

function serializePlayers(players, fallbackStats) {
  const result = [];
  for (const [id, player] of players) {
    const pos = player.body.getPosition();
    const stats = player.stats || fallbackStats;
    result.push({
      id,
      x: pos.x,
      y: pos.y,
      angle: player.angle,
      isReady: player.isReady,
      character: player.character,
      focus: Boolean(player.input?.focus),
      hp: Number(player.hp.toFixed(2)),
      sp: Number(player.sp.toFixed(2)),
      maxHp: stats.hpMax,
      maxSp: stats.spMax,
      defensePercent: stats.defensePercent,
      lastProcessedSeq: typeof player.lastProcessedSeq === 'number' ? player.lastProcessedSeq : -1,
    });
  }
  return result;
}

function serializeBossHud(room) {
  if (!room.boss.isActive && !room.boss.isDefeated) {
    const mb = room.enemySystem.active.find((e) => e.isMiniboss && !e.isDead);
    if (mb) {
      return {
        x: mb.x,
        y: mb.y,
        hp: mb.hp,
        maxHp: mb.maxHp,
        phase: 1,
        remainingStocks: 0,
        spellcardName: mb.minibossName || 'MINIBOSS',
        isSpellCard: false,
        isActive: false,
        renderHudOnly: true,
        isMiniboss: true,
        bossId: mb.type,
        sprite: mb.sprite,
        angle: Number((mb.angle ?? Math.PI).toFixed(3)),
        isDefeated: false,
        isRefilling: false,
        isLockedForBeam: false,
      };
    }
  }
  return room.boss.toSnapshot();
}

function buildRoomSnapshot(room, options) {
  const { fallbackStats } = options;
  return {
    type: 'snapshot',
    tick: room.tick,
    phase: room.phase,
    countdownMs: room.phase === 'countdown' ? Math.max(0, room._countdownMs) : undefined,
    stageTime: room.stageTime,
    players: serializePlayers(room.players, fallbackStats),
    bullets: room.bulletSystem.getState(),
    lasers: room.laserSystem.getState(),
    walls: room.wallSystem.getState(),
    enemies: room.enemySystem.getState(),
    boss: serializeBossHud(room),
    campaign: room.campaign.toSnapshot(),
    struggle: room._beamStruggleController.toSnapshot(),
  };
}

module.exports = {
  buildRoomSnapshot,
};

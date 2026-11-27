'use strict';

const DEFAULT_PLAYER_STATS = {
  spMax: 1000,
  hpMax: 100,
  bulletDamage: 5,
  shotsPerSecond: 8,
  bombDamage: 750,
  spChargePerHit: 2,
  defensePercent: 50,
};

const CHARACTER_STATS = {
  dps: { ...DEFAULT_PLAYER_STATS, shotsPerSecond: 9.5, bulletDamage: 3.1 },
  physical: { ...DEFAULT_PLAYER_STATS, shotsPerSecond: 9.5, bulletDamage: 3.1 },
  special_attack: { ...DEFAULT_PLAYER_STATS, shotsPerSecond: 8.2, bulletDamage: 3.4 },
  attack: { ...DEFAULT_PLAYER_STATS, shotsPerSecond: 8.2, bulletDamage: 3.4 },
  tank: { ...DEFAULT_PLAYER_STATS, hpMax: 140, defensePercent: 65, shotsPerSecond: 5.8, bulletDamage: 3.0, bombDamage: 500 },
  defense: { ...DEFAULT_PLAYER_STATS, hpMax: 140, defensePercent: 65, shotsPerSecond: 5.8, bulletDamage: 3.0, bombDamage: 500 },
  support: { ...DEFAULT_PLAYER_STATS, hpMax: 90, defensePercent: 40, shotsPerSecond: 7.2, bulletDamage: 2.7, bombDamage: 600 },
  healer: { ...DEFAULT_PLAYER_STATS, hpMax: 90, defensePercent: 40, shotsPerSecond: 7.2, bulletDamage: 2.7, bombDamage: 600 },
};

function normalizeClassId(classId) {
  return String(classId || '').toLowerCase();
}

function getCharacterStats(classId) {
  const key = normalizeClassId(classId);
  return CHARACTER_STATS[key] || DEFAULT_PLAYER_STATS;
}

module.exports = {
  DEFAULT_PLAYER_STATS,
  normalizeClassId,
  getCharacterStats,
};

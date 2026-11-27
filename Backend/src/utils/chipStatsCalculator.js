'use strict';

const { getCharacterStats, normalizeClassId } = require('../game/config/characterStats');
const { MAX_EQUIPPED_CHIPS } = require('../models/Chips');

const BASE_CRITIC_CHANCE = 0;   // %
const BASE_CRIT_DAMAGE = 150;   // % (1.5x daño crítico base)
const MAX_DEFENSE = 85;
const MAX_CRITIC_CHANCE = 100;

/**
 * Metadata de cada stat para distinguir numéricos puros ('flat') vs porcentajes ('percent').
 */
const CHIP_STAT_META = {
  HP: { label: 'HP', kind: 'flat', unit: '' },
  Bullet_Damage: { label: 'ATK / Bullet DMG', kind: 'flat', unit: '' },
  Defense: { label: 'Defense', kind: 'flat', unit: '' },
  SP_Charge: { label: 'SP Charge', kind: 'flat', unit: '' },
  Ultimate_Damage: { label: 'Ultimate DMG', kind: 'percent', unit: '%' },
  Cadency: { label: 'Cadency', kind: 'percent', unit: '%' },
  Critic_Chance: { label: 'Crit Chance', kind: 'percent', unit: '%' },
  Crit_Damage: { label: 'Crit DMG', kind: 'percent', unit: '%' },
};

function sumChipStat(equippedChips, key) {
  let total = 0;
  for (const chip of equippedChips || []) {
    const raw = chip?.stats?.[key];
    const num = Number(raw);
    if (Number.isFinite(num)) {
      total += num;
    }
  }
  return Number(total.toFixed(2));
}

// ============================================================================
// UNA FUNCIÓN POR STAT — Numéricos puros (suma plana) vs Porcentajes (%)
// ============================================================================

/** Numérico puro: HP base + suma de HP de las chips equipadas */
function calculateHP(baseHp, equippedChips) {
  const bonus = sumChipStat(equippedChips, 'HP');
  return {
    base: baseHp,
    bonus,
    total: Number((baseHp + bonus).toFixed(2)),
    kind: 'flat',
  };
}

/** Numérico puro: daño de bala base + suma de Bullet_Damage */
function calculateBulletDamage(baseBulletDamage, equippedChips) {
  const bonus = sumChipStat(equippedChips, 'Bullet_Damage');
  return {
    base: baseBulletDamage,
    bonus,
    total: Number((baseBulletDamage + bonus).toFixed(2)),
    kind: 'flat',
  };
}

/** Numérico puro: defensa base + suma de Defense (tope seguro 85) */
function calculateDefense(baseDefense, equippedChips) {
  const bonus = sumChipStat(equippedChips, 'Defense');
  return {
    base: baseDefense,
    bonus,
    total: Number(Math.min(MAX_DEFENSE, Math.max(0, baseDefense + bonus)).toFixed(2)),
    kind: 'flat',
  };
}

/** Numérico puro: carga de SP por impacto base + suma de SP_Charge */
function calculateSPCharge(baseSpCharge, equippedChips) {
  const bonus = sumChipStat(equippedChips, 'SP_Charge');
  return {
    base: baseSpCharge,
    bonus,
    total: Number((baseSpCharge + bonus).toFixed(2)),
    kind: 'flat',
  };
}

/** Porcentaje (%): daño de ultimate base multiplicado por (1 + % / 100) */
function calculateUltimateDamage(baseUltimateDamage, equippedChips) {
  const bonusPercent = sumChipStat(equippedChips, 'Ultimate_Damage');
  return {
    base: baseUltimateDamage,
    bonusPercent,
    total: Number((baseUltimateDamage * (1 + bonusPercent / 100)).toFixed(2)),
    kind: 'percent',
  };
}

/** Porcentaje (%): cadencia de disparo base multiplicada por (1 + % / 100) */
function calculateCadency(baseCadency, equippedChips) {
  const bonusPercent = sumChipStat(equippedChips, 'Cadency');
  return {
    base: baseCadency,
    bonusPercent,
    total: Number((baseCadency * (1 + bonusPercent / 100)).toFixed(2)),
    kind: 'percent',
  };
}

/** Porcentaje (%): probabilidad de crítico (0% a 100%) */
function calculateCriticChance(baseCriticChance, equippedChips) {
  const bonusPercent = sumChipStat(equippedChips, 'Critic_Chance');
  return {
    base: baseCriticChance,
    bonusPercent,
    total: Number(Math.min(MAX_CRITIC_CHANCE, Math.max(0, baseCriticChance + bonusPercent)).toFixed(2)),
    kind: 'percent',
  };
}

/** Porcentaje (%): multiplicador de daño crítico (base 150% + % de chips) */
function calculateCritDamage(baseCritDamage, equippedChips) {
  const bonusPercent = sumChipStat(equippedChips, 'Crit_Damage');
  return {
    base: baseCritDamage,
    bonusPercent,
    total: Number((baseCritDamage + bonusPercent).toFixed(2)),
    kind: 'percent',
  };
}

/**
 * Calcula todas las stats de un jugador combinando el rol base + sus chips equipadas.
 */
function calculateTotalStats(classId = 'dps', equippedChips = []) {
  const normalizedClass = normalizeClassId(classId) || 'dps';
  const baseStats = getCharacterStats(normalizedClass);
  const chips = Array.isArray(equippedChips) ? equippedChips.slice(0, MAX_EQUIPPED_CHIPS) : [];

  const hp = calculateHP(baseStats.hpMax, chips);
  const bulletDamage = calculateBulletDamage(baseStats.bulletDamage, chips);
  const defense = calculateDefense(baseStats.defensePercent, chips);
  const spCharge = calculateSPCharge(baseStats.spChargePerHit, chips);
  const ultimateDamage = calculateUltimateDamage(baseStats.bombDamage, chips);
  const cadency = calculateCadency(baseStats.shotsPerSecond, chips);
  const criticChance = calculateCriticChance(BASE_CRITIC_CHANCE, chips);
  const critDamage = calculateCritDamage(BASE_CRIT_DAMAGE, chips);

  return {
    classId: normalizedClass,
    equippedCount: chips.length,
    maxEquipped: MAX_EQUIPPED_CHIPS,
    equippedChipIds: chips.map((c) => c.id),
    base: {
      HP: hp.base,
      Bullet_Damage: bulletDamage.base,
      Defense: defense.base,
      SP_Charge: spCharge.base,
      Ultimate_Damage: ultimateDamage.base,
      Cadency: cadency.base,
      Critic_Chance: criticChance.base,
      Crit_Damage: critDamage.base,
    },
    bonuses: {
      HP: hp.bonus,
      Bullet_Damage: bulletDamage.bonus,
      Defense: defense.bonus,
      SP_Charge: spCharge.bonus,
      Ultimate_Damage: ultimateDamage.bonusPercent,
      Cadency: cadency.bonusPercent,
      Critic_Chance: criticChance.bonusPercent,
      Crit_Damage: critDamage.bonusPercent,
    },
    total: {
      HP: hp.total,
      Bullet_Damage: bulletDamage.total,
      Defense: defense.total,
      SP_Charge: spCharge.total,
      Ultimate_Damage: ultimateDamage.total,
      Cadency: cadency.total,
      Critic_Chance: criticChance.total,
      Crit_Damage: critDamage.total,
    },
    breakdown: {
      HP: hp,
      Bullet_Damage: bulletDamage,
      Defense: defense,
      SP_Charge: spCharge,
      Ultimate_Damage: ultimateDamage,
      Cadency: cadency,
      Critic_Chance: criticChance,
      Crit_Damage: critDamage,
    },
    meta: CHIP_STAT_META,
  };
}

module.exports = {
  CHIP_STAT_META,
  calculateHP,
  calculateBulletDamage,
  calculateDefense,
  calculateSPCharge,
  calculateUltimateDamage,
  calculateCadency,
  calculateCriticChance,
  calculateCritDamage,
  calculateTotalStats,
};

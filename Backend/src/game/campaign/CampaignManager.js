'use strict';

const {
  getStageConfig,
  hasNextStage,
  getNextStageIndices,
  WORLDS_PER_DIFFICULTY,
  STAGES_PER_WORLD,
  DIFFICULTY_LABELS,
} = require('./stageConfigs');

const VALID_DIFFICULTIES = ['normal', 'difficult', 'no_mercy'];

function normalizeDifficulty(raw) {
  if (typeof raw === 'string' && raw.length >= 3 && raw.length <= 20) return raw;
  return 'normal';
}

function clampIndex(oneBased, max) {
  const num = Number(oneBased);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(max - 1, Math.floor(num) - 1));
}

/**
 * Manages campaign progression for a game room across the 27 space levels.
 * Tracks difficulty, current world/stage, and stage clear state.
 */
class CampaignManager {
  constructor(rawDifficulty, initialWorld = 1, initialStage = 1) {
    this.difficulty = normalizeDifficulty(rawDifficulty);
    const isStandard = VALID_DIFFICULTIES.includes(this.difficulty);
    this.worldIndex = isStandard ? clampIndex(initialWorld, WORLDS_PER_DIFFICULTY) : 0;
    this.stageIndex = isStandard ? clampIndex(initialStage, STAGES_PER_WORLD) : 0;
    this.campaignComplete = false;
    this.stageState = 'intro'; // 'intro' | 'waves' | 'boss_warning' | 'boss_battle' | 'stage_clear'
  }

  setLevel(world = 1, stage = 1) {
    const isStandard = VALID_DIFFICULTIES.includes(this.difficulty);
    this.worldIndex = isStandard ? clampIndex(world, WORLDS_PER_DIFFICULTY) : 0;
    this.stageIndex = isStandard ? clampIndex(stage, STAGES_PER_WORLD) : 0;
    this.campaignComplete = false;
    this.stageState = 'intro';
  }

  getStageConfig() {
    return getStageConfig(this.difficulty, this.worldIndex, this.stageIndex);
  }

  markStageCleared() {
    this.stageState = 'stage_clear';
    this.campaignComplete = !hasNextStage(this.worldIndex, this.stageIndex, this.difficulty);
  }

  advanceToNextStage() {
    const next = getNextStageIndices(this.worldIndex, this.stageIndex, this.difficulty);
    if (!next) return false;
    this.worldIndex = next.worldIndex;
    this.stageIndex = next.stageIndex;
    this.campaignComplete = false;
    this.stageState = 'intro';
    return true;
  }

  hasNextStage() {
    return hasNextStage(this.worldIndex, this.stageIndex, this.difficulty);
  }

  get bannerText() {
    const config = this.getStageConfig();
    return `MUNDO ${this.worldIndex + 1}-${this.stageIndex + 1} · ${config.worldName.toUpperCase()}`;
  }

  get bannerSubtext() {
    const config = this.getStageConfig();
    const label = DIFFICULTY_LABELS[this.difficulty] || this.difficulty;
    return `${label} — ${config.stageTitle}`;
  }

  get clearTitle() {
    const label = DIFFICULTY_LABELS[this.difficulty] || this.difficulty;
    if (this.campaignComplete) return `¡EXPEDICIÓN ${label.toUpperCase()} COMPLETADA!`;
    return `¡SECTOR ${this.worldIndex + 1}-${this.stageIndex + 1} DESPEJADO!`;
  }

  get clearSubtext() {
    const config = this.getStageConfig();
    const label = DIFFICULTY_LABELS[this.difficulty] || this.difficulty;
    if (this.campaignComplete) {
      return `Conquistaste los ${WORLDS_PER_DIFFICULTY * STAGES_PER_WORLD} sectores espaciales de ${label}.`;
    }
    return `${config.bossProfile?.bossName || 'Jefe'} derrotado en ${config.stageTitle}.`;
  }

  toSnapshot() {
    const config = this.getStageConfig();
    return {
      difficulty: this.difficulty,
      difficultyLabel: DIFFICULTY_LABELS[this.difficulty] || this.difficulty,
      world: this.worldIndex + 1,
      stage: this.stageIndex + 1,
      stageState: this.stageState,
      campaignComplete: this.campaignComplete,
      bannerText: this.bannerText,
      bannerSubtext: this.bannerSubtext,
      clearTitle: this.clearTitle,
      clearSubtext: this.clearSubtext,
      worldName: config.worldName,
      stageTitle: config.stageTitle,
      bossSpawnAt: config.bossSpawnAt,
      bossWarningAt: config.bossWarningAt,
      spaceTheme: config.spaceTheme,
    };
  }
}

module.exports = { CampaignManager };

'use strict';

/**
 * Timeline manager for stage events.
 * Fires events (spawn_wave, boss_warning, spawn_boss, stage_banner) at scheduled times.
 */
class TimelineManager {
  constructor() {
    /** @type {{ time: number, action: string, payload: any, executed: boolean }[]} */
    this.events = [];
    this.currentTime = 0;
    this.isPaused = false;
    /** @type {Map<string, function>} */
    this._handlers = new Map();
  }

  loadScript(events) {
    this.events = events
      .map((e) => ({ ...e, executed: false }))
      .sort((a, b) => a.time - b.time);
    this.currentTime = 0;
    this.isPaused = false;
  }

  /**
   * Build and load timeline events from a 27-level space stage config.
   */
  loadFromStageConfig(config, bannerText, bannerSubtext) {
    const waveEvents = Array.isArray(config.waves) && config.waves.length > 0
      ? config.waves.map((w, idx) => ({
          time: w.at,
          action: 'spawn_wave',
          payload: {
            wave: idx + 1,
            archetype: w.archetype,
            enemies: w.enemies,
          },
        }))
      : (config.wavePattern || []).map((wave, idx) => ({
          time: config.waveScheduleSeconds?.[idx] || (3 + idx * 7),
          action: 'spawn_wave',
          payload: { wave },
        }));

    const endAction = config.hasBoss === false && config.miniboss ? 'spawn_miniboss' : 'spawn_boss';

    const events = [
      {
        time: 0.1,
        action: 'stage_banner',
        payload: { text: bannerText, subtext: bannerSubtext },
      },
      ...waveEvents,
    ];

    if (!config.disableBoss) {
      events.push(
        {
          time: config.bossWarningAt,
          action: 'boss_warning',
          payload: { isMiniboss: endAction === 'spawn_miniboss' },
        },
        {
          time: config.bossSpawnAt,
          action: endAction,
          payload: config.miniboss ? { miniboss: config.miniboss } : {},
        }
      );
    }

    this.loadScript(events);
  }

  on(action, handler) {
    this._handlers.set(action, handler);
    return this;
  }

  update(dt) {
    if (this.isPaused) return;

    this.currentTime += dt;

    for (const ev of this.events) {
      if (!ev.executed && this.currentTime >= ev.time) {
        ev.executed = true;
        const handler = this._handlers.get(ev.action);
        if (handler) handler(ev.payload);
      }
    }
  }

  reset() {
    this.currentTime = 0;
    for (const ev of this.events) {
      ev.executed = false;
    }
  }

  get isFinished() {
    return this.events.every((e) => e.executed);
  }
}

module.exports = { TimelineManager };

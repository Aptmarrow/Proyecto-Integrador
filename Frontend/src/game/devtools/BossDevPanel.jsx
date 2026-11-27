import { useState } from 'react';
import './bossDevPanel.css';

const DIFFICULTIES = [
  { id: 'normal', label: 'Normal' },
  { id: 'difficult', label: 'Difficult' },
  { id: 'no_mercy', label: 'No Mercy' },
];

const TIME_SCALES = [0.25, 0.5, 1, 1.5, 2];
const ROLES = [
  { id: 'DPS', label: 'DPS' },
  { id: 'Tank', label: 'Tank' },
  { id: 'Support', label: 'Sup' },
  { id: 'Special_Attack', label: 'SpAtk' },
];

function formatRecTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function BossDevPanel({
  isOpen,
  onToggleOpen,
  telemetry,
  selectedClass,
  debugHitboxes,
  recordingMode,
  recordElapsed,
  recordStatus,
  autoStopRecOnClear,
  onToggleAutoStopRec,
  onStartRecording,
  onStopRecording,
  onStartMoBotShowcase,
  onJumpLevel,
  onJumpPhase,
  onDamageBoss,
  onSpawnBoss,
  onStartStruggle,
  onClearBullets,
  onSetFlags,
  onStepFrame,
  onResetHits,
  onHealPlayer,
  onToggleHitboxes,
  onSelectRole,
  onRestartStage,
  onNextStage,
}) {
  const [autoSpawnBoss, setAutoSpawnBoss] = useState(true);

  const t = telemetry || {
    godMode: false,
    infiniteSp: false,
    paused: false,
    botPlay: false,
    timeScale: 1,
    hitsTaken: 0,
    bulletCount: 0,
    enemyCount: 0,
    laserCount: 0,
    bossPhaseCount: 5,
    bossId: '-',
    bossName: 'Waiting...',
    bossHp: 0,
    bossMaxHp: 1,
    bossPhase: 1,
    bossActive: false,
    bossSpellcard: '',
    difficulty: 'normal',
    world: 1,
    stage: 1,
  };

  // When capturing full screen+HUD, hide the entire Dev Lab pill so zero dev UI appears in the video!
  if (recordingMode === 'screen' && !isOpen) {
    return null;
  }

  const phaseCount = Math.max(1, Math.min(8, t.bossPhaseCount || 5));
  const phaseList = Array.from({ length: phaseCount }, (_, i) => i + 1);
  const hpPct = t.bossMaxHp > 0 ? Math.max(0, Math.min(100, (t.bossHp / t.bossMaxHp) * 100)) : 0;

  return (
    <div className={`dk-devlab-root ${isOpen ? 'open' : 'collapsed'}`}>
      <button
        type="button"
        className="dk-devlab-toggle"
        onClick={onToggleOpen}
        title="Abrir/Cerrar Boss Dev Lab [F2]"
      >
        <span className={`dk-devlab-dot ${recordingMode ? 'rec' : t.paused ? 'paused' : t.botPlay ? 'bot' : t.godMode ? 'god' : ''}`} />
        <span>DEV LAB [F2]</span>
        {t.botPlay && <span className="dk-devlab-mini-tag bot">BOT</span>}
        {recordingMode && <span className="dk-devlab-mini-tag rec">● {formatRecTime(recordElapsed)}</span>}
        {t.godMode && <span className="dk-devlab-mini-tag">GOD</span>}
        {t.paused && <span className="dk-devlab-mini-tag warn">PAUSED</span>}
      </button>

      {isOpen && (
        <aside className="dk-devlab-drawer" aria-label="Boss Lab Dev Tools">
          {/* 1. Live Telemetry */}
          <section className="dk-devlab-section">
            <div className="dk-devlab-sec-title">
              <span>TELEMETRY</span>
              <span className="dk-devlab-badge">
                {t.difficulty.toUpperCase()} · W{t.world}-{t.stage}
              </span>
            </div>

            <div className="dk-devlab-boss-header">
              <strong>{t.bossName}</strong>
              <span className="dk-devlab-muted">
                {t.bossActive ? `P${t.bossPhase}/${phaseCount}` : 'INACTIVE'}
              </span>
            </div>
            {t.bossSpellcard && <div className="dk-devlab-spell">{t.bossSpellcard}</div>}

            <div className="dk-devlab-hpbar">
              <div className="dk-devlab-hpbar-fill" style={{ width: `${hpPct}%` }} />
              <span>
                HP {t.bossHp} / {t.bossMaxHp}
              </span>
            </div>

            <div className="dk-devlab-metrics">
              <div>
                <small>BULLETS</small>
                <strong>{t.bulletCount}</strong>
              </div>
              <div>
                <small>ENEMIES</small>
                <strong>{t.enemyCount}</strong>
              </div>
              <div>
                <small>LASERS</small>
                <strong>{t.laserCount}</strong>
              </div>
              <div className="dk-devlab-hits">
                <small>HITS (GOD)</small>
                <div className="dk-devlab-hits-row">
                  <strong className={t.hitsTaken > 0 ? 'hit-alert' : ''}>{t.hitsTaken}</strong>
                  <button type="button" onClick={onResetHits} title="Resetear contador de golpes">
                    ↺
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Level / Boss Hot-Jump */}
          <section className="dk-devlab-section">
            <div className="dk-devlab-sec-title">
              <span>BOSS / LEVEL JUMP</span>
              <label className="dk-devlab-check">
                <input
                  type="checkbox"
                  checked={autoSpawnBoss}
                  onChange={(e) => setAutoSpawnBoss(e.target.checked)}
                />
                <span>Auto-Boss</span>
              </label>
            </div>

            <div className="dk-devlab-row">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`dk-devlab-btn ${t.difficulty === d.id ? 'active' : ''}`}
                  onClick={() => onJumpLevel(d.id, t.world, t.stage, autoSpawnBoss)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="dk-devlab-stage-grid">
              {[1, 2, 3].map((w) =>
                [1, 2, 3].map((s) => {
                  const active = t.world === w && t.stage === s;
                  return (
                    <button
                      key={`${w}-${s}`}
                      type="button"
                      className={`dk-devlab-btn ${active ? 'active' : ''}`}
                      onClick={() => onJumpLevel(t.difficulty, w, s, autoSpawnBoss)}
                    >
                      W{w}-{s}
                    </button>
                  );
                })
              )}
            </div>

            <div className="dk-devlab-row">
              <button type="button" className="dk-devlab-btn accent" onClick={onSpawnBoss}>
                Spawn Boss [B]
              </button>
              <button type="button" className="dk-devlab-btn" onClick={onRestartStage}>
                Restart [R]
              </button>
              <button type="button" className="dk-devlab-btn" onClick={onNextStage}>
                Next [N]
              </button>
            </div>
          </section>

          {/* 3. Boss Phases & HP */}
          <section className="dk-devlab-section">
            <div className="dk-devlab-sec-title">
              <span>PHASES &amp; HP</span>
              <span className="dk-devlab-muted">[ / ]</span>
            </div>

            <div className="dk-devlab-row">
              {phaseList.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`dk-devlab-btn ${t.bossActive && t.bossPhase === p ? 'active' : ''}`}
                  onClick={() => onJumpPhase(p)}
                >
                  P{p}
                </button>
              ))}
            </div>

            <div className="dk-devlab-row">
              <button
                type="button"
                className="dk-devlab-btn"
                onClick={() => onJumpPhase(t.bossPhase || 1)}
                title="Reiniciar fase actual [Shift+R]"
              >
                Re-Phase [⇧R]
              </button>
              <button type="button" className="dk-devlab-btn" onClick={() => onDamageBoss('percent', 10)}>
                -10%
              </button>
              <button type="button" className="dk-devlab-btn" onClick={() => onDamageBoss('percent', 25)}>
                -25%
              </button>
              <button type="button" className="dk-devlab-btn warn" onClick={() => onDamageBoss('one_hp')}>
                1 HP
              </button>
              <button type="button" className="dk-devlab-btn danger" onClick={() => onDamageBoss('kill')}>
                Kill
              </button>
            </div>

            <div className="dk-devlab-row">
              <button type="button" className="dk-devlab-btn" onClick={onClearBullets}>
                Clear Bullets [C]
              </button>
              <button type="button" className="dk-devlab-btn" onClick={onStartStruggle}>
                Beam Clash [T]
              </button>
            </div>
          </section>

          {/* 4. Time & Frame Step */}
          <section className="dk-devlab-section">
            <div className="dk-devlab-sec-title">
              <span>TIME &amp; STEP</span>
              <span className="dk-devlab-muted">{t.timeScale}x</span>
            </div>

            <div className="dk-devlab-row">
              <button
                type="button"
                className={`dk-devlab-btn ${t.paused ? 'warn' : ''}`}
                onClick={() => onSetFlags({ paused: !t.paused })}
              >
                {t.paused ? '▶ Play [P]' : '❚❚ Pause [P]'}
              </button>
              <button type="button" className="dk-devlab-btn" onClick={() => onStepFrame(1)}>
                +1F [.]
              </button>
              <button type="button" className="dk-devlab-btn" onClick={() => onStepFrame(5)}>
                +5F
              </button>
            </div>

            <div className="dk-devlab-row">
              {TIME_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  className={`dk-devlab-btn ${Math.abs(t.timeScale - scale) < 0.01 ? 'active' : ''}`}
                  onClick={() => onSetFlags({ timeScale: scale, paused: false })}
                >
                  {scale}x
                </button>
              ))}
            </div>
          </section>

          {/* 5. Touhou Autopilot Bot & 60fps Video Recorder */}
          <section className="dk-devlab-section">
            <div className="dk-devlab-sec-title">
              <span>BOT PLAY &amp; REC 60FPS</span>
              <label className="dk-devlab-check" title="Detiene y descarga el video automáticamente al derrotar al jefe">
                <input
                  type="checkbox"
                  checked={autoStopRecOnClear}
                  onChange={(e) => onToggleAutoStopRec(e.target.checked)}
                />
                <span>Auto-Stop</span>
              </label>
            </div>

            <div className="dk-devlab-row">
              <button
                type="button"
                className={`dk-devlab-btn ${t.botPlay ? 'bot-active' : 'accent'}`}
                onClick={() => onSetFlags({ botPlay: !t.botPlay })}
                title="Activa/Desactiva la IA Touhou predictiva [I]"
              >
                {t.botPlay ? '🤖 Bot: ON [I]' : '🤖 Bot Play [I]'}
              </button>
              <button
                type="button"
                className="dk-devlab-btn"
                onClick={onStartMoBotShowcase}
                title="Reinicia M.O. desde la intro con Bot Play listo para grabar"
              >
                ★ Run M.O.
              </button>
            </div>

            <div className="dk-devlab-row">
              {recordingMode ? (
                <button
                  type="button"
                  className="dk-devlab-btn danger"
                  onClick={onStopRecording}
                >
                  ■ Parar y Descargar ({formatRecTime(recordElapsed)})
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="dk-devlab-btn"
                    onClick={() => onStartRecording('canvas')}
                    title="Graba el canvas del juego directo a 60fps (.webm) sin paneles ni HUD"
                  >
                    🎬 Rec Canvas
                  </button>
                  <button
                    type="button"
                    className="dk-devlab-btn"
                    onClick={() => onStartRecording('screen')}
                    title="Graba la pestaña con Intro de M.O., Spell Cards y barra de vida (oculta Dev Lab; F2 para frenar)"
                  >
                    📺 Rec + HUD
                  </button>
                </>
              )}
            </div>

            {recordStatus && <div className="dk-devlab-rec-status">{recordStatus}</div>}
          </section>

          {/* 6. Player & Debug Overlay */}
          <section className="dk-devlab-section">
            <div className="dk-devlab-sec-title">
              <span>PLAYER &amp; VISUALS</span>
            </div>

            <div className="dk-devlab-row">
              <button
                type="button"
                className={`dk-devlab-btn ${t.godMode ? 'active' : ''}`}
                onClick={() => onSetFlags({ godMode: !t.godMode })}
              >
                God [G]
              </button>
              <button
                type="button"
                className={`dk-devlab-btn ${t.infiniteSp ? 'active' : ''}`}
                onClick={() => onSetFlags({ infiniteSp: !t.infiniteSp })}
              >
                Inf SP
              </button>
              <button
                type="button"
                className={`dk-devlab-btn ${debugHitboxes ? 'active' : ''}`}
                onClick={onToggleHitboxes}
              >
                Hitboxes [H]
              </button>
              <button type="button" className="dk-devlab-btn" onClick={onHealPlayer}>
                Heal
              </button>
            </div>

            <div className="dk-devlab-row">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`dk-devlab-btn ${selectedClass === r.id ? 'active' : ''}`}
                  onClick={() => onSelectRole(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      )}
    </div>
  );
}


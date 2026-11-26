import { memo } from 'react';

function GameArenaOverlays({
  stageBanner,
  bossWarningActive,
  spellcardBanner,
  moIntroActive = false,
  moIntroProgress = 0,
  isStruggleAligning,
  isBeamStruggle,
  struggleProgress,
  struggleTimeLeft,
  isTouchDevice,
  isStageClear,
  isAutoAdvancingStage = false,
  stageBlackAlpha = 0,
  stageFlashAlpha = 0,
  isPlayerDefeated = false,
  stageClearTitle = 'STAGE 1 CLEARED!',
  stageClearSubtext = '¡Misión completada con éxito!',
  stageClearMeta = '',
  stageClearButtonText = '🔄 JUGAR OTRA VEZ (REPLAY)',
  onPushStruggle,
  onRestartStage,
  onExitLobby,
}) {
  return (
    <>
      {stageBanner && (
        <div className="dk-stage-banner-overlay">
          <div className="dk-stage-banner-card">
            <div className="dk-stage-banner-badge">DANMAKREW STAGE</div>
            <h1 className="dk-stage-banner-title">{stageBanner.text}</h1>
            <div className="dk-stage-banner-divider" />
            <p className="dk-stage-banner-subtext">{stageBanner.subtext}</p>
          </div>
        </div>
      )}

      {bossWarningActive && (
        <div className="dk-boss-warning-overlay">
          <div className="dk-hazard-bar" />
          <div className="dk-warning-content">
            <span className="dk-warning-siren">⚠️</span>
            <span className="dk-warning-text">WARNING! HIGH-ENERGY BOSS APPROACHING</span>
            <span className="dk-warning-siren">⚠️</span>
          </div>
          <div className="dk-hazard-bar" />
        </div>
      )}

      {spellcardBanner && spellcardBanner.active && (
        <div className="dk-spellcard-cutin-banner">
          <span className="dk-spellcard-tag">SPELL CARD</span>
          <span className="dk-spellcard-title">{spellcardBanner.name}</span>
        </div>
      )}

      {moIntroActive && (() => {
        const p = Math.max(0, Math.min(1, moIntroProgress));
        const enterOpacity = p < 0.12 ? p / 0.12 : (p > 0.89 ? Math.max(0, (1 - p) / 0.11) : 1);
        const compress = p <= 0.44 ? 0 : Math.min(1, (p - 0.44) / 0.26);
        const finalBurst = p >= 0.7 ? Math.min(1, (p - 0.7) / 0.16) : 0;
        const lockFlash = p >= 0.7 && p <= 0.84 ? Math.sin(((p - 0.7) / 0.14) * Math.PI) : 0;
        const shockScale = p >= 0.7 ? 0.35 + ((p - 0.7) / 0.3) * 2.1 : 0.35;
        const shockOpacity = p >= 0.7 ? Math.max(0, 1 - (p - 0.7) / 0.28) : 0;
        const convergeScale = p >= 0.38 && p < 0.7 ? 1.8 - ((p - 0.38) / 0.32) * 1.45 : 0;
        const convergeOpacity = p >= 0.38 && p < 0.7 ? (p - 0.38) / 0.32 : 0;
        const collapseStyle = {
          maxWidth: `${(1 - compress) * 11}em`,
          opacity: Math.max(0, 1 - compress * 1.35),
          transform: `scaleX(${Math.max(0.01, 1 - compress)})`,
        };
        const titleScale = 1 + finalBurst * 0.42;
        return (
          <div className="dk-mo-intro-overlay" style={{ opacity: enterOpacity }}>
            <div className="dk-mo-letterbox top" />
            <div className="dk-mo-letterbox bottom" />
            <div className="dk-mo-scanlines" />
            <div className="dk-mo-aura-flare" />
            <div className="dk-mo-halo-ring outer" />
            <div className="dk-mo-halo-ring mid" />
            <div className="dk-mo-halo-ring inner" />
            <div className="dk-mo-orbit-sigils">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <span key={idx} className={`dk-mo-sigil s${idx}`}>◈</span>
              ))}
            </div>
            {convergeOpacity > 0 && (
              <div
                className="dk-mo-converge-ring"
                style={{ transform: `scale(${convergeScale})`, opacity: convergeOpacity }}
              />
            )}
            {shockOpacity > 0 && (
              <div
                className="dk-mo-lock-shockwave"
                style={{ transform: `scale(${shockScale})`, opacity: shockOpacity }}
              />
            )}
            {lockFlash > 0.02 && (
              <div className="dk-mo-flash-veil" style={{ opacity: lockFlash * 0.55 }} />
            )}
            <div className="dk-mo-intro-badge">
              {compress < 0.75 ? 'OMEGA SERAPH UNIT // FINAL SECTOR 3-3' : '◈ DESIGNATION LOCKED // THREAT MAX ◈'}
            </div>
            <div
              className={`dk-mo-morph-title ${finalBurst > 0.2 ? 'locked' : ''}`}
              style={{ transform: `scale(${titleScale})` }}
            >
              <span className="dk-mo-keep">M</span>
              <span className="dk-mo-collapse" style={collapseStyle}>ECANICAL&nbsp;</span>
              <span
                className="dk-mo-dot"
                style={{
                  maxWidth: `${compress * 0.6}em`,
                  opacity: compress,
                  transform: `scale(${0.4 + compress * 0.6})`,
                }}
              >
                .
              </span>
              <span className="dk-mo-keep">O</span>
              <span className="dk-mo-collapse" style={collapseStyle}>PHANIM</span>
            </div>
            <div className="dk-mo-intro-sub">
              {finalBurst > 0.3 ? '⚠ PROTOCOLO DE ASALTO LINEAL ACTIVO ⚠' : 'MECANICAL OPHANIM · DESPLEGANDO SELLOS DEL TRONO'}
            </div>
          </div>
        );
      })()}

      {isStruggleAligning && (
        <div className="dk-beam-clash-intro-banner">
          <div className="dk-clash-intro-badge">⚡ BEAM CLASH INCOMING ⚡</div>
          <div className="dk-clash-intro-sub">¡PREPÁRATE PARA MACHACAR [Z]!</div>
        </div>
      )}

      {isBeamStruggle && (
        <div className="dk-beam-struggle-clean-overlay">
          <div className="dk-struggle-top-bar">
            <div className="dk-struggle-balance-line">
              <span className="dk-stream-badge player">⚡ SPARK</span>
              <div className="dk-slim-tug-track">
                <div className="dk-slim-tug-fill player" style={{ width: `${struggleProgress}%` }} />
                <div className="dk-slim-tug-fill boss" style={{ width: `${100 - struggleProgress}%` }} />
                <div className="dk-slim-clash-icon" style={{ left: `${struggleProgress}%` }}>⚔️</div>
              </div>
              <span className="dk-stream-badge boss">RAY ☀️</span>
            </div>

            <div className="dk-mash-key-box">
              <div className="dk-animated-mash-key">
                <span className="dk-key-letter">Z</span>
              </div>
              <span className="dk-mash-text">¡MASH!</span>
            </div>

            <div className="dk-struggle-timer-badge">
              ⏱️ {struggleTimeLeft.toFixed(1)}s
            </div>
          </div>

          {isTouchDevice && (
            <button
              type="button"
              className="dk-mobile-struggle-corner-btn"
              onTouchStart={(e) => {
                e.preventDefault();
                onPushStruggle();
              }}
              onClick={onPushStruggle}
              aria-label="Push Struggle button"
            >
              ⚡<br /><small>MASH</small>
            </button>
          )}
        </div>
      )}

      {isPlayerDefeated && !isStageClear && (
        <div className="dk-stage-clear-overlay">
          <div className="dk-stage-clear-card defeated">
            <div className="dk-clear-badge defeated">SQUAD DOWN</div>
            <h1 className="dk-clear-title">CAÍSTE EN COMBATE</h1>
            <p className="dk-clear-sub">Reintenta el escenario o vuelve al lobby de selección.</p>
            <div className="dk-overlay-actions">
              <button type="button" className="dk-stage-replay-btn" onClick={onRestartStage}>
                🔄 REINTENTAR STAGE
              </button>
              <button type="button" className="dk-stage-exit-btn" onClick={onExitLobby}>
                ← VOLVER AL LOBBY
              </button>
            </div>
          </div>
        </div>
      )}

      {stageBlackAlpha > 0.005 && (
        <div
          className="dk-stage-transition-black"
          style={{ opacity: Math.min(1, Math.max(0, stageBlackAlpha)) }}
          aria-hidden="true"
        >
          {isAutoAdvancingStage && stageBlackAlpha > 0.45 && (
            <div className="dk-stage-transition-caption">
              <span className="dk-transition-dot" />
              <span>SALTANDO AL SIGUIENTE SECTOR...</span>
            </div>
          )}
        </div>
      )}

      {stageFlashAlpha > 0.005 && (
        <div
          className="dk-stage-reveal-flash"
          style={{ opacity: Math.min(1, Math.max(0, stageFlashAlpha)) }}
          aria-hidden="true"
        />
      )}

      {isStageClear && (
        <div className="dk-stage-clear-overlay">
          <div className="dk-stage-clear-card">
            <div className="dk-clear-badge">STAGE COMPLETE</div>
            <h1 className="dk-clear-title">{stageClearTitle}</h1>
            <p className="dk-clear-sub">{stageClearSubtext}</p>
            {stageClearMeta && <p className="dk-clear-meta">{stageClearMeta}</p>}
            <div className="dk-overlay-actions">
              <button type="button" className="dk-stage-replay-btn" onClick={onRestartStage}>
                {stageClearButtonText}
              </button>
              <button type="button" className="dk-stage-exit-btn" onClick={onExitLobby}>
                ← VOLVER AL LOBBY
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(GameArenaOverlays);


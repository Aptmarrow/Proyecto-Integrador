import { memo } from 'react';

function GameArenaOverlays({
  stageBanner,
  bossWarningActive,
  spellcardBanner,
  chipDropNotice = null,
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
  roomClosedMessage = null,
  stageClearTitle = 'STAGE CLEAR',
  stageClearSubtext = '',
  stageClearMeta = '',
  stageClearButtonText = 'JUGAR DE NUEVO',
  onPushStruggle,
  onRestartStage,
  onLeaveMatch,
}) {
  return (
    <>
      {stageBanner && (
        <div className="dk-stage-banner-overlay">
          <div className="dk-stage-banner-card">
            <div className="dk-stage-banner-badge">STAGE</div>
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
            <span className="dk-warning-text">WARNING — BOSS APPROACHING</span>
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

      {chipDropNotice && (() => {
        const isPremium = Number(chipDropNotice.rarity) >= 3;
        const tierClass = isPremium ? 'premiumish' : Number(chipDropNotice.rarity) === 2 ? 'reliable' : 'scrapy';
        return (
          <div className={`dk-chip-drop-toast ${tierClass}`} key={chipDropNotice.id}>
            {isPremium && (
              <div className="dk-chip-drop-confetti" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <span key={i} className={`dk-confetti-p p${i}`} />
                ))}
              </div>
            )}
            <div className="dk-chip-drop-icon">
              {isPremium ? '★' : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                  <rect x="9" y="9" width="6" height="6" />
                  <line x1="9" y1="2" x2="9" y2="6" />
                  <line x1="15" y1="2" x2="15" y2="6" />
                  <line x1="9" y1="18" x2="9" y2="22" />
                  <line x1="15" y1="18" x2="15" y2="22" />
                  <line x1="2" y1="9" x2="6" y2="9" />
                  <line x1="2" y1="15" x2="6" y2="15" />
                  <line x1="18" y1="9" x2="22" y2="9" />
                  <line x1="18" y1="15" x2="22" y2="15" />
                </svg>
              )}
            </div>
            <div className="dk-chip-drop-body">
              <div className="dk-chip-drop-kicker">
                {isPremium ? '★ PREMIUMISH CHIP DROP! ★' : `CHIP OBTAINED · ${chipDropNotice.rarityLabel.toUpperCase()}`}
              </div>
              <div className="dk-chip-drop-name">{chipDropNotice.name}</div>
              <div className="dk-chip-drop-sub">Added to Inventory</div>
            </div>
          </div>
        );
      })()}

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
              {compress < 0.75 ? 'SECTOR 3-3 · JEFE FINAL' : 'OBJETIVO FIJADO'}
            </div>
            <div
              className={`dk-mo-morph-title ${finalBurst > 0.2 ? 'locked' : ''}`}
              style={{ transform: `scale(${titleScale})` }}
            >
              <span className="dk-mo-keep">M</span>
              <span className="dk-mo-collapse" style={collapseStyle}>ECHANICAL&nbsp;</span>
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
              {finalBurst > 0.3 ? 'ASALTO LINEAL ACTIVO' : 'MECHANICAL OPHANIM'}
            </div>
          </div>
        );
      })()}

      {isStruggleAligning && (
        <div className="dk-beam-clash-intro-banner">
          <div className="dk-clash-intro-badge">BEAM CLASH</div>
          <div className="dk-clash-intro-sub">PRESIONÁ [Z] RÁPIDO</div>
        </div>
      )}

      {isBeamStruggle && (
        <div className="dk-beam-struggle-clean-overlay">
          <div className="dk-struggle-top-bar">
            <div className="dk-struggle-balance-line">
              <span className="dk-stream-badge player">SPARK</span>
              <div className="dk-slim-tug-track">
                <div className="dk-slim-tug-fill player" style={{ width: `${struggleProgress}%` }} />
                <div className="dk-slim-tug-fill boss" style={{ width: `${100 - struggleProgress}%` }} />
                <div className="dk-slim-clash-icon" style={{ left: `${struggleProgress}%` }} />
              </div>
              <span className="dk-stream-badge boss">BOSS</span>
            </div>

            <div className="dk-mash-key-box">
              <div className="dk-animated-mash-key">
                <span className="dk-key-letter">Z</span>
              </div>
              <span className="dk-mash-text">MASH</span>
            </div>

            <div className="dk-struggle-timer-badge">
              {struggleTimeLeft.toFixed(1)}s
            </div>
          </div>

          {isTouchDevice && (
            <button
              type="button"
              className="dk-mobile-struggle-corner-btn"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPushStruggle();
              }}
              aria-label="Push Struggle button"
            >
              MASH
            </button>
          )}
        </div>
      )}

      {roomClosedMessage && (
        <div className="dk-stage-clear-overlay">
          <div className="dk-stage-clear-card defeated">
            <div className="dk-clear-badge defeated">SALA CERRADA</div>
            <h1 className="dk-clear-title">PARTIDA FINALIZADA</h1>
            <p className="dk-clear-sub">{roomClosedMessage}</p>
            <div className="dk-overlay-actions">
              <button type="button" className="dk-stage-exit-btn" onClick={onLeaveMatch}>
                SALIR AL MENÚ
              </button>
            </div>
          </div>
        </div>
      )}

      {!roomClosedMessage && isPlayerDefeated && !isStageClear && (
        <div className="dk-stage-clear-overlay">
          <div className="dk-stage-clear-card defeated">
            <div className="dk-clear-badge defeated">DERROTA</div>
            <h1 className="dk-clear-title">CAÍSTE EN COMBATE</h1>
            <p className="dk-clear-sub">Reintentá el nivel o abandoná la partida.</p>
            <div className="dk-overlay-actions">
              <button type="button" className="dk-stage-replay-btn" onClick={onRestartStage}>
                REINTENTAR
              </button>
              <button type="button" className="dk-stage-exit-btn" onClick={onLeaveMatch}>
                ✕ ABANDONAR PARTIDA
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
              <span>SIGUIENTE SECTOR...</span>
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

      {!roomClosedMessage && isStageClear && (
        <div className="dk-stage-clear-overlay">
          <div className="dk-stage-clear-card">
            <div className="dk-clear-badge">STAGE CLEAR</div>
            <h1 className="dk-clear-title">{stageClearTitle}</h1>
            {stageClearSubtext && <p className="dk-clear-sub">{stageClearSubtext}</p>}
            {stageClearMeta && <p className="dk-clear-meta">{stageClearMeta}</p>}
            <div className="dk-overlay-actions">
              <button type="button" className="dk-stage-replay-btn" onClick={onRestartStage}>
                {stageClearButtonText}
              </button>
              <button type="button" className="dk-stage-exit-btn" onClick={onLeaveMatch}>
                ✕ ABANDONAR PARTIDA
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(GameArenaOverlays);

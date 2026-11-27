import { memo } from 'react';

function FloatingControlsBar({
  selectedClass,
  isFullscreen,
  canSwitchRole = false,
  showDebugActions = false,
  stagePreviewVariants = [],
  activeStagePreviewIdx = -1,
  onSelectRole,
  onTriggerSkill,
  onSpawnBoss,
  onStartStruggle,
  onSelectStagePreview,
  onToggleFullscreen,
}) {
  return (
    <div className="dk-floating-controls-bar">
      {canSwitchRole && (
        <div className="dk-roles-quick-group">
          <button
            type="button"
            className={`dk-quick-role-btn ${selectedClass === 'DPS' ? 'active' : ''}`}
            onClick={() => onSelectRole('DPS')}
          >
            DPS [1]
          </button>
          <button
            type="button"
            className={`dk-quick-role-btn ${selectedClass === 'Tank' ? 'active' : ''}`}
            onClick={() => onSelectRole('Tank')}
          >
            TANK [2]
          </button>
          <button
            type="button"
            className={`dk-quick-role-btn ${selectedClass === 'Support' ? 'active' : ''}`}
            onClick={() => onSelectRole('Support')}
          >
            SUPPORT [3]
          </button>
          <button
            type="button"
            className={`dk-quick-role-btn ${selectedClass === 'Special_Attack' ? 'active' : ''}`}
            onClick={() => onSelectRole('Special_Attack')}
          >
            SP.ATK [4]
          </button>
        </div>
      )}

      <div className="dk-controls-hint-group">
        <span className="dk-hint-chip">WASD / FLECHAS · MOVER</span>
        <span className="dk-hint-chip">[Z] · DISPARAR</span>
        <span className="dk-hint-chip">[SHIFT] · FOCUS</span>
      </div>

      <div className="dk-actions-quick-group">
        <button
          type="button"
          className="dk-action-btn dk-skill-act-btn"
          onClick={onTriggerSkill}
          title="Habilidad especial [X]"
        >
          SKILL [X]
        </button>
        {showDebugActions && (
          <>
            <button
              type="button"
              className="dk-action-btn dk-boss-act-btn"
              onClick={onSpawnBoss}
              title="Invocar jefe [B]"
            >
              BOSS [B]
            </button>
            <button
              type="button"
              className="dk-action-btn dk-struggle-act-btn"
              onClick={onStartStruggle}
              title="Probar choque de rayos [T]"
            >
              CLASH [T]
            </button>
            {stagePreviewVariants.length > 0 && (
              <>
                {stagePreviewVariants.map((variant, idx) => (
                  <button
                    key={variant.key || variant.label || idx}
                    type="button"
                    className={`dk-action-btn dk-preview-act-btn ${activeStagePreviewIdx === idx ? 'active' : ''}`}
                    onClick={() => onSelectStagePreview?.(idx)}
                    title={`${variant.label} [${variant.key || idx + 5}]`}
                  >
                    {variant.label} [{variant.key || idx + 5}]
                  </button>
                ))}
                <button
                  type="button"
                  className="dk-action-btn dk-preview-reset-btn"
                  onClick={() => onSelectStagePreview?.(-1)}
                  title="Restaurar línea temporal [0]"
                >
                  RESET [0]
                </button>
              </>
            )}
          </>
        )}
        <button
          type="button"
          className="dk-action-btn dk-fullscreen-toggle-btn"
          onClick={onToggleFullscreen}
          title="Pantalla completa [F]"
        >
          {isFullscreen ? 'VENTANA [F]' : 'PANTALLA COMPLETA [F]'}
        </button>
      </div>
    </div>
  );
}

export default memo(FloatingControlsBar);

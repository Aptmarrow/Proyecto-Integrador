import { useEffect } from 'react';

const MAX_EQUIPPED_CHIPS = 3;

const RARITY_MAP = {
  1: { label: 'Scrapy', color: '#22c55e' },
  2: { label: 'Reliable', color: '#ef4444' },
  3: { label: 'Premiumish', color: '#38bdf8' },
};

const STAT_META = [
  { key: 'HP', label: 'HP', kind: 'flat' },
  { key: 'Bullet_Damage', label: 'ATK', kind: 'flat' },
  { key: 'Defense', label: 'DEF', kind: 'flat' },
  { key: 'SP_Charge', label: 'SP', kind: 'flat' },
  { key: 'Ultimate_Damage', label: 'ULT', kind: 'percent' },
  { key: 'Cadency', label: 'CAD', kind: 'percent' },
  { key: 'Critic_Chance', label: 'CRIT', kind: 'percent' },
  { key: 'Crit_Damage', label: 'CDMG', kind: 'percent' },
];

function getRarity(rarity) {
  const tier = Math.max(1, Math.min(3, Number(rarity) || 1));
  return RARITY_MAP[tier] || RARITY_MAP[1];
}

function getInitials(name) {
  const clean = String(name || 'CH').trim();
  const words = clean.split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function formatStats(stats) {
  if (!stats) return [];
  const out = [];
  for (const m of STAT_META) {
    const val = stats[m.key];
    if (val !== null && val !== undefined && Number(val) !== 0) {
      out.push(`${m.label} ${Number(val) > 0 ? '+' : ''}${val}${m.kind === 'percent' ? '%' : ''}`);
    }
  }
  return out;
}

export default function ChipLoadoutModal({
  isOpen,
  onClose,
  chips = [],
  equippedChips = [],
  loading = false,
  busyChipId = null,
  errorMsg = '',
  selectedRole = 'DPS',
  statsData = null,
  onToggleEquip,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="cs-chip-modal-backdrop" onClick={onClose}>
      <div className="cs-chip-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Select Chips">
        <header className="cs-chip-modal-header">
          <div className="cs-chip-modal-title-wrap">
            <svg className="cs-chip-modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <div>
              <h3>EQUIPPED CHIPS ({equippedChips.length}/{MAX_EQUIPPED_CHIPS})</h3>
              <span>Active Role: {selectedRole} • Max 3 chips</span>
            </div>
          </div>
          <button type="button" className="cs-chip-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {errorMsg && <div className="cs-chip-modal-error">{errorMsg}</div>}

        {/* 3 Equipped Slots */}
        <div className="cs-chip-slots-row">
          {[0, 1, 2].map((idx) => {
            const eq = equippedChips[idx];
            if (!eq) {
              return (
                <div key={idx} className="cs-chip-slot empty">
                  <span>SLOT {idx + 1}</span>
                </div>
              );
            }
            const r = getRarity(eq.rarity);
            return (
              <div key={eq.id} className="cs-chip-slot filled" style={{ borderColor: r.color }}>
                <div className="cs-chip-slot-badge" style={{ color: r.color, borderColor: r.color }}>
                  {eq.image ? <img src={eq.image} alt={eq.name} /> : getInitials(eq.name)}
                </div>
                <div className="cs-chip-slot-text">
                  <strong>{eq.name}</strong>
                  <small>Lv.{eq.level || 1}</small>
                </div>
                <button
                  type="button"
                  className="cs-chip-slot-unequip"
                  onClick={() => onToggleEquip(eq)}
                  disabled={busyChipId === eq.id}
                  title="Unequip"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* Live Stats Preview */}
        {statsData?.total && (
          <div className="cs-chip-stats-strip">
            {STAT_META.map((m) => {
              const total = statsData.total[m.key];
              const bonus = Number(statsData.bonuses?.[m.key] || 0);
              const isPctDisplay = m.key === 'Critic_Chance' || m.key === 'Crit_Damage';
              return (
                <div key={m.key} className={`cs-chip-stat-pill${bonus > 0 ? ' boosted' : ''}`}>
                  <small>{m.label}</small>
                  <strong>
                    {total}{isPctDisplay ? '%' : ''}
                  </strong>
                </div>
              );
            })}
          </div>
        )}

        {/* Inventory Chips Grid */}
        <div className="cs-chip-modal-body">
          {loading ? (
            <div className="cs-chip-modal-empty">Loading inventory chips...</div>
          ) : chips.length === 0 ? (
            <div className="cs-chip-modal-empty">
              You don&apos;t have any chips in your inventory yet.
            </div>
          ) : (
            <div className="cs-chip-modal-grid">
              {chips.map((chip) => {
                const r = getRarity(chip.rarity);
                const lines = formatStats(chip.stats);
                const isFull = !chip.is_equipped && equippedChips.length >= MAX_EQUIPPED_CHIPS;
                const disabled = busyChipId === chip.id || isFull;

                return (
                  <div
                    key={chip.id}
                    className={`cs-chip-item${chip.is_equipped ? ' equipped' : ''}`}
                    style={{ borderColor: chip.is_equipped ? r.color : undefined }}
                  >
                    <div className="cs-chip-item-head">
                      <span style={{ color: r.color }}>{r.label}</span>
                      <small>Lv.{chip.level || 1}</small>
                    </div>
                    <div className="cs-chip-item-icon" style={{ borderColor: r.color, color: r.color }}>
                      {chip.image ? <img src={chip.image} alt={chip.name} /> : getInitials(chip.name)}
                    </div>
                    <div className="cs-chip-item-name">{chip.name}</div>
                    <div className="cs-chip-item-stats">
                      {lines.length > 0 ? lines.map((l) => <span key={l}>{l}</span>) : <span>No bonuses</span>}
                    </div>
                    <button
                      type="button"
                      className={`cs-chip-item-btn${chip.is_equipped ? ' unequip' : ''}`}
                      onClick={() => onToggleEquip(chip)}
                      disabled={disabled}
                    >
                      {busyChipId === chip.id
                        ? '...'
                        : chip.is_equipped
                          ? 'UNEQUIP'
                          : isFull
                            ? 'FULL (3/3)'
                            : 'EQUIP'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


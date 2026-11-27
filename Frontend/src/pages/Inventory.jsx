import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BulletBackground from '../components/BulletBackground';
import {
  getCurrentUser,
  getEquippedChipStats,
  getUserInventory,
  toggleEquipChip,
} from '../services/api';
import '../styles/inventory.css';

const MAX_EQUIPPED_CHIPS = 3;

const ROLES = [
  { id: 'DPS', label: 'DPS' },
  { id: 'Tank', label: 'Tank' },
  { id: 'Support', label: 'Support' },
  { id: 'Special_Attack', label: 'SP.ATK' },
];

const SKIN_CHARACTER_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'DPS', label: 'DPS' },
  { id: 'Tank', label: 'Tank' },
  { id: 'Support', label: 'Support' },
  { id: 'Special_Attack', label: 'SP.ATK' },
];

const TABS = [
  { id: 'chips', label: 'Chips' },
  { id: 'character_skins', label: 'Character Skins' },
  { id: 'effect_skins', label: 'Effect Skins' },
  { id: 'resources', label: 'Resources' },
];

const RARITY_INFO = {
  1: { name: 'Scrapy', className: 'inv-rarity-1' },
  2: { name: 'Reliable', className: 'inv-rarity-2' },
  3: { name: 'Premiumish', className: 'inv-rarity-3' },
};

const STAT_CONFIG = [
  { key: 'HP', label: 'HP', kind: 'flat' },
  { key: 'Bullet_Damage', label: 'ATK', kind: 'flat' },
  { key: 'Defense', label: 'DEF', kind: 'flat' },
  { key: 'SP_Charge', label: 'SP Charge', kind: 'flat' },
  { key: 'Ultimate_Damage', label: 'Ultimate DMG', kind: 'percent' },
  { key: 'Cadency', label: 'Cadency', kind: 'percent' },
  { key: 'Critic_Chance', label: 'Crit Chance', kind: 'percent' },
  { key: 'Crit_Damage', label: 'Crit DMG', kind: 'percent' },
];

function getRarityMeta(rarity) {
  const tier = Math.max(1, Math.min(3, Number(rarity) || 1));
  return RARITY_INFO[tier] || RARITY_INFO[1];
}

function getChipInitials(name) {
  const clean = String(name || 'CH').trim();
  const words = clean.split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function resolveSkinEntry(entry) {
  if (entry && typeof entry === 'object') {
    const id = entry.id ?? entry.skin_id ?? 0;
    const role = entry.character || entry.role || ROLES[Math.abs(Number(id) - 1) % ROLES.length]?.id || 'DPS';
    return {
      id,
      name: entry.name || `Character Skin #${id}`,
      character: role,
    };
  }
  const id = Number(entry) || 0;
  const role = ROLES[Math.abs(id - 1) % ROLES.length]?.id || 'DPS';
  return {
    id,
    name: `Character Skin #${id}`,
    character: role,
  };
}

function getRoleLabel(roleId) {
  const found = ROLES.find((r) => r.id.toLowerCase() === String(roleId || '').toLowerCase());
  return found ? found.label : String(roleId || 'DPS');
}

const CHIP_SPRITES_BY_NAME = {
  'scrapy chips (b)': '/assets/sprites/chips/scrapy_b.png',
  'scrapy chips (o)': '/assets/sprites/chips/scrapy_o.png',
  'scrapy chips (v)': '/assets/sprites/chips/scrapy_v.png',
  'scrapy chips (t)': '/assets/sprites/chips/scrapy_t.png',
  'blood bags': '/assets/sprites/chips/blood_bags.png',
  'excuses': '/assets/sprites/chips/excuses.png',
  'heavy helmet': '/assets/sprites/chips/heavy_helmet.png',
  'tasty batteries': '/assets/sprites/chips/tasty_batteries.png',
  'sniper': '/assets/sprites/chips/sniper.png',
  'shot da woop': '/assets/sprites/chips/shot_da_woop.png',
  'in a hurry': '/assets/sprites/chips/in_a_hurry.png',
  'rage potion': '/assets/sprites/chips/rage_potion.png',
};

function resolveChipSprite(chip) {
  if (chip?.image) return chip.image;
  const key = String(chip?.name || '').trim().toLowerCase();
  return CHIP_SPRITES_BY_NAME[key] || null;
}

function ChipIcon({ chip }) {
  const spriteSrc = resolveChipSprite(chip);
  if (spriteSrc) {
    return <img src={spriteSrc} alt={chip.name} className="inv-chip-img" />;
  }

  const tier = Math.max(1, Math.min(4, Number(chip.rarity) || 1));
  const stroke =
    tier === 4 ? '#f59e0b' : tier === 3 ? '#38bdf8' : tier === 2 ? '#ef4444' : '#22c55e';
  const bg = tier === 1 ? '#12381c' : '#141726';
  const initials = getChipInitials(chip.name);

  return (
    <svg className="inv-chip-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon
        points="16,4 48,4 60,16 60,48 48,60 16,60 4,48 4,16"
        fill={bg}
        stroke={stroke}
        strokeWidth="3.2"
      />
      <rect x="13" y="13" width="38" height="38" rx="6" fill="rgba(0,0,0,0.35)" stroke={stroke} strokeOpacity="0.45" strokeWidth="1.5" />
      <line x1="22" y1="4" x2="22" y2="12" stroke={stroke} strokeWidth="2" strokeOpacity="0.7" />
      <line x1="42" y1="4" x2="42" y2="12" stroke={stroke} strokeWidth="2" strokeOpacity="0.7" />
      <line x1="22" y1="52" x2="22" y2="60" stroke={stroke} strokeWidth="2" strokeOpacity="0.7" />
      <line x1="42" y1="52" x2="42" y2="60" stroke={stroke} strokeWidth="2" strokeOpacity="0.7" />
      <text
        x="32"
        y="37"
        textAnchor="middle"
        fill={stroke}
        fontSize="16"
        fontWeight="700"
        fontFamily="Orbitron, monospace"
      >
        {initials}
      </text>
    </svg>
  );
}

function formatChipStatBadges(stats) {
  if (!stats) return [];
  const list = [];
  for (const cfg of STAT_CONFIG) {
    const val = stats[cfg.key];
    if (val !== null && val !== undefined && Number(val) !== 0) {
      const sign = Number(val) > 0 ? '+' : '';
      const suffix = cfg.kind === 'percent' ? '%' : '';
      list.push({ key: cfg.key, text: `${cfg.label} ${sign}${val}${suffix}` });
    }
  }
  return list;
}

export default function Inventory() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('chips');
  const [rarityFilter, setRarityFilter] = useState('all');
  const [skinCharacterFilter, setSkinCharacterFilter] = useState('all');
  const [selectedRole, setSelectedRole] = useState('DPS');

  const [inventory, setInventory] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [statsData, setStatsData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busyChipId, setBusyChipId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? '' : prev));
    }, 3000);
  }, []);

  const fetchStats = useCallback(async (role) => {
    try {
      const data = await getEquippedChipStats(role);
      setStatsData(data);
    } catch {
      // ignore transient error
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [invRes, meRes] = await Promise.all([
        getUserInventory(),
        getCurrentUser().catch(() => null),
      ]);
      setInventory(invRes);
      setUserInfo(meRes?.user || meRes || null);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    fetchStats(selectedRole);
  }, [selectedRole, fetchStats]);

  const chips = useMemo(() => inventory?.chips || [], [inventory]);
  const equippedChips = useMemo(() => chips.filter((c) => c.is_equipped), [chips]);

  const filteredChips = useMemo(() => {
    if (rarityFilter === 'all') return chips;
    const tier = Number(rarityFilter);
    return chips.filter((c) => Math.max(1, Math.min(3, Number(c.rarity || 1))) === tier);
  }, [chips, rarityFilter]);

  const normalizedCharSkins = useMemo(
    () => (inventory?.character_skins || []).map(resolveSkinEntry),
    [inventory]
  );

  const filteredCharSkins = useMemo(() => {
    if (skinCharacterFilter === 'all') return normalizedCharSkins;
    return normalizedCharSkins.filter(
      (s) => String(s.character).toLowerCase() === skinCharacterFilter.toLowerCase()
    );
  }, [normalizedCharSkins, skinCharacterFilter]);

  const handleToggleEquip = async (chip) => {
    if (busyChipId !== null) return;
    const nextEquipped = !chip.is_equipped;
    setErrorMsg('');
    setBusyChipId(chip.id);
    try {
      await toggleEquipChip(chip.id, nextEquipped);
      const [invRes, stRes] = await Promise.all([
        getUserInventory(),
        getEquippedChipStats(selectedRole),
      ]);
      setInventory(invRes);
      setStatsData(stRes);
      showToast(nextEquipped ? `Equipped "${chip.name}"` : `Unequipped "${chip.name}"`);
    } catch (err) {
      setErrorMsg(err?.message || 'Could not update chip equipment.');
    } finally {
      setBusyChipId(null);
    }
  };

  const effSkins = inventory?.effect_skins || [];
  const scraps = inventory?.scraps ?? 0;
  const danmas = userInfo?.danmas ?? 0;

  return (
    <div className="inv-page">
      <BulletBackground />

      <div className="inv-shell">
        {/* Top bar */}
        <header className="inv-topbar">
          <div className="inv-topbar-left">
            <button
              type="button"
              className="inv-back-btn"
              onClick={() => navigate('/dashboard')}
              aria-label="Back to menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 19L3 12M3 12L10 5M3 12H21" />
              </svg>
            </button>
            <div>
              <h1 className="inv-title">INVENTORY</h1>
            </div>
          </div>

          <div className="inv-currencies">
            <div className="inv-currency-pill inv-currency-danmas">
              <span className="inv-currency-label">DANMAS</span>
              <strong>{danmas}</strong>
            </div>
            <div className="inv-currency-pill inv-currency-scraps">
              <span className="inv-currency-label">SCRAPS</span>
              <strong>{scraps}</strong>
            </div>
          </div>
        </header>

        {/* Main tabs */}
        <nav className="inv-tabs" aria-label="Inventory categories">
          {TABS.map((tab) => {
            const count =
              tab.id === 'chips'
                ? chips.length
                : tab.id === 'character_skins'
                  ? normalizedCharSkins.length
                  : tab.id === 'effect_skins'
                    ? effSkins.length
                    : null;
            return (
              <button
                key={tab.id}
                type="button"
                className={`inv-tab${activeTab === tab.id ? ' inv-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                {count !== null && <span className="inv-tab-badge">{count}</span>}
              </button>
            );
          })}
        </nav>

        {errorMsg && <div className="inv-alert inv-alert--error">{errorMsg}</div>}
        {toastMsg && <div className="inv-alert inv-alert--ok">{toastMsg}</div>}

        {loading ? (
          <div className="inv-loading">Loading inventory...</div>
        ) : (
          <div className="inv-content-grid">
            {/* Main column */}
            <section className="inv-main-panel">
              {activeTab === 'chips' && (
                <>
                  {/* 3 Equipped Chip Slots */}
                  <div className="inv-equipped-bar">
                    <div className="inv-section-head">
                      <h2>Equipped Chips</h2>
                      <span className="inv-slot-counter">
                        {equippedChips.length} / {MAX_EQUIPPED_CHIPS}
                      </span>
                    </div>
                    <div className="inv-slots-row">
                      {[0, 1, 2].map((slotIdx) => {
                        const eq = equippedChips[slotIdx];
                        if (!eq) {
                          return (
                            <div key={`slot-${slotIdx}`} className="inv-slot inv-slot--empty">
                              <span>SLOT {slotIdx + 1}</span>
                              <small>Empty</small>
                            </div>
                          );
                        }
                        const rMeta = getRarityMeta(eq.rarity);
                        return (
                          <div key={`slot-${slotIdx}`} className={`inv-slot inv-slot--filled ${rMeta.className}`}>
                            <div className="inv-slot-icon">
                              <ChipIcon chip={eq} />
                            </div>
                            <div className="inv-slot-info">
                              <strong>{eq.name}</strong>
                              <small>Lv. {eq.level || 1} • {rMeta.name}</small>
                            </div>
                            <button
                              type="button"
                              className="inv-slot-remove"
                              onClick={() => handleToggleEquip(eq)}
                              disabled={busyChipId === eq.id}
                              title="Unequip"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rarity filter */}
                  <div className="inv-filters">
                    <span className="inv-filter-label">Rarity:</span>
                    {[
                      { id: 'all', label: 'All' },
                      { id: '1', label: 'Scrapy' },
                      { id: '2', label: 'Reliable' },
                      { id: '3', label: 'Premiumish' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`inv-filter-pill${rarityFilter === f.id ? ' inv-filter-pill--active' : ''}`}
                        onClick={() => setRarityFilter(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Chips grid */}
                  {filteredChips.length === 0 ? (
                    <div className="inv-empty-state">
                      <p>No chips found in this category yet.</p>
                      <small>Unlocked chips will appear here ready to equip.</small>
                    </div>
                  ) : (
                    <div className="inv-chips-grid">
                      {filteredChips.map((chip) => {
                        const rMeta = getRarityMeta(chip.rarity);
                        const statBadges = formatChipStatBadges(chip.stats);
                        const slotsFull = !chip.is_equipped && equippedChips.length >= MAX_EQUIPPED_CHIPS;
                        const disabled = busyChipId === chip.id || slotsFull;

                        return (
                          <article
                            key={chip.id}
                            className={`inv-chip-card ${rMeta.className}${chip.is_equipped ? ' inv-chip-card--equipped' : ''}`}
                          >
                            <div className="inv-chip-top">
                              <span className="inv-chip-rarity-tag">{rMeta.name}</span>
                              <span className="inv-chip-level">Lv. {chip.level || 1}</span>
                            </div>

                            <div className="inv-chip-art">
                              <ChipIcon chip={chip} />
                            </div>

                            <h3 className="inv-chip-name">{chip.name}</h3>

                            <div className="inv-chip-stats">
                              {statBadges.length > 0 ? (
                                statBadges.map((sb) => (
                                  <span key={sb.key} className="inv-chip-stat-line">
                                    {sb.text}
                                  </span>
                                ))
                              ) : (
                                <span className="inv-chip-stat-line inv-chip-stat-line--muted">
                                  No stat bonuses
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              className={`inv-equip-btn${chip.is_equipped ? ' inv-equip-btn--unequip' : ''}`}
                              onClick={() => handleToggleEquip(chip)}
                              disabled={disabled}
                            >
                              {busyChipId === chip.id
                                ? 'Updating...'
                                : chip.is_equipped
                                  ? 'Unequip'
                                  : slotsFull
                                    ? 'Slots Full (3/3)'
                                    : 'Equip'}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'character_skins' && (
                <div className="inv-skins-section">
                  <div className="inv-section-head">
                    <h2>Character Skins</h2>
                    <span className="inv-slot-counter">{filteredCharSkins.length} unlocked</span>
                  </div>

                  {/* Character filter */}
                  <div className="inv-filters">
                    <span className="inv-filter-label">Character:</span>
                    {SKIN_CHARACTER_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`inv-filter-pill${skinCharacterFilter === f.id ? ' inv-filter-pill--active' : ''}`}
                        onClick={() => setSkinCharacterFilter(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {filteredCharSkins.length === 0 ? (
                    <div className="inv-empty-state">
                      <p>
                        {skinCharacterFilter === 'all'
                          ? 'No character skins unlocked yet.'
                          : `No skins unlocked for ${getRoleLabel(skinCharacterFilter)} yet.`}
                      </p>
                      <small>Unlocked character skins will be organized here by role.</small>
                    </div>
                  ) : (
                    <div className="inv-skins-grid">
                      {filteredCharSkins.map((skin) => (
                        <div key={skin.id} className="inv-skin-card">
                          <div className="inv-skin-icon">✦</div>
                          <strong>{skin.name}</strong>
                          <small>{getRoleLabel(skin.character)} • Unlocked</small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'effect_skins' && (
                <div className="inv-skins-section">
                  <div className="inv-section-head">
                    <h2>Effect Skins</h2>
                    <span className="inv-slot-counter">{effSkins.length} unlocked</span>
                  </div>
                  {effSkins.length === 0 ? (
                    <div className="inv-empty-state">
                      <p>No effect skins unlocked yet.</p>
                      <small>Unlocked shot and trail effects will appear here.</small>
                    </div>
                  ) : (
                    <div className="inv-skins-grid">
                      {effSkins.map((skinId) => (
                        <div key={skinId} className="inv-skin-card inv-skin-card--effect">
                          <div className="inv-skin-icon">⚡</div>
                          <strong>Effect Skin #{skinId}</strong>
                          <small>Unlocked</small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'resources' && (
                <div className="inv-resources-section">
                  <div className="inv-section-head">
                    <h2>Account Resources</h2>
                  </div>
                  <div className="inv-resources-grid">
                    <div className="inv-resource-card inv-resource-card--danmas">
                      <span className="inv-resource-tag">MAIN CURRENCY</span>
                      <h3>Danmas</h3>
                      <div className="inv-resource-value">{danmas}</div>
                      <p>Currency earned from campaigns and Danmakrew events.</p>
                    </div>
                    <div className="inv-resource-card inv-resource-card--scraps">
                      <span className="inv-resource-tag">CHIP MATERIAL</span>
                      <h3>Scraps</h3>
                      <div className="inv-resource-value">{scraps}</div>
                      <p>Technical scrap used to craft or upgrade chips.</p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Right sidebar: Total Stats calculated live via GET /api/auth/user/inventory/stats */}
            <aside className="inv-stats-sidebar">
              <div className="inv-section-head">
                <h2>Total Stats</h2>
              </div>

              <div className="inv-role-switcher">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`inv-role-btn${selectedRole === r.id ? ' inv-role-btn--active' : ''}`}
                    onClick={() => setSelectedRole(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div className="inv-stats-list">
                {STAT_CONFIG.map((cfg) => {
                  const base = statsData?.base?.[cfg.key] ?? 0;
                  const bonus = statsData?.bonuses?.[cfg.key] ?? 0;
                  const total = statsData?.total?.[cfg.key] ?? base;
                  const isPct = cfg.kind === 'percent';
                  const hasBonus = Number(bonus) !== 0;

                  const totalDisplay =
                    cfg.key === 'Critic_Chance' || cfg.key === 'Crit_Damage'
                      ? `${total}%`
                      : `${total}`;
                  const bonusDisplay = `${Number(bonus) > 0 ? '+' : ''}${bonus}${isPct ? '%' : ''}`;

                  return (
                    <div key={cfg.key} className={`inv-stat-row${hasBonus ? ' inv-stat-row--boosted' : ''}`}>
                      <div className="inv-stat-name">
                        <span>{cfg.label}</span>
                        <small>{isPct ? 'Percentage (%)' : 'Numeric'}</small>
                      </div>
                      <div className="inv-stat-values">
                        <strong className="inv-stat-total">{totalDisplay}</strong>
                        {hasBonus && <span className="inv-stat-bonus">({bonusDisplay})</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

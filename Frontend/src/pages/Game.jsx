import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEV_TOOLS_ENABLED } from '../config/devTools';
import { deleteRoom, getIdToken, getStoredUserId, leaveRoom } from '../services/api';
import { clearLutCache, decodeLutWithKey, getCachedLutProfile } from '../game/engine/SpriteLutCache';
import {
  GameRuntimeSession,
  clampLevelPart,
  readSessionQuery,
  toDifficulty,
} from '../game/session/gameRuntimeSession';
import {
  createDefaultCompanionSlots,
  mergeCompanionSnapshot,
  normalizeRole,
  roleIcon,
} from '../game/session/squadState';
import GameHudHeader from '../game/components/GameHudHeader';
import GameArenaOverlays from '../game/components/GameArenaOverlays';
import TouchControlsOverlay from '../game/components/TouchControlsOverlay';
import FloatingControlsBar from '../game/components/FloatingControlsBar';
import AdFooter from '../game/components/AdFooter';
import '../styles/game.css';

const SESSION_STORAGE_KEY = 'danma_game_session';

// Tree-shaken completely out of production builds (`DEV_TOOLS_ENABLED === false`)
const BossDevPanel = DEV_TOOLS_ENABLED
  ? lazy(() => import('../game/devtools/BossDevPanel'))
  : null;

function readPersistedGameSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Game({ isDevMode = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const canvasMountRef = useRef(null);
  const sessionRef = useRef(null);

  const isSandboxRoute =
    DEV_TOOLS_ENABLED &&
    (isDevMode ||
      location.pathname === '/sandbox' ||
      location.pathname === '/dev' ||
      location.pathname === '/test' ||
      location.search.includes('sandbox=true') ||
      location.search.includes('dev=true'));

  const launchConfig = useMemo(() => {
    const persisted = isSandboxRoute ? null : readPersistedGameSession();
    const query = readSessionQuery(location.search, 'normal');
    const state = location.state || {};
    const storedUserId = getStoredUserId();

    const roomId = state.roomId || query.roomId || (isSandboxRoute ? 'local-sandbox' : persisted?.roomId) || 'local-room';
    const hostId = state.hostId || (isSandboxRoute ? '' : persisted?.hostId) || '';
    const userId = state.userId || storedUserId || (isSandboxRoute ? 'dev-player' : persisted?.userId) || 'player-local-host';
    const playerCharacters = state.playerCharacters || persisted?.playerCharacters || {};
    const usernamesById = state.usernamesById || persisted?.usernamesById || {};
    const roleFromRoster = userId && playerCharacters[userId] ? playerCharacters[userId] : null;
    const defaultRole = isSandboxRoute ? 'Special_Attack' : 'DPS';
    const resolvedRole = normalizeRole(state.role || roleFromRoster || query.classId || (isSandboxRoute ? 'Special_Attack' : persisted?.role) || defaultRole);
    const calKey = isSandboxRoute ? null : (state.calKey ?? persisted?.calKey ?? null);
    const rawDifficulty = state.difficulty || persisted?.difficulty || query.difficulty || 'normal';
    const difficulty = calKey ? rawDifficulty : toDifficulty(rawDifficulty, 'normal');
    const world = clampLevelPart(state.world ?? persisted?.world ?? query.world, 1);
    const stage = clampLevelPart(state.stage ?? persisted?.stage ?? query.stage, 1);
    const token = isSandboxRoute ? '' : (state.token || getIdToken() || query.token || '');

    const payload = {
      roomId,
      hostId,
      userId,
      role: resolvedRole,
      difficulty,
      calKey,
      world,
      stage,
      playerCharacters,
      usernamesById,
      testMode: query.testMode,
      token,
    };

    try {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          roomId,
          hostId,
          userId,
          role: resolvedRole,
          difficulty,
          calKey,
          world,
          stage,
          playerCharacters,
          usernamesById,
        })
      );
    } catch {
      // ignore storage quota errors
    }

    return payload;
  }, [location.search, location.state]);

  const [selectedClass, setSelectedClass] = useState(launchConfig.role);
  const selectedClassRef = useRef(launchConfig.role);
  const [workerMode, setWorkerMode] = useState('connecting');
  const [isHost, setIsHost] = useState(() =>
    Boolean(launchConfig.hostId && launchConfig.userId && launchConfig.hostId === launchConfig.userId)
  );
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;
  const leavingRef = useRef(false);
  const [roomClosedMessage, setRoomClosedMessage] = useState(null);
  const roomClosedTimerRef = useRef(null);

  const [playerHp, setPlayerHp] = useState(100);
  const [playerMaxHp, setPlayerMaxHp] = useState(100);
  const [playerSp, setPlayerSp] = useState(1000);
  const [playerMaxSp, setPlayerMaxSp] = useState(1000);
  const [companionSlots, setCompanionSlots] = useState(() => createDefaultCompanionSlots());

  const [showBossHpBar, setShowBossHpBar] = useState(false);
  const [bossRemainingStocks, setBossRemainingStocks] = useState(4);
  const [isBossRefilling, setIsBossRefilling] = useState(false);
  const [bossDisplayHpPercent, setBossDisplayHpPercent] = useState(100);
  const [spellcardName, setSpellcardName] = useState('Phase 1 "Vanguard Barrage"');
  const [bossAvatarSrc, setBossAvatarSrc] = useState('/assets/sprites/FirstBoss.png');
  const [isMinibossEncounter, setIsMinibossEncounter] = useState(false);
  const [moIntroActive, setMoIntroActive] = useState(false);
  const [moIntroProgress, setMoIntroProgress] = useState(0);

  const [stageBanner, setStageBanner] = useState(null);
  const [bossWarningActive, setBossWarningActive] = useState(false);
  const [spellcardBanner, setSpellcardBanner] = useState(null);
  const [chipDropNotice, setChipDropNotice] = useState(null);
  const [isStageClear, setIsStageClear] = useState(false);
  const [isAutoAdvancingStage, setIsAutoAdvancingStage] = useState(false);
  const [stageBlackAlpha, setStageBlackAlpha] = useState(0);
  const [stageFlashAlpha, setStageFlashAlpha] = useState(0);
  const [currentDifficultyLabel, setCurrentDifficultyLabel] = useState(() => {
    const activeLut = getCachedLutProfile();
    if (activeLut?.id && launchConfig.difficulty === activeLut.id) {
      return activeLut.level?.difficultyLabel || activeLut.ui?.label || launchConfig.difficulty;
    }
    return launchConfig.difficulty === 'no_mercy'
      ? 'No Mercy'
      : launchConfig.difficulty === 'difficult'
        ? 'Difficult'
        : 'Normal';
  });
  const [currentWorld, setCurrentWorld] = useState(launchConfig.world);
  const [currentStage, setCurrentStage] = useState(launchConfig.stage);
  const [currentStageTitle, setCurrentStageTitle] = useState('');
  const [bossEtaSeconds, setBossEtaSeconds] = useState(0);
  const [stageClearTitle, setStageClearTitle] = useState('STAGE CLEARED!');
  const [stageClearSubtext, setStageClearSubtext] = useState('Boss derrotado.');
  const [devPanelOpen, setDevPanelOpen] = useState(
    () => DEV_TOOLS_ENABLED && typeof window !== 'undefined' && window.innerWidth >= 900
  );
  const [devTelemetry, setDevTelemetry] = useState(null);
  const [debugHitboxes, setDebugHitboxes] = useState(false);
  const [recordingMode, setRecordingMode] = useState(null);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const [recordStatus, setRecordStatus] = useState('');
  const [autoStopRecOnClear, setAutoStopRecOnClear] = useState(true);
  const recorderRef = useRef(null);
  const autoStopTimerRef = useRef(null);
  const [canAdvanceStage, setCanAdvanceStage] = useState(false);
  const [isCampaignComplete, setIsCampaignComplete] = useState(false);

  const [isBeamStruggle, setIsBeamStruggle] = useState(false);
  const [isStruggleAligning, setIsStruggleAligning] = useState(false);
  const [struggleProgress, setStruggleProgress] = useState(50);
  const [struggleTimeLeft, setStruggleTimeLeft] = useState(5.0);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stagePreviewVariants, setStagePreviewVariants] = useState([]);
  const [activeStagePreviewIdx, setActiveStagePreviewIdx] = useState(-1);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [touchFocus, setTouchFocus] = useState(false);

  const touchInputRef = useRef({
    touchDx: 0,
    touchDy: 0,
    touchFiring: false,
    touchFocus: false,
  });
  const canAdvanceStageRef = useRef(false);
  canAdvanceStageRef.current = canAdvanceStage;

  useEffect(() => {
    document.body.classList.add('dk-in-game');
    return () => {
      document.body.classList.remove('dk-in-game');
    };
  }, []);

  const updateSelectedRole = useCallback((role) => {
    selectedClassRef.current = role;
    setSelectedClass(role);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // ignore fullscreen errors
    }
  }, []);

  useEffect(() => {
    const mountContainer = canvasMountRef.current;
    if (!mountContainer) return undefined;

    let cancelled = false;
    let activeSession = null;
    leavingRef.current = false;
    setRoomClosedMessage(null);
    if (roomClosedTimerRef.current) {
      clearTimeout(roomClosedTimerRef.current);
      roomClosedTimerRef.current = null;
    }

    let lastHudSync = 0;
    let lastPreviewSig = '';
    let lastPreviewActive = -1;
    setStagePreviewVariants([]);
    setActiveStagePreviewIdx(-1);

    const startRuntime = async () => {
      if (launchConfig.calKey && !getCachedLutProfile()) {
        await decodeLutWithKey(launchConfig.calKey, {
          roomId: launchConfig.roomId,
          hostId: launchConfig.hostId,
        }).catch(() => null);
      }
      if (cancelled) return;

      // Dirty-checked quantized cache: only notify React when visible HUD values change
      const hudCache = {
      hp: -1,
      maxHp: -1,
      sp: -1,
      maxSp: -1,
      bossStocks: -1,
      bossRefilling: null,
      bossHpPct: -1,
      spellName: null,
      showBossHp: null,
      bossAvatarSrc: null,
      isMinibossEncounter: null,
      moIntroActive: null,
      moIntroProgress: -1,
      stageBannerKey: null,
      bossWarning: null,
      spellBannerKey: null,
      chipDropKey: '',
      isStageClear: null,
      isAutoAdvancing: null,
      blackAlpha: -1,
      flashAlpha: -1,
      diffLabel: null,
      world: -1,
      stage: -1,
      stageTitle: null,
      bossEta: -1,
      clearTitle: null,
      clearSubtext: null,
      canAdvance: null,
      campaignComplete: null,
      isBeamStruggle: null,
      isStruggleAligning: null,
      struggleProgress: -1,
      struggleTimeLeft: -1,
    };

      const session = new GameRuntimeSession({
      mountContainer,
      roomId: launchConfig.roomId,
      userId: launchConfig.userId,
      classId: launchConfig.role,
      token: launchConfig.token,
      difficulty: launchConfig.difficulty,
      world: launchConfig.world,
      stage: launchConfig.stage,
      testMode: launchConfig.testMode,
      allowDebugHotkeys: isSandboxRoute,
      initialRoster: launchConfig.playerCharacters,
      getSelectedRole: () => selectedClassRef.current,
      setSelectedRole: (role) => updateSelectedRole(role),
      getFrameInput: () => touchInputRef.current,
      onTouchDeviceChange: (touch) => setIsTouchDevice(touch),
      onFirstTouch: () => {},
      onOrientationChange: () => {},
      onFullscreenChange: () => setIsFullscreen(Boolean(document.fullscreenElement)),
      onToggleFullscreen: toggleFullscreen,
      onWorkerModeChange: (mode) => {
        setWorkerMode(mode);
      },
      onHostStatusChange: (hostFlag) => {
        isHostRef.current = hostFlag;
        setIsHost(hostFlag);
      },
      onDevTelemetry: isSandboxRoute ? (nextTelemetry) => setDevTelemetry(nextTelemetry) : undefined,
      onToggleDevPanel: isSandboxRoute ? () => setDevPanelOpen((prev) => !prev) : undefined,
      onDebugHitboxesChange: isSandboxRoute ? (enabled) => setDebugHitboxes(enabled) : undefined,
      onRoomClosed: (message) => {
        if (leavingRef.current) return;
        clearLutCache();
        try {
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
          sessionStorage.removeItem('danma_current_room_id');
        } catch {
          // ignore storage errors
        }
        setRoomClosedMessage(message || 'El host abandonó la partida. La sala fue cerrada.');
        if (roomClosedTimerRef.current) clearTimeout(roomClosedTimerRef.current);
        roomClosedTimerRef.current = setTimeout(() => {
          navigate('/join', { replace: true });
        }, 2400);
      },
      onPlayersSnapshot: (players, myPlayerId) => {
        const me = players.find((p) => p.id === myPlayerId);
        if (me?.character) {
          const norm = normalizeRole(me.character);
          if (norm !== selectedClassRef.current) {
            updateSelectedRole(norm);
          }
        }
        setCompanionSlots((prev) =>
          mergeCompanionSnapshot(prev, players, myPlayerId, launchConfig.usernamesById)
        );
      },
      onEngineFrame: (engine) => {
        const now = performance.now();
        // Sync React HUD at ~20Hz (60Hz during struggle, stage clear, M.O intro, or cinematic transitions)
        const isTransitioning = engine.stageTransitionBlackAlpha > 0.005 || engine.stageRevealFlashAlpha > 0.005 || engine.moIntroActive;
        if (now - lastHudSync < 48 && !engine.isBeamStruggle && !engine.isStageClear && !isTransitioning) {
          return;
        }
        lastHudSync = now;

        const qHp = Math.round(engine.playerHp);
        if (qHp !== hudCache.hp) { hudCache.hp = qHp; setPlayerHp(qHp); }

        const qMaxHp = Math.round(engine.playerMaxHp);
        if (qMaxHp !== hudCache.maxHp) { hudCache.maxHp = qMaxHp; setPlayerMaxHp(qMaxHp); }

        const qSp = Math.round(engine.playerSp);
        if (qSp !== hudCache.sp) { hudCache.sp = qSp; setPlayerSp(qSp); }

        const qMaxSp = Math.round(engine.playerMaxSp);
        if (qMaxSp !== hudCache.maxSp) { hudCache.maxSp = qMaxSp; setPlayerMaxSp(qMaxSp); }

        if (engine.remainingStocks !== hudCache.bossStocks) {
          hudCache.bossStocks = engine.remainingStocks;
          setBossRemainingStocks(engine.remainingStocks);
        }
        if (engine.isRefillingHp !== hudCache.bossRefilling) {
          hudCache.bossRefilling = engine.isRefillingHp;
          setIsBossRefilling(engine.isRefillingHp);
        }
        const qBossPct = Math.round(engine.displayHpPercent * 2) / 2;
        if (qBossPct !== hudCache.bossHpPct) {
          hudCache.bossHpPct = qBossPct;
          setBossDisplayHpPercent(qBossPct);
        }
        if (engine.spellcardName !== hudCache.spellName) {
          hudCache.spellName = engine.spellcardName;
          setSpellcardName(engine.spellcardName);
        }
        if (engine.showBossHpBar !== hudCache.showBossHp) {
          hudCache.showBossHp = engine.showBossHpBar;
          setShowBossHpBar(engine.showBossHpBar);
        }
        if (engine.bossAvatarSrc !== hudCache.bossAvatarSrc) {
          hudCache.bossAvatarSrc = engine.bossAvatarSrc;
          setBossAvatarSrc(engine.bossAvatarSrc);
        }
        if (engine.isMinibossEncounter !== hudCache.isMinibossEncounter) {
          hudCache.isMinibossEncounter = engine.isMinibossEncounter;
          setIsMinibossEncounter(engine.isMinibossEncounter);
        }
        if (engine.moIntroActive !== hudCache.moIntroActive) {
          hudCache.moIntroActive = engine.moIntroActive;
          setMoIntroActive(engine.moIntroActive);
        }
        const qMoProg = engine.moIntroActive ? Math.round(engine.moIntroProgress * 100) / 100 : 0;
        if (qMoProg !== hudCache.moIntroProgress) {
          hudCache.moIntroProgress = qMoProg;
          setMoIntroProgress(qMoProg);
        }

        const nextStageBannerKey = engine.stageBanner
          ? `${engine.stageBanner.text}\u0000${engine.stageBanner.subtext}`
          : '';
        if (nextStageBannerKey !== hudCache.stageBannerKey) {
          hudCache.stageBannerKey = nextStageBannerKey;
          setStageBanner(
            engine.stageBanner ? { text: engine.stageBanner.text, subtext: engine.stageBanner.subtext } : null
          );
        }

        if (engine.bossWarningActive !== hudCache.bossWarning) {
          hudCache.bossWarning = engine.bossWarningActive;
          setBossWarningActive(engine.bossWarningActive);
        }

        const nextSpellBannerKey = engine.spellcardBanner.active ? engine.spellcardBanner.name : '';
        if (nextSpellBannerKey !== hudCache.spellBannerKey) {
          hudCache.spellBannerKey = nextSpellBannerKey;
          setSpellcardBanner(
            engine.spellcardBanner.active ? { active: true, name: engine.spellcardBanner.name } : null
          );
        }

        const nextChipDropKey = engine.chipDropNotice ? engine.chipDropNotice.id : '';
        if (nextChipDropKey !== hudCache.chipDropKey) {
          hudCache.chipDropKey = nextChipDropKey;
          setChipDropNotice(
            engine.chipDropNotice
              ? {
                  id: engine.chipDropNotice.id,
                  name: engine.chipDropNotice.name,
                  rarity: engine.chipDropNotice.rarity,
                  rarityLabel: engine.chipDropNotice.rarityLabel,
                }
              : null
          );
        }

        if (engine.isStageClear !== hudCache.isStageClear) {
          hudCache.isStageClear = engine.isStageClear;
          setIsStageClear(engine.isStageClear);
        }
        if (engine.isAutoAdvancingStage !== hudCache.isAutoAdvancing) {
          hudCache.isAutoAdvancing = engine.isAutoAdvancingStage;
          setIsAutoAdvancingStage(engine.isAutoAdvancingStage);
        }

        const qBlack = engine.stageTransitionBlackAlpha <= 0.005
          ? 0
          : Math.round(engine.stageTransitionBlackAlpha * 50) / 50;
        if (qBlack !== hudCache.blackAlpha) {
          hudCache.blackAlpha = qBlack;
          setStageBlackAlpha(qBlack);
        }

        const qFlash = engine.stageRevealFlashAlpha <= 0.005
          ? 0
          : Math.round(engine.stageRevealFlashAlpha * 50) / 50;
        if (qFlash !== hudCache.flashAlpha) {
          hudCache.flashAlpha = qFlash;
          setStageFlashAlpha(qFlash);
        }

        if (engine.currentDifficultyLabel !== hudCache.diffLabel) {
          hudCache.diffLabel = engine.currentDifficultyLabel;
          setCurrentDifficultyLabel(engine.currentDifficultyLabel);
        }
        if (engine.currentWorld !== hudCache.world) {
          hudCache.world = engine.currentWorld;
          setCurrentWorld(engine.currentWorld);
        }
        if (engine.currentStage !== hudCache.stage) {
          hudCache.stage = engine.currentStage;
          setCurrentStage(engine.currentStage);
        }
        if (engine.currentStageTitle !== hudCache.stageTitle) {
          hudCache.stageTitle = engine.currentStageTitle;
          setCurrentStageTitle(engine.currentStageTitle);
        }

        const qEta = Math.ceil(engine.bossEtaSeconds);
        if (qEta !== hudCache.bossEta) {
          hudCache.bossEta = qEta;
          setBossEtaSeconds(qEta);
        }
        if (engine.stageClearTitle !== hudCache.clearTitle) {
          hudCache.clearTitle = engine.stageClearTitle;
          setStageClearTitle(engine.stageClearTitle);
        }
        if (engine.stageClearSubtext !== hudCache.clearSubtext) {
          hudCache.clearSubtext = engine.stageClearSubtext;
          setStageClearSubtext(engine.stageClearSubtext);
        }
        if (engine.canAdvanceStage !== hudCache.canAdvance) {
          hudCache.canAdvance = engine.canAdvanceStage;
          setCanAdvanceStage(engine.canAdvanceStage);
        }
        if (engine.isCampaignComplete !== hudCache.campaignComplete) {
          hudCache.campaignComplete = engine.isCampaignComplete;
          setIsCampaignComplete(engine.isCampaignComplete);
        }
        if (engine.isBeamStruggle !== hudCache.isBeamStruggle) {
          hudCache.isBeamStruggle = engine.isBeamStruggle;
          setIsBeamStruggle(engine.isBeamStruggle);
        }
        if (engine.isStruggleAligning !== hudCache.isStruggleAligning) {
          hudCache.isStruggleAligning = engine.isStruggleAligning;
          setIsStruggleAligning(engine.isStruggleAligning);
        }
        const qStruggleProg = Math.round(engine.struggleProgress * 2) / 2;
        if (qStruggleProg !== hudCache.struggleProgress) {
          hudCache.struggleProgress = qStruggleProg;
          setStruggleProgress(qStruggleProg);
        }
        const qStruggleTime = Math.round(engine.struggleTimeLeft * 10) / 10;
        if (qStruggleTime !== hudCache.struggleTimeLeft) {
          hudCache.struggleTimeLeft = qStruggleTime;
          setStruggleTimeLeft(qStruggleTime);
        }

        const previewVariants = engine.getStagePreviewVariants();
        const sig = previewVariants.map((v) => `${v.key}:${v.label}:${v.preset}`).join('|');
        if (sig !== lastPreviewSig) {
          lastPreviewSig = sig;
          setStagePreviewVariants(previewVariants);
        }
        const activeIdx = engine.getActiveStagePreviewVariantIndex();
        if (activeIdx !== lastPreviewActive) {
          lastPreviewActive = activeIdx;
          setActiveStagePreviewIdx(activeIdx);
        }
      },
    });

      activeSession = session;
      sessionRef.current = session;
      session.start();
    };

    startRuntime();

    return () => {
      cancelled = true;
      if (roomClosedTimerRef.current) {
        clearTimeout(roomClosedTimerRef.current);
        roomClosedTimerRef.current = null;
      }
      if (activeSession) {
        activeSession.stop();
      }
      sessionRef.current = null;
    };
  }, [launchConfig, navigate, toggleFullscreen, updateSelectedRole]);

  const handleTouchVectorChange = useCallback((dx, dy) => {
    touchInputRef.current.touchDx = dx;
    touchInputRef.current.touchDy = dy;
  }, []);

  const handleToggleTouchFocus = useCallback(() => {
    setTouchFocus((prev) => {
      const next = !prev;
      touchInputRef.current.touchFocus = next;
      return next;
    });
  }, []);

  const handleTouchFireChange = useCallback((firing) => {
    touchInputRef.current.touchFiring = firing;
  }, []);

  const handleStageClearAction = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (canAdvanceStageRef.current) {
      session.goToNextStage();
    } else {
      session.restartStage();
    }
  }, []);

  const handleLeaveMatch = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;

    if (roomClosedTimerRef.current) {
      clearTimeout(roomClosedTimerRef.current);
      roomClosedTimerRef.current = null;
    }

    clearLutCache();
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem('danma_current_room_id');
    } catch {
      // ignore storage errors
    }

    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      session.leaveMatch();
    }

    const isOnlineRoom =
      !isSandboxRoute &&
      Boolean(launchConfig.token) &&
      Boolean(launchConfig.roomId) &&
      /^[0-9a-f-]{36}$/i.test(launchConfig.roomId);

    if (isOnlineRoom) {
      if (isHostRef.current) {
        deleteRoom(launchConfig.roomId, { keepalive: true }).catch(() => {
          leaveRoom(launchConfig.roomId, { keepalive: true }).catch(() => {});
        });
      } else {
        leaveRoom(launchConfig.roomId, { keepalive: true }).catch(() => {});
      }
    }

    if (isSandboxRoute) {
      navigate('/dashboard', { replace: true });
      return;
    }
    navigate('/join', { replace: true });
  }, [isSandboxRoute, launchConfig.roomId, launchConfig.token, navigate]);

  const handlePushStruggle = useCallback(() => sessionRef.current?.pushStruggle(), []);
  const handleSelectRole = useCallback((role) => sessionRef.current?.selectRole(role), []);
  const handleTriggerSkill = useCallback(() => sessionRef.current?.triggerSkill(), []);
  const handleSpawnBoss = useCallback(() => sessionRef.current?.spawnBossNow(), []);
  const handleStartStruggle = useCallback(() => sessionRef.current?.startBeamStruggleTest(), []);
  const handleSelectStagePreview = useCallback((idx) => sessionRef.current?.selectStagePreviewVariant(idx), []);
  const handleDevJumpLevel = useCallback(
    (diff, world, stage, autoBoss) => sessionRef.current?.devJumpLevel(diff, world, stage, autoBoss),
    []
  );
  const handleDevJumpPhase = useCallback((phase) => sessionRef.current?.devJumpBossPhase(phase), []);
  const handleDevDamageBoss = useCallback((mode, val) => sessionRef.current?.devDamageBoss(mode, val), []);
  const handleDevClearBullets = useCallback(() => sessionRef.current?.devClearBullets(), []);
  const handleDevSetFlags = useCallback((flags) => sessionRef.current?.devSetFlags(flags), []);
  const handleDevStepFrame = useCallback((frames) => sessionRef.current?.devStepFrame(frames), []);
  const handleDevResetHits = useCallback(() => sessionRef.current?.devResetHits(), []);
  const handleDevHealPlayer = useCallback(() => sessionRef.current?.devHealPlayer(), []);
  const handleDevToggleHitboxes = useCallback(() => sessionRef.current?.toggleDebugHitboxes(), []);
  const handleDevRestartStage = useCallback(() => sessionRef.current?.restartStage(), []);
  const handleDevNextStage = useCallback(() => sessionRef.current?.goToNextStage(), []);

  const handleStopRecording = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    recorderRef.current?.stop();
  }, []);

  const handleStartRecording = useCallback(async (mode) => {
    if (!DEV_TOOLS_ENABLED) return;
    const session = sessionRef.current;
    if (!session) return;
    const { ShowcaseRecorder } = await import('../game/devtools/showcaseRecorder');
    if (!recorderRef.current) {
      recorderRef.current = new ShowcaseRecorder();
    }
    setRecordStatus('');
    const canvas = session.getCanvasElement();
    const label = `${devTelemetry?.bossId || 'boss'}-w${currentWorld}-${currentStage}-${mode}`;
    const ok = await recorderRef.current.start(mode, canvas, label, (st) => {
      setRecordingMode(st.recording ? st.mode : null);
      if (!st.recording) {
        setRecordElapsed(0);
        if (st.savedFile) {
          setRecordStatus(`Descargado: ${st.savedFile}`);
        } else if (st.error) {
          setRecordStatus(st.error);
        }
      }
    });
    if (ok && mode === 'screen') {
      // Collapse Dev Lab completely so zero debug chrome appears in the HUD capture!
      setDevPanelOpen(false);
    }
  }, [currentStage, currentWorld, devTelemetry?.bossId]);

  const handleStartMoBotShowcase = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const diff = devTelemetry?.difficulty || 'normal';
    session.devJumpLevel(diff, 3, 3, true);
    session.devResetHits();
    session.devHealPlayer();
    session.devSetFlags({ botPlay: true, paused: false, timeScale: 1 });
    setRecordStatus('M.O. Full Run + Bot Play activado. Tocá Rec Canvas o Rec + HUD.');
  }, [devTelemetry?.difficulty]);

  useEffect(() => {
    if (!recordingMode) return undefined;
    const id = setInterval(() => {
      if (recorderRef.current?.isRecording()) {
        setRecordElapsed(recorderRef.current.getElapsedSeconds());
      }
    }, 250);
    return () => clearInterval(id);
  }, [recordingMode]);

  useEffect(() => {
    if (!recordingMode || !autoStopRecOnClear || !isStageClear) return undefined;
    if (autoStopTimerRef.current) return undefined;
    autoStopTimerRef.current = setTimeout(() => {
      autoStopTimerRef.current = null;
      recorderRef.current?.stop();
    }, 2200);
    return () => {
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
    };
  }, [autoStopRecOnClear, isStageClear, recordingMode]);

  useEffect(() => () => {
    if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
    recorderRef.current?.stop();
  }, []);

  const playerHpPercent = Math.max(0, Math.min(100, (playerHp / (playerMaxHp || 100)) * 100));
  const playerSpPercent = Math.max(0, Math.min(100, (playerSp / (playerMaxSp || 1000)) * 100));
  const minSkillThreshold =
    selectedClass === 'Tank' ? 25 : selectedClass === 'DPS' ? 35 : selectedClass === 'Support' ? 40 : 50;
  const isUltiReady = playerSpPercent >= minSkillThreshold;
  const playerAvatarSrc = roleIcon(selectedClass);
  const isLocalWorkerMode = workerMode === 'local-worker';

  const stageClearMetaText = `${currentDifficultyLabel} · Mundo ${currentWorld}-${currentStage}`;
  const stageClearButtonText = canAdvanceStage
    ? 'SIGUIENTE NIVEL'
    : isCampaignComplete
      ? 'REINICIAR CAMPAÑA'
      : 'JUGAR DE NUEVO';

  return (
    <div className="dk-game-viewport" role="application" aria-label="Danmakrew Arena de Combate">
      <div className="dk-main-layout-container">
        <GameHudHeader
          selectedClass={selectedClass}
          playerAvatarSrc={playerAvatarSrc}
          playerHpPercent={playerHpPercent}
          playerSpPercent={playerSpPercent}
          isUltiReady={isUltiReady}
          companionSlots={companionSlots}
          showBossHpBar={showBossHpBar}
          bossRemainingStocks={bossRemainingStocks}
          spellcardName={spellcardName}
          bossAvatarSrc={bossAvatarSrc}
          isMiniboss={isMinibossEncounter}
          isBossRefilling={isBossRefilling}
          bossDisplayHpPercent={bossDisplayHpPercent}
          difficultyLabel={currentDifficultyLabel}
          world={currentWorld}
          stage={currentStage}
          stageTitle={currentStageTitle}
          bossEtaSeconds={bossEtaSeconds}
          isHost={isHost}
          isTouchDevice={isTouchDevice}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onLeaveMatch={handleLeaveMatch}
        />

        <main className="dk-combat-arena-wrapper">
          <div className="dk-arena-frame-rail" />

          <div className="dk-canvas-container">
            <div ref={canvasMountRef} className="dk-pixi-mount" />

            <GameArenaOverlays
              stageBanner={stageBanner}
              bossWarningActive={bossWarningActive}
              spellcardBanner={spellcardBanner}
              chipDropNotice={chipDropNotice}
              moIntroActive={moIntroActive}
              moIntroProgress={moIntroProgress}
              isStruggleAligning={isStruggleAligning}
              isBeamStruggle={isBeamStruggle}
              struggleProgress={struggleProgress}
              struggleTimeLeft={struggleTimeLeft}
              isTouchDevice={isTouchDevice}
              isStageClear={isStageClear && !isAutoAdvancingStage}
              isAutoAdvancingStage={isAutoAdvancingStage}
              stageBlackAlpha={stageBlackAlpha}
              stageFlashAlpha={stageFlashAlpha}
              isPlayerDefeated={playerHp <= 0}
              roomClosedMessage={roomClosedMessage}
              stageClearTitle={stageClearTitle}
              stageClearSubtext={stageClearSubtext}
              stageClearMeta={stageClearMetaText}
              stageClearButtonText={stageClearButtonText}
              onPushStruggle={handlePushStruggle}
              onRestartStage={handleStageClearAction}
              onLeaveMatch={handleLeaveMatch}
            />

            {isTouchDevice && (
              <TouchControlsOverlay
                touchFocus={touchFocus}
                isUltiReady={isUltiReady}
                onVectorChange={handleTouchVectorChange}
                onFireChange={handleTouchFireChange}
                onTriggerSkill={handleTriggerSkill}
                onToggleFocus={handleToggleTouchFocus}
              />
            )}
          </div>

          <div className="dk-arena-frame-rail" />
        </main>

        <AdFooter />

        {(!isTouchDevice || isSandboxRoute) && recordingMode !== 'screen' && (
          <FloatingControlsBar
            selectedClass={selectedClass}
            isFullscreen={isFullscreen}
            canSwitchRole={isSandboxRoute && isLocalWorkerMode}
            showDebugActions={isSandboxRoute}
            stagePreviewVariants={stagePreviewVariants}
            activeStagePreviewIdx={activeStagePreviewIdx}
            onSelectRole={handleSelectRole}
            onTriggerSkill={handleTriggerSkill}
            onSpawnBoss={handleSpawnBoss}
            onStartStruggle={handleStartStruggle}
            onSelectStagePreview={handleSelectStagePreview}
            onToggleFullscreen={toggleFullscreen}
          />
        )}
        {DEV_TOOLS_ENABLED && isSandboxRoute && BossDevPanel && (
          <Suspense fallback={null}>
            <BossDevPanel
              isOpen={devPanelOpen}
              onToggleOpen={() => setDevPanelOpen((prev) => !prev)}
              telemetry={devTelemetry}
              selectedClass={selectedClass}
              debugHitboxes={debugHitboxes}
              recordingMode={recordingMode}
              recordElapsed={recordElapsed}
              recordStatus={recordStatus}
              autoStopRecOnClear={autoStopRecOnClear}
              onToggleAutoStopRec={setAutoStopRecOnClear}
              onStartRecording={handleStartRecording}
              onStopRecording={handleStopRecording}
              onStartMoBotShowcase={handleStartMoBotShowcase}
              onJumpLevel={handleDevJumpLevel}
              onJumpPhase={handleDevJumpPhase}
              onDamageBoss={handleDevDamageBoss}
              onSpawnBoss={handleSpawnBoss}
              onStartStruggle={handleStartStruggle}
              onClearBullets={handleDevClearBullets}
              onSetFlags={handleDevSetFlags}
              onStepFrame={handleDevStepFrame}
              onResetHits={handleDevResetHits}
              onHealPlayer={handleDevHealPlayer}
              onToggleHitboxes={handleDevToggleHitboxes}
              onSelectRole={handleSelectRole}
              onRestartStage={handleDevRestartStage}
              onNextStage={handleDevNextStage}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

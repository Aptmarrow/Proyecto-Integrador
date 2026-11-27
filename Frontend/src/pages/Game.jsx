import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getIdToken, getStoredUserId } from '../services/api';
import { clearLutCache } from '../game/engine/SpriteLutCache';
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
    isDevMode ||
    location.pathname === '/sandbox' ||
    location.pathname === '/dev' ||
    location.pathname === '/test' ||
    location.search.includes('sandbox=true') ||
    location.search.includes('dev=true');

  const launchConfig = useMemo(() => {
    const persisted = isSandboxRoute ? null : readPersistedGameSession();
    const query = readSessionQuery(location.search, 'normal');
    const state = location.state || {};
    const storedUserId = getStoredUserId();

    const roomId = state.roomId || query.roomId || (isSandboxRoute ? 'local-sandbox' : persisted?.roomId) || 'local-room';
    const userId = state.userId || storedUserId || (isSandboxRoute ? 'dev-player' : persisted?.userId) || 'player-local-host';
    const playerCharacters = state.playerCharacters || persisted?.playerCharacters || {};
    const usernamesById = state.usernamesById || persisted?.usernamesById || {};
    const roleFromRoster = userId && playerCharacters[userId] ? playerCharacters[userId] : null;
    const defaultRole = isSandboxRoute ? 'Special_Attack' : 'DPS';
    const resolvedRole = normalizeRole(state.role || roleFromRoster || query.classId || (isSandboxRoute ? 'Special_Attack' : persisted?.role) || defaultRole);
    const difficulty = toDifficulty(state.difficulty || persisted?.difficulty || query.difficulty, 'normal');
    const world = clampLevelPart(state.world ?? persisted?.world ?? query.world, 1);
    const stage = clampLevelPart(state.stage ?? persisted?.stage ?? query.stage, 1);
    const token = isSandboxRoute ? '' : (state.token || getIdToken() || query.token || '');

    const payload = {
      roomId,
      userId,
      role: resolvedRole,
      difficulty,
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
          userId,
          role: resolvedRole,
          difficulty,
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
  const [workerModeLabel, setWorkerModeLabel] = useState('Iniciando Web Workers...');

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
  const [isStageClear, setIsStageClear] = useState(false);
  const [isAutoAdvancingStage, setIsAutoAdvancingStage] = useState(false);
  const [stageBlackAlpha, setStageBlackAlpha] = useState(0);
  const [stageFlashAlpha, setStageFlashAlpha] = useState(0);
  const [currentDifficultyLabel, setCurrentDifficultyLabel] = useState(
    launchConfig.difficulty === 'no_mercy'
      ? 'No Mercy'
      : launchConfig.difficulty === 'difficult'
        ? 'Difficult'
        : 'Normal'
  );
  const [currentWorld, setCurrentWorld] = useState(launchConfig.world);
  const [currentStage, setCurrentStage] = useState(launchConfig.stage);
  const [currentStageTitle, setCurrentStageTitle] = useState('');
  const [bossEtaSeconds, setBossEtaSeconds] = useState(0);
  const [stageClearTitle, setStageClearTitle] = useState('STAGE CLEARED!');
  const [stageClearSubtext, setStageClearSubtext] = useState('Boss derrotado.');
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
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickStickPos, setJoystickStickPos] = useState({ x: 0, y: 0 });
  const [touchFiring, setTouchFiring] = useState(false);
  const [touchFocus, setTouchFocus] = useState(false);

  const touchInputRef = useRef({
    touchDx: 0,
    touchDy: 0,
    touchFiring: false,
    touchFocus: false,
  });
  const joystickBaseRef = useRef({ x: 0, y: 0 });
  const joystickActiveRef = useRef(false);
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

    let lastHudSync = 0;
    let lastPreviewSig = '';
    let lastPreviewActive = -1;
    setStagePreviewVariants([]);
    setActiveStagePreviewIdx(-1);

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
      initialRoster: launchConfig.playerCharacters,
      getSelectedRole: () => selectedClassRef.current,
      setSelectedRole: (role) => updateSelectedRole(role),
      getFrameInput: () => touchInputRef.current,
      onTouchDeviceChange: (touch) => setIsTouchDevice(touch),
      onFirstTouch: () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }
      },
      onOrientationChange: () => {},
      onFullscreenChange: () => setIsFullscreen(Boolean(document.fullscreenElement)),
      onToggleFullscreen: toggleFullscreen,
      onWorkerModeChange: (mode, label) => {
        setWorkerMode(mode);
        setWorkerModeLabel(label);
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

    sessionRef.current = session;
    session.start();

    return () => {
      session.stop();
      sessionRef.current = null;
    };
  }, [launchConfig, toggleFullscreen, updateSelectedRole]);

  const updateJoystickVector = useCallback((clientX, clientY, centerX, centerY, maxRadius) => {
    const rawDx = clientX - centerX;
    const rawDy = clientY - centerY;
    const dist = Math.hypot(rawDx, rawDy);
    const clampedRadius = Math.min(dist, maxRadius);
    const angle = Math.atan2(rawDy, rawDx);

    setJoystickStickPos({
      x: Math.cos(angle) * clampedRadius,
      y: Math.sin(angle) * clampedRadius,
    });

    const deadzone = 0.08;
    const normalizedDist = Math.min(1, dist / maxRadius);
    if (normalizedDist > deadzone) {
      const factor = (normalizedDist - deadzone) / (1 - deadzone);
      touchInputRef.current.touchDx = Math.cos(angle) * factor;
      touchInputRef.current.touchDy = Math.sin(angle) * factor;
    } else {
      touchInputRef.current.touchDx = 0;
      touchInputRef.current.touchDy = 0;
    }
  }, []);

  const handleJoystickStart = useCallback((e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    joystickBaseRef.current = { x: centerX, y: centerY };
    joystickActiveRef.current = true;
    setJoystickActive(true);
    updateJoystickVector(touch.clientX, touch.clientY, centerX, centerY, rect.width / 2);
  }, [updateJoystickVector]);

  const handleJoystickMove = useCallback((e) => {
    e.preventDefault();
    if (!joystickActiveRef.current) return;
    const touch = e.changedTouches[0];
    updateJoystickVector(
      touch.clientX,
      touch.clientY,
      joystickBaseRef.current.x,
      joystickBaseRef.current.y,
      42
    );
  }, [updateJoystickVector]);

  const handleJoystickEnd = useCallback((e) => {
    e.preventDefault();
    joystickActiveRef.current = false;
    setJoystickActive(false);
    setJoystickStickPos({ x: 0, y: 0 });
    touchInputRef.current.touchDx = 0;
    touchInputRef.current.touchDy = 0;
  }, []);

  const handleToggleTouchFocus = useCallback(() => {
    setTouchFocus((prev) => {
      const next = !prev;
      touchInputRef.current.touchFocus = next;
      return next;
    });
  }, []);

  const handleSetTouchFiring = useCallback((firing) => {
    setTouchFiring(firing);
    touchInputRef.current.touchFiring = firing;
  }, []);

  const handleFireStart = useCallback(() => handleSetTouchFiring(true), [handleSetTouchFiring]);
  const handleFireEnd = useCallback(() => handleSetTouchFiring(false), [handleSetTouchFiring]);

  const handleStageClearAction = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (canAdvanceStageRef.current) {
      session.goToNextStage();
    } else {
      session.restartStage();
    }
  }, []);

  const handleExitLobby = useCallback(() => {
    clearLutCache();
    if (isSandboxRoute) {
      navigate('/dashboard');
      return;
    }
    navigate('/join');
  }, [isSandboxRoute, navigate]);

  const handlePushStruggle = useCallback(() => sessionRef.current?.pushStruggle(), []);
  const handleSelectRole = useCallback((role) => sessionRef.current?.selectRole(role), []);
  const handleTriggerSkill = useCallback(() => sessionRef.current?.triggerSkill(), []);
  const handleSpawnBoss = useCallback(() => sessionRef.current?.spawnBossNow(), []);
  const handleStartStruggle = useCallback(() => sessionRef.current?.startBeamStruggleTest(), []);
  const handleSelectStagePreview = useCallback((idx) => sessionRef.current?.selectStagePreviewVariant(idx), []);

  const playerHpPercent = Math.max(0, Math.min(100, (playerHp / (playerMaxHp || 100)) * 100));
  const playerSpPercent = Math.max(0, Math.min(100, (playerSp / (playerMaxSp || 1000)) * 100));
  const minSkillThreshold =
    selectedClass === 'Tank' ? 25 : selectedClass === 'DPS' ? 35 : selectedClass === 'Support' ? 40 : 50;
  const isUltiReady = playerSpPercent >= minSkillThreshold;
  const playerAvatarSrc = roleIcon(selectedClass);
  const isLocalWorkerMode = workerMode === 'local-worker';

  const stageClearMetaText = `Dificultad: ${currentDifficultyLabel} | Mundo ${currentWorld} | Stage ${currentStage}`;
  const stageClearButtonText = canAdvanceStage
    ? '▶ SIGUIENTE STAGE'
    : isCampaignComplete
      ? '🏆 REINICIAR CAMPAÑA'
      : '🔄 JUGAR OTRA VEZ (REPLAY)';

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
          workerModeLabel={workerModeLabel}
          difficultyLabel={currentDifficultyLabel}
          world={currentWorld}
          stage={currentStage}
          stageTitle={currentStageTitle}
          bossEtaSeconds={bossEtaSeconds}
          onExitLobby={handleExitLobby}
        />

        <main className="dk-combat-arena-wrapper">
          <div className="dk-arena-frame-rail" />

          <div className="dk-canvas-container">
            <div ref={canvasMountRef} className="dk-pixi-mount" />

            <GameArenaOverlays
              stageBanner={stageBanner}
              bossWarningActive={bossWarningActive}
              spellcardBanner={spellcardBanner}
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
              stageClearTitle={stageClearTitle}
              stageClearSubtext={stageClearSubtext}
              stageClearMeta={stageClearMetaText}
              stageClearButtonText={stageClearButtonText}
              onPushStruggle={handlePushStruggle}
              onRestartStage={handleStageClearAction}
              onExitLobby={handleExitLobby}
            />

            {isTouchDevice && (
              <TouchControlsOverlay
                joystickActive={joystickActive}
                joystickStickPos={joystickStickPos}
                touchFocus={touchFocus}
                touchFiring={touchFiring}
                onJoystickStart={handleJoystickStart}
                onJoystickMove={handleJoystickMove}
                onJoystickEnd={handleJoystickEnd}
                onTriggerSkill={handleTriggerSkill}
                onToggleFocus={handleToggleTouchFocus}
                onFireStart={handleFireStart}
                onFireEnd={handleFireEnd}
              />
            )}
          </div>

          <div className="dk-arena-frame-rail" />
        </main>

        <AdFooter />

        <FloatingControlsBar
          selectedClass={selectedClass}
          isFullscreen={isFullscreen}
          canSwitchRole={isLocalWorkerMode}
          showDebugActions={true}
          stagePreviewVariants={stagePreviewVariants}
          activeStagePreviewIdx={activeStagePreviewIdx}
          onSelectRole={handleSelectRole}
          onTriggerSkill={handleTriggerSkill}
          onSpawnBoss={handleSpawnBoss}
          onStartStruggle={handleStartStruggle}
          onSelectStagePreview={handleSelectStagePreview}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>
    </div>
  );
}

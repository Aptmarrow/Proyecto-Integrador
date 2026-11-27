import { memo, useCallback, useRef, useState } from 'react';

const MAX_STICK_RADIUS = 44;
const DEADZONE = 0.11;

function TouchControlsOverlay({
  touchFocus,
  isUltiReady = false,
  onVectorChange,
  onFireChange,
  onTriggerSkill,
  onToggleFocus,
}) {
  const [joystickActive, setJoystickActive] = useState(false);
  const [fireActive, setFireActive] = useState(false);

  const joystickPointerIdRef = useRef(null);
  const firePointerIdRef = useRef(null);
  const joystickOriginRef = useRef({ x: 0, y: 0 });
  const baseRef = useRef(null);
  const stickRef = useRef(null);

  const applyStickOffset = useCallback((ox, oy) => {
    if (stickRef.current) {
      stickRef.current.style.transform = `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0)`;
    }
  }, []);

  const updateStickFromPoint = useCallback(
    (clientX, clientY) => {
      const rawDx = clientX - joystickOriginRef.current.x;
      const rawDy = clientY - joystickOriginRef.current.y;
      const dist = Math.hypot(rawDx, rawDy);
      const clampedDist = Math.min(dist, MAX_STICK_RADIUS);
      const angle = Math.atan2(rawDy, rawDx);

      applyStickOffset(Math.cos(angle) * clampedDist, Math.sin(angle) * clampedDist);

      const normDist = Math.min(1, dist / MAX_STICK_RADIUS);
      if (normDist > DEADZONE) {
        const factor = (normDist - DEADZONE) / (1 - DEADZONE);
        onVectorChange(Math.cos(angle) * factor, Math.sin(angle) * factor);
      } else {
        onVectorChange(0, 0);
      }
    },
    [applyStickOffset, onVectorChange]
  );

  const resetJoystick = useCallback(() => {
    joystickPointerIdRef.current = null;
    setJoystickActive(false);
    applyStickOffset(0, 0);
    if (baseRef.current) {
      baseRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    }
    onVectorChange(0, 0);
  }, [applyStickOffset, onVectorChange]);

  const handleJoystickPointerDown = useCallback(
    (e) => {
      if (joystickPointerIdRef.current !== null) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore if pointer capture is unavailable
      }
      joystickPointerIdRef.current = e.pointerId;
      setJoystickActive(true);

      const zoneRect = e.currentTarget.getBoundingClientRect();
      const zoneCenterX = zoneRect.left + zoneRect.width * 0.5;
      const zoneCenterY = zoneRect.top + zoneRect.height * 0.5;
      // Floating origin: recenter ring where thumb lands (clamped inside touch zone)
      const maxShiftX = Math.max(0, zoneRect.width * 0.5 - 52);
      const maxShiftY = Math.max(0, zoneRect.height * 0.5 - 52);
      const shiftX = Math.max(-maxShiftX, Math.min(maxShiftX, e.clientX - zoneCenterX));
      const shiftY = Math.max(-maxShiftY, Math.min(maxShiftY, e.clientY - zoneCenterY));

      joystickOriginRef.current = {
        x: zoneCenterX + shiftX,
        y: zoneCenterY + shiftY,
      };
      if (baseRef.current) {
        baseRef.current.style.transform = `translate3d(${shiftX.toFixed(1)}px, ${shiftY.toFixed(1)}px, 0)`;
      }
      updateStickFromPoint(e.clientX, e.clientY);
    },
    [updateStickFromPoint]
  );

  const handleJoystickPointerMove = useCallback(
    (e) => {
      if (joystickPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      updateStickFromPoint(e.clientX, e.clientY);
    },
    [updateStickFromPoint]
  );

  const handleJoystickPointerUp = useCallback(
    (e) => {
      if (joystickPointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      resetJoystick();
    },
    [resetJoystick]
  );

  const handleFirePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      firePointerIdRef.current = e.pointerId;
      setFireActive(true);
      onFireChange(true);
    },
    [onFireChange]
  );

  const handleFirePointerUp = useCallback(
    (e) => {
      if (firePointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      firePointerIdRef.current = null;
      setFireActive(false);
      onFireChange(false);
    },
    [onFireChange]
  );

  return (
    <div className="dk-touch-controls-overlay">
      <div
        className="dk-touch-joystick-zone"
        onPointerDown={handleJoystickPointerDown}
        onPointerMove={handleJoystickPointerMove}
        onPointerUp={handleJoystickPointerUp}
        onPointerCancel={handleJoystickPointerUp}
        onLostPointerCapture={handleJoystickPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label="Joystick Virtual"
      >
        <div ref={baseRef} className={`dk-joystick-base ${joystickActive ? 'active' : ''}`}>
          <div ref={stickRef} className="dk-joystick-stick" />
        </div>
      </div>

      <div className="dk-touch-buttons-zone" onContextMenu={(e) => e.preventDefault()}>
        <div className="dk-touch-secondary-col">
          <button
            type="button"
            className={`dk-touch-btn dk-skill-touch-btn ${isUltiReady ? 'ready' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTriggerSkill();
            }}
            aria-label="Habilidad Especial"
          >
            SKILL
          </button>
          <button
            type="button"
            className={`dk-touch-btn dk-focus-btn ${touchFocus ? 'active' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFocus();
            }}
            aria-label="Modo Focus"
          >
            FOCUS
          </button>
        </div>
        <button
          type="button"
          className={`dk-touch-btn dk-fire-btn ${fireActive ? 'active' : ''}`}
          onPointerDown={handleFirePointerDown}
          onPointerUp={handleFirePointerUp}
          onPointerCancel={handleFirePointerUp}
          onLostPointerCapture={handleFirePointerUp}
          aria-label="Disparar"
        >
          FIRE
        </button>
      </div>
    </div>
  );
}

export default memo(TouchControlsOverlay);

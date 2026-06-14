// ============================================================
// AZ Tamer — Mobile input & UI manager
// ============================================================
import { worldOrbit } from './camorbit';

export function isMobileMode(): boolean {
  return localStorage.getItem('mobileMode') === 'true';
}

function simulateKeyEvent(key: string, type: 'keydown' | 'keyup') {
  const codeMap: Record<string, string> = {
    'w': 'KeyW',
    'a': 'KeyA',
    's': 'KeyS',
    'd': 'KeyD',
    'e': 'KeyE',
    'm': 'KeyM',
    'escape': 'Escape',
    'enter': 'Enter'
  };
  const event = new KeyboardEvent(type, {
    key: key,
    code: codeMap[key.toLowerCase()] || key,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
}

// Track key states to avoid flooding with duplicate keydown events
const keyStates: Record<string, boolean> = {
  'w': false,
  'a': false,
  's': false,
  'd': false
};

function setKeyState(key: string, active: boolean) {
  if (keyStates[key] !== active) {
    keyStates[key] = active;
    simulateKeyEvent(key, active ? 'keydown' : 'keyup');
  }
}

function releaseAllKeys() {
  for (const key in keyStates) {
    if (keyStates[key]) {
      setKeyState(key, false);
    }
  }
}

function simulateEscapeKey() {
  simulateKeyEvent('escape', 'keydown');
  setTimeout(() => simulateKeyEvent('escape', 'keyup'), 50);
}

export function handleMobileBackAction(): void {
  const optionsModal = document.getElementById('options-modal');
  const isOptionsOpen = optionsModal && optionsModal.style.display === 'flex';

  const dialogueBox = document.getElementById('dialogue-box');
  const isDialogueVisible = dialogueBox && dialogueBox.style.display === 'block';

  const menuScreen = document.getElementById('menu-screen');
  const isMenuVisible = menuScreen && menuScreen.style.display === 'flex';

  const nameModal = document.getElementById('name-modal');
  const isNameVisible = nameModal && nameModal.style.display === 'flex';

  const gcardOverlay = document.getElementById('gcard-overlay');
  const isGCardVisible = gcardOverlay && gcardOverlay.style.display === 'flex';

  const pcardOverlay = document.getElementById('pcard-overlay');
  const isPCardVisible = pcardOverlay && pcardOverlay.style.display === 'flex';

  const victoryScreen = document.getElementById('victory-screen');
  const isVictoryVisible = victoryScreen && victoryScreen.style.display === 'flex';

  const isAnyModalOpen = isOptionsOpen || isDialogueVisible || isMenuVisible || 
                          isNameVisible || isGCardVisible || isPCardVisible || 
                          isVictoryVisible;

  if (isAnyModalOpen) {
    if (isOptionsOpen) {
      const closeBtn = document.getElementById('opt-close-btn');
      if (closeBtn) {
        closeBtn.click();
      } else {
        optionsModal.style.display = 'none';
      }
    } else {
      simulateEscapeKey();
    }
  } else {
    import('./ui').then(m => {
      m.openOptionsMenu();
    });
  }
}

function onPopState(e: PopStateEvent) {
  window.history.pushState({ main: true }, '');
  handleMobileBackAction();
}

function onBackButton(e: Event) {
  e.preventDefault();
  handleMobileBackAction();
}

export function initMobileControls(): void {
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  
  if (isMobileMode() || isMobileDevice) {
    if (window.history.state?.main !== true) {
      window.history.pushState({ main: true }, '');
    }
    window.removeEventListener('popstate', onPopState);
    window.addEventListener('popstate', onPopState);

    document.removeEventListener('backbutton', onBackButton);
    document.addEventListener('backbutton', onBackButton);
  } else {
    window.removeEventListener('popstate', onPopState);
    document.removeEventListener('backbutton', onBackButton);
  }

  // Clean up any existing elements first
  const existing = document.getElementById('mobile-overlay');
  if (existing) existing.remove();

  if (!isMobileMode()) {
    document.body.classList.remove('mobile-mode-active');
    return;
  }

  document.body.classList.add('mobile-mode-active');

  // Insert Mobile HTML overlays
  const overlay = document.createElement('div');
  overlay.id = 'mobile-overlay';
  overlay.innerHTML = `
    <!-- Touch Joystick -->
    <div id="joystick-zone">
      <div id="joystick-base">
        <div id="joystick-stick"></div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div id="mobile-action-buttons">
      <button id="btn-mobile-cam" class="mobile-btn">🎥 CAM</button>
      <button id="btn-mobile-m" class="mobile-btn">🗺️ MAP</button>
      <button id="btn-mobile-esc" class="mobile-btn">⛺ MENU</button>
      <button id="btn-mobile-e" class="mobile-btn-primary">INTERACT</button>
    </div>

    <!-- Portrait Mode Warning -->
    <div id="portrait-warning">
      <div class="warning-inner">
        <div class="warning-icon">🔄</div>
        <h2>Landscape Mode Required</h2>
        <p>Please rotate your device to Landscape to play AZ Tamer.</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Wire up Joystick touch events
  const joyZone = document.getElementById('joystick-zone')!;
  const joyBase = document.getElementById('joystick-base')!;
  const joyStick = document.getElementById('joystick-stick')!;

  let joyActive = false;
  let startX = 0;
  let startY = 0;
  const maxRadius = 45; // max pixels stick can move

  const handleStart = (e: TouchEvent) => {
    e.preventDefault();
    const rect = joyBase.getBoundingClientRect();
    // Use the center of the joystick base
    startX = rect.left + rect.width / 2;
    startY = rect.top + rect.height / 2;
    joyActive = true;
    handleMove(e);
  };

  const handleMove = (e: TouchEvent) => {
    if (!joyActive) return;
    e.preventDefault();
    const touch = e.targetTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let moveX = dx;
    let moveY = dy;

    if (dist > maxRadius) {
      moveX = (dx / dist) * maxRadius;
      moveY = (dy / dist) * maxRadius;
    }

    joyStick.style.transform = `translate(${moveX}px, ${moveY}px)`;

    // Map to W, A, S, D
    const nx = moveX / maxRadius;
    const ny = moveY / maxRadius;
    const deadzone = 0.3;

    // Up/Down
    if (ny < -deadzone) {
      setKeyState('w', true);
      setKeyState('s', false);
    } else if (ny > deadzone) {
      setKeyState('s', true);
      setKeyState('w', false);
    } else {
      setKeyState('w', false);
      setKeyState('s', false);
    }

    // Left/Right
    if (nx < -deadzone) {
      setKeyState('a', true);
      setKeyState('d', false);
    } else if (nx > deadzone) {
      setKeyState('d', true);
      setKeyState('a', false);
    } else {
      setKeyState('a', false);
      setKeyState('d', false);
    }
  };

  const handleEnd = (e: TouchEvent) => {
    joyActive = false;
    joyStick.style.transform = 'translate(0px, 0px)';
    releaseAllKeys();
  };

  joyZone.addEventListener('touchstart', handleStart, { passive: false });
  joyZone.addEventListener('touchmove', handleMove, { passive: false });
  joyZone.addEventListener('touchend', handleEnd);
  joyZone.addEventListener('touchcancel', handleEnd);

  // Wire up Action Buttons
  const btnE = document.getElementById('btn-mobile-e')!;
  const btnEsc = document.getElementById('btn-mobile-esc')!;
  const btnM = document.getElementById('btn-mobile-m')!;
  const btnCam = document.getElementById('btn-mobile-cam')!;

  btnE.addEventListener('touchstart', (e) => {
    e.preventDefault();
    simulateKeyEvent('e', 'keydown');
  });
  btnE.addEventListener('touchend', (e) => {
    e.preventDefault();
    simulateKeyEvent('e', 'keyup');
  });

  btnEsc.addEventListener('touchstart', (e) => {
    e.preventDefault();
    simulateKeyEvent('escape', 'keydown');
  });
  btnEsc.addEventListener('touchend', (e) => {
    e.preventDefault();
    simulateKeyEvent('escape', 'keyup');
  });

  btnM.addEventListener('touchstart', (e) => {
    e.preventDefault();
    simulateKeyEvent('m', 'keydown');
  });
  btnM.addEventListener('touchend', (e) => {
    e.preventDefault();
    simulateKeyEvent('m', 'keyup');
  });

  // Wire up Camera Drag Button
  let camDragActive = false;
  let camStartX = 0;
  let camStartY = 0;

  const handleCamStart = (e: TouchEvent) => {
    e.preventDefault();
    const touch = e.targetTouches[0];
    camStartX = touch.clientX;
    camStartY = touch.clientY;
    camDragActive = true;
    worldOrbit.dragging = true;
    worldOrbit.idleT = 0;
  };

  const handleCamMove = (e: TouchEvent) => {
    if (!camDragActive) return;
    e.preventDefault();
    const touch = e.targetTouches[0];
    const dx = touch.clientX - camStartX;
    const dy = touch.clientY - camStartY;
    camStartX = touch.clientX;
    camStartY = touch.clientY;

    const YAW_SPEED = 0.0085;
    const PITCH_SPEED = 0.006;
    const PITCH_MIN = -0.55;
    const PITCH_MAX = 0.62;

    worldOrbit.dragTravel += Math.abs(dx) + Math.abs(dy);
    worldOrbit.yaw -= dx * YAW_SPEED;
    worldOrbit.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, worldOrbit.pitch + dy * PITCH_SPEED));
    worldOrbit.idleT = 0;
  };

  const handleCamEnd = (e: TouchEvent) => {
    camDragActive = false;
    worldOrbit.dragging = false;
  };

  btnCam.addEventListener('touchstart', handleCamStart, { passive: false });
  btnCam.addEventListener('touchmove', handleCamMove, { passive: false });
  btnCam.addEventListener('touchend', handleCamEnd);
  btnCam.addEventListener('touchcancel', handleCamEnd);

  // Make battle auto banner clickable on mobile to stop auto battle
  const battleAuto = document.getElementById('battle-auto');
  if (battleAuto) {
    battleAuto.addEventListener('click', () => {
      simulateKeyEvent('a', 'keydown');
      setTimeout(() => simulateKeyEvent('a', 'keyup'), 50);
    });
  }

  // Monitor DOM states to show/hide controls contextually
  function updateControlsVisibility() {
    if (!isMobileMode()) return;
    
    const dialogueBox = document.getElementById('dialogue-box');
    const menuScreen = document.getElementById('menu-screen');
    const nameModal = document.getElementById('name-modal');
    const gcardOverlay = document.getElementById('gcard-overlay');
    const pcardOverlay = document.getElementById('pcard-overlay');
    const battleUi = document.getElementById('battle-ui');
    const victoryScreen = document.getElementById('victory-screen');
    const titleScreen = document.getElementById('title-screen');

    const isDialogueVisible = dialogueBox && dialogueBox.style.display === 'block';
    const isMenuVisible = menuScreen && menuScreen.style.display === 'flex';
    const isNameVisible = nameModal && nameModal.style.display === 'flex';
    const isGCardVisible = gcardOverlay && gcardOverlay.style.display === 'flex';
    const isPCardVisible = pcardOverlay && pcardOverlay.style.display === 'flex';
    const isBattleVisible = battleUi && battleUi.style.display === 'block';
    const isVictoryVisible = victoryScreen && victoryScreen.style.display === 'flex';
    const isTitleVisible = titleScreen && titleScreen.style.display === 'flex';

    const joyContainer = document.getElementById('joystick-zone');
    const actionContainer = document.getElementById('mobile-action-buttons');
    const hotkeysContainer = document.getElementById('hotkeys');

    const shouldHide = isDialogueVisible || isMenuVisible || isNameVisible || 
                       isGCardVisible || isPCardVisible || isBattleVisible || 
                       isVictoryVisible || isTitleVisible;

    if (joyContainer && actionContainer) {
      const displayStyle = shouldHide ? 'none' : 'block';
      joyContainer.style.display = displayStyle;
      actionContainer.style.display = displayStyle;
    }

    if (hotkeysContainer) {
      hotkeysContainer.style.visibility = shouldHide ? 'hidden' : 'visible';
    }

    requestAnimationFrame(updateControlsVisibility);
  }

  requestAnimationFrame(updateControlsVisibility);
}

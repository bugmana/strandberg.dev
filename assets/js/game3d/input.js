export const input = {
  forward: false,
  back: false,
  left: false,
  right: false,
  running: false,
  interact: false,
  jump: false,
  cameraYaw: 0, // set externally from camera
  actionSlot: 0, // 1-9 when pressed, 0 = none
};

let interactConsumed = false;

window.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    input.forward = false;
    input.back = false;
    input.left = false;
    input.right = false;
    input.running = false;
    input.jump = false;
    return;
  }

  // Ignore controls if user is typing in the chat input field
  if (document.activeElement && document.activeElement.tagName === 'INPUT') {
    return;
  }

  switch (e.key.toLowerCase()) {
    case 'w':
    case 'arrowup':
      input.forward = true;
      break;
    case 's':
    case 'arrowdown':
      input.back = true;
      break;
    case 'a':
    case 'arrowleft':
      input.left = true;
      break;
    case 'd':
    case 'arrowright':
      input.right = true;
      break;
    case 'shift':
      input.running = true;
      break;
    case ' ':
      input.jump = true;
      break;
    case 'e':
      if (!interactConsumed) {
        input.interact = true;
        interactConsumed = true;
      }
      break;
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      input.actionSlot = parseInt(e.key, 10);
      break;
  }
  // Block scroll keys
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', e => {
  switch (e.key.toLowerCase()) {
    case 'w':
    case 'arrowup':
      input.forward = false;
      break;
    case 's':
    case 'arrowdown':
      input.back = false;
      break;
    case 'a':
    case 'arrowleft':
      input.left = false;
      break;
    case 'd':
    case 'arrowright':
      input.right = false;
      break;
    case 'shift':
      input.running = false;
      break;
    case ' ':
      input.jump = false;
      break;
    case 'e':
      input.interact = false;
      interactConsumed = false;
      break;
  }
});

export function initMobileControls() {
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isMobile) {
    return;
  }

  const mobileControls = document.getElementById('mobile-controls');
  if (mobileControls) {
    mobileControls.classList.remove('hidden');
  }

  const joystickContainer = document.getElementById('joystick-container');
  if (joystickContainer) {
    joystickContainer.classList.remove('hidden');
  }

  // Set body class for mobile styling adjustments
  document.body.classList.add('is-mobile');

  // Initialize joystick
  const base = document.getElementById('joystick-base');
  const knob = document.getElementById('joystick-knob');

  if (!base || !knob) {
    return;
  }

  let dragStart = null;

  const handleTouchStart = e => {
    e.preventDefault(); // Prevent page scrolling/bounce
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    dragStart = { x: centerX, y: centerY, radius: rect.width * 0.4 };
  };

  const handleTouchMove = e => {
    if (!dragStart) {
      return;
    }
    e.preventDefault();
    const touch = e.touches[0];
    let dx = touch.clientX - dragStart.x;
    let dy = touch.clientY - dragStart.y;

    const maxRadius = dragStart.radius;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    knob.style.transform = `translate(${dx}px, ${dy}px)`;

    // Map normalized offsets to movement flags
    const normX = dx / maxRadius;
    const normY = dy / maxRadius;

    // Reset movement flags
    input.forward = false;
    input.back = false;
    input.left = false;
    input.right = false;

    // Direct movement steering mappings
    if (dist > 8) {
      if (normY < -0.38) {
        input.forward = true;
      }
      if (normY > 0.38) {
        input.back = true;
      }
      if (normX < -0.38) {
        input.left = true;
      }
      if (normX > 0.38) {
        input.right = true;
      }
    }
  };

  const handleTouchEnd = () => {
    dragStart = null;
    knob.style.transform = 'translate(0px, 0px)';
    input.forward = false;
    input.back = false;
    input.left = false;
    input.right = false;
  };

  base.addEventListener('touchstart', handleTouchStart, { passive: false });
  base.addEventListener('touchmove', handleTouchMove, { passive: false });
  base.addEventListener('touchend', handleTouchEnd, { passive: false });

  // Initialize right-side mobile action buttons
  const btnJump = document.getElementById('btn-mobile-jump');
  const btnInteract = document.getElementById('btn-mobile-interact');
  const btnRun = document.getElementById('btn-mobile-run');

  if (btnJump) {
    btnJump.addEventListener(
      'touchstart',
      e => {
        e.preventDefault();
        e.stopPropagation();
        input.jump = true;
      },
      { passive: false }
    );
    btnJump.addEventListener('touchend', () => {
      input.jump = false;
    });
  }

  if (btnInteract) {
    btnInteract.addEventListener(
      'touchstart',
      e => {
        e.preventDefault();
        e.stopPropagation();
        input.interact = true;
      },
      { passive: false }
    );
    btnInteract.addEventListener('touchend', () => {
      input.interact = false;
    });
  }

  if (btnRun) {
    // Make run/sprint a toggle button on mobile
    btnRun.addEventListener(
      'touchstart',
      e => {
        e.preventDefault();
        e.stopPropagation();
        input.running = !input.running;
        btnRun.classList.toggle('active', input.running);
      },
      { passive: false }
    );
  }
}

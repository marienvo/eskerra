import confetti from 'canvas-confetti';

type ConfettiInstance = ReturnType<typeof confetti.create>;

let instance: ConfettiInstance | null = null;

function getInstance(): ConfettiInstance | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (instance) {
    return instance;
  }
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;'
    + 'pointer-events:none;z-index:2147483000;';
  document.body.appendChild(canvas);
  instance = confetti.create(canvas, {resize: true, useWorker: true});
  return instance;
}

/** Short burst from the top-right when the Inbox becomes empty. */
export function fireInboxClearedConfetti(): void {
  const fire = getInstance();
  if (!fire) {
    return;
  }
  void fire({
    particleCount: 120,
    spread: 70,
    startVelocity: 55,
    angle: 225,
    origin: {x: 1, y: 0},
    scalar: 0.9,
    disableForReducedMotion: true,
  });
}

import './DesktopStartupSplash.css';

export type DesktopStartupSplashPhase = 'artwork' | 'scrim';

type Props = {
  phase: DesktopStartupSplashPhase;
};

export function DesktopStartupSplash({phase}: Props) {
  // artwork phase: the inline HTML splash in index.html handles the image — render nothing.
  if (phase === 'artwork') return null;

  return (
    <div
      className="desktop-startup-splash"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading Eskerra"
    />
  );
}

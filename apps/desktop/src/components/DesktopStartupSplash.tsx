import './DesktopStartupSplash.css';

/** Placeholder art: replace `public/splash.png` (640×400). */
const SPLASH_SRC = '/splash.png';

export function DesktopStartupSplash() {
  return (
    <div
      className="desktop-startup-splash"
      style={{backgroundImage: `url("${SPLASH_SRC}")`}}
      aria-busy="true"
      aria-label="Loading"
      role="img"
    />
  );
}

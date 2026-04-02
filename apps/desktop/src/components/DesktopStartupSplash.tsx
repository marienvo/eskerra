import './DesktopStartupSplash.css';

/** Placeholder art: replace `public/startup-splash-placeholder.png` (640×400). */
const SPLASH_SRC = '/startup-splash-placeholder.png';

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

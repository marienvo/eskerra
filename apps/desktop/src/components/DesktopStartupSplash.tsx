import './DesktopStartupSplash.css';

/** Placeholder art: replace `public/splash.png` (640×400). */
const SPLASH_SRC = '/splash.png';

export function DesktopStartupSplash() {
  return (
    <div
      className="desktop-startup-splash"
      style={{backgroundImage: `url("${SPLASH_SRC}")`}}
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading Eskerra">
      <div className="desktop-startup-splash__brand-top">
        <div className="desktop-startup-splash__title">Eskerra</div>
        <div className="desktop-startup-splash__version">{__DESKTOP_APP_VERSION__}</div>
      </div>
      <div className="desktop-startup-splash__brand-bottom">Made in Rotterdam</div>
    </div>
  );
}

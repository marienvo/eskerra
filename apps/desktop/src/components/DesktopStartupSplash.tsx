import './DesktopStartupSplash.css';

/** Placeholder art: replace `public/splash.png` (640×400). */
const SPLASH_SRC = '/splash.png';

export type DesktopStartupSplashPhase = 'artwork' | 'scrim';

type Props = {
  phase: DesktopStartupSplashPhase;
};

export function DesktopStartupSplash({phase}: Props) {
  return (
    <div
      className="desktop-startup-splash"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading Eskerra">
      {phase === 'artwork' ? (
        <>
          <div
            className="desktop-startup-splash__artwork"
            style={{backgroundImage: `url("${SPLASH_SRC}")`}}
            aria-hidden="true"
          />
          <div className="desktop-startup-splash__brand-top">
            <div className="desktop-startup-splash__title">Eskerra</div>
            <div className="desktop-startup-splash__version">{__DESKTOP_APP_VERSION__}</div>
          </div>
          <div className="desktop-startup-splash__brand-bottom">Made in Rotterdam</div>
        </>
      ) : null}
    </div>
  );
}

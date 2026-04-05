import {useId, useMemo} from 'react';

import {
  APP_CHROME_PALETTE,
  layoutChromeBlobs,
  normalizeChromePalette,
} from '../shell/appChromePalette';

export type AppChromeBackgroundProps = {
  /** Hex strings `#RRGGBB`; 1–30 entries (trimmed, invalid entries throw from normalizer). */
  palette?: readonly string[];
  /** SVG `feGaussianBlur` stdDeviation in user units (viewBox 0–100). Higher = softer merge. */
  blurStdDeviation?: number;
};

/**
 * Full-bleed shell background: blurred color blobs (SVG, single shared Gaussian blur).
 */
export function AppChromeBackground({
  palette = APP_CHROME_PALETTE,
  blurStdDeviation = 24,
}: AppChromeBackgroundProps) {
  const rawId = useId().replaceAll(/:/g, '');
  const filterId = `app-chrome-blur-${rawId}`;

  const colors = useMemo(() => normalizeChromePalette(palette), [palette]);
  const blobs = useMemo(() => layoutChromeBlobs(colors), [colors]);

  if (colors.length === 0) {
    return null;
  }

  const singleFill = colors.length === 1 ? colors[0] : null;

  return (
    <div aria-hidden className="app-chrome-background" role="presentation">
      <svg
        className="app-chrome-background__svg"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter
            height="200%"
            id={filterId}
            width="200%"
            x="-50%"
            y="-50%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={blurStdDeviation} />
          </filter>
        </defs>
        {singleFill != null ? (
          <rect fill={singleFill} height="100" width="100" x="0" y="0" />
        ) : (
          <>
            {/* Opaque base under blur so fringes do not leave holes over transparent .app-root. */}
            <rect fill={colors[0]} height="100" width="100" x="0" y="0" />
            <g filter={`url(#${filterId})`}>
              {blobs.map((b, i) => (
                <ellipse
                  key={`${b.fill}-${i}`}
                  cx={b.cx}
                  cy={b.cy}
                  fill={b.fill}
                  rx={b.rx}
                  ry={b.ry}
                />
              ))}
            </g>
          </>
        )}
      </svg>
    </div>
  );
}

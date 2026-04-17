import type {HTMLAttributes} from 'react';

/**
 * Material Icons (Google) via webfont — same glyph set and names as
 * `react-native-vector-icons/MaterialIcons` on mobile.
 *
 * Icon box size must be a positive multiple of {@link DESKTOP_ICON_GLYPH_GRID_STEP_PX}; see
 * `specs/design/desktop-icons.md`.
 */

/** Raster step for width/height/font-size (12px); 24px is the usual default optical size. */
export const DESKTOP_ICON_GLYPH_GRID_STEP_PX = 12;

export const DESKTOP_ICON_GLYPH_UNIT_PX = DESKTOP_ICON_GLYPH_GRID_STEP_PX;

/** Allowed Material Icon raster sizes on desktop (multiples of 12px, max 192). */
export type DesktopIconGlyphSizePx =
  | 12
  | 24
  | 36
  | 48
  | 60
  | 72
  | 84
  | 96
  | 108
  | 120
  | 132
  | 144
  | 156
  | 168
  | 180
  | 192;

type IconGlyphProps = {
  /** Ligature name (e.g. `radio`, `move_to_inbox`) — matches Material Icons / RN MaterialIcons. */
  name: string;
  size: DesktopIconGlyphSizePx;
  className?: string;
} & HTMLAttributes<HTMLSpanElement>;

export function IconGlyph({name, size, className, style, ...rest}: IconGlyphProps) {
  if (
    import.meta.env.DEV &&
    (size < DESKTOP_ICON_GLYPH_GRID_STEP_PX ||
      size > 192 ||
      size % DESKTOP_ICON_GLYPH_GRID_STEP_PX !== 0)
  ) {
    console.error(
      `[IconGlyph] size must be a multiple of ${DESKTOP_ICON_GLYPH_GRID_STEP_PX}px between 12 and 192, got ${size}`,
    );
  }

  return (
    <span
      className={['material-icons', className].filter(Boolean).join(' ')}
      style={{
        fontSize: size,
        width: size,
        height: size,
        lineHeight: `${size}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      {...rest}
    >
      {name}
    </span>
  );
}

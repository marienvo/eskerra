import type {HTMLAttributes} from 'react';

/**
 * Material Icons (Google) via webfont — same glyph set and names as
 * `react-native-vector-icons/MaterialIcons` on mobile.
 *
 * Icon box size must be a positive multiple of {@link DESKTOP_MATERIAL_ICON_GRID_STEP_PX}; see
 * `specs/design/desktop-icons.md`.
 */

/** Raster step for width/height/font-size (12px); 24px is the usual default optical size. */
export const DESKTOP_MATERIAL_ICON_GRID_STEP_PX = 12;

export const DESKTOP_MATERIAL_ICON_UNIT_PX = DESKTOP_MATERIAL_ICON_GRID_STEP_PX;

/** Allowed Material Icon raster sizes on desktop (multiples of 12px, max 192). */
export type DesktopMaterialIconSizePx =
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

type MaterialIconProps = {
  /** Ligature name (e.g. `radio`, `move_to_inbox`) — matches Material Icons / RN MaterialIcons. */
  name: string;
  size: DesktopMaterialIconSizePx;
  className?: string;
} & HTMLAttributes<HTMLSpanElement>;

export function MaterialIcon({name, size, className, style, ...rest}: MaterialIconProps) {
  if (
    import.meta.env.DEV &&
    (size < DESKTOP_MATERIAL_ICON_GRID_STEP_PX ||
      size > 192 ||
      size % DESKTOP_MATERIAL_ICON_GRID_STEP_PX !== 0)
  ) {
    console.error(
      `[MaterialIcon] size must be a multiple of ${DESKTOP_MATERIAL_ICON_GRID_STEP_PX}px between 12 and 192, got ${size}`,
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

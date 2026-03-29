import type {HTMLAttributes} from 'react';

/**
 * Material Icons (Google) via webfont — same glyph set and names as
 * `react-native-vector-icons/MaterialIcons` on mobile.
 *
 * Icon box size must be a multiple of {@link DESKTOP_MATERIAL_ICON_UNIT_PX}; see
 * `specs/design/desktop-icons.md`.
 */

export const DESKTOP_MATERIAL_ICON_UNIT_PX = 24;

/** Allowed Material Icon raster sizes on desktop (multiples of 24px). */
export type DesktopMaterialIconSizePx =
  | 24
  | 48
  | 72
  | 96
  | 120
  | 144
  | 168
  | 192;

type MaterialIconProps = {
  /** Ligature name (e.g. `radio`, `notes`) — matches Material Icons / RN MaterialIcons. */
  name: string;
  size: DesktopMaterialIconSizePx;
  className?: string;
} & HTMLAttributes<HTMLSpanElement>;

export function MaterialIcon({name, size, className, style, ...rest}: MaterialIconProps) {
  if (import.meta.env.DEV && size % DESKTOP_MATERIAL_ICON_UNIT_PX !== 0) {
    console.error(
      `[MaterialIcon] size must be a multiple of ${DESKTOP_MATERIAL_ICON_UNIT_PX}px, got ${size}`,
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

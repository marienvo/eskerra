import type {ButtonHTMLAttributes} from 'react';

import type {DesktopMaterialIconSizePx} from '../components/MaterialIcon';
import {MaterialIcon} from '../components/MaterialIcon';

export type TabButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'aria-pressed' | 'children' | 'className'
> & {
  'aria-label': string;
  /** Selected state: accent fill (`.rail-tab.active`). */
  active: boolean;
  icon: string;
  iconSize?: DesktopMaterialIconSizePx;
  tooltip: string;
  tooltipPlacement?: string;
  /**
   * When set, the control is a toggle (`aria-pressed`). Omitted when `disabled`
   * so the attribute does not describe stale visibility.
   */
  ariaPressed?: boolean;
};

const BASE_CLASS = 'rail-tab app-tooltip-trigger';

export function TabButton({
  active,
  ariaPressed,
  disabled,
  icon,
  iconSize = 24,
  tooltip,
  tooltipPlacement = 'inline-end',
  onClick,
  type = 'button',
  ...rest
}: TabButtonProps) {
  const className = [BASE_CLASS, active ? 'active' : ''].filter(Boolean).join(' ');
  const pressedProp =
    disabled || ariaPressed === undefined ? undefined : {'aria-pressed': ariaPressed};

  return (
    <button
      type={type}
      className={className}
      disabled={disabled}
      data-tooltip={tooltip}
      data-tooltip-placement={tooltipPlacement}
      onClick={onClick}
      {...rest}
      {...pressedProp}
    >
      <MaterialIcon name={icon} size={iconSize} aria-hidden />
    </button>
  );
}

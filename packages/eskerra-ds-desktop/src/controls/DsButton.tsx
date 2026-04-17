import type {ButtonHTMLAttributes, ReactNode} from 'react';

import styles from './DsButton.module.css';

export type DsButtonVariant = 'primary' | 'secondary';

export type DsButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: DsButtonVariant;
  className?: string;
  children?: ReactNode;
};

export function DsButton({
  variant = 'secondary',
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: DsButtonProps) {
  const variantClass = variant === 'primary' ? styles.primary : styles.secondary;
  return (
    <button
      type={type}
      disabled={disabled}
      className={[styles.root, variantClass, disabled ? styles.disabled : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

import type {HTMLAttributes, ReactNode} from 'react';

import styles from './DsText.module.css';

export type DsTextVariant = 'body' | 'muted' | 'title';

export type DsTextProps = {
  variant?: DsTextVariant;
  children?: ReactNode;
} & HTMLAttributes<HTMLParagraphElement>;

export function DsText({variant = 'body', className, children, ...rest}: DsTextProps) {
  const variantClass =
    variant === 'muted' ? styles.muted : variant === 'title' ? styles.title : styles.body;
  return (
    <p className={[variantClass, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </p>
  );
}

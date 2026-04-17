import type {HTMLAttributes, ReactNode} from 'react';

import styles from './DsSurface.module.css';

export type DsSurfaceProps = {
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function DsSurface({children, className, ...rest}: DsSurfaceProps) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

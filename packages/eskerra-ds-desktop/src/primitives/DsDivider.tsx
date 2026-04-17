import type {HTMLAttributes} from 'react';

import styles from './DsDivider.module.css';

export type DsDividerProps = HTMLAttributes<HTMLHRElement>;

export function DsDivider({className, ...rest}: DsDividerProps) {
  return <hr className={[styles.root, className].filter(Boolean).join(' ')} {...rest} />;
}

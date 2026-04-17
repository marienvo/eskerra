import {useEffect, useState} from 'react';

import type {ThemeMode} from '@eskerra/core';

export type ResolvedChromeMode = 'light' | 'dark';

export function useResolvedChromeMode(mode: ThemeMode): ResolvedChromeMode {
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
  );

  useEffect(() => {
    if (mode !== 'auto') {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      setPrefersDark(mq.matches);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, [mode]);

  if (mode === 'light') {
    return 'light';
  }
  if (mode === 'dark') {
    return 'dark';
  }
  return prefersDark ? 'dark' : 'light';
}

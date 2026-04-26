import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {useEffect, useState} from 'react';

/**
 * True while the main Tauri window is focused, visible, and the document is visible.
 */
export function useTauriMainWindowPollActive(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let cancelled = false;
    let unlistenFocus: (() => void) | undefined;

    const sync = async (): Promise<void> => {
      try {
        const win = getCurrentWindow();
        const focused = await win.isFocused();
        const visible = await win.isVisible();
        const docVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
        if (!cancelled) {
          setActive(focused && visible && docVisible);
        }
      } catch {
        if (!cancelled) {
          setActive(false);
        }
      }
    };

    queueMicrotask(() => {
      void sync();
    });
    getCurrentWindow()
      .onFocusChanged(() => {
        void sync();
      })
      .then(fn => {
        if (cancelled) {
          fn();
        } else {
          unlistenFocus = fn;
        }
      })
      .catch(() => undefined);

    const onVisibility = (): void => {
      void sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      unlistenFocus?.();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return active;
}

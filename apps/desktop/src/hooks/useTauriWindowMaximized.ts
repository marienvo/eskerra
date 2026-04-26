import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {useCallback, useEffect, useState} from 'react';

export function useTauriWindowMaximized(): {
  maximized: boolean;
  refresh: () => void;
} {
  const [maximized, setMaximized] = useState(false);
  const tauri = isTauri();

  const refresh = useCallback(() => {
    if (!tauri) {
      return;
    }
    void (async () => {
      try {
        const m = await getCurrentWindow().isMaximized();
        setMaximized(m);
      } catch {
        // ignore
      }
    })();
  }, [tauri]);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    queueMicrotask(refresh);
    let unlistenResize: (() => void) | undefined;
    let cancelled = false;
    getCurrentWindow()
      .onResized(() => {
        refresh();
      })
      .then(fn => {
        if (cancelled) {
          fn();
        } else {
          unlistenResize = fn;
        }
      })
      .catch(() => undefined);
    const onFocus = () => {
      refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      unlistenResize?.();
      window.removeEventListener('focus', onFocus);
    };
  }, [tauri, refresh]);

  return {maximized, refresh};
}

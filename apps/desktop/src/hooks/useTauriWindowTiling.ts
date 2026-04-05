import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {useCallback, useEffect, useRef, useState} from 'react';

import {getWindowTilingDetection, windowTilingDebugEnabled, type WindowTilingState} from '../lib/windowTiling';

const DEBOUNCE_MS = 80;

export function useTauriWindowTiling(): {
  tiling: WindowTilingState;
  confidence: number;
  refresh: () => void;
  tilingDebug: boolean;
} {
  const [tiling, setTiling] = useState<WindowTilingState>('none');
  const [confidence, setConfidence] = useState(0);
  const tauri = isTauri();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tilingDebug = windowTilingDebugEnabled();

  const refresh = useCallback(() => {
    if (!tauri) {
      return;
    }
    void (async () => {
      try {
        const d = await getWindowTilingDetection();
        setTiling(d.state);
        setConfidence(d.confidence);
        if (tilingDebug) {
          console.debug('[eskerra tiling]', d);
        }
      } catch {
        // ignore
      }
    })();
  }, [tauri, tilingDebug]);

  const scheduleRefresh = useCallback(() => {
    if (!tauri) {
      return;
    }
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      refresh();
    }, DEBOUNCE_MS);
  }, [tauri, refresh]);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    queueMicrotask(refresh);
    let unlistenResize: (() => void) | undefined;
    let unlistenMove: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWindow()
      .onResized(() => {
        scheduleRefresh();
      })
      .then(fn => {
        if (cancelled) {
          fn();
        } else {
          unlistenResize = fn;
        }
      })
      .catch(() => undefined);
    void getCurrentWindow()
      .onMoved(() => {
        scheduleRefresh();
      })
      .then(fn => {
        if (cancelled) {
          fn();
        } else {
          unlistenMove = fn;
        }
      })
      .catch(() => undefined);

    const onFocus = () => {
      scheduleRefresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
      unlistenResize?.();
      unlistenMove?.();
      window.removeEventListener('focus', onFocus);
    };
  }, [tauri, refresh, scheduleRefresh]);

  return {tiling, confidence, refresh, tilingDebug};
}

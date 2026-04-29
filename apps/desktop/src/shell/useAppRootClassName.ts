import {isTauri} from '@tauri-apps/api/core';
import {useMemo} from 'react';

export function useAppRootClassName(
  vaultRoot: string | null,
  layoutsReady: boolean,
  maximized: boolean,
  tiling: 'none' | 'left' | 'right',
  tilingDebug: boolean,
): string {
  return useMemo(() => {
    const parts = ['app-root'];
    if (isTauri()) {
      parts.push('app-root--tauri');
    }
    if (!vaultRoot || !layoutsReady) {
      parts.push('app-root--setup');
    }
    if (maximized) {
      parts.push('app-root--maximized');
    }
    if (tiling === 'left') {
      parts.push('app-root--tiled-left');
    }
    if (tiling === 'right') {
      parts.push('app-root--tiled-right');
    }
    if (tilingDebug) {
      parts.push('app-root--tiling-debug');
    }
    return parts.join(' ');
  }, [vaultRoot, layoutsReady, maximized, tiling, tilingDebug]);
}

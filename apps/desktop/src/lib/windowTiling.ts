import {invoke} from '@tauri-apps/api/core';

export type WindowTilingState = 'left' | 'right' | 'none';

export type TilingDetection = {
  state: WindowTilingState;
  confidence: number;
  components?: Record<string, number>;
};

export async function getWindowTilingDetection(): Promise<TilingDetection> {
  return invoke<TilingDetection>('get_window_tiling_detection');
}

/** Dev-only: set `sessionStorage.setItem('noteboxDebugTiling', '1')` then reload to highlight layout + console.log. */
export function windowTilingDebugEnabled(): boolean {
  if (!import.meta.env.DEV || typeof sessionStorage === 'undefined') {
    return false;
  }
  return sessionStorage.getItem('noteboxDebugTiling') === '1';
}

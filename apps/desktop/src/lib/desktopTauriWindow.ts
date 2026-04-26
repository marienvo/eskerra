import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';

/** True when running inside the Tauri desktop shell (not plain web). */
export function isDesktopTauriHost(): boolean {
  return isTauri();
}

export function minimizeDesktopMainWindow(): void {
  if (!isTauri()) {
    return;
  }
  Promise.resolve(getCurrentWindow().minimize()).catch(() => {});
}

export function closeDesktopMainWindow(): void {
  if (!isTauri()) {
    return;
  }
  Promise.resolve(getCurrentWindow().close()).catch(() => {});
}

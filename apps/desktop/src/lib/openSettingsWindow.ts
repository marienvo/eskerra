import {isTauri} from '@tauri-apps/api/core';
import {WebviewWindow} from '@tauri-apps/api/webviewWindow';

export const SETTINGS_WINDOW_LABEL = 'settings';

/**
 * Opens or focuses the native Settings window (Tauri only).
 */
export async function openSettingsWindow(): Promise<void> {
  if (!isTauri()) {
    return;
  }
  const existing = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const url = origin ? `${origin}/` : '/';

  const created = new WebviewWindow(SETTINGS_WINDOW_LABEL, {
    url,
    title: 'Settings',
    width: 480,
    height: 560,
    minWidth: 380,
    minHeight: 400,
    resizable: true,
    decorations: true,
    center: true,
  });
  void created.once('tauri://error', e => {
    console.error('Settings window failed to create', e);
  });
}

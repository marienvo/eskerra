import {isTauri} from '@tauri-apps/api/core';
import {openUrl} from '@tauri-apps/plugin-opener';

/**
 * Opens an `http`, `https`, or `mailto` URL in the default application (browser / mail handler).
 * In Tauri builds this uses the opener plugin; in a plain browser tab it falls back to `window.open`.
 */
export async function openSystemBrowserUrl(url: string): Promise<void> {
  if (isTauri()) {
    await openUrl(url);
    return;
  }
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    throw new Error('Popup blocked: could not open the link.');
  }
}

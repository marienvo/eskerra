import {useEffect} from 'react';

import type {MainTabId} from '../lib/mainWindowUiStore';

type Options = {
  mainTab: MainTabId;
  vaultRoot: string | null;
  busy: boolean;
  editorHistoryCanGoBack: boolean;
  editorHistoryCanGoForward: boolean;
  editorHistoryGoBack: () => void;
  editorHistoryGoForward: () => void;
};

/**
 * Mouse back/forward (X1 / X2) → vault document history, like a browser.
 *
 * - **Linux / WebKitGTK (WRY):** side buttons are injected as synthesized `mousedown`/`mouseup`
 *   with `button` 3/4 only (not `pointerdown` / `auxclick`). `mouseup` must call
 *   `preventDefault()` or WRY runs `window.history.back()` / `forward()` (often a no-op).
 * - **Other stacks:** `mousedown` / `mouseup` and `auxclick` (avoid `pointerdown` so we do not
 *   double-fire alongside `mousedown` on some engines).
 */
export function useEditorHistoryMouseButtons({
  mainTab,
  vaultRoot,
  busy,
  editorHistoryCanGoBack,
  editorHistoryCanGoForward,
  editorHistoryGoBack,
  editorHistoryGoForward,
}: Options): void {
  useEffect(() => {
    /** Skip duplicate navigation when `mousedown` + `mouseup` / `auxclick` share one gesture. */
    let lastHistoryNavMs = 0;

    const sideButton = (e: MouseEvent) =>
      e.button === 3 || e.button === 4 || e.button === 8 || e.button === 9;

    const tryNavigate = (
      e: MouseEvent,
      source: 'auxclick' | 'mousedown' | 'mouseup',
    ) => {
      const navBack = e.button === 3 || e.button === 8;
      const navFwd = e.button === 4 || e.button === 9;
      const isSide = navBack || navFwd;

      if (mainTab === 'inbox' && vaultRoot && isSide) {
        e.preventDefault();
      }

      if (source === 'auxclick' && Date.now() - lastHistoryNavMs < 160) {
        return;
      }

      if (source === 'mouseup' && Date.now() - lastHistoryNavMs < 160) {
        return;
      }

      if (mainTab !== 'inbox' || !vaultRoot) {
        return;
      }

      if (!isSide) {
        return;
      }

      if (busy) {
        return;
      }
      if (navBack && editorHistoryCanGoBack) {
        editorHistoryGoBack();
        lastHistoryNavMs = Date.now();
      } else if (navFwd && editorHistoryCanGoForward) {
        editorHistoryGoForward();
        lastHistoryNavMs = Date.now();
      }
    };

    const onAuxClick = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) {
        return;
      }
      tryNavigate(e, 'auxclick');
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!sideButton(e)) {
        return;
      }
      tryNavigate(e, 'mousedown');
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!sideButton(e)) {
        return;
      }
      tryNavigate(e, 'mouseup');
    };

    window.addEventListener('auxclick', onAuxClick, {capture: true});
    window.addEventListener('mousedown', onMouseDown, {capture: true});
    window.addEventListener('mouseup', onMouseUp, {capture: true});
    return () => {
      window.removeEventListener('auxclick', onAuxClick, {capture: true});
      window.removeEventListener('mousedown', onMouseDown, {capture: true});
      window.removeEventListener('mouseup', onMouseUp, {capture: true});
    };
  }, [
    mainTab,
    vaultRoot,
    busy,
    editorHistoryCanGoBack,
    editorHistoryCanGoForward,
    editorHistoryGoBack,
    editorHistoryGoForward,
  ]);
}

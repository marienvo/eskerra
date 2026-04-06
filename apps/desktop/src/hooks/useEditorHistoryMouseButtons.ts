import {useEffect, useRef} from 'react';

import {
  isWithinMouseHistoryCooldown,
  MOUSE_EDITOR_HISTORY_NAV_COOLDOWN_MS,
} from './mouseEditorHistoryCooldown';

type Options = {
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
 * - **Cooldown:** After a successful history step, ignore further side-button navigations from
 *   any of those events until `MOUSE_EDITOR_HISTORY_NAV_COOLDOWN_MS` has elapsed (reduces
 *   accidental multi-step jumps and duplicates one physical click across phases). The timestamp
 *   is stored in a ref so it survives this hook's `useEffect` re-running when `canGoForward` /
 *   `canGoBack` update after a navigation.
 */
export function useEditorHistoryMouseButtons({
  vaultRoot,
  busy,
  editorHistoryCanGoBack,
  editorHistoryCanGoForward,
  editorHistoryGoBack,
  editorHistoryGoForward,
}: Options): void {
  const lastHistoryNavMsRef = useRef(0);

  useEffect(() => {
    if (!vaultRoot) {
      lastHistoryNavMsRef.current = 0;
    }
  }, [vaultRoot]);

  useEffect(() => {
    const sideButton = (e: MouseEvent) =>
      e.button === 3 || e.button === 4 || e.button === 8 || e.button === 9;

    const tryNavigate = (e: MouseEvent) => {
      const navBack = e.button === 3 || e.button === 8;
      const navFwd = e.button === 4 || e.button === 9;
      const isSide = navBack || navFwd;

      if (vaultRoot && isSide) {
        e.preventDefault();
      }

      if (!vaultRoot) {
        return;
      }

      if (!isSide) {
        return;
      }

      if (busy) {
        return;
      }

      const now = Date.now();
      const lastNav = lastHistoryNavMsRef.current;
      const cooldownActive = isWithinMouseHistoryCooldown(
        lastNav,
        now,
        MOUSE_EDITOR_HISTORY_NAV_COOLDOWN_MS,
      );

      if (cooldownActive) {
        return;
      }

      if (navBack && editorHistoryCanGoBack) {
        editorHistoryGoBack();
        lastHistoryNavMsRef.current = Date.now();
      } else if (navFwd && editorHistoryCanGoForward) {
        editorHistoryGoForward();
        lastHistoryNavMsRef.current = Date.now();
      }
    };

    const onAuxClick = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) {
        return;
      }
      tryNavigate(e);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!sideButton(e)) {
        return;
      }
      tryNavigate(e);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!sideButton(e)) {
        return;
      }
      tryNavigate(e);
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
    vaultRoot,
    busy,
    editorHistoryCanGoBack,
    editorHistoryCanGoForward,
    editorHistoryGoBack,
    editorHistoryGoForward,
  ]);
}

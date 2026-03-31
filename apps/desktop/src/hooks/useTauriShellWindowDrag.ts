import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {type RefObject, useEffect} from 'react';

/** Matches App.css `.app-root--tauri` no-drag list; keep in sync when that list changes. */
const INTERACTIVE_DRAG_EXCLUSION = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '.resize-sep',
  '.note-list',
  '.episode-scroll',
  '.playlist-body',
  '[contenteditable="true"]',
].join(',');

/**
 * Declarative title bar regions (logo + center strip) use `data-tauri-drag-region`; skip programmatic
 * startDragging there to avoid double-handling on WebKitGTK.
 */
const DECLARATIVE_TITLEBAR_DRAG = '.window-title-bar-drag,.window-title-bar-icon';

/**
 * Frameless window: primary-click on inert shell starts a native move via startDragging (Linux-safe).
 * `remountKey` must change when a different `.app-root` node mounts (setup vs main) so the listener rebinds.
 */
export function useTauriShellWindowDrag(
  shellRef: RefObject<HTMLElement | null>,
  remountKey: string,
): void {
  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    const el = shellRef.current;
    if (!el) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) {
        return;
      }
      const t = e.target;
      if (!(t instanceof Element)) {
        return;
      }
      if (!el.contains(t)) {
        return;
      }
      if (t.closest(INTERACTIVE_DRAG_EXCLUSION)) {
        return;
      }
      if (t.closest(DECLARATIVE_TITLEBAR_DRAG)) {
        return;
      }
      void getCurrentWindow().startDragging();
    };
    el.addEventListener('pointerdown', onPointerDown);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
    };
  }, [shellRef, remountKey]);
}

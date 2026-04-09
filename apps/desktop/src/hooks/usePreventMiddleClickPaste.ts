import {useEffect, useRef} from 'react';

import {isMiddleClickPasteBlocked} from './middleClickPasteBlock';

/**
 * Linux / WebKitGTK (Tauri): middle-click anywhere can synthesize a `paste` from the X11
 * primary selection. Register window **capture** listeners so chrome (tabs, tree, etc.)
 * is covered without per-component handlers.
 *
 * Defense-in-depth: CodeMirror still sets its own short block window on middle `mousedown`
 * inside the editor; this hook catches every other surface.
 */
export function usePreventMiddleClickPaste(): void {
  const lastMiddleMouseDownMsRef = useRef(0);

  useEffect(() => {
    const onMouseDownCapture = (e: MouseEvent) => {
      if (e.button !== 1) {
        return;
      }
      lastMiddleMouseDownMsRef.current = Date.now();
    };

    const onPasteCapture = (e: ClipboardEvent) => {
      const now = Date.now();
      if (isMiddleClickPasteBlocked(lastMiddleMouseDownMsRef.current, now)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('mousedown', onMouseDownCapture, {capture: true});
    window.addEventListener('paste', onPasteCapture, {capture: true});
    return () => {
      window.removeEventListener('mousedown', onMouseDownCapture, {capture: true});
      window.removeEventListener('paste', onPasteCapture, {capture: true});
    };
  }, []);
}

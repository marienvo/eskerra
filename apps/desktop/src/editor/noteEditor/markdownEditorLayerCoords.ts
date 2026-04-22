import {Direction, type EditorView} from '@codemirror/view';

/** Layer origin for `RectangleMarker` positions (same as CodeMirror `getBase` in `@codemirror/view`). */
export function layerBaseOffset(view: EditorView): {left: number; top: number} {
  const rect = view.scrollDOM.getBoundingClientRect();
  const left =
    view.textDirection === Direction.LTR
      ? rect.left
      : rect.right - view.scrollDOM.clientWidth * view.scaleX;
  return {
    left: left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
  };
}

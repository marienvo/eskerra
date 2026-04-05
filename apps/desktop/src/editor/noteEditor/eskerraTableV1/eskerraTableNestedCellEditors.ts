import type {TransactionSpec} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';

import {bumpTableShellStaticPreview} from './tableShellStaticPreviewStore';

const parentToCellViews = new Map<EditorView, Set<EditorView>>();

/**
 * Register a table shell's nested cell EditorView so the parent note editor can
 * reconfigure shared compartments (wiki / relative link highlights).
 */
export function registerEskerraTableNestedCellEditor(
  parentView: EditorView,
  cellView: EditorView,
): () => void {
  let set = parentToCellViews.get(parentView);
  if (!set) {
    set = new Set();
    parentToCellViews.set(parentView, set);
  }
  set.add(cellView);
  return () => {
    set!.delete(cellView);
    if (set!.size === 0) {
      parentToCellViews.delete(parentView);
    }
  };
}

/**
 * Dispatch the same transaction spec to every nested cell editor for a parent.
 */
export function dispatchEskerraTableNestedCellEditors(
  parentView: EditorView,
  spec: TransactionSpec,
): void {
  const set = parentToCellViews.get(parentView);
  if (set) {
    for (const v of set) {
      v.dispatch(spec);
    }
  }
  bumpTableShellStaticPreview();
}

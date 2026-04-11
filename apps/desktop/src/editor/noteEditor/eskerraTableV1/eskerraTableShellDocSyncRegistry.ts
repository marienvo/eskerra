import {ViewPlugin, type EditorView, type ViewUpdate} from '@codemirror/view';

type ShellDocSyncListener = (update: ViewUpdate) => void;

const listenersByView = new WeakMap<EditorView, Set<ShellDocSyncListener>>();

/**
 * Subscribe to parent `EditorView` document updates (table shell sync).
 * Unsubscribe in the React cleanup to avoid leaks.
 */
export function registerShellDocSyncListener(
  view: EditorView,
  listener: ShellDocSyncListener,
): () => void {
  let set = listenersByView.get(view);
  if (!set) {
    set = new Set();
    listenersByView.set(view, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) {
      listenersByView.delete(view);
    }
  };
}

export const eskerraTableShellDocSyncPlugin = ViewPlugin.define(view => ({
  update(u: ViewUpdate) {
    if (!u.docChanged) {
      return;
    }
    const set = listenersByView.get(view);
    if (!set?.size) {
      return;
    }
    for (const fn of set) {
      fn(u);
    }
  },
}));

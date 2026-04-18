import {todayHubFolderLabelFromUri, vaultUriIsTodayMarkdownFile} from '@eskerra/core';

import {editorTabPillDisplayName} from './editorTabPillDisplayName';

/**
 * Tab strip label for an open note URI. `Today.md` uses the **parent folder name** (hub-style daily note).
 */
export function editorOpenTabPillLabel(
  notes: readonly {name: string; uri: string}[],
  uri: string,
): string {
  const norm = uri.replace(/\\/g, '/');
  if (vaultUriIsTodayMarkdownFile(norm)) {
    return todayHubFolderLabelFromUri(norm);
  }
  const row = notes.find(
    n => n.uri === uri || n.uri.replace(/\\/g, '/') === norm,
  );
  if (row) {
    return editorTabPillDisplayName(row.name);
  }
  const tail = norm.split('/').pop()?.trim();
  return editorTabPillDisplayName(tail || uri);
}

export type EditorOpenTabPillIconName = 'description' | 'today';

/** Leading glyph kind for the open-tab pill (Radix icons in `EditorPaneOpenNoteTabs`). */
export function editorOpenTabPillIconName(uri: string): EditorOpenTabPillIconName {
  return vaultUriIsTodayMarkdownFile(uri.replace(/\\/g, '/')) ? 'today' : 'description';
}

import {normalizeEditorDocUri} from './editorDocumentHistory';
import {tabCurrentUri, type EditorWorkspaceTab} from './editorWorkspaceTabs';
import {vaultUriIsTodayMarkdownFile} from '@eskerra/core';

export type SelectNoteActiveHubTodayOpen =
  /** No tab row; load active hub Today as the implicit workspace surface. */
  | 'workspaceShell'
  /**
   * Keep existing tabs but clear `activeEditorTabId` so no tab pill is “active” while the
   * editor shows the active hub Today (title bar workspace control carries active chrome).
   */
  | 'workspaceHomePreserveTabs';

/**
 * After `findTabIdWithCurrentUri` is null: how `selectNote` should open the active hub Today.
 * Returns `null` when `uri` is not the active workspace home Today.
 */
export function selectNoteActiveHubTodayOpen(input: {
  uri: string;
  activeTodayHubUri: string | null;
  uriIsTodayMarkdownFile: boolean;
  editorWorkspaceTabCount: number;
}): SelectNoteActiveHubTodayOpen | null {
  if (input.activeTodayHubUri == null || !input.uriIsTodayMarkdownFile) {
    return null;
  }
  const normUri = normalizeEditorDocUri(input.uri);
  const normHub = normalizeEditorDocUri(input.activeTodayHubUri);
  if (!normUri || !normHub || normUri !== normHub) {
    return null;
  }
  return input.editorWorkspaceTabCount === 0
    ? 'workspaceShell'
    : 'workspaceHomePreserveTabs';
}

/** True only for the empty-tab-strip workspace shell (see {@link selectNoteActiveHubTodayOpen}). */
export function shouldOpenActiveHubTodayAsShell(input: {
  uri: string;
  activeTodayHubUri: string | null;
  uriIsTodayMarkdownFile: boolean;
  editorWorkspaceTabCount: number;
}): boolean {
  return selectNoteActiveHubTodayOpen(input) === 'workspaceShell';
}

/**
 * Title bar: workspace main control uses the same active chrome as an editor tab pill.
 */
export function workspaceSelectShowsActiveTabPillState(input: {
  composingNewEntry: boolean;
  activeTodayHubUri: string | null;
  selectedUri: string | null;
  editorWorkspaceTabs: readonly EditorWorkspaceTab[];
}): boolean {
  if (
    input.composingNewEntry
    || !input.activeTodayHubUri
    || !input.selectedUri
  ) {
    return false;
  }
  const hub = normalizeEditorDocUri(input.activeTodayHubUri);
  const sel = normalizeEditorDocUri(input.selectedUri);
  if (
    !hub
    || !sel
    || hub !== sel
    || !vaultUriIsTodayMarkdownFile(sel)
  ) {
    return false;
  }
  return !input.editorWorkspaceTabs.some(t => {
    const cur = tabCurrentUri(t);
    return cur != null && normalizeEditorDocUri(cur) === hub;
  });
}

/** Wiki / relative link activation: force new editor tab when on the active hub Today surface. */
export function isActiveWorkspaceTodayLinkSurface(input: {
  composingNewEntry: boolean;
  activeTodayHubUri: string | null;
  selectedUri: string | null;
}): boolean {
  if (input.composingNewEntry || !input.activeTodayHubUri || !input.selectedUri) {
    return false;
  }
  const hub = normalizeEditorDocUri(input.activeTodayHubUri);
  const sel = normalizeEditorDocUri(input.selectedUri);
  if (!hub || !sel || hub !== sel) {
    return false;
  }
  return vaultUriIsTodayMarkdownFile(sel);
}

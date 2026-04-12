import {normalizeEditorDocUri} from './editorDocumentHistory';
import {tabCurrentUri, type EditorWorkspaceTab} from './editorWorkspaceTabs';
import {vaultUriIsTodayMarkdownFile} from './vaultTreeLoadChildren';

/**
 * When true, `selectNote(uri)` should open the active hub Today in workspace-shell mode
 * (no editor tab pill) instead of creating a tab.
 */
export function shouldOpenActiveHubTodayAsShell(input: {
  editorWorkspaceTabCount: number;
  uri: string;
  activeTodayHubUri: string | null;
  uriIsTodayMarkdownFile: boolean;
}): boolean {
  if (
    input.activeTodayHubUri == null
    || input.editorWorkspaceTabCount !== 0
    || !input.uriIsTodayMarkdownFile
  ) {
    return false;
  }
  const normUri = normalizeEditorDocUri(input.uri);
  const normHub = normalizeEditorDocUri(input.activeTodayHubUri);
  return normUri != null && normHub != null && normUri === normHub;
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

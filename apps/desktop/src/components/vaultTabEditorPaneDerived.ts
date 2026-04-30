import {normalizeEditorDocUri} from '../lib/editorDocumentHistory';
import type {TodayHubSettings} from '../lib/todayHub';

type VaultTabEditorPaneMergeView =
  | null
  | {kind: 'backup'; baseUri: string; backupUri: string}
  | {kind: 'diskConflict'; baseUri: string; diskMarkdown: string};

type VaultTabEditorPaneDiskConflict = {uri: string} | null;

export type VaultTabEditorPaneDerivedInput = {
  mergeView: VaultTabEditorPaneMergeView;
  inboxContentByUri: Record<string, string>;
  selectedUri: string | null;
  editorBody: string;
  showTodayHubCanvas: boolean;
  todayHubSettings: TodayHubSettings | null;
  composingNewEntry: boolean;
  busy: boolean;
  diskConflict: VaultTabEditorPaneDiskConflict;
};

export type VaultTabEditorPaneDerived = {
  mergeCurrentBody: string;
  scrollTodayHubLayout: boolean;
  frontmatterReadOnly: boolean;
};

export function buildVaultTabEditorPaneDerived({
  mergeView,
  inboxContentByUri,
  selectedUri,
  editorBody,
  showTodayHubCanvas,
  todayHubSettings,
  composingNewEntry,
  busy,
  diskConflict,
}: VaultTabEditorPaneDerivedInput): VaultTabEditorPaneDerived {
  let mergeCurrentBody = '';
  if (mergeView != null) {
    const k = mergeView.baseUri;
    const fromCache = inboxContentByUri[k];
    if (fromCache !== undefined) {
      mergeCurrentBody = fromCache;
    } else if (selectedUri != null && normalizeEditorDocUri(selectedUri) === k) {
      mergeCurrentBody = editorBody;
    }
  }

  const scrollTodayHubLayout =
    showTodayHubCanvas
    && Boolean(selectedUri)
    && todayHubSettings != null
    && !composingNewEntry
    && mergeView == null;

  const frontmatterReadOnly =
    busy
    || Boolean(
      diskConflict
        && selectedUri
        && normalizeEditorDocUri(diskConflict.uri) ===
          normalizeEditorDocUri(selectedUri),
    );

  return {mergeCurrentBody, scrollTodayHubLayout, frontmatterReadOnly};
}

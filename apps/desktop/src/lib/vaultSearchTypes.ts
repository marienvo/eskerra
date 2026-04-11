export type VaultSearchProgress = {
  /**
   * Indexed search: backend sets this to the note-level result count (same as returned `notes` length,
   * capped by the search limit). UI labels this "hits", not "files scanned".
   */
  scannedFiles: number;
  /** Number of matching notes in the current result batch (note-level hits, not raw match occurrences). */
  totalHits: number;
  skippedLargeFiles: number;
  /** Backend index lifecycle: `ready` | `building` | `failed` | `idle` | `unavailable`. */
  indexStatus: string;
  indexReady: boolean;
};

export type VaultSearchBestField = 'title' | 'path' | 'body';

export type VaultSearchNoteSnippet = {
  lineNumber: number;
  text: string;
};

export type VaultSearchNoteResult = {
  uri: string;
  relativePath: string;
  title: string;
  bestField: VaultSearchBestField;
  matchCount: number;
  score: number;
  snippets: VaultSearchNoteSnippet[];
};

/** Lower rank sorts earlier: title, then path, then body (tie-breaker after score). */
export function vaultSearchBestFieldRank(field: VaultSearchBestField): number {
  switch (field) {
    case 'title':
      return 0;
    case 'path':
      return 1;
    case 'body':
      return 2;
  }
}

/** Sort note-level results: higher score first, then stronger bestField, then uri. */
export function compareVaultSearchNotes(a: VaultSearchNoteResult, b: VaultSearchNoteResult): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  const fa = vaultSearchBestFieldRank(a.bestField);
  const fb = vaultSearchBestFieldRank(b.bestField);
  if (fa !== fb) {
    return fa - fb;
  }
  return a.uri.localeCompare(b.uri);
}

export type VaultSearchUpdatePayload = {
  searchId: string;
  notes: VaultSearchNoteResult[];
  progress: VaultSearchProgress;
};

export type VaultSearchDonePayload = {
  searchId: string;
  cancelled: boolean;
  progress: VaultSearchProgress;
};

/** Device event `vault-search:index-progress` during incremental index/reconcile. */
export type VaultSearchIndexProgress = {
  phase: 'titles' | 'bodies' | 'reconcile';
  processed: number;
  total: number;
  indexed: number;
  skipped: number;
  vaultInstanceId: string;
};

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
  /** Mobile native index: true while a full rebuild is in flight. Desktop Tauri may omit. */
  isBuilding?: boolean;
  /** Mobile: false while title-only phase is done but body text is still being filled. Desktop may omit. */
  bodiesIndexReady?: boolean;
  /** Mobile native index schema version string. Desktop Tauri may omit. */
  schemaVersion?: string;
};

export type VaultSearchBestField = 'title' | 'path' | 'body';

export type VaultSearchNoteSnippet = {
  /** 1-based line in source when known; null when not reliably determined (e.g. mobile title-only hit). */
  lineNumber: number | null;
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
  /** Mobile EskerraVaultSearch; omit on desktop Tauri events. */
  vaultInstanceId?: string;
  notes: VaultSearchNoteResult[];
  progress: VaultSearchProgress;
};

export type VaultSearchDonePayload = {
  searchId: string;
  /** Mobile EskerraVaultSearch; omit on desktop Tauri events. */
  vaultInstanceId?: string;
  cancelled: boolean;
  progress: VaultSearchProgress;
  /** Mobile native search: final ranked note list (capped). */
  notes?: VaultSearchNoteResult[];
};

export type VaultSearchIndexStatusPayload = {
  vaultInstanceId?: string;
  /** Native EskerraVaultSearch: `building` | `ready` | `error` | … */
  status: 'idle' | 'building' | 'reconciling' | 'ready' | 'failed' | 'error';
  /** Mobile: false after titles phase until body indexing completes. */
  bodiesIndexReady?: boolean;
  indexedNotes?: number;
  skippedNotes?: number;
  added?: number;
  updated?: number;
  removed?: number;
  reason?: string;
  message?: string;
  /** Epoch ms from native after successful rebuild/reconcile when provided. */
  lastReconciledAt?: number;
};

/** Device event `vault-search:index-status` (same shape as [VaultSearchIndexStatusPayload]). */
export type VaultSearchIndexStatusEvent = VaultSearchIndexStatusPayload;

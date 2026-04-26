import type {
  VaultSearchBestField,
  VaultSearchDonePayload,
  VaultSearchIndexProgress,
  VaultSearchIndexStatusPayload,
  VaultSearchNoteResult,
  VaultSearchNoteSnippet,
  VaultSearchProgress,
  VaultSearchUpdatePayload,
} from '@eskerra/core';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {NativeEventEmitter, NativeModules} from 'react-native';

import {eskerraVaultSearch} from '../../../native/eskerraVaultSearch';

const DEFAULT_DEBOUNCE_MS = 260;
const SEARCHING_STATUS_VISIBLE_DELAY_MS = 100;
const PREVIOUS_RESULTS_HOLD_MS = 100;
/** Dev-only: stale native events ignored (searchId / vaultInstanceId mismatch). */
let droppedVaultSearchEvents = 0;

/** @internal test helper */
export function resetDroppedVaultSearchEventsCountForTest(): void {
  droppedVaultSearchEvents = 0;
}

/** @internal test helper */
export function getDroppedVaultSearchEventsCountForTest(): number {
  return droppedVaultSearchEvents;
}

const RECONCILE_STALE_MS = 10_000;

function logDroppedVaultSearchEvent(reason: 'searchId' | 'vaultInstanceId', detail: string) {
  droppedVaultSearchEvents += 1;
  if (__DEV__) {
    const dbg: typeof console.debug = console.debug.bind(console);
    dbg(`[useVaultContentSearch] dropped stale event (${reason}) #${droppedVaultSearchEvents}: ${detail}`);
  }
}

export function isVaultSearchEventCurrent(
  payloadSearchId: string,
  currentId: string | null,
): boolean {
  return currentId != null && payloadSearchId === currentId;
}

/**
 * When JS has not yet pinned `vaultInstanceId` (screen still awaiting maintenance), the first
 * native event for the active `searchId` carries the authoritative instance id — seed the ref so
 * we do not drop `update`/`done` before the prop arrives (fixes first-query hang on reopen).
 */
function acceptVaultInstanceForSearchEvent(
  payloadInstanceId: string | undefined,
  vaultInstanceIdRef: {current: string | null},
): boolean {
  if (payloadInstanceId == null || payloadInstanceId === '') {
    return true;
  }
  const cur = vaultInstanceIdRef.current;
  if (cur == null || cur === '') {
    vaultInstanceIdRef.current = payloadInstanceId;
    return true;
  }
  return payloadInstanceId === cur;
}

function normalizeNote(raw: unknown): VaultSearchNoteResult {
  const o = raw as Record<string, unknown>;
  const snippets: VaultSearchNoteSnippet[] = [];
  const rawSnippets = o.snippets;
  if (Array.isArray(rawSnippets)) {
    for (const s of rawSnippets) {
      if (typeof s !== 'object' || s === null) {
        continue;
      }
      const sn = s as Record<string, unknown>;
      const ln = sn.lineNumber;
      let lineNumber: number | null;
      if (ln === null || ln === undefined) {
        lineNumber = null;
      } else if (typeof ln === 'number') {
        lineNumber = ln;
      } else {
        lineNumber = Number(ln);
      }
      snippets.push({
        text: String(sn.text ?? ''),
        lineNumber,
      });
    }
  }
  const bf = o.bestField;
  const bestField: VaultSearchBestField =
    bf === 'title' || bf === 'path' || bf === 'body' ? bf : 'body';
  return {
    uri: String(o.uri ?? ''),
    relativePath: String(o.relativePath ?? o.relPath ?? ''),
    title: String(o.title ?? ''),
    bestField,
    matchCount: Number(o.matchCount ?? 1),
    score: Number(o.score ?? 0),
    snippets,
  };
}

function normalizeProgress(raw: unknown): VaultSearchProgress | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const p = raw as Record<string, unknown>;
  const bodiesRaw = p.bodiesIndexReady;
  return {
    scannedFiles: Number(p.scannedFiles ?? 0),
    totalHits: Number(p.totalHits ?? 0),
    skippedLargeFiles: Number(p.skippedLargeFiles ?? 0),
    indexStatus: String(p.indexStatus ?? 'idle'),
    indexReady: Boolean(p.indexReady),
    isBuilding: p.isBuilding === true,
    bodiesIndexReady: typeof bodiesRaw === 'boolean' ? bodiesRaw : undefined,
    schemaVersion:
      p.schemaVersion === undefined || p.schemaVersion === null
        ? undefined
        : String(p.schemaVersion),
  };
}

function normalizeIndexStatusLive(raw: unknown): VaultSearchIndexStatusPayload | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const st = o.status;
  if (st == null) {
    return null;
  }
  const lastRaw = o.lastReconciledAt;
  let lastReconciledAt: number | undefined;
  if (typeof lastRaw === 'number' && Number.isFinite(lastRaw)) {
    lastReconciledAt = lastRaw;
  } else if (typeof lastRaw === 'string') {
    const n = Number(lastRaw);
    if (Number.isFinite(n)) {
      lastReconciledAt = n;
    }
  }
  const bodiesRaw = o.bodiesIndexReady;
  return {
    vaultInstanceId: typeof o.vaultInstanceId === 'string' ? o.vaultInstanceId : undefined,
    status: String(st) as VaultSearchIndexStatusPayload['status'],
    indexedNotes: typeof o.indexedNotes === 'number' ? o.indexedNotes : undefined,
    skippedNotes: typeof o.skippedNotes === 'number' ? o.skippedNotes : undefined,
    reason: typeof o.reason === 'string' ? o.reason : undefined,
    lastReconciledAt,
    bodiesIndexReady: typeof bodiesRaw === 'boolean' ? bodiesRaw : undefined,
  };
}

function normalizeIndexProgressEvent(raw: unknown): VaultSearchIndexProgress | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const phase = o.phase;
  if (phase !== 'titles' && phase !== 'bodies' && phase !== 'reconcile') {
    return null;
  }
  return {
    phase,
    processed: Number(o.processed ?? 0),
    total: Number(o.total ?? 0),
    indexed: Number(o.indexed ?? 0),
    skipped: Number(o.skipped ?? 0),
    vaultInstanceId: String(o.vaultInstanceId ?? ''),
  };
}

export type UseVaultContentSearchMobileOptions = {
  open: boolean;
  baseUri: string | null;
  vaultInstanceId: string | null;
  /** When false, pre-search reconcile is skipped. */
  indexReady?: boolean;
  /** From native open/getIndexStatus; used to throttle reconcile. */
  lastReconciledAt?: number | null;
  /** From native `open()` when titles are ready but body column is still filling. */
  bodiesIndexReadyFromOpen?: boolean;
  debounceMs?: number;
};

export function useVaultContentSearch({
  open,
  baseUri,
  vaultInstanceId,
  indexReady = false,
  lastReconciledAt = null,
  bodiesIndexReadyFromOpen = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseVaultContentSearchMobileOptions) {
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<VaultSearchNoteResult[]>([]);
  const [progress, setProgress] = useState<VaultSearchProgress | null>(null);
  const [scanDone, setScanDone] = useState(true);
  const [awaitingDebouncedRun, setAwaitingDebouncedRun] = useState(false);
  const [searchingStatusVisible, setSearchingStatusVisible] = useState(false);
  const [holdingPreviousResults, setHoldingPreviousResults] = useState(false);
  const [indexStatusLive, setIndexStatusLive] = useState<VaultSearchIndexStatusPayload | null>(null);
  const [indexProgress, setIndexProgress] = useState<VaultSearchIndexProgress | null>(null);

  const searchIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchingStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(open);
  const scanDoneRef = useRef(scanDone);
  const queryRef = useRef(query);
  const notesRef = useRef(notes);
  const vaultInstanceIdRef = useRef(vaultInstanceId);
  const pendingFlushNotesRef = useRef<VaultSearchNoteResult[]>([]);
  const pendingProgressRef = useRef<VaultSearchProgress | null>(null);
  const notesFlushRafRef = useRef<number | null>(null);
  /** At most one pre-search reconcile attempt per focus session (open + baseUri). */
  const reconciledForSessionRef = useRef(false);
  const indexReadyRef = useRef(indexReady);
  const lastReconciledAtRef = useRef(lastReconciledAt);
  /** When native returns not-ready for a query, re-run search after index-status ready. */
  const needsSearchRetryRef = useRef(false);
  const fallbackSearchIdCounterRef = useRef(0);

  const createSearchId = useCallback((): string => {
    if (globalThis.crypto && 'randomUUID' in globalThis.crypto) {
      return globalThis.crypto.randomUUID();
    }
    fallbackSearchIdCounterRef.current += 1;
    return `${Date.now()}-${fallbackSearchIdCounterRef.current}`;
  }, []);

  useEffect(() => {
    indexReadyRef.current = indexReady;
    lastReconciledAtRef.current = lastReconciledAt;
  }, [indexReady, lastReconciledAt]);

  useEffect(() => {
    if (open) {
      reconciledForSessionRef.current = false;
    }
  }, [open, baseUri]);

  useEffect(() => {
    setIndexStatusLive(null);
    setIndexProgress(null);
  }, [baseUri]);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setIndexStatusLive(null);
        needsSearchRetryRef.current = false;
      });
    }
  }, [open]);

  const cancelNotesFlushRaf = useCallback(() => {
    if (notesFlushRafRef.current != null) {
      cancelAnimationFrame(notesFlushRafRef.current);
      notesFlushRafRef.current = null;
    }
  }, []);

  const clearPendingSearchFlush = useCallback(() => {
    cancelNotesFlushRaf();
    pendingFlushNotesRef.current = [];
    pendingProgressRef.current = null;
  }, [cancelNotesFlushRaf]);

  const clearResultHoldTimer = useCallback(() => {
    if (resultHoldTimerRef.current != null) {
      clearTimeout(resultHoldTimerRef.current);
      resultHoldTimerRef.current = null;
    }
  }, []);

  /** Shared by `vault-search:index-status` and prop-driven `indexReady` (open() may resolve after a not-ready search). */
  const startSearchRetryIfPending = useCallback(
    (uri: string | null) => {
      if (uri == null || !needsSearchRetryRef.current || !openRef.current) {
        return;
      }
      if (!eskerraVaultSearch.isAvailable()) {
        return;
      }
      const q = queryRef.current.trim();
      if (q.length === 0) {
        return;
      }
      needsSearchRetryRef.current = false;
      const id = createSearchId();
      searchIdRef.current = id;
      clearResultHoldTimer();
      queueMicrotask(() => {
        setHoldingPreviousResults(false);
      });
      setScanDone(false);
      eskerraVaultSearch.start(uri, id, q).catch(() => {
        searchIdRef.current = null;
        queueMicrotask(() => {
          setScanDone(true);
        });
      });
    },
    [clearResultHoldTimer, createSearchId],
  );

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    vaultInstanceIdRef.current = null;
  }, [baseUri]);

  useEffect(() => {
    if (vaultInstanceId != null && vaultInstanceId !== '') {
      const cur = vaultInstanceIdRef.current;
      if (cur == null || cur === '' || cur === vaultInstanceId) {
        vaultInstanceIdRef.current = vaultInstanceId;
      }
    }
  }, [vaultInstanceId]);

  useEffect(() => {
    openRef.current = open;
    scanDoneRef.current = scanDone;
  }, [open, scanDone]);

  useEffect(() => {
    if (searchingStatusTimerRef.current != null) {
      clearTimeout(searchingStatusTimerRef.current);
      searchingStatusTimerRef.current = null;
    }
    if (!open || scanDone) {
      queueMicrotask(() => {
        setSearchingStatusVisible(false);
      });
      return;
    }
    queueMicrotask(() => {
      setSearchingStatusVisible(false);
    });
    searchingStatusTimerRef.current = setTimeout(() => {
      searchingStatusTimerRef.current = null;
      if (!openRef.current || scanDoneRef.current) {
        return;
      }
      setSearchingStatusVisible(true);
    }, SEARCHING_STATUS_VISIBLE_DELAY_MS);
    return () => {
      if (searchingStatusTimerRef.current != null) {
        clearTimeout(searchingStatusTimerRef.current);
        searchingStatusTimerRef.current = null;
      }
    };
  }, [open, scanDone]);

  const resetLocal = useCallback(() => {
    searchIdRef.current = null;
    needsSearchRetryRef.current = false;
    clearResultHoldTimer();
    clearPendingSearchFlush();
    queueMicrotask(() => {
      setHoldingPreviousResults(false);
    });
    setNotes([]);
    setProgress(null);
    setIndexProgress(null);
    setScanDone(true);
    setAwaitingDebouncedRun(false);
  }, [clearPendingSearchFlush, clearResultHoldTimer]);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        resetLocal();
      });
      eskerraVaultSearch.cancel().catch(() => undefined);
    }
  }, [open, resetLocal]);

  useEffect(() => {
    if (!open || !baseUri || !eskerraVaultSearch.isAvailable()) {
      return;
    }
    const mod = (NativeModules as {EskerraVaultSearch?: object}).EskerraVaultSearch;
    const emitter = mod ? new NativeEventEmitter(mod as never) : new NativeEventEmitter();

    const onUpdate = (event: VaultSearchUpdatePayload) => {
      if (!isVaultSearchEventCurrent(event.searchId, searchIdRef.current)) {
        logDroppedVaultSearchEvent('searchId', `payload=${event.searchId} current=${searchIdRef.current}`);
        return;
      }
      if (!acceptVaultInstanceForSearchEvent(event.vaultInstanceId, vaultInstanceIdRef)) {
        logDroppedVaultSearchEvent(
          'vaultInstanceId',
          `payload=${event.vaultInstanceId ?? ''} current=${vaultInstanceIdRef.current ?? ''}`,
        );
        return;
      }
      clearResultHoldTimer();
      queueMicrotask(() => {
        setHoldingPreviousResults(false);
      });
      pendingFlushNotesRef.current = (event.notes as unknown[]).map(normalizeNote);
      pendingProgressRef.current = normalizeProgress(event.progress) ?? event.progress;
      if (notesFlushRafRef.current != null) {
        return;
      }
      notesFlushRafRef.current = requestAnimationFrame(() => {
        notesFlushRafRef.current = null;
        if (searchIdRef.current == null) {
          return;
        }
        setNotes([...pendingFlushNotesRef.current]);
        const prog = pendingProgressRef.current;
        if (prog != null) {
          setProgress(prog);
        }
        setScanDone(false);
      });
    };

    const onDone = (event: VaultSearchDonePayload) => {
      if (!isVaultSearchEventCurrent(event.searchId, searchIdRef.current)) {
        logDroppedVaultSearchEvent('searchId', `payload=${event.searchId} current=${searchIdRef.current}`);
        return;
      }
      if (!acceptVaultInstanceForSearchEvent(event.vaultInstanceId, vaultInstanceIdRef)) {
        logDroppedVaultSearchEvent(
          'vaultInstanceId',
          `payload=${event.vaultInstanceId ?? ''} current=${vaultInstanceIdRef.current ?? ''}`,
        );
        return;
      }
      clearResultHoldTimer();
      queueMicrotask(() => {
        setHoldingPreviousResults(false);
      });
      cancelNotesFlushRaf();
      const rawNotes = event.notes;
      if (Array.isArray(rawNotes)) {
        setNotes(rawNotes.map(normalizeNote));
      } else {
        setNotes([]);
      }
      const prog = normalizeProgress(event.progress) ?? event.progress;
      setProgress(prog);
      setScanDone(true);
      if (
        !event.cancelled &&
        prog != null &&
        !prog.indexReady &&
        queryRef.current.trim().length > 0
      ) {
        needsSearchRetryRef.current = true;
      }
    };

    const onIndexStatus = (raw: unknown) => {
      const live = normalizeIndexStatusLive(raw);
      if (live == null) {
        return;
      }
      if (live.vaultInstanceId != null && live.vaultInstanceId !== '') {
        vaultInstanceIdRef.current = live.vaultInstanceId;
      }
      const st = live.status;
      if (st === 'ready') {
        indexReadyRef.current = true;
        if (live.lastReconciledAt != null && Number.isFinite(live.lastReconciledAt)) {
          lastReconciledAtRef.current = live.lastReconciledAt;
        }
      } else if (st === 'error') {
        indexReadyRef.current = false;
      }
      queueMicrotask(() => {
        setIndexStatusLive(live);
      });
      if (st === 'ready') {
        startSearchRetryIfPending(baseUri);
      }
    };

    const onIndexProgress = (raw: unknown) => {
      const p = normalizeIndexProgressEvent(raw);
      if (p == null) {
        return;
      }
      if (!acceptVaultInstanceForSearchEvent(p.vaultInstanceId, vaultInstanceIdRef)) {
        logDroppedVaultSearchEvent(
          'vaultInstanceId',
          `index-progress vault=${p.vaultInstanceId} current=${vaultInstanceIdRef.current ?? ''}`,
        );
        return;
      }
      queueMicrotask(() => {
        setIndexProgress(p);
      });
    };

    const subUpdate = emitter.addListener('vault-search:update', onUpdate);
    const subDone = emitter.addListener('vault-search:done', onDone);
    const subIndex = emitter.addListener('vault-search:index-status', onIndexStatus);
    const subIndexProgress = emitter.addListener('vault-search:index-progress', onIndexProgress);
    return () => {
      clearResultHoldTimer();
      cancelNotesFlushRaf();
      subUpdate.remove();
      subDone.remove();
      subIndex.remove();
      subIndexProgress.remove();
    };
  }, [open, baseUri, cancelNotesFlushRaf, clearResultHoldTimer, startSearchRetryIfPending]);

  useEffect(() => {
    if (!indexReady) {
      return;
    }
    startSearchRetryIfPending(baseUri);
  }, [indexReady, baseUri, startSearchRetryIfPending]);

  useEffect(() => {
    if (!open || !baseUri || !eskerraVaultSearch.isAvailable()) {
      return;
    }
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      queueMicrotask(() => {
        resetLocal();
      });
      eskerraVaultSearch.cancel().catch(() => undefined);
      return;
    }

    searchIdRef.current = null;
    clearResultHoldTimer();
    queueMicrotask(() => {
      setHoldingPreviousResults(false);
    });
    clearPendingSearchFlush();
    eskerraVaultSearch.cancel().catch(() => undefined);
    queueMicrotask(() => {
      setScanDone(true);
      setAwaitingDebouncedRun(true);
    });

    const onResultHoldTimerExpiry = (holdId: string) => {
      resultHoldTimerRef.current = null;
      if (searchIdRef.current !== holdId) {
        return;
      }
      queueMicrotask(() => {
        setHoldingPreviousResults(false);
      });
      setNotes([]);
      setProgress(null);
    };

    const onSearchStartError = () => {
      searchIdRef.current = null;
      clearResultHoldTimer();
      queueMicrotask(() => {
        setHoldingPreviousResults(false);
      });
      setScanDone(true);
    };

    const doSearchAsync = async (q: string, id: string) => {
      await eskerraVaultSearch.cancel().catch(() => undefined);
      if (!reconciledForSessionRef.current) {
        reconciledForSessionRef.current = true;
        const ready = indexReadyRef.current;
        const lastRec = lastReconciledAtRef.current;
        const stale =
          lastRec == null ||
          !Number.isFinite(lastRec) ||
          Date.now() - lastRec > RECONCILE_STALE_MS;
        if (ready && stale) {
          /** Do not await — reconcile walks the whole vault on SAF and would block FTS search (WAL allows both). */
          eskerraVaultSearch.reconcile(baseUri).catch(() => undefined);
        }
      }
      await eskerraVaultSearch.start(baseUri, id, q).catch(onSearchStartError);
    };

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const q = queryRef.current.trim();
      if (!q) {
        queueMicrotask(() => {
          setAwaitingDebouncedRun(false);
        });
        return;
      }
      const id = createSearchId();
      searchIdRef.current = id;
      clearPendingSearchFlush();
      clearResultHoldTimer();
      queueMicrotask(() => {
        setAwaitingDebouncedRun(false);
      });
      const hadPriorNotes = notesRef.current.length > 0;
      if (hadPriorNotes) {
        queueMicrotask(() => {
          setHoldingPreviousResults(true);
        });
        resultHoldTimerRef.current = setTimeout(() => onResultHoldTimerExpiry(id), PREVIOUS_RESULTS_HOLD_MS);
      } else {
        queueMicrotask(() => {
          setHoldingPreviousResults(false);
        });
        setNotes([]);
        setProgress(null);
      }
      setScanDone(false);
      doSearchAsync(q, id).catch(() => undefined);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [query, open, baseUri, debounceMs, resetLocal, clearPendingSearchFlush, clearResultHoldTimer, createSearchId]);

  const partialBodiesIndexing = useMemo(() => {
    if (bodiesIndexReadyFromOpen === false) {
      return true;
    }
    if (progress?.bodiesIndexReady === false) {
      return true;
    }
    if (indexStatusLive?.bodiesIndexReady === false) {
      return true;
    }
    if (
      indexProgress != null &&
      indexProgress.phase === 'bodies' &&
      indexProgress.total > 0 &&
      indexProgress.processed < indexProgress.total
    ) {
      return true;
    }
    return false;
  }, [
    bodiesIndexReadyFromOpen,
    progress?.bodiesIndexReady,
    indexStatusLive?.bodiesIndexReady,
    indexProgress,
  ]);

  return {
    query,
    setQuery,
    notes,
    progress,
    scanDone,
    awaitingDebouncedRun,
    searchingStatusVisible,
    holdingPreviousResults,
    indexStatusLive,
    indexProgress,
    partialBodiesIndexing,
  };
}

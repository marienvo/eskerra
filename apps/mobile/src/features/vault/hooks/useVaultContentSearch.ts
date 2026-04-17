import type {
  VaultSearchBestField,
  VaultSearchDonePayload,
  VaultSearchIndexStatusPayload,
  VaultSearchNoteResult,
  VaultSearchNoteSnippet,
  VaultSearchProgress,
  VaultSearchUpdatePayload,
} from '@eskerra/core';
import {useCallback, useEffect, useRef, useState} from 'react';
import {NativeEventEmitter, NativeModules} from 'react-native';

import {eskerraVaultSearch} from '../../../native/eskerraVaultSearch';

const DEFAULT_DEBOUNCE_MS = 300;
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

function isVaultInstanceCurrent(
  payloadInstanceId: string | undefined,
  currentInstanceId: string | null,
): boolean {
  if (payloadInstanceId == null || payloadInstanceId === '') {
    return true;
  }
  return currentInstanceId != null && payloadInstanceId === currentInstanceId;
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
      snippets.push({
        text: String(sn.text ?? ''),
        lineNumber:
          ln === null || ln === undefined ? null : typeof ln === 'number' ? ln : Number(ln),
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
  return {
    scannedFiles: Number(p.scannedFiles ?? 0),
    totalHits: Number(p.totalHits ?? 0),
    skippedLargeFiles: Number(p.skippedLargeFiles ?? 0),
    indexStatus: String(p.indexStatus ?? 'idle'),
    indexReady: Boolean(p.indexReady),
    isBuilding: p.isBuilding === true,
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
  return {
    vaultInstanceId: typeof o.vaultInstanceId === 'string' ? o.vaultInstanceId : undefined,
    status: String(st) as VaultSearchIndexStatusPayload['status'],
    indexedNotes: typeof o.indexedNotes === 'number' ? o.indexedNotes : undefined,
    skippedNotes: typeof o.skippedNotes === 'number' ? o.skippedNotes : undefined,
    reason: typeof o.reason === 'string' ? o.reason : undefined,
    lastReconciledAt,
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
  debounceMs?: number;
};

export function useVaultContentSearch({
  open,
  baseUri,
  vaultInstanceId,
  indexReady = false,
  lastReconciledAt = null,
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
      if (!isVaultInstanceCurrent(event.vaultInstanceId, vaultInstanceIdRef.current)) {
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
      if (!isVaultInstanceCurrent(event.vaultInstanceId, vaultInstanceIdRef.current)) {
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
      } else if (st === 'building' || st === 'error') {
        indexReadyRef.current = false;
      }
      queueMicrotask(() => {
        setIndexStatusLive(live);
      });
      if (st === 'ready' && needsSearchRetryRef.current && openRef.current && baseUri != null) {
        const q = queryRef.current.trim();
        if (q.length > 0) {
          needsSearchRetryRef.current = false;
          const id =
            globalThis.crypto && 'randomUUID' in globalThis.crypto
              ? globalThis.crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`;
          searchIdRef.current = id;
          clearResultHoldTimer();
          queueMicrotask(() => {
            setHoldingPreviousResults(false);
          });
          setScanDone(false);
          eskerraVaultSearch.start(baseUri, id, q).catch(() => {
            searchIdRef.current = null;
            queueMicrotask(() => {
              setScanDone(true);
            });
          });
        }
      }
    };

    const subUpdate = emitter.addListener('vault-search:update', onUpdate);
    const subDone = emitter.addListener('vault-search:done', onDone);
    const subIndex = emitter.addListener('vault-search:index-status', onIndexStatus);
    return () => {
      clearResultHoldTimer();
      cancelNotesFlushRaf();
      subUpdate.remove();
      subDone.remove();
      subIndex.remove();
    };
  }, [open, baseUri, cancelNotesFlushRaf, clearResultHoldTimer]);

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

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const q = queryRef.current.trim();
      if (!q) {
        queueMicrotask(() => {
          setAwaitingDebouncedRun(false);
        });
        return;
      }
      const id =
        globalThis.crypto && 'randomUUID' in globalThis.crypto
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
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
        resultHoldTimerRef.current = setTimeout(() => {
          resultHoldTimerRef.current = null;
          if (searchIdRef.current !== id) {
            return;
          }
          queueMicrotask(() => {
            setHoldingPreviousResults(false);
          });
          setNotes([]);
          setProgress(null);
        }, PREVIOUS_RESULTS_HOLD_MS);
      } else {
        queueMicrotask(() => {
          setHoldingPreviousResults(false);
        });
        setNotes([]);
        setProgress(null);
      }
      setScanDone(false);
      (async () => {
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
            await eskerraVaultSearch.reconcile(baseUri).catch(() => undefined);
          }
        }
        await eskerraVaultSearch.start(baseUri, id, q).catch(() => {
          searchIdRef.current = null;
          clearResultHoldTimer();
          queueMicrotask(() => {
            setHoldingPreviousResults(false);
          });
          setScanDone(true);
        });
      })().catch(() => undefined);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [query, open, baseUri, debounceMs, resetLocal, clearPendingSearchFlush, clearResultHoldTimer]);

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
  };
}

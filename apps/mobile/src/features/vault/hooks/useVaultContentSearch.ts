import type {
  VaultSearchBestField,
  VaultSearchDonePayload,
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

export type UseVaultContentSearchMobileOptions = {
  open: boolean;
  baseUri: string | null;
  vaultInstanceId: string | null;
  debounceMs?: number;
};

export function useVaultContentSearch({
  open,
  baseUri,
  vaultInstanceId,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseVaultContentSearchMobileOptions) {
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<VaultSearchNoteResult[]>([]);
  const [progress, setProgress] = useState<VaultSearchProgress | null>(null);
  const [scanDone, setScanDone] = useState(true);
  const [awaitingDebouncedRun, setAwaitingDebouncedRun] = useState(false);
  const [searchingStatusVisible, setSearchingStatusVisible] = useState(false);
  const [holdingPreviousResults, setHoldingPreviousResults] = useState(false);

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
    vaultInstanceIdRef.current = vaultInstanceId;
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
        return;
      }
      if (!isVaultInstanceCurrent(event.vaultInstanceId, vaultInstanceIdRef.current)) {
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
        return;
      }
      if (!isVaultInstanceCurrent(event.vaultInstanceId, vaultInstanceIdRef.current)) {
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
      setProgress(normalizeProgress(event.progress) ?? event.progress);
      setScanDone(true);
    };

    const subUpdate = emitter.addListener('vault-search:update', onUpdate);
    const subDone = emitter.addListener('vault-search:done', onDone);
    return () => {
      clearResultHoldTimer();
      cancelNotesFlushRaf();
      subUpdate.remove();
      subDone.remove();
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
  };
}

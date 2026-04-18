import {listen} from '@tauri-apps/api/event';
import {useCallback, useEffect, useRef, useState} from 'react';

import type {
  VaultSearchDonePayload,
  VaultSearchNoteResult,
  VaultSearchProgress,
  VaultSearchUpdatePayload,
} from '@eskerra/core';
import {vaultSearchCancel, vaultSearchStart} from '../lib/tauriVaultSearch';

/** Trailing idle after typing before starting a search run (palette: no `Searching…` until a run actually starts). */
const DEFAULT_DEBOUNCE_MS = 300;

/** Hold off showing `Searching…` until a run stays active this long (avoids sub-100ms flicker). */
const SEARCHING_STATUS_VISIBLE_DELAY_MS = 100;

/** After a new run starts, keep prior notes on screen this long if the backend is still quiet (gap smoothing). */
const PREVIOUS_RESULTS_HOLD_MS = 100;

export function isVaultSearchEventCurrent(
  payloadSearchId: string,
  currentId: string | null,
): boolean {
  return currentId != null && payloadSearchId === currentId;
}

export type UseVaultContentSearchOptions = {
  open: boolean;
  vaultRoot: string | null;
  debounceMs?: number;
};

export function useVaultContentSearch({
  open,
  vaultRoot,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseVaultContentSearchOptions) {
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<VaultSearchNoteResult[]>([]);
  const [progress, setProgress] = useState<VaultSearchProgress | null>(null);
  const [scanDone, setScanDone] = useState(true);
  /** True after input changed until debounce fires and a new backend run starts. */
  const [awaitingDebouncedRun, setAwaitingDebouncedRun] = useState(false);
  /** True only after an active run (`!scanDone`) has lasted at least 100 ms (see `SEARCHING_STATUS_VISIBLE_DELAY_MS`). */
  const [searchingStatusVisible, setSearchingStatusVisible] = useState(false);
  /** True while showing prior-query notes briefly after a new run started (until first update, done, or hold timeout). */
  const [holdingPreviousResults, setHoldingPreviousResults] = useState(false);

  const searchIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const searchingStatusTimerRef = useRef<number | null>(null);
  const resultHoldTimerRef = useRef<number | null>(null);
  const openRef = useRef(open);
  const scanDoneRef = useRef(scanDone);
  const queryRef = useRef(query);
  const notesRef = useRef(notes);
  /** Next `vault-search:update` replaces `notes`; flushed via `requestAnimationFrame`. */
  const pendingFlushNotesRef = useRef<VaultSearchNoteResult[]>([]);
  const pendingProgressRef = useRef<VaultSearchProgress | null>(null);
  const notesFlushRafRef = useRef<number | null>(null);

  const cancelNotesFlushRaf = useCallback(() => {
    if (notesFlushRafRef.current != null) {
      window.cancelAnimationFrame(notesFlushRafRef.current);
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
      window.clearTimeout(resultHoldTimerRef.current);
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
    openRef.current = open;
    scanDoneRef.current = scanDone;
  }, [open, scanDone]);

  useEffect(() => {
    if (searchingStatusTimerRef.current != null) {
      window.clearTimeout(searchingStatusTimerRef.current);
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
    searchingStatusTimerRef.current = window.setTimeout(() => {
      searchingStatusTimerRef.current = null;
      if (!openRef.current || scanDoneRef.current) {
        return;
      }
      setSearchingStatusVisible(true);
    }, SEARCHING_STATUS_VISIBLE_DELAY_MS);
    return () => {
      if (searchingStatusTimerRef.current != null) {
        window.clearTimeout(searchingStatusTimerRef.current);
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
      void vaultSearchCancel().catch(() => undefined);
    }
  }, [open, resetLocal]);

  useEffect(() => {
    if (!open || !vaultRoot) {
      return;
    }
    let unlistenUpdate: (() => void) | undefined;
    let unlistenDone: (() => void) | undefined;
    let cancelled = false;

    const scheduleNotesFlush = () => {
      if (notesFlushRafRef.current != null) {
        return;
      }
      notesFlushRafRef.current = window.requestAnimationFrame(() => {
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

    void (async () => {
      unlistenUpdate = await listen<VaultSearchUpdatePayload>(
        'vault-search:update',
        event => {
          const p = event.payload;
          if (!isVaultSearchEventCurrent(p.searchId, searchIdRef.current)) {
            return;
          }
          clearResultHoldTimer();
          queueMicrotask(() => {
            setHoldingPreviousResults(false);
          });
          pendingFlushNotesRef.current = [...p.notes];
          pendingProgressRef.current = p.progress;
          scheduleNotesFlush();
        },
      );
      if (cancelled) {
        unlistenUpdate();
        return;
      }
      unlistenDone = await listen<VaultSearchDonePayload>('vault-search:done', event => {
        const p = event.payload;
        if (!isVaultSearchEventCurrent(p.searchId, searchIdRef.current)) {
          return;
        }
        clearResultHoldTimer();
        queueMicrotask(() => {
          setHoldingPreviousResults(false);
        });
        cancelNotesFlushRaf();
        setNotes([...pendingFlushNotesRef.current]);
        setProgress(p.progress);
        setScanDone(true);
      });
    })();
    return () => {
      cancelled = true;
      clearResultHoldTimer();
      cancelNotesFlushRaf();
      unlistenUpdate?.();
      unlistenDone?.();
    };
  }, [open, vaultRoot, cancelNotesFlushRaf, clearResultHoldTimer]);

  useEffect(() => {
    if (!open || !vaultRoot) {
      return;
    }
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      queueMicrotask(() => {
        resetLocal();
      });
      void vaultSearchCancel().catch(() => undefined);
      return;
    }

    searchIdRef.current = null;
    clearResultHoldTimer();
    queueMicrotask(() => {
      setHoldingPreviousResults(false);
    });
    clearPendingSearchFlush();
    void vaultSearchCancel().catch(() => undefined);
    queueMicrotask(() => {
      setScanDone(true);
      setAwaitingDebouncedRun(true);
    });

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      const q = queryRef.current.trim();
      if (!q) {
        queueMicrotask(() => {
          setAwaitingDebouncedRun(false);
        });
        return;
      }
      const id = crypto.randomUUID();
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
        resultHoldTimerRef.current = window.setTimeout(() => {
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
      void (async () => {
        await vaultSearchCancel().catch(() => undefined);
        await vaultSearchStart({searchId: id, query: q}).catch(() => {
          searchIdRef.current = null;
          clearResultHoldTimer();
          queueMicrotask(() => {
            setHoldingPreviousResults(false);
          });
          setScanDone(true);
        });
      })();
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [
    query,
    open,
    vaultRoot,
    debounceMs,
    resetLocal,
    clearPendingSearchFlush,
    clearResultHoldTimer,
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
  };
}

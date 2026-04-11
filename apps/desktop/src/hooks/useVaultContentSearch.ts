import {listen} from '@tauri-apps/api/event';
import {useCallback, useEffect, useRef, useState} from 'react';

import type {
  VaultSearchDonePayload,
  VaultSearchHit,
  VaultSearchProgress,
  VaultSearchUpdatePayload,
} from '../lib/vaultSearchTypes';
import {vaultSearchCancel, vaultSearchStart} from '../lib/tauriVaultSearch';

/** Trailing idle after typing before starting a vault-wide scan (see palette: no `Searching…` until a run actually starts). */
const DEFAULT_DEBOUNCE_MS = 300;

/** Hold off showing `Searching…` until a run stays active this long (avoids sub-100ms flicker). */
const SEARCHING_STATUS_VISIBLE_DELAY_MS = 100;

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
  const [hits, setHits] = useState<VaultSearchHit[]>([]);
  const [progress, setProgress] = useState<VaultSearchProgress | null>(null);
  const [scanDone, setScanDone] = useState(true);
  /** True after input changed until debounce fires and a new backend run starts. */
  const [awaitingDebouncedRun, setAwaitingDebouncedRun] = useState(false);
  /** True only after an active run (`!scanDone`) has lasted at least 100 ms (see `SEARCHING_STATUS_VISIBLE_DELAY_MS`). */
  const [searchingStatusVisible, setSearchingStatusVisible] = useState(false);

  const searchIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const searchingStatusTimerRef = useRef<number | null>(null);
  const openRef = useRef(open);
  const scanDoneRef = useRef(scanDone);
  const queryRef = useRef(query);
  /** Next `vault-search:update` for this `searchId` replaces `hits`; later updates append. */
  const replaceNextHitsRef = useRef(true);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

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
    replaceNextHitsRef.current = true;
    setHits([]);
    setProgress(null);
    setScanDone(true);
    setAwaitingDebouncedRun(false);
  }, []);

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
    void (async () => {
      unlistenUpdate = await listen<VaultSearchUpdatePayload>(
        'vault-search:update',
        event => {
          const p = event.payload;
          if (!isVaultSearchEventCurrent(p.searchId, searchIdRef.current)) {
            return;
          }
          if (replaceNextHitsRef.current) {
            replaceNextHitsRef.current = false;
            setHits(p.hits);
          } else {
            setHits(prev => [...prev, ...p.hits]);
          }
          setProgress(p.progress);
          setScanDone(false);
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
        setProgress(p.progress);
        setScanDone(true);
      });
    })();
    return () => {
      cancelled = true;
      unlistenUpdate?.();
      unlistenDone?.();
    };
  }, [open, vaultRoot]);

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

    // Debouncing: drop in-flight run for event matching; keep visible hits until a new run starts.
    searchIdRef.current = null;
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
      replaceNextHitsRef.current = true;
      queueMicrotask(() => {
        setAwaitingDebouncedRun(false);
      });
      setHits([]);
      setProgress(null);
      setScanDone(false);
      void (async () => {
        await vaultSearchCancel().catch(() => undefined);
        await vaultSearchStart({searchId: id, query: q}).catch(() => {
          searchIdRef.current = null;
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
  }, [query, open, vaultRoot, debounceMs, resetLocal]);

  return {
    query,
    setQuery,
    hits,
    progress,
    scanDone,
    awaitingDebouncedRun,
    searchingStatusVisible,
  };
}

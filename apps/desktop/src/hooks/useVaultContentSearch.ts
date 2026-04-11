import {listen} from '@tauri-apps/api/event';
import {useCallback, useEffect, useRef, useState} from 'react';

import type {
  VaultSearchDonePayload,
  VaultSearchHit,
  VaultSearchProgress,
  VaultSearchUpdatePayload,
} from '../lib/vaultSearchTypes';
import {vaultSearchCancel, vaultSearchStart} from '../lib/tauriVaultSearch';

const DEFAULT_DEBOUNCE_MS = 300;

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
  const searchIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const resetLocal = useCallback(() => {
    searchIdRef.current = null;
    setHits([]);
    setProgress(null);
    setScanDone(true);
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
          setHits(prev => [...prev, ...p.hits]);
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
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      const id = crypto.randomUUID();
      searchIdRef.current = id;
      setHits([]);
      setProgress(null);
      setScanDone(false);
      void vaultSearchStart({searchId: id, query: trimmed}).catch(() => {
        setScanDone(true);
      });
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
  };
}

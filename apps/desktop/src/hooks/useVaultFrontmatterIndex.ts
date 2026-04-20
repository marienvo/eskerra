import {listen} from '@tauri-apps/api/event';
import {isTauri} from '@tauri-apps/api/core';
import {
  type FrontmatterPropertyType,
  resolveEffectiveFrontmatterPropertyType,
} from '@eskerra/core';
import {useCallback, useEffect, useMemo, useState} from 'react';

import {
  type VaultFrontmatterIndexSnapshotDto,
  vaultFrontmatterIndexSnapshot,
  vaultFrontmatterIndexValuesForKey,
} from '../lib/tauriVaultFrontmatter';

const KNOWN_TYPES = new Set<FrontmatterPropertyType>([
  'text',
  'number',
  'checkbox',
  'date',
  'datetime',
  'timestamp',
  'url',
  'list',
  'tags',
  'object',
]);

function coerceInferred(raw: string): FrontmatterPropertyType {
  const t = raw as FrontmatterPropertyType;
  return KNOWN_TYPES.has(t) ? t : 'text';
}

export function useVaultFrontmatterIndex(options: {
  vaultRoot: string | null;
  /** From `vaultSettings.frontmatterProperties` — setting override wins over vault inference. */
  overrides: Record<string, {type: FrontmatterPropertyType}> | undefined;
}) {
  const [snapshot, setSnapshot] =
    useState<VaultFrontmatterIndexSnapshotDto | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const reload = useCallback(async () => {
    if (!isTauri() || !options.vaultRoot) {
      setSnapshot(null);
      return;
    }
    try {
      const s = await vaultFrontmatterIndexSnapshot();
      setSnapshot(s);
      setRefreshNonce(n => n + 1);
    } catch {
      setSnapshot(null);
    }
  }, [options.vaultRoot]);

  useEffect(() => {
    if (!isTauri() || !options.vaultRoot) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale snapshot when vault is deselected
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    vaultFrontmatterIndexSnapshot()
      .then(s => {
        if (!cancelled) {
          setSnapshot(s);
          setRefreshNonce(n => n + 1);
        }
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [options.vaultRoot]);

  useEffect(() => {
    if (!isTauri() || !options.vaultRoot) {
      return;
    }
    let cancelled = false;
    let unlistenReady: (() => void) | undefined;
    let unlistenUpdated: (() => void) | undefined;

    void listen('vault-frontmatter-index-ready', () => {
      if (!cancelled) {
        void reload();
      }
    }).then((fn: () => void) => {
      unlistenReady = fn;
    });

    void listen('vault-frontmatter-index-updated', () => {
      if (!cancelled) {
        void reload();
      }
    }).then((fn: () => void) => {
      unlistenUpdated = fn;
    });

    return () => {
      cancelled = true;
      unlistenReady?.();
      unlistenUpdated?.();
    };
  }, [options.vaultRoot, reload]);

  const keys = useMemo(
    () => snapshot?.keys.map(k => k.key) ?? [],
    [snapshot],
  );

  const inferredFromSnapshot = useMemo(() => {
    const m = new Map<string, FrontmatterPropertyType>();
    if (!snapshot) {
      return m;
    }
    for (const row of snapshot.keys) {
      m.set(row.key, coerceInferred(row.inferredType));
    }
    return m;
  }, [snapshot]);

  const inferredType = useCallback(
    (key: string): FrontmatterPropertyType => {
      const ov = options.overrides?.[key]?.type;
      const inf = inferredFromSnapshot.get(key) ?? 'text';
      return resolveEffectiveFrontmatterPropertyType({
        override: ov,
        inferredFromVault: inf,
      });
    },
    [options.overrides, inferredFromSnapshot],
  );

  const totalNotesWithKey = useCallback(
    (key: string): number => {
      const row = snapshot?.keys.find(k => k.key === key);
      return row?.totalNotes ?? 0;
    },
    [snapshot],
  );

  const valuesFor = useCallback(
    async (
      key: string,
      prefix: string,
    ): Promise<Array<{value: string | number; count: number}>> => {
      if (!isTauri() || !options.vaultRoot) {
        return [];
      }
      try {
        const dto = await vaultFrontmatterIndexValuesForKey({
          key,
          prefix,
          limit: 50,
        });
        const out: Array<{value: string | number; count: number}> = [];
        for (const e of dto.entries) {
          const v = e.valueJson;
          if (typeof v === 'string' || typeof v === 'number') {
            out.push({value: v, count: e.count});
          }
        }
        return out;
      } catch {
        return [];
      }
    },
    [options.vaultRoot],
  );

  return {
    snapshot,
    keys,
    inferredType,
    totalNotesWithKey,
    valuesFor,
    refreshNonce,
    reload,
    skippedDuplicateKeyFiles: snapshot?.skippedDuplicateKeyFiles ?? 0,
  };
}

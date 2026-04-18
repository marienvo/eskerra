import {InteractionManager} from 'react-native';

import {eskerraVaultSearch, type VaultSearchOpenResult} from '../../native/eskerraVaultSearch';
import {
  canonicalizeVaultBaseUriForSearch,
  fullNeedsRebuild,
  parseVaultSearchIndexStatus,
  shouldReconcile,
  type VaultSearchIndexStatus,
  VAULT_SEARCH_SUPPORTED_SCHEMA_VERSION,
  vaultSearchBaseUriHash,
} from './vaultSearchLifecycle';

function rebuildReason(full: VaultSearchIndexStatus, canonicalBaseUri: string): string {
  const expectedHash = vaultSearchBaseUriHash(canonicalizeVaultBaseUriForSearch(canonicalBaseUri));
  if (full.baseUriHash !== '' && full.baseUriHash !== expectedHash) {
    return 'base-uri-change';
  }
  if (full.schemaVersion !== VAULT_SEARCH_SUPPORTED_SCHEMA_VERSION) {
    return 'schema-mismatch';
  }
  return 'missing';
}

/** Single-flight per base URI so warmup + search screen share one open + getIndexStatus + rebuild/reconcile pass. */
const inFlight = new Map<string, Promise<VaultSearchOpenResult | null>>();

/**
 * Opens the search DB, runs rebuild or reconcile as needed (same rules as the former Vault tab focus path).
 * Returns the `open` result for UI state. Concurrent calls for the same URI share one in-flight promise.
 */
export function runVaultSearchIndexMaintenance(baseUri: string): Promise<VaultSearchOpenResult | null> {
  const trimmed = baseUri.trim();
  if (trimmed === '' || !eskerraVaultSearch.isAvailable()) {
    return Promise.resolve(null);
  }

  const existing = inFlight.get(trimmed);
  if (existing != null) {
    return existing;
  }

  const run = (async (): Promise<VaultSearchOpenResult | null> => {
    try {
      const st = await eskerraVaultSearch.open(trimmed);
      const full = parseVaultSearchIndexStatus(await eskerraVaultSearch.getIndexStatus(trimmed));
      if (full == null) {
        return st;
      }
      if (fullNeedsRebuild(full, trimmed)) {
        const reason = rebuildReason(full, trimmed);
        await eskerraVaultSearch.scheduleFullRebuild(trimmed, reason).catch(() => undefined);
        return st;
      }
      if (shouldReconcile(full, Date.now())) {
        void eskerraVaultSearch.reconcile(trimmed).catch(() => undefined);
      }
      return st;
    } catch {
      return null;
    } finally {
      inFlight.delete(trimmed);
    }
  })();

  inFlight.set(trimmed, run);
  return run;
}

/**
 * Schedules maintenance after transitions/animations complete — does not block the first paint.
 * Use when `baseUri` becomes available (session applied).
 */
export function requestVaultSearchIndexWarmup(baseUri: string | null | undefined): void {
  if (baseUri == null || baseUri.trim() === '' || !eskerraVaultSearch.isAvailable()) {
    return;
  }
  const trimmed = baseUri.trim();
  InteractionManager.runAfterInteractions(() => {
    void runVaultSearchIndexMaintenance(trimmed);
  });
}

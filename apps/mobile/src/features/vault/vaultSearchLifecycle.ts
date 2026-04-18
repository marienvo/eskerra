import {createHash} from 'react-native-quick-crypto';

/** Must match [com.eskerra.vaultsearch.VaultSearchModule] SCHEMA_VERSION. */
export const VAULT_SEARCH_SUPPORTED_SCHEMA_VERSION = 1;

export const VAULT_SEARCH_RECONCILE_MAX_AGE_MS = 60_000;

/** Shape returned by native `open` / `getIndexStatus` (subset used by JS). */
export type VaultSearchIndexStatus = {
  vaultInstanceId: string;
  baseUriHash: string;
  schemaVersion: number;
  indexReady: boolean;
  isBuilding: boolean;
  bodiesIndexReady?: boolean;
  indexedNotes: number;
  lastFullBuildAt: number;
  lastReconciledAt: number;
};

/**
 * Mirrors Kotlin [VaultPath.canonicalizeUri] for consistent base-uri hashing.
 */
export function canonicalizeVaultBaseUriForSearch(raw: string): string {
  let s = raw.trim();
  if (s.length > 1 && s.endsWith('/')) {
    const withoutTrailing = s.replace(/\/+$/, '');
    if (withoutTrailing !== '' && !withoutTrailing.endsWith(':')) {
      s = withoutTrailing;
    }
  }
  return s;
}

export function vaultSearchBaseUriHash(canonicalBaseUri: string): string {
  return createHash('sha1').update(canonicalBaseUri, 'utf8').digest('hex');
}

export function parseVaultSearchIndexStatus(raw: unknown): VaultSearchIndexStatus | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const schema = o.schemaVersion;
  const schemaNum =
    typeof schema === 'number' ? schema : schema != null ? Number(schema) : Number.NaN;
  return {
    vaultInstanceId: String(o.vaultInstanceId ?? ''),
    baseUriHash: String(o.baseUriHash ?? ''),
    schemaVersion: Number.isFinite(schemaNum) ? schemaNum : 0,
    indexReady: o.indexReady === true,
    isBuilding: o.isBuilding === true,
    bodiesIndexReady: o.bodiesIndexReady === true ? true : o.bodiesIndexReady === false ? false : undefined,
    indexedNotes: Number(o.indexedNotes ?? 0),
    lastFullBuildAt: Number(o.lastFullBuildAt ?? 0),
    lastReconciledAt: Number(o.lastReconciledAt ?? 0),
  };
}

/**
 * True when the on-disk index clearly has rows for this vault (even if `indexReady` is still false,
 * e.g. interrupted body phase). In that case we must not call `scheduleFullRebuild` — native can
 * resume or `reconcile` will refresh without wiping the DB.
 */
export function persistedVaultSearchHasRows(status: VaultSearchIndexStatus): boolean {
  return Number.isFinite(status.indexedNotes) && status.indexedNotes > 0;
}

/**
 * When true, JS should call `scheduleFullRebuild` (missing index, schema mismatch, or base-uri drift).
 */
export function fullNeedsRebuild(
  status: VaultSearchIndexStatus,
  canonicalBaseUri: string,
): boolean {
  const canonical = canonicalizeVaultBaseUriForSearch(canonicalBaseUri);
  const expectedHash = vaultSearchBaseUriHash(canonical);
  if (status.baseUriHash !== '' && status.baseUriHash !== expectedHash) {
    return true;
  }
  if (status.schemaVersion !== VAULT_SEARCH_SUPPORTED_SCHEMA_VERSION) {
    return true;
  }
  if (!status.indexReady && !status.isBuilding) {
    /** Empty DB / never built — full rebuild. */
    if (!persistedVaultSearchHasRows(status)) {
      return true;
    }
    /** Rows exist but flags say not ready and not building — resume with reconcile, not a wipe. */
    return false;
  }
  return false;
}

export function shouldReconcile(
  status: VaultSearchIndexStatus,
  nowMs: number,
  maxAgeMs: number = VAULT_SEARCH_RECONCILE_MAX_AGE_MS,
): boolean {
  if (!status.indexReady || status.isBuilding) {
    return false;
  }
  return nowMs - status.lastReconciledAt > maxAgeMs;
}

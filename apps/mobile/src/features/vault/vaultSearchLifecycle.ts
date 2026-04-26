import {createHash} from 'react-native-quick-crypto';

/** Must match [com.eskerra.vaultsearch.VaultSearchSchema] SCHEMA_VERSION. */
export const VAULT_SEARCH_SUPPORTED_SCHEMA_VERSION = 3;

export const VAULT_SEARCH_RECONCILE_MAX_AGE_MS = 60_000;

/** Shape returned by native `open` / `getIndexStatus` (subset used by JS). */
export type VaultSearchIndexStatus = {
  vaultInstanceId: string;
  baseUriHash: string;
  schemaVersion: number;
  indexReady: boolean;
  isBuilding: boolean;
  bodiesIndexReady?: boolean;
  /** True when native has fully aligned [vault_markdown_notes] (migration / rebuild / reconcile). */
  notesRegistryReady?: boolean;
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
    let withoutTrailing = s;
    while (withoutTrailing.endsWith('/')) {
      withoutTrailing = withoutTrailing.slice(0, -1);
    }
    if (withoutTrailing !== '' && !withoutTrailing.endsWith(':')) {
      s = withoutTrailing;
    }
  }
  return s;
}

export function vaultSearchBaseUriHash(canonicalBaseUri: string): string {
  return createHash('sha1').update(canonicalBaseUri, 'utf8').digest('hex');
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  return undefined;
}

export function parseVaultSearchIndexStatus(raw: unknown): VaultSearchIndexStatus | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const schema = o.schemaVersion;
  let schemaNum = Number.NaN;
  if (typeof schema === 'number') {
    schemaNum = schema;
  } else if (schema != null) {
    schemaNum = Number(schema);
  }
  return {
    vaultInstanceId: String(o.vaultInstanceId ?? ''),
    baseUriHash: String(o.baseUriHash ?? ''),
    schemaVersion: Number.isFinite(schemaNum) ? schemaNum : 0,
    indexReady: o.indexReady === true,
    isBuilding: o.isBuilding === true,
    bodiesIndexReady: parseOptionalBoolean(o.bodiesIndexReady),
    notesRegistryReady: parseOptionalBoolean(o.notesRegistryReady),
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
    /** Empty DB / never built — full rebuild; rows exist → resume with reconcile, not a wipe. */
    return !persistedVaultSearchHasRows(status);
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

export type VaultSearchProgress = {
  scannedFiles: number;
  totalHits: number;
  skippedLargeFiles: number;
};

export type VaultFilenameMatchStrength = 'exact' | 'partial';

export type VaultSearchHit = {
  uri: string;
  lineNumber: number;
  snippet: string;
  /** Present only for filename hits (`lineNumber === 0`). */
  filenameMatch?: VaultFilenameMatchStrength;
};

/** Lower rank sorts earlier: exact filename, then partial filename, then body lines. */
export function vaultSearchHitTierRank(hit: VaultSearchHit): number {
  if (hit.lineNumber !== 0) {
    return 2;
  }
  if (hit.filenameMatch === 'exact') {
    return 0;
  }
  if (hit.filenameMatch === 'partial') {
    return 1;
  }
  return 1;
}

export function compareVaultSearchHits(a: VaultSearchHit, b: VaultSearchHit): number {
  const ra = vaultSearchHitTierRank(a);
  const rb = vaultSearchHitTierRank(b);
  if (ra !== rb) {
    return ra - rb;
  }
  const pathCmp = a.uri.localeCompare(b.uri);
  if (pathCmp !== 0) {
    return pathCmp;
  }
  return a.lineNumber - b.lineNumber;
}

export type VaultSearchUpdatePayload = {
  searchId: string;
  hits: VaultSearchHit[];
  progress: VaultSearchProgress;
};

export type VaultSearchDonePayload = {
  searchId: string;
  cancelled: boolean;
  progress: VaultSearchProgress;
};

export type VaultSearchProgress = {
  scannedFiles: number;
  totalHits: number;
  skippedLargeFiles: number;
};

export type VaultSearchHit = {
  uri: string;
  lineNumber: number;
  snippet: string;
};

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

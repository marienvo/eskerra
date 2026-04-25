import {
  type VaultFilesChangedPayload,
  vaultFilesChangedIsCoarse,
} from './vaultFilesChangedPayload';

export type VaultFilesChangedEventPlan = {
  paths: string[];
  coarse: boolean;
  shouldTouchPathsIncrementally: boolean;
  shouldScheduleFullReindex: boolean;
  shouldRefreshPodcasts: boolean;
  pathsForReconcile: string[];
};

export function planVaultFilesChangedEvent(input: {
  payload: VaultFilesChangedPayload | null | undefined;
  isPodcastRelevantPath: (path: string) => boolean;
  allowCoarseFullReindex?: boolean;
}): VaultFilesChangedEventPlan {
  const paths = input.payload?.paths ?? [];
  const coarse = vaultFilesChangedIsCoarse(input.payload);
  const shouldTouchPathsIncrementally = !coarse && paths.length > 0;
  const shouldScheduleFullReindex = coarse
    ? input.allowCoarseFullReindex !== false
    : !shouldTouchPathsIncrementally;
  const shouldRefreshPodcasts = coarse || paths.some(input.isPodcastRelevantPath);
  const pathsForReconcile = coarse ? [] : paths;
  return {
    paths,
    coarse,
    shouldTouchPathsIncrementally,
    shouldScheduleFullReindex,
    shouldRefreshPodcasts,
    pathsForReconcile,
  };
}

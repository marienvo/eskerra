/**
 * Canvas fills this object so the workspace can flush hub saves and (for future reconcile) read live merges.
 */
export type TodayHubWorkspaceBridge = {
  flushPendingEdits: () => Promise<void>;
  getLiveRowUri: () => string | null;
  getLiveRowMergedMarkdown: () => string | null;
  /** True when a debounced hub row persist is scheduled or in flight (see TodayHubCanvas). */
  hasPendingHubFlush: () => boolean;
  /**
   * Normalizes markdown for every non-empty day column on hub canvas week rows, then persists
   * changed row files (see `cleanTodayHubRowColumns` + `persistTodayHubRow`).
   */
  cleanHubPageDayColumns: () => Promise<void>;
};

export function createIdleTodayHubWorkspaceBridge(): TodayHubWorkspaceBridge {
  return {
    flushPendingEdits: async () => {},
    getLiveRowUri: () => null,
    getLiveRowMergedMarkdown: () => null,
    hasPendingHubFlush: () => false,
    cleanHubPageDayColumns: async () => {},
  };
}

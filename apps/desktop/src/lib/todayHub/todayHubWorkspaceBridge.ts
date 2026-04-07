/**
 * Canvas fills this object so the workspace can flush hub saves and (for future reconcile) read live merges.
 */
export type TodayHubWorkspaceBridge = {
  flushPendingEdits: () => Promise<void>;
  getLiveRowUri: () => string | null;
  getLiveRowMergedMarkdown: () => string | null;
};

export function createIdleTodayHubWorkspaceBridge(): TodayHubWorkspaceBridge {
  return {
    flushPendingEdits: async () => {},
    getLiveRowUri: () => null,
    getLiveRowMergedMarkdown: () => null,
  };
}

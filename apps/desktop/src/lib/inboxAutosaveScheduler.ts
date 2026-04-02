/** Debounce delay after the last inbox markdown edit before writing to disk. */
export const INBOX_AUTOSAVE_DEBOUNCE_MS = 400;

export type InboxAutosaveScheduler = {
  schedule: (fn: () => void) => void;
  cancel: () => void;
};

export function createInboxAutosaveScheduler(
  debounceMs: number,
): InboxAutosaveScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(fn: () => void) {
      if (timer != null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, debounceMs);
    },
    cancel() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

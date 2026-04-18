import type {PlaylistEntry} from './playlist';
import type {R2PlaylistConditionalResult} from './r2PlaylistConditional';

export type PlaylistEtagPollerFetch = (args: {
  etag: string | null;
  signal: AbortSignal;
}) => Promise<R2PlaylistConditionalResult>;

export type CreatePlaylistEtagPollerOptions = {
  intervalMs: number;
  fetchConditional: PlaylistEtagPollerFetch;
  onDataChanged: (entry: PlaylistEntry) => void;
  /** Fires once when remote `playlist.json` goes from present to absent (404 / empty), not on first-boot missing. */
  onRemotePlaylistCleared?: () => void;
  onTransientError?: (error: unknown) => void;
};

export type PlaylistEtagPoller = {
  setActive: (active: boolean) => void;
  /**
   * Changes the poll interval while preserving ETag state. If active, reschedules the timer
   * without an extra immediate tick (use {@link triggerCheck} when you want that).
   */
  setIntervalMs: (intervalMs: number) => void;
  /** Runs one poll immediately if active and idle; skips when a request is in flight. */
  triggerCheck: () => void;
  dispose: () => void;
  getEtag: () => string | null;
};

function isAbortError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    (error as {name: unknown}).name === 'AbortError'
  );
}

/**
 * Single-interval ETag poller: no overlapping requests, abort on deactivate, immediate check on resume.
 */
export function createPlaylistEtagPoller(options: CreatePlaylistEtagPollerOptions): PlaylistEtagPoller {
  let etag: string | null = null;
  /** True after we have observed a successful `updated` for this poller lifetime. */
  let haveRemote = false;
  let active = false;
  let currentIntervalMs = options.intervalMs;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  let disposed = false;
  let abort: AbortController | null = null;

  const clearTimer = (): void => {
    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const cancelInFlight = (): void => {
    if (abort != null) {
      abort.abort();
      abort = null;
    }
    inFlight = false;
  };

  const tick = async (): Promise<void> => {
    if (!active || disposed || inFlight) {
      return;
    }
    inFlight = true;
    abort = new AbortController();
    const signal = abort.signal;
    try {
      const result = await options.fetchConditional({etag, signal});
      if (disposed || signal.aborted) {
        return;
      }
      if (result.kind === 'updated') {
        etag = result.etag;
        haveRemote = true;
        options.onDataChanged(result.entry);
      } else if (result.kind === 'missing') {
        etag = null;
        if (haveRemote) {
          haveRemote = false;
          options.onRemotePlaylistCleared?.();
        }
      }
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        return;
      }
      options.onTransientError?.(error);
    } finally {
      inFlight = false;
      abort = null;
    }
  };

  const scheduleInterval = (): void => {
    clearTimer();
    intervalId = setInterval(() => {
      void tick();
    }, currentIntervalMs);
  };

  return {
    setActive(next: boolean): void {
      if (disposed) {
        return;
      }
      if (next === active) {
        return;
      }
      active = next;
      if (!active) {
        clearTimer();
        cancelInFlight();
        return;
      }
      void tick();
      scheduleInterval();
    },

    setIntervalMs(nextMs: number): void {
      if (disposed || nextMs === currentIntervalMs) {
        return;
      }
      currentIntervalMs = nextMs;
      if (!active) {
        return;
      }
      scheduleInterval();
    },

    triggerCheck(): void {
      void tick();
    },

    dispose(): void {
      disposed = true;
      active = false;
      clearTimer();
      cancelInFlight();
    },

    getEtag(): string | null {
      return etag;
    },
  };
}

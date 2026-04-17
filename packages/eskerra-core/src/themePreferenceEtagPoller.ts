import type {R2ThemePreferenceConditionalResult} from './r2ThemePreferenceConditional';
import type {ThemePreference} from './themePreference';

export type ThemePreferenceEtagPollerFetch = (args: {
  etag: string | null;
  signal: AbortSignal;
}) => Promise<R2ThemePreferenceConditionalResult>;

export type CreateThemePreferenceEtagPollerOptions = {
  intervalMs: number;
  fetchConditional: ThemePreferenceEtagPollerFetch;
  onDataChanged: (preference: ThemePreference) => void;
  /** Fires when remote object goes from present to absent after we had seen content. */
  onRemoteCleared?: () => void;
  onTransientError?: (error: unknown) => void;
};

export type ThemePreferenceEtagPoller = {
  setActive: (active: boolean) => void;
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

export function createThemePreferenceEtagPoller(
  options: CreateThemePreferenceEtagPollerOptions,
): ThemePreferenceEtagPoller {
  let etag: string | null = null;
  let haveRemote = false;
  let active = false;
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
        options.onDataChanged(result.preference);
      } else if (result.kind === 'missing') {
        etag = null;
        if (haveRemote) {
          haveRemote = false;
          options.onRemoteCleared?.();
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
    }, options.intervalMs);
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

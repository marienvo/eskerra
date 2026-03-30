/**
 * Central place to detect environments where Sentry and the ring buffer should stay off.
 */

export function isObservabilityDisabled(): boolean {
  const proc = (globalThis as {process?: {env?: Record<string, string | undefined>}}).process;
  return proc?.env?.JEST_WORKER_ID !== undefined;
}

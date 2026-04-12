/**
 * Environments where Sentry and similar hooks should stay off (tests, CI without DSN).
 */

export function isObservabilityDisabled(): boolean {
  try {
    if (import.meta.env?.MODE === 'test') {
      return true;
    }
  } catch {
    // Non-Vite bundlers: ignore.
  }
  const proc = (globalThis as {process?: {env?: Record<string, string | undefined>}})
    .process;
  return (
    proc?.env?.VITEST_WORKER_ID !== undefined
    || proc?.env?.JEST_WORKER_ID !== undefined
  );
}

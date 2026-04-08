/** Dev-only: set `localStorage.todayHubPerf = '1'` to log Today Hub timing breakdown. */
export function todayHubPerfEnabled(): boolean {
  try {
    return (
      import.meta.env.DEV &&
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('todayHubPerf') === '1'
    );
  } catch {
    return false;
  }
}

export function todayHubPerfLog(
  phase: string,
  payload?: Record<string, unknown>,
): void {
  if (!todayHubPerfEnabled()) {
    return;
  }
  console.log(`[todayHubPerf] ${phase}`, payload ?? '');
}

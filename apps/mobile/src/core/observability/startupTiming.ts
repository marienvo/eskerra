/**
 * Marks time from JS bundle evaluation for startup correlation (logcat, ANR post-mortems).
 * Import this module early from the entry file so `bundleLoadMarkMs` is close to first JS execution.
 */

type WithPerformance = typeof globalThis & {
  performance?: {now: () => number};
};

function perfNow(): number | null {
  const p = (globalThis as WithPerformance).performance;
  if (p && typeof p.now === 'function') {
    return p.now();
  }
  return null;
}

const bundleLoadWallMs = Date.now();
const bundleLoadPerfMs = perfNow();

/**
 * Milliseconds since this module was first evaluated (approximate JS bundle eval time).
 */
export function elapsedMsSinceJsBundleEval(): number {
  const nowPerf = perfNow();
  if (nowPerf != null && bundleLoadPerfMs != null) {
    return Math.round(nowPerf - bundleLoadPerfMs);
  }
  return Math.round(Date.now() - bundleLoadWallMs);
}

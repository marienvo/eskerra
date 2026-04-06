/** Formats milliseconds as `m:ss` for status/title chrome; `—` when unknown. */
export function formatPlaybackMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) {
    return '—';
  }
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

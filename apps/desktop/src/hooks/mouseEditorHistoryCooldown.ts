/** Minimum time between successful mouse-driven editor history navigations (all event sources). */
export const MOUSE_EDITOR_HISTORY_NAV_COOLDOWN_MS = 400;

export function isWithinMouseHistoryCooldown(
  lastNavMs: number,
  now: number,
  cooldownMs: number,
): boolean {
  return lastNavMs > 0 && now - lastNavMs < cooldownMs;
}

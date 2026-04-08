/**
 * X11 / WebKitGTK: middle mouse button can synthesize a `paste` from primary selection.
 * Window-level paste suppression uses a short window after middle `mousedown`.
 * WebKitGTK can deliver the synthetic primary-selection `paste` well after `mousedown`
 * (observed ~250–400ms); keep this comfortably above that tail.
 */
export const MIDDLE_CLICK_BLOCK_PASTE_WINDOW_MS = 750;

/**
 * Whether a paste at `nowMs` should be treated as a middle-click primary-selection paste
 * and blocked when `lastMiddleMouseDownMs` is the timestamp of the most recent middle
 * `mousedown` (from the global capture listener).
 */
export function isMiddleClickPasteBlocked(
  lastMiddleMouseDownMs: number,
  nowMs: number,
): boolean {
  if (lastMiddleMouseDownMs <= 0) {
    return false;
  }
  return nowMs - lastMiddleMouseDownMs < MIDDLE_CLICK_BLOCK_PASTE_WINDOW_MS;
}

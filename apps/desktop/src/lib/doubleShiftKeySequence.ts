/** Max ms between consecutive Shift releases for a double-tap. */
export const DOUBLE_SHIFT_WINDOW_MS = 400;

export type DoubleShiftState = {
  /** Timestamp from `performance.now()` or `Date.now()` of the last bare Shift keyup. */
  lastShiftUpAt: number | null;
};

export const initialDoubleShiftState: DoubleShiftState = {lastShiftUpAt: null};

/**
 * Call on capture-phase `keydown`. Any key chord that is not a lone Shift clears progress.
 */
export function reduceDoubleShiftKeyDown(
  state: DoubleShiftState,
  key: string,
  ctrlKey: boolean,
  metaKey: boolean,
  altKey: boolean,
): DoubleShiftState {
  const loneShift = key === 'Shift' && !ctrlKey && !metaKey && !altKey;
  if (!loneShift) {
    return {lastShiftUpAt: null};
  }
  return state;
}

/**
 * Call on capture-phase `keyup`. Returns `shouldOpen` when a second bare Shift release lands
 * within {@link DOUBLE_SHIFT_WINDOW_MS} after the previous one.
 */
export function reduceDoubleShiftKeyUp(
  state: DoubleShiftState,
  now: number,
  key: string,
  ctrlKey: boolean,
  metaKey: boolean,
  altKey: boolean,
): {state: DoubleShiftState; shouldOpen: boolean} {
  if (key !== 'Shift') {
    return {state: {lastShiftUpAt: null}, shouldOpen: false};
  }
  if (ctrlKey || metaKey || altKey) {
    return {state: {lastShiftUpAt: null}, shouldOpen: false};
  }
  const prev = state.lastShiftUpAt;
  if (prev == null) {
    return {state: {lastShiftUpAt: now}, shouldOpen: false};
  }
  if (now - prev <= DOUBLE_SHIFT_WINDOW_MS) {
    return {state: {lastShiftUpAt: null}, shouldOpen: true};
  }
  return {state: {lastShiftUpAt: now}, shouldOpen: false};
}

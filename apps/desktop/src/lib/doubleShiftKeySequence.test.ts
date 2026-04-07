import {describe, expect, it} from 'vitest';

import {
  DOUBLE_SHIFT_WINDOW_MS,
  initialDoubleShiftState,
  reduceDoubleShiftKeyDown,
  reduceDoubleShiftKeyUp,
} from './doubleShiftKeySequence';

describe('reduceDoubleShiftKeyDown', () => {
  it('clears after non-Shift key', () => {
    let s = initialDoubleShiftState;
    ({state: s} = reduceDoubleShiftKeyUp(s, 0, 'Shift', false, false, false));
    expect(s.lastShiftUpAt).toBe(0);
    s = reduceDoubleShiftKeyDown(s, 'a', false, false, false);
    expect(s.lastShiftUpAt).toBeNull();
  });

  it('clears when Shift is pressed with Ctrl', () => {
    let s = initialDoubleShiftState;
    ({state: s} = reduceDoubleShiftKeyUp(s, 0, 'Shift', false, false, false));
    s = reduceDoubleShiftKeyDown(s, 'Shift', true, false, false);
    expect(s.lastShiftUpAt).toBeNull();
  });

  it('preserves state on lone Shift keydown', () => {
    let s = initialDoubleShiftState;
    ({state: s} = reduceDoubleShiftKeyUp(s, 100, 'Shift', false, false, false));
    const t = reduceDoubleShiftKeyDown(s, 'Shift', false, false, false);
    expect(t.lastShiftUpAt).toBe(100);
  });
});

describe('reduceDoubleShiftKeyUp', () => {
  it('opens on second Shift within window', () => {
    let s = initialDoubleShiftState;
    ({state: s} = reduceDoubleShiftKeyUp(s, 1000, 'Shift', false, false, false));
    expect(s.lastShiftUpAt).toBe(1000);
    const r = reduceDoubleShiftKeyUp(s, 1000 + DOUBLE_SHIFT_WINDOW_MS, 'Shift', false, false, false);
    expect(r.shouldOpen).toBe(true);
    expect(r.state.lastShiftUpAt).toBeNull();
  });

  it('does not open when gap exceeds window', () => {
    let s = initialDoubleShiftState;
    ({state: s} = reduceDoubleShiftKeyUp(s, 0, 'Shift', false, false, false));
    const r = reduceDoubleShiftKeyUp(
      s,
      DOUBLE_SHIFT_WINDOW_MS + 1,
      'Shift',
      false,
      false,
      false,
    );
    expect(r.shouldOpen).toBe(false);
    expect(r.state.lastShiftUpAt).toBe(DOUBLE_SHIFT_WINDOW_MS + 1);
  });

  it('clears progress on Shift keyup with modifiers', () => {
    let s = initialDoubleShiftState;
    ({state: s} = reduceDoubleShiftKeyUp(s, 0, 'Shift', false, false, false));
    const r = reduceDoubleShiftKeyUp(s, 10, 'Shift', true, false, false);
    expect(r.shouldOpen).toBe(false);
    expect(r.state.lastShiftUpAt).toBeNull();
  });
});

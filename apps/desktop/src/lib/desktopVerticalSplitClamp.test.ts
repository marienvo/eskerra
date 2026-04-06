import {describe, expect, it} from 'vitest';

import {
  clampSplitTopHeightPx,
  shouldPersistVerticalSplitTopHeightClamp,
} from './desktopVerticalSplitClamp';

describe('shouldPersistVerticalSplitTopHeightClamp', () => {
  it('returns false when max top slot is below min top (degenerate)', () => {
    expect(shouldPersistVerticalSplitTopHeightClamp(0, 120, 560)).toBe(false);
    expect(shouldPersistVerticalSplitTopHeightClamp(119, 120, 560)).toBe(false);
  });

  it('returns false when stored height does not fit and maxH is barely above min (transient squeeze)', () => {
    expect(shouldPersistVerticalSplitTopHeightClamp(129, 120, 560)).toBe(false);
  });

  it('returns true when user meaningfully shrinks top (maxH well above min)', () => {
    expect(shouldPersistVerticalSplitTopHeightClamp(200, 120, 560)).toBe(true);
  });

  it('returns true when stored height fits', () => {
    expect(shouldPersistVerticalSplitTopHeightClamp(400, 120, 280)).toBe(true);
  });
});

describe('clampSplitTopHeightPx', () => {
  it('clamps to min/max and container', () => {
    expect(clampSplitTopHeightPx(280, 120, 560, 800, 5, 120)).toBe(280);
    expect(clampSplitTopHeightPx(900, 120, 560, 800, 5, 120)).toBe(560);
    expect(clampSplitTopHeightPx(100, 120, 560, 800, 5, 120)).toBe(120);
  });

  it('shrinks when container is short', () => {
    expect(clampSplitTopHeightPx(280, 120, 560, 400, 5, 120)).toBe(275);
  });
});

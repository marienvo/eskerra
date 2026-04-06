import {describe, expect, it} from 'vitest';

import {clampSplitTopHeightPx} from './desktopVerticalSplitClamp';

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

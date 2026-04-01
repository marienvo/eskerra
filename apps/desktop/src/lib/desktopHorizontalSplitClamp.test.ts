import {describe, expect, it} from 'vitest';

import {clampSplitLeftWidthPx} from './desktopHorizontalSplitClamp';

describe('clampSplitLeftWidthPx', () => {
  it('clamps to min/max and container', () => {
    expect(clampSplitLeftWidthPx(280, 160, 520, 1200, 13, 220)).toBe(280);
    expect(clampSplitLeftWidthPx(900, 160, 520, 1200, 13, 220)).toBe(520);
    expect(clampSplitLeftWidthPx(100, 160, 520, 1200, 13, 220)).toBe(160);
  });

  it('shrinks when container is narrow', () => {
    expect(clampSplitLeftWidthPx(280, 160, 520, 500, 13, 220)).toBe(267);
  });
});

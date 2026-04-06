import {describe, expect, it} from 'vitest';

import {
  clampSplitLeftWidthPx,
  clampSplitRightWidthPx,
  shouldPersistLeftSplitWidthClamp,
} from './desktopHorizontalSplitClamp';

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

describe('shouldPersistLeftSplitWidthClamp', () => {
  it('returns false when available space is below min left (transient or degenerate)', () => {
    expect(shouldPersistLeftSplitWidthClamp(0, 160)).toBe(false);
    expect(shouldPersistLeftSplitWidthClamp(159, 160)).toBe(false);
  });

  it('returns true when enough space exists to honor min left', () => {
    expect(shouldPersistLeftSplitWidthClamp(160, 160)).toBe(true);
    expect(shouldPersistLeftSplitWidthClamp(400, 160)).toBe(true);
  });
});

describe('clampSplitRightWidthPx', () => {
  it('clamps to min/max and container', () => {
    expect(clampSplitRightWidthPx(280, 200, 480, 1200, 13, 280)).toBe(280);
    expect(clampSplitRightWidthPx(900, 200, 480, 1200, 13, 280)).toBe(480);
    expect(clampSplitRightWidthPx(100, 200, 480, 1200, 13, 280)).toBe(200);
  });

  it('shrinks when container is narrow', () => {
    expect(clampSplitRightWidthPx(280, 200, 480, 500, 13, 280)).toBe(207);
  });
});

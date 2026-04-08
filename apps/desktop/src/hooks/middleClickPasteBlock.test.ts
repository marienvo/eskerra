import {describe, expect, it} from 'vitest';

import {
  isMiddleClickPasteBlocked,
  MIDDLE_CLICK_BLOCK_PASTE_WINDOW_MS,
} from './middleClickPasteBlock';

describe('isMiddleClickPasteBlocked', () => {
  it('returns false when no middle mousedown has been recorded', () => {
    expect(isMiddleClickPasteBlocked(0, 10_000)).toBe(false);
    expect(isMiddleClickPasteBlocked(-1, 10_000)).toBe(false);
  });

  it('returns true within the block window after lastMiddleMouseDownMs', () => {
    expect(isMiddleClickPasteBlocked(1000, 1000)).toBe(true);
    expect(
      isMiddleClickPasteBlocked(1000, 1000 + MIDDLE_CLICK_BLOCK_PASTE_WINDOW_MS - 1),
    ).toBe(true);
  });

  it('returns false at exactly MIDDLE_CLICK_BLOCK_PASTE_WINDOW_MS elapsed (exclusive upper bound)', () => {
    const start = 1000;
    const end = start + MIDDLE_CLICK_BLOCK_PASTE_WINDOW_MS;
    expect(isMiddleClickPasteBlocked(start, end)).toBe(false);
  });

  it('returns false after the block window', () => {
    expect(isMiddleClickPasteBlocked(1000, 1000 + MIDDLE_CLICK_BLOCK_PASTE_WINDOW_MS + 1)).toBe(
      false,
    );
  });
});

describe('MIDDLE_CLICK_BLOCK_PASTE_WINDOW_MS', () => {
  it('is a positive duration', () => {
    expect(MIDDLE_CLICK_BLOCK_PASTE_WINDOW_MS).toBeGreaterThan(0);
  });
});

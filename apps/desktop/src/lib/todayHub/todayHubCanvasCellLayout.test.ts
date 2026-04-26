import {describe, expect, it} from 'vitest';

import {
  todayHubCanvasCellSurface,
  todayHubCanvasCellWarmOrActive,
} from './todayHubCanvasCellLayout';

describe('todayHubCanvasCellLayout', () => {
  it('selects empty-readonly only when not editing, not warm, and chunk is blank', () => {
    expect(
      todayHubCanvasCellSurface({
        editing: false,
        isWarm: false,
        chunkTrimmedLength: 0,
      }),
    ).toBe('empty-readonly');
    expect(
      todayHubCanvasCellSurface({
        editing: false,
        isWarm: true,
        chunkTrimmedLength: 0,
      }),
    ).toBe('non-empty');
    expect(
      todayHubCanvasCellSurface({
        editing: false,
        isWarm: false,
        chunkTrimmedLength: 3,
      }),
    ).toBe('non-empty');
    expect(
      todayHubCanvasCellSurface({
        editing: true,
        isWarm: false,
        chunkTrimmedLength: 0,
      }),
    ).toBe('non-empty');
  });

  it('warmOrActive mirrors editing or warm', () => {
    expect(todayHubCanvasCellWarmOrActive(false, false)).toBe(false);
    expect(todayHubCanvasCellWarmOrActive(true, false)).toBe(true);
    expect(todayHubCanvasCellWarmOrActive(false, true)).toBe(true);
  });
});

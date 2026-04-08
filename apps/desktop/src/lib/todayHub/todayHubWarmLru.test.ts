import {describe, expect, it} from 'vitest';

import {hubCellWarmKey, touchWarmLru} from './todayHubWarmLru';

describe('touchWarmLru', () => {
  it('moves touched key to MRU and enforces max', () => {
    expect(touchWarmLru(['a', 'b'], 'c', 2, null)).toEqual(['b', 'c']);
    expect(touchWarmLru(['b', 'c'], 'a', 2, null)).toEqual(['c', 'a']);
  });

  it('never evicts pinned key', () => {
    const pin = hubCellWarmKey('vault:/r/2026-04-07.md', 1);
    const a = hubCellWarmKey('vault:/r/a.md', 0);
    const b = hubCellWarmKey('vault:/r/b.md', 0);
    expect(touchWarmLru([a, pin], b, 2, pin)).toEqual([pin, b]);
  });

  it('returns empty when maxWarm is 0', () => {
    expect(touchWarmLru(['a'], 'b', 0, null)).toEqual([]);
  });
});

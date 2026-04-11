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

  it('re-touch prior cell after opening new (pin new) restores prior when pool was full', () => {
    const max = 4;
    const w1 = hubCellWarmKey('vault:/r/2026-04-01.md', 0);
    const w2 = hubCellWarmKey('vault:/r/2026-04-02.md', 0);
    const w3 = hubCellWarmKey('vault:/r/2026-04-03.md', 0);
    const w4 = hubCellWarmKey('vault:/r/2026-04-04.md', 0);
    const w5 = hubCellWarmKey('vault:/r/2026-04-05.md', 0);
    const full = [w1, w2, w3, w4];
    const pin = w5;
    let next = touchWarmLru(full, pin, max, pin);
    expect(next).not.toContain(w1);
    next = touchWarmLru(next, w1, max, pin);
    expect(next).toContain(w1);
    expect(next).toContain(pin);
    expect(next.length).toBe(max);
  });

  it('returns empty when maxWarm is 0', () => {
    expect(touchWarmLru(['a'], 'b', 0, null)).toEqual([]);
  });
});

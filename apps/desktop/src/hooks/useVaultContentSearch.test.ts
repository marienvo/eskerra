import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {isVaultSearchEventCurrent} from './useVaultContentSearch';

describe('isVaultSearchEventCurrent', () => {
  it('returns false when current id is null', () => {
    expect(isVaultSearchEventCurrent('a', null)).toBe(false);
  });

  it('returns false on mismatch', () => {
    expect(isVaultSearchEventCurrent('a', 'b')).toBe(false);
  });

  it('returns true when ids match', () => {
    expect(isVaultSearchEventCurrent('same', 'same')).toBe(true);
  });
});

describe('vault content search debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires at most one timeout per debounce window for repeated query changes', () => {
    const fn = vi.fn();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (q: string, ms: number) => {
      if (timer != null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        fn(q);
      }, ms);
    };
    schedule('a', 300);
    vi.advanceTimersByTime(100);
    schedule('ab', 300);
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('ab');
  });
});

import {describe, expect, it} from 'vitest';

import {formatPlaybackMs} from './formatPlaybackMs';

describe('formatPlaybackMs', () => {
  it('returns em dash for null or non-finite', () => {
    expect(formatPlaybackMs(null)).toBe('—');
    expect(formatPlaybackMs(Number.NaN)).toBe('—');
  });

  it('formats minutes and zero-padded seconds', () => {
    expect(formatPlaybackMs(65_000)).toBe('1:05');
    expect(formatPlaybackMs(0)).toBe('0:00');
  });
});

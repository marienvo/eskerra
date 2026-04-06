import {describe, expect, test} from 'vitest';

import {
  capEmojiUsageCounts,
  evictLowestCountKey,
  parseEmojiUsagePayload,
} from './emojiUsageStore';

describe('capEmojiUsageCounts', () => {
  test('keeps all when under cap', () => {
    expect(capEmojiUsageCounts({a: 1, b: 2}, 10)).toEqual({a: 1, b: 2});
  });

  test('normalizes keys to lowercase', () => {
    expect(capEmojiUsageCounts({Smile: 3}, 10)).toEqual({smile: 3});
  });

  test('drops non-positive and non-finite', () => {
    expect(
      capEmojiUsageCounts({a: 0, b: -1, c: Number.NaN, d: 2}, 10),
    ).toEqual({d: 2});
  });

  test('keeps highest counts when over cap', () => {
    const raw = Object.fromEntries(
      Array.from({length: 10}, (_, i) => [`e${i}`, i + 1]),
    );
    expect(Object.keys(capEmojiUsageCounts(raw, 3)).length).toBe(3);
    const capped = capEmojiUsageCounts(raw, 3);
    expect(capped.e9).toBe(10);
    expect(capped.e8).toBe(9);
    expect(capped.e7).toBe(8);
  });
});

describe('parseEmojiUsagePayload', () => {
  test('accepts v1 payload', () => {
    expect(parseEmojiUsagePayload({v: 1, counts: {smile: 2}})).toEqual({smile: 2});
  });

  test('rejects wrong version', () => {
    expect(parseEmojiUsagePayload({v: 2, counts: {}})).toBeNull();
  });

  test('rejects invalid shape', () => {
    expect(parseEmojiUsagePayload(null)).toBeNull();
    expect(parseEmojiUsagePayload({v: 1})).toBeNull();
    expect(parseEmojiUsagePayload({v: 1, counts: []})).toBeNull();
  });
});

describe('evictLowestCountKey', () => {
  test('removes lowest count', () => {
    const m = new Map([
      ['a', 5],
      ['b', 1],
      ['c', 3],
    ]);
    evictLowestCountKey(m, 3);
    expect(m.has('b')).toBe(false);
    expect(m.size).toBe(2);
  });

  test('tie-breaks by lexicographic key', () => {
    const m = new Map([
      ['z', 2],
      ['a', 2],
      ['m', 2],
    ]);
    evictLowestCountKey(m, 3);
    expect(m.has('a')).toBe(false);
    expect(m.size).toBe(2);
  });

  test('no-op when under maxKeys', () => {
    const m = new Map([['x', 1]]);
    evictLowestCountKey(m, 5);
    expect(m.size).toBe(1);
  });
});

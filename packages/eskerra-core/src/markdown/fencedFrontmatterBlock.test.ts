import {describe, expect, it} from 'vitest';

import {
  fencedFrontmatterBlockToInner,
  innerToFencedFrontmatterBlock,
} from './fencedFrontmatterBlock';

describe('fencedFrontmatterBlock', () => {
  it('round-trips inner through fence', () => {
    const inner = 'title: Hello\n';
    const fenced = innerToFencedFrontmatterBlock(inner);
    expect(fencedFrontmatterBlockToInner(fenced)).toBe(inner.trimEnd());
  });
});

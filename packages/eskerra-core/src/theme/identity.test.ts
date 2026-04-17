import {describe, expect, it} from 'vitest';

import {pickUniqueThemeStem, toKebabIdFromName} from './identity';

describe('toKebabIdFromName', () => {
  it('slugifies ASCII', () => {
    expect(toKebabIdFromName('  My Cool Theme  ')).toBe('my-cool-theme');
  });

  it('strips combining marks (NFKD)', () => {
    expect(toKebabIdFromName('Café')).toBe('cafe');
  });

  it('returns theme for empty-after-trim', () => {
    expect(toKebabIdFromName('   ---   ')).toBe('theme');
  });
});

describe('pickUniqueThemeStem', () => {
  it('returns base when free', () => {
    expect(pickUniqueThemeStem('foo', new Set(['bar']))).toBe('foo');
  });

  it('adds numeric suffix on collision', () => {
    const s = new Set(['foo', 'foo-2']);
    expect(pickUniqueThemeStem('foo', s)).toBe('foo-3');
  });
});

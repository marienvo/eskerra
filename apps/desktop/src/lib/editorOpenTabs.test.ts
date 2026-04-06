import {describe, expect, it} from 'vitest';

import {
  closeOtherOpenTabs,
  ensureOpenTab,
  keepOnlyOpenTab,
  normalizeOpenTabList,
  pickNeighborUriAfterRemovingTab,
  pickSurvivorAfterSelectedRemovedFromTabs,
  remapOpenTabUris,
  removeOpenTab,
  removeOpenTabsWhere,
} from './editorOpenTabs';

describe('normalizeOpenTabList', () => {
  it('normalizes and dedupes', () => {
    expect(normalizeOpenTabList(['/a.md', ' /a.md ', '/b.md'])).toEqual([
      '/a.md',
      '/b.md',
    ]);
  });
});

describe('ensureOpenTab', () => {
  it('appends new uri', () => {
    expect(ensureOpenTab(['/a.md'], '/b.md')).toEqual(['/a.md', '/b.md']);
  });

  it('does not duplicate', () => {
    expect(ensureOpenTab(['/a.md', '/b.md'], '/a.md')).toEqual(['/a.md', '/b.md']);
  });
});

describe('removeOpenTab', () => {
  it('removes by normalized match', () => {
    expect(removeOpenTab(['/a.md', '/b.md'], ' /a.md ')).toEqual(['/b.md']);
  });
});

describe('pickSurvivorAfterSelectedRemovedFromTabs', () => {
  it('returns selected when still open', () => {
    expect(
      pickSurvivorAfterSelectedRemovedFromTabs(['/a.md', '/b.md'], ['/a.md', '/b.md'], '/a.md'),
    ).toBe('/a.md');
  });

  it('prefers right survivor in old order', () => {
    expect(
      pickSurvivorAfterSelectedRemovedFromTabs(
        ['/a.md', '/b.md', '/c.md'],
        ['/a.md', '/c.md'],
        '/b.md',
      ),
    ).toBe('/c.md');
  });
});

describe('pickNeighborUriAfterRemovingTab', () => {
  it('prefers right neighbor', () => {
    expect(pickNeighborUriAfterRemovingTab(['/a.md', '/b.md', '/c.md'], '/b.md')).toBe(
      '/c.md',
    );
  });

  it('uses left when closing rightmost', () => {
    expect(pickNeighborUriAfterRemovingTab(['/a.md', '/b.md'], '/b.md')).toBe('/a.md');
  });

  it('returns null for single tab', () => {
    expect(pickNeighborUriAfterRemovingTab(['/a.md'], '/a.md')).toBeNull();
  });
});

describe('remapOpenTabUris', () => {
  it('remaps prefixes like vault tree operations', () => {
    const tabs = ['/vault/Old/a.md', '/vault/Old/b.md'];
    expect(remapOpenTabUris(tabs, '/vault/Old', '/vault/New')).toEqual([
      '/vault/New/a.md',
      '/vault/New/b.md',
    ]);
  });

  it('dedupes when two tabs collapse to same path', () => {
    expect(remapOpenTabUris(['/x/a.md', '/x/b.md'], '/x', '/y')).toEqual([
      '/y/a.md',
      '/y/b.md',
    ]);
  });
});

describe('removeOpenTabsWhere', () => {
  it('filters by predicate', () => {
    expect(
      removeOpenTabsWhere(['/a.md', '/b.md', '/c.md'], u => u === '/b.md'),
    ).toEqual(['/a.md', '/c.md']);
  });
});

describe('keepOnlyOpenTab', () => {
  it('keeps only matching uri when present', () => {
    expect(keepOnlyOpenTab(['/a.md', '/b.md'], '/b.md')).toEqual(['/b.md']);
  });

  it('returns empty when keep uri not in list', () => {
    expect(keepOnlyOpenTab(['/a.md'], '/b.md')).toEqual([]);
  });
});

describe('closeOtherOpenTabs', () => {
  it('aliases keepOnlyOpenTab behavior', () => {
    expect(closeOtherOpenTabs(['/a.md', '/b.md'], '/a.md')).toEqual(['/a.md']);
  });
});

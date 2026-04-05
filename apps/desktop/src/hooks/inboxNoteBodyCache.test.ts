import {describe, expect, it} from 'vitest';

import {
  mergeInboxNoteBodyIntoCache,
  resolveInboxCachedBodyForEditor,
} from './inboxNoteBodyCache';

describe('mergeInboxNoteBodyIntoCache', () => {
  it('returns null when the entry already matches', () => {
    const prev = {'/vault/Inbox/A.md': 'hello'};
    expect(
      mergeInboxNoteBodyIntoCache(prev, '/vault/Inbox/A.md', 'hello'),
    ).toBeNull();
  });

  it('returns a new map with the updated body when it changed', () => {
    const prev = {'/vault/Inbox/A.md': 'old'};
    const next = mergeInboxNoteBodyIntoCache(
      prev,
      '/vault/Inbox/A.md',
      'edited',
    );
    expect(next).toEqual({'/vault/Inbox/A.md': 'edited'});
    expect(prev).toEqual({'/vault/Inbox/A.md': 'old'});
  });

  it('adds a new URI without mutating the previous map', () => {
    const prev = {'/vault/Inbox/A.md': 'a'};
    const next = mergeInboxNoteBodyIntoCache(prev, '/vault/Inbox/B.md', 'b');
    expect(next).toEqual({
      '/vault/Inbox/A.md': 'a',
      '/vault/Inbox/B.md': 'b',
    });
  });

  it('matches persisted markdown after image rewrite (trimmed body)', () => {
    const prev = {'/n.md': '![](blob:xxx)'};
    const rewritten = '![](../Assets/Attachments/x.png)';
    const next = mergeInboxNoteBodyIntoCache(prev, '/n.md', rewritten);
    expect(next).toEqual({'/n.md': rewritten});
  });
});

describe('resolveInboxCachedBodyForEditor', () => {
  const uri = '/vault/Inbox/Note.md';

  it('uses cache when lastPersisted is null', () => {
    expect(
      resolveInboxCachedBodyForEditor(uri, 'cached', null),
    ).toEqual({markdown: 'cached', healedCache: false});
  });

  it('uses cache when lastPersisted is for another URI', () => {
    expect(
      resolveInboxCachedBodyForEditor(uri, 'cached', {
        uri: '/other.md',
        markdown: 'disk',
      }),
    ).toEqual({markdown: 'cached', healedCache: false});
  });

  it('uses cache when lastPersisted agrees with cache', () => {
    expect(
      resolveInboxCachedBodyForEditor(uri, 'same', {
        uri,
        markdown: 'same',
      }),
    ).toEqual({markdown: 'same', healedCache: false});
  });

  it('prefers lastPersisted when same URI but cache is stale', () => {
    expect(
      resolveInboxCachedBodyForEditor(uri, 'stale', {
        uri,
        markdown: 'from-disk',
      }),
    ).toEqual({markdown: 'from-disk', healedCache: true});
  });
});

describe('inbox note body cache scenarios', () => {
  it('keeps edited body in cache across virtual A -> B -> A after save', () => {
    let cache: Record<string, string> = {'/A.md': 'v0', '/B.md': 'b'};
    cache =
      mergeInboxNoteBodyIntoCache(cache, '/A.md', 'v1 edited') ?? cache;
    const lastPersisted = {uri: '/A.md', markdown: 'v1 edited'};
    cache =
      mergeInboxNoteBodyIntoCache(cache, '/A.md', lastPersisted.markdown) ??
      cache;
    const resolved = resolveInboxCachedBodyForEditor(
      '/A.md',
      cache['/A.md']!,
      lastPersisted,
    );
    expect(resolved).toEqual({
      markdown: 'v1 edited',
      healedCache: false,
    });
  });

  it('heals stale cache when lastPersisted reflects a successful save', () => {
    const staleCache = 'v0';
    const lastPersisted = {uri: '/A.md', markdown: 'v1 saved'};
    const resolved = resolveInboxCachedBodyForEditor(
      '/A.md',
      staleCache,
      lastPersisted,
    );
    expect(resolved).toEqual({markdown: 'v1 saved', healedCache: true});
    const healed =
      mergeInboxNoteBodyIntoCache({'/A.md': staleCache}, '/A.md', resolved.markdown) ??
      null;
    expect(healed).toEqual({'/A.md': 'v1 saved'});
  });
});

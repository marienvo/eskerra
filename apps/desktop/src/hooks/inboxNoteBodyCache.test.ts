import {describe, expect, it} from 'vitest';

import {
  mergeInboxNoteBodyIntoCache,
  resolveInboxCachedBodyForEditor,
  classifyNoteDiskReconcile,
  fsChangePathsMayAffectUri,
  removeInboxNoteBodyFromCache,
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

describe('fsChangePathsMayAffectUri', () => {
  const root = '/home/user/Vault';
  const note = '/home/user/Vault/Inbox/Note.md';

  it('returns true when the batch is empty (full refresh signal)', () => {
    expect(fsChangePathsMayAffectUri([], note, root)).toBe(true);
  });

  it('returns true when the changed path equals the note URI', () => {
    expect(fsChangePathsMayAffectUri([note], note, root)).toBe(true);
  });

  it('returns true when a parent directory changed', () => {
    expect(
      fsChangePathsMayAffectUri(
        [`${root}/Inbox`],
        note,
        root,
      ),
    ).toBe(true);
  });

  it('returns false when the note is outside the vault root', () => {
    expect(fsChangePathsMayAffectUri([`${root}/Inbox/x.md`], '/tmp/other.md', root)).toBe(
      false,
    );
  });

  it('returns false when no path affects the note', () => {
    expect(
      fsChangePathsMayAffectUri([`${root}/Podcasts/foo`], note, root),
    ).toBe(false);
  });
});

describe('removeInboxNoteBodyFromCache', () => {
  it('returns null when the URI is absent', () => {
    expect(removeInboxNoteBodyFromCache({'/a.md': 'x'}, '/missing.md')).toBeNull();
  });

  it('returns a new map without the URI', () => {
    const prev = {'/a.md': 'x', '/b.md': 'y'};
    const next = removeInboxNoteBodyFromCache(prev, '/a.md');
    expect(next).toEqual({'/b.md': 'y'});
    expect(prev).toEqual({'/a.md': 'x', '/b.md': 'y'});
  });
});

describe('classifyNoteDiskReconcile', () => {
  const uri = '/vault/Inbox/N.md';

  it('returns noop when disk matches last persisted', () => {
    expect(
      classifyNoteDiskReconcile({
        noteUri: uri,
        lastPersisted: {uri, markdown: 'same'},
        diskMarkdown: 'same',
        localMarkdown: 'edited',
      }),
    ).toBe('noop');
  });

  it('returns reload_from_disk when disk changed and editor still matches last persist', () => {
    expect(
      classifyNoteDiskReconcile({
        noteUri: uri,
        lastPersisted: {uri, markdown: 'old'},
        diskMarkdown: 'new-from-disk',
        localMarkdown: 'old',
      }),
    ).toBe('reload_from_disk');
  });

  it('returns conflict when disk and local both diverged from last persist', () => {
    expect(
      classifyNoteDiskReconcile({
        noteUri: uri,
        lastPersisted: {uri, markdown: 'old'},
        diskMarkdown: 'new-from-disk',
        localMarkdown: 'local-edits',
      }),
    ).toBe('conflict');
  });

  it('returns reload_from_disk when there is no lastPersisted baseline but disk differs', () => {
    expect(
      classifyNoteDiskReconcile({
        noteUri: uri,
        lastPersisted: null,
        diskMarkdown: 'd',
        localMarkdown: '',
      }),
    ).toBe('reload_from_disk');
  });
});

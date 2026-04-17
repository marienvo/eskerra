import {describe, expect, it} from 'vitest';

import {
  clearPodcastNoteUriCacheForVault,
  persistPodcastNoteUri,
  resolveCachedPodcastNoteUri,
} from './podcastNoteUriCacheDesktop';

const BASE = '/vault';

describe('podcastNoteUriCacheDesktop', () => {
  it('resolves exact series title', () => {
    clearPodcastNoteUriCacheForVault(BASE);
    persistPodcastNoteUri(BASE, 'My Show', 'file:///general/%F0%9F%93%BB%20My%20Show.md');
    expect(resolveCachedPodcastNoteUri(BASE, 'My Show')).toBe(
      'file:///general/%F0%9F%93%BB%20My%20Show.md',
    );
  });

  it('resolves via normalized key when wording differs', () => {
    clearPodcastNoteUriCacheForVault(BASE);
    persistPodcastNoteUri(BASE, 'Hello World', 'file:///a.md');
    expect(resolveCachedPodcastNoteUri(BASE, 'hello  world')).toBe('file:///a.md');
  });

  it('clearPodcastNoteUriCacheForVault removes entries for that vault only', () => {
    clearPodcastNoteUriCacheForVault(BASE);
    clearPodcastNoteUriCacheForVault('/other');
    persistPodcastNoteUri(BASE, 'A', 'uri-a');
    persistPodcastNoteUri('/other', 'B', 'uri-b');
    clearPodcastNoteUriCacheForVault(BASE);
    expect(resolveCachedPodcastNoteUri(BASE, 'A')).toBeUndefined();
    expect(resolveCachedPodcastNoteUri('/other', 'B')).toBe('uri-b');
  });

  it('ignores empty URIs on persist', () => {
    clearPodcastNoteUriCacheForVault(BASE);
    persistPodcastNoteUri(BASE, 'X', '   ');
    expect(resolveCachedPodcastNoteUri(BASE, 'X')).toBeUndefined();
  });
});

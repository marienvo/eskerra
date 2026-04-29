import {describe, expect, it} from 'vitest';

import {isPodcastRelevantVaultPath} from './workspacePodcastFsRelevance';

describe('isPodcastRelevantVaultPath', () => {
  it('matches podcast episode markdown files', () => {
    expect(isPodcastRelevantVaultPath('2026 My Show - podcasts.md')).toBe(true);
  });

  it('matches RSS episode-style markdown names', () => {
    expect(isPodcastRelevantVaultPath('📻 My Feed.md')).toBe(true);
  });

  it('rejects RSS episode-style names without a non-blank title', () => {
    expect(isPodcastRelevantVaultPath('📻.md')).toBe(false);
    expect(isPodcastRelevantVaultPath('📻   .md')).toBe(false);
  });

  it('rejects non-markdown files', () => {
    expect(isPodcastRelevantVaultPath('📻 My Feed.txt')).toBe(false);
    expect(isPodcastRelevantVaultPath('cover.png')).toBe(false);
  });

  it('matches relevant files in nested POSIX paths by basename', () => {
    expect(isPodcastRelevantVaultPath('/vault/General/Podcasts/📻 Daily.md')).toBe(
      true,
    );
  });

  it('matches relevant files in nested Windows paths by basename', () => {
    expect(isPodcastRelevantVaultPath('C:\\vault\\General\\2026 My Show - podcasts.md')).toBe(
      true,
    );
  });

  it('rejects irrelevant nested markdown files', () => {
    expect(isPodcastRelevantVaultPath('/vault/General/Notes/Meeting.md')).toBe(
      false,
    );
  });
});

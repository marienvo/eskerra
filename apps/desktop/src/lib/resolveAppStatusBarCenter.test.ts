import {describe, expect, it} from 'vitest';

import {resolveAppStatusBarCenter} from './resolveAppStatusBarCenter';

const base = {
  err: null as string | null,
  diskConflict: false,
  diskConflictSoft: false,
  renameLinkProgress: null as {done: number; total: number} | null,
  wikiRenameNotice: null as string | null,
  playerLabel: 'idle' as const,
  activeEpisode: null as {seriesName: string; title: string} | null,
  tagline: 'Think. Compose. Nothing else.',
};

describe('resolveAppStatusBarCenter', () => {
  it('returns tagline when nothing else applies', () => {
    expect(resolveAppStatusBarCenter(base)).toEqual({
      kind: 'tagline',
      text: base.tagline,
    });
  });

  it('prefers err over player and tagline', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      err: 'Save failed',
      playerLabel: 'playing',
      activeEpisode: {title: 'Ep', seriesName: 'Show'},
    });
    expect(r).toEqual({kind: 'message', tone: 'error', text: 'Save failed'});
  });

  it('prefers rename progress over wiki notice and player', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      renameLinkProgress: {done: 1, total: 5},
      wikiRenameNotice: 'Wiki',
      playerLabel: 'paused',
      activeEpisode: {title: 'Ep', seriesName: 'Show'},
    });
    expect(r).toEqual({
      kind: 'message',
      tone: 'info',
      text: 'Updating links… 1/5',
    });
  });

  it('prefers wiki notice over player when no rename progress', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      wikiRenameNotice: 'Renamed X → Y',
      playerLabel: 'playing',
      activeEpisode: {title: 'Ep', seriesName: 'Show'},
    });
    expect(r).toEqual({
      kind: 'message',
      tone: 'info',
      text: 'Renamed X → Y',
    });
  });

  it('shows player when playing and no simple message', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      playerLabel: 'playing',
      activeEpisode: {title: 'Episode A', seriesName: 'Podcast B'},
    });
    expect(r).toEqual({
      kind: 'player',
      episodeTitle: 'Episode A',
      seriesName: 'Podcast B',
    });
  });

  it('shows player when paused', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      playerLabel: 'paused',
      activeEpisode: {title: 'E', seriesName: 'S'},
    });
    expect(r).toEqual({
      kind: 'player',
      episodeTitle: 'E',
      seriesName: 'S',
    });
  });

  it('does not show player for loading/idle/ended when no message', () => {
    for (const playerLabel of ['loading', 'idle', 'ended', 'error'] as const) {
      const r = resolveAppStatusBarCenter({
        ...base,
        playerLabel,
        activeEpisode: {title: 'E', seriesName: 'S'},
      });
      expect(r.kind).toBe('tagline');
    }
  });

  it('falls back to tagline when playing but no episode', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      playerLabel: 'playing',
      activeEpisode: null,
    });
    expect(r).toEqual({kind: 'tagline', text: base.tagline});
  });

  it('suppresses rename/wiki while diskConflict is true', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      diskConflict: true,
      renameLinkProgress: {done: 1, total: 2},
      wikiRenameNotice: 'Note',
    });
    expect(r).toEqual({kind: 'tagline', text: base.tagline});
  });

  it('suppresses rename/wiki while diskConflictSoft is true', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      diskConflictSoft: true,
      renameLinkProgress: {done: 1, total: 2},
    });
    expect(r).toEqual({kind: 'tagline', text: base.tagline});
  });

  it('still shows err while diskConflict is true', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      err: 'Oops',
      diskConflict: true,
    });
    expect(r).toEqual({kind: 'message', tone: 'error', text: 'Oops'});
  });
});

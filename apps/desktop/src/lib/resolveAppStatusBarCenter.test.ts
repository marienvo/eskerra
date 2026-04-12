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

  it('prefers err over tagline when playback is active', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      err: 'Save failed',
      playerLabel: 'playing',
      activeEpisode: {title: 'Ep', seriesName: 'Show'},
    });
    expect(r).toEqual({kind: 'message', tone: 'error', text: 'Save failed'});
  });

  it('prefers rename progress over wiki notice when playback is active', () => {
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

  it('prefers wiki notice when no rename progress (playback ignored)', () => {
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

  it('uses tagline when playing and no simple message (episode line is on toolbar)', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      playerLabel: 'playing',
      activeEpisode: {title: 'Episode A', seriesName: 'Podcast B'},
    });
    expect(r).toEqual({kind: 'tagline', text: base.tagline});
  });

  it('uses tagline when paused with episode', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      playerLabel: 'paused',
      activeEpisode: {title: 'E', seriesName: 'S'},
    });
    expect(r).toEqual({kind: 'tagline', text: base.tagline});
  });

  it('uses tagline when loading with active episode', () => {
    const r = resolveAppStatusBarCenter({
      ...base,
      playerLabel: 'loading',
      activeEpisode: {title: 'E', seriesName: 'S'},
    });
    expect(r).toEqual({kind: 'tagline', text: base.tagline});
  });

  it('uses tagline for idle/ended/error when no message', () => {
    for (const playerLabel of ['idle', 'ended', 'error'] as const) {
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

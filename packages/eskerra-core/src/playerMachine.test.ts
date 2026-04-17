import {describe, expect, it, vi} from 'vitest';
import {createActor} from 'xstate';

import type {PlaylistEntry} from './playlist';
import {NEAR_END_WINDOW_MS} from './playlist';
import {getPlaybackSubstate, podcastPlayerMachine} from './playerMachine';

function makePlaylistEntry(
  partial: Pick<PlaylistEntry, 'episodeId' | 'mp3Url' | 'positionMs'> &
    Partial<Omit<PlaylistEntry, 'episodeId' | 'mp3Url' | 'positionMs'>>,
): PlaylistEntry {
  return {
    durationMs: 120_000,
    updatedAt: 1,
    playbackOwnerId: '',
    controlRevision: 0,
    ...partial,
  };
}

function noopDeps() {
  return {
    hasR2: () => false,
    persist: vi.fn().mockResolvedValue({kind: 'skipped' as const}),
    clearRemotePlaylist: vi.fn(),
    markEpisodeListened: vi.fn(),
  };
}

describe('podcastPlayerMachine', () => {
  it('enters markingNearEnd when progress crosses last window', async () => {
    const persist = vi.fn().mockResolvedValue({kind: 'saved' as const, entry: {} as never});
    const clearRemotePlaylist = vi.fn().mockResolvedValue(undefined);
    const markEpisodeListened = vi.fn().mockResolvedValue(undefined);

    const actor = createActor(podcastPlayerMachine, {
      input: {
        deps: {
          hasR2: () => true,
          persist,
          clearRemotePlaylist,
          markEpisodeListened,
        },
      },
    });
    actor.start();

    actor.send({
      type: 'EPISODE_PLAY',
      episode: {
        id: 'e1',
        mp3Url: 'https://x/a.mp3',
        title: 'T',
        artist: 'A',
      },
      baseline: null,
    });
    actor.send({type: 'NATIVE', state: 'playing'});
    const duration = NEAR_END_WINDOW_MS * 2 + 50_000;
    actor.send({
      type: 'PROGRESS',
      positionMs: duration - NEAR_END_WINDOW_MS + 1,
      durationMs: duration,
    });

    await vi.waitFor(() => {
      expect(clearRemotePlaylist).toHaveBeenCalled();
      expect(markEpisodeListened).toHaveBeenCalledWith('e1', false);
    });
  });

  it('HYDRATE from primed with same episode updates position and baseline only', () => {
    const actor = createActor(podcastPlayerMachine, {
      input: {deps: noopDeps()},
    });
    actor.start();

    const ep = {
      id: 'e1',
      mp3Url: 'https://x/a.mp3',
      title: 'T',
      artist: 'A',
    };
    const entry1 = makePlaylistEntry({
      episodeId: ep.id,
      mp3Url: ep.mp3Url,
      positionMs: 1000,
    });

    actor.send({
      type: 'HYDRATE',
      episode: ep,
      entry: entry1,
      baseline: entry1,
    });

    expect(getPlaybackSubstate(actor.getSnapshot())).toBe('primed');
    expect(actor.getSnapshot().context.positionMs).toBe(1000);

    const entry2 = makePlaylistEntry({
      episodeId: ep.id,
      mp3Url: ep.mp3Url,
      positionMs: 5000,
      controlRevision: 3,
    });
    actor.send({
      type: 'HYDRATE',
      episode: ep,
      entry: entry2,
      baseline: entry2,
    });

    expect(getPlaybackSubstate(actor.getSnapshot())).toBe('primed');
    expect(actor.getSnapshot().context.positionMs).toBe(5000);
    expect(actor.getSnapshot().context.episode?.id).toBe('e1');
    expect(actor.getSnapshot().context.playlistBaseline?.controlRevision).toBe(3);
  });

  it('HYDRATE from primed with different episode replaces context without going idle', () => {
    const actor = createActor(podcastPlayerMachine, {
      input: {deps: noopDeps()},
    });
    actor.start();

    const ep1 = {
      id: 'e1',
      mp3Url: 'https://x/a.mp3',
      title: 'T1',
      artist: 'A',
    };
    const ep2 = {
      id: 'e2',
      mp3Url: 'https://x/b.mp3',
      title: 'T2',
      artist: 'A',
    };
    actor.send({
      type: 'HYDRATE',
      episode: ep1,
      entry: makePlaylistEntry({
        episodeId: ep1.id,
        mp3Url: ep1.mp3Url,
        positionMs: 100,
      }),
      baseline: null,
    });
    expect(actor.getSnapshot().context.episode?.id).toBe('e1');

    actor.send({
      type: 'HYDRATE',
      episode: ep2,
      entry: makePlaylistEntry({
        episodeId: ep2.id,
        mp3Url: ep2.mp3Url,
        positionMs: 200,
      }),
      baseline: null,
    });

    expect(getPlaybackSubstate(actor.getSnapshot())).toBe('primed');
    expect(actor.getSnapshot().context.episode?.id).toBe('e2');
    expect(actor.getSnapshot().context.positionMs).toBe(200);
  });

  it('HYDRATE from paused with matching episode only updates baseline and position', () => {
    const actor = createActor(podcastPlayerMachine, {
      input: {deps: noopDeps()},
    });
    actor.start();

    const ep = {
      id: 'e1',
      mp3Url: 'https://x/a.mp3',
      title: 'T',
      artist: 'A',
    };
    actor.send({
      type: 'EPISODE_PLAY',
      episode: ep,
      baseline: null,
    });
    actor.send({type: 'NATIVE', state: 'paused'});

    expect(getPlaybackSubstate(actor.getSnapshot())).toBe('paused');

    actor.send({
      type: 'HYDRATE',
      episode: ep,
      entry: makePlaylistEntry({
        episodeId: ep.id,
        mp3Url: ep.mp3Url,
        positionMs: 99_000,
        controlRevision: 7,
      }),
      baseline: null,
    });

    expect(getPlaybackSubstate(actor.getSnapshot())).toBe('paused');
    expect(actor.getSnapshot().context.positionMs).toBe(99_000);
    expect(actor.getSnapshot().context.playlistBaseline?.controlRevision).toBe(7);
  });
});

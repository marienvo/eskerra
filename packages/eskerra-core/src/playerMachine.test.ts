import {describe, expect, it, vi} from 'vitest';
import {createActor, waitFor} from 'xstate';

import type {PlaylistEntry} from './playlist';
import {NEAR_END_WINDOW_MS} from './playlist';
import {
  getPlaybackSubstate,
  getPlaybackTransportPlayControl,
  isPersistIdle,
  isPlaybackTransportBuffering,
  podcastPlayerMachine,
} from './playerMachine';

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

  it('NATIVE ended during markingNearEnd reaches idle (does not stick in nearEndPlaying)', async () => {
    const persist = vi.fn().mockResolvedValue({kind: 'skipped' as const});
    const hang = new Promise<void>(() => {
      /* never resolves — simulates slow clearRemote during nearEndEffects */
    });
    const clearRemotePlaylist = vi
      .fn()
      .mockImplementationOnce(() => hang)
      .mockResolvedValue(undefined);
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
      expect(clearRemotePlaylist).toHaveBeenCalledTimes(1);
      expect(getPlaybackSubstate(actor.getSnapshot())).toBe('markingNearEnd');
    });

    actor.send({type: 'NATIVE', state: 'ended'});

    await waitFor(
      actor,
      s => getPlaybackSubstate(s) === 'idle',
      {timeout: 5000},
    );
    expect(actor.getSnapshot().context.native).toBe('idle');
    expect(actor.getSnapshot().context.episode).toBeNull();
    expect(markEpisodeListened).toHaveBeenCalledWith('e1', true);
    expect(clearRemotePlaylist).toHaveBeenCalledTimes(2);
  });

  it('nearEndEffects rejection enters error with native idle', async () => {
    const persist = vi.fn().mockResolvedValue({kind: 'skipped' as const});
    const clearRemotePlaylist = vi.fn().mockRejectedValue(new Error('clear failed'));
    const markEpisodeListened = vi.fn();

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
      expect(getPlaybackSubstate(actor.getSnapshot())).toBe('error');
    });
    expect(actor.getSnapshot().context.native).toBe('idle');
    expect(actor.getSnapshot().context.errorMessage).toBe('clear failed');
    expect(markEpisodeListened).not.toHaveBeenCalled();
  });

  it('ERROR from playing sets native idle so episode selection is not stuck', () => {
    const actor = createActor(podcastPlayerMachine, {
      input: {deps: noopDeps()},
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
    actor.send({type: 'ERROR', message: 'boom'});
    expect(getPlaybackSubstate(actor.getSnapshot())).toBe('error');
    expect(actor.getSnapshot().context.native).toBe('idle');
    expect(actor.getSnapshot().context.errorMessage).toBe('boom');
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

  it('getPlaybackTransportPlayControl returns loading when native is loading and not seeking', () => {
    const actor = createActor(podcastPlayerMachine, {
      input: {deps: noopDeps()},
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
    expect(
      getPlaybackTransportPlayControl({
        context: actor.getSnapshot().context,
        value: actor.getSnapshot().value,
      }),
    ).toBe('loading');
  });

  it('getPlaybackTransportPlayControl returns buffering only while playing and context.buffering', () => {
    const actor = createActor(podcastPlayerMachine, {
      input: {deps: noopDeps()},
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

    expect(
      getPlaybackTransportPlayControl({
        context: actor.getSnapshot().context,
        value: actor.getSnapshot().value,
      }),
    ).toBe('playing');

    actor.send({type: 'BUFFERING', buffering: true});
    expect(actor.getSnapshot().context.buffering).toBe(true);
    const buf = getPlaybackTransportPlayControl({
      context: actor.getSnapshot().context,
      value: actor.getSnapshot().value,
    });
    expect(buf).toBe('buffering');
    expect(isPlaybackTransportBuffering(buf)).toBe(true);

    actor.send({type: 'BUFFERING', buffering: false});
    expect(
      getPlaybackTransportPlayControl({
        context: actor.getSnapshot().context,
        value: actor.getSnapshot().value,
      }),
    ).toBe('playing');
  });

  it('getPlaybackTransportPlayControl stays paused when buffering is true but playback is paused', () => {
    const actor = createActor(podcastPlayerMachine, {
      input: {deps: noopDeps()},
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
    actor.send({type: 'NATIVE', state: 'paused'});
    actor.send({type: 'BUFFERING', buffering: true});

    expect(actor.getSnapshot().context.buffering).toBe(true);
    expect(
      getPlaybackTransportPlayControl({
        context: actor.getSnapshot().context,
        value: actor.getSnapshot().value,
      }),
    ).toBe('paused');
  });

  it('RESET clears buffering flag', () => {
    const actor = createActor(podcastPlayerMachine, {
      input: {deps: noopDeps()},
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
    actor.send({type: 'BUFFERING', buffering: true});
    expect(actor.getSnapshot().context.buffering).toBe(true);

    actor.send({type: 'RESET'});
    expect(actor.getSnapshot().context.buffering).toBe(false);
  });

  it('isPersistIdle is true on start and false while persist is debouncing or flushing', () => {
    const actor = createActor(podcastPlayerMachine, {
      input: {deps: noopDeps()},
    });
    actor.start();
    expect(isPersistIdle(actor.getSnapshot())).toBe(true);

    actor.send({
      type: 'QUEUE_PERSIST',
      entry: makePlaylistEntry({
        episodeId: 'e1',
        mp3Url: 'https://x/a.mp3',
        positionMs: 100,
      }),
    });
    expect(isPersistIdle(actor.getSnapshot())).toBe(false);
  });

  it('waitFor(actor, isPersistIdle) resolves after QUEUE_PERSIST completes', async () => {
    let finishPersist!: (out: {
      kind: 'saved';
      entry: PlaylistEntry;
    }) => void;
    const persistPromise = new Promise<{
      kind: 'saved';
      entry: PlaylistEntry;
    }>(resolve => {
      finishPersist = resolve;
    });
    const persist = vi.fn().mockReturnValue(persistPromise);
    const actor = createActor(podcastPlayerMachine, {
      input: {
        deps: {
          hasR2: () => true,
          persist,
          clearRemotePlaylist: vi.fn(),
          markEpisodeListened: vi.fn(),
        },
      },
    });

    vi.useFakeTimers();
    actor.start();

    const entry = makePlaylistEntry({
      episodeId: 'e1',
      mp3Url: 'https://x/a.mp3',
      positionMs: 5000,
    });
    actor.send({type: 'QUEUE_PERSIST', entry});
    expect(isPersistIdle(actor.getSnapshot())).toBe(false);

    const done = waitFor(actor, isPersistIdle, {timeout: 20_000});

    await vi.advanceTimersByTimeAsync(500);
    expect(persist).toHaveBeenCalled();

    const saved = makePlaylistEntry({
      episodeId: 'e1',
      mp3Url: 'https://x/a.mp3',
      positionMs: 5000,
      updatedAt: 99,
    });
    finishPersist({kind: 'saved', entry: saved});

    await done;
    expect(isPersistIdle(actor.getSnapshot())).toBe(true);

    vi.useRealTimers();
  });

  it('waitFor(actor, isPersistIdle) rejects when timeout while persist is in flight', async () => {
    const persist = vi.fn().mockReturnValue(new Promise(() => {}));
    const actor = createActor(podcastPlayerMachine, {
      input: {
        deps: {
          hasR2: () => true,
          persist,
          clearRemotePlaylist: vi.fn(),
          markEpisodeListened: vi.fn(),
        },
      },
    });

    vi.useFakeTimers();
    actor.start();
    actor.send({
      type: 'QUEUE_PERSIST',
      entry: makePlaylistEntry({
        episodeId: 'e1',
        mp3Url: 'https://x/a.mp3',
        positionMs: 100,
      }),
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(persist).toHaveBeenCalled();

    const p = waitFor(actor, isPersistIdle, {timeout: 80});
    const assertRejected = expect(p).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(200);
    await assertRejected;

    vi.useRealTimers();
  });
});

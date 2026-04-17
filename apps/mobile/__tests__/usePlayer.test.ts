import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import {
  clearPlaylist,
  readPlaylistCoalesced,
  writePlaylist,
} from '../src/core/storage/eskerraStorage';
import {useVaultContext} from '../src/core/vault/VaultContext';
import {usePlayer} from '../src/features/podcasts/hooks/usePlayer';
import {getAudioPlayer} from '../src/features/podcasts/services/audioPlayer';
import {PodcastEpisode} from '../src/types';

jest.mock('../src/core/storage/eskerraStorage', () => ({
  clearPlaylist: jest.fn(),
  readPlaylistCoalesced: jest.fn(),
  writePlaylist: jest.fn(),
}));

jest.mock('../src/core/vault/VaultContext', () => ({
  useVaultContext: jest.fn(),
}));

jest.mock('../src/features/podcasts/services/audioPlayer', () => ({
  getAudioPlayer: jest.fn(),
}));

type PlayerHookSnapshot = {
  activeEpisode: PodcastEpisode | null;
  progress: {
    durationMs: number | null;
    positionMs: number;
  };
  state: string;
};

type HookHarnessProps = {
  episodesById: Map<string, PodcastEpisode>;
  onResult: (result: PlayerHookSnapshot) => void;
  podcastsCatalogReady?: boolean;
  podcastsLoading?: boolean;
};

function HookHarness({
  episodesById,
  onResult,
  podcastsCatalogReady = false,
  podcastsLoading = false,
}: HookHarnessProps) {
  const result = usePlayer(episodesById, {
    onMarkAsPlayed: async () => undefined,
    podcastsCatalogReady,
    podcastsLoading,
  });

  useEffect(() => {
    onResult({
      activeEpisode: result.activeEpisode,
      progress: result.progress,
      state: result.state,
    });
  }, [onResult, result]);

  return null;
}

type ClearSnapshotHarnessProps = {
  episodesById: Map<string, PodcastEpisode>;
  onClearReady: (
    clearNowPlayingIfMatchesEpisode: (episodeId: string) => Promise<void>,
  ) => void;
  onSnapshot: (snapshot: PlayerHookSnapshot) => void;
};

function ClearSnapshotHarness({
  episodesById,
  onClearReady,
  onSnapshot,
}: ClearSnapshotHarnessProps) {
  const result = usePlayer(episodesById, {
    onMarkAsPlayed: async () => undefined,
    podcastsCatalogReady: true,
    podcastsLoading: false,
  });

  useEffect(() => {
    onClearReady(result.clearNowPlayingIfMatchesEpisode);
  }, [onClearReady, result.clearNowPlayingIfMatchesEpisode]);

  useEffect(() => {
    onSnapshot({
      activeEpisode: result.activeEpisode,
      progress: result.progress,
      state: result.state,
    });
  }, [onSnapshot, result.activeEpisode, result.progress, result.state]);

  return null;
}

type ClearHarnessProps = {
  episodesById: Map<string, PodcastEpisode>;
  onClearReady: (
    clearNowPlayingIfMatchesEpisode: (episodeId: string) => Promise<void>,
  ) => void;
};

function ClearHarness({episodesById, onClearReady}: ClearHarnessProps) {
  const result = usePlayer(episodesById, {
    onMarkAsPlayed: async () => undefined,
    podcastsCatalogReady: true,
    podcastsLoading: false,
  });

  useEffect(() => {
    onClearReady(result.clearNowPlayingIfMatchesEpisode);
  }, [onClearReady, result.clearNowPlayingIfMatchesEpisode]);

  return null;
}

type ResyncHarnessProps = {
  episodesById: Map<string, PodcastEpisode>;
  onResyncReady: (resyncPlaylistFromDisk: () => Promise<void>) => void;
};

function ResyncHarness({episodesById, onResyncReady}: ResyncHarnessProps) {
  const result = usePlayer(episodesById, {
    onMarkAsPlayed: async () => undefined,
    podcastsCatalogReady: true,
    podcastsLoading: false,
  });

  useEffect(() => {
    onResyncReady(result.resyncPlaylistFromDisk);
  }, [onResyncReady, result.resyncPlaylistFromDisk]);

  return null;
}

type SeekHarnessProps = {
  episodesById: Map<string, PodcastEpisode>;
  onSeekTo: (seekTo: (ms: number) => Promise<void>) => void;
};

function SeekHarness({episodesById, onSeekTo}: SeekHarnessProps) {
  const result = usePlayer(episodesById, {
    onMarkAsPlayed: async () => undefined,
    podcastsCatalogReady: true,
    podcastsLoading: false,
  });

  useEffect(() => {
    onSeekTo(result.seekTo);
  }, [onSeekTo, result.seekTo]);

  return null;
}

type PlayToggleHarnessProps = {
  episodesById: Map<string, PodcastEpisode>;
  onMarkAsPlayed: (
    episode: PodcastEpisode,
    options?: {dismissNowPlaying?: boolean},
  ) => Promise<void>;
  onReady: (controls: {
    playEpisode: (e: PodcastEpisode) => Promise<void>;
    togglePlayback: () => Promise<void>;
  }) => void;
};

function PlayToggleHarness({
  episodesById,
  onMarkAsPlayed,
  onReady,
}: PlayToggleHarnessProps) {
  const result = usePlayer(episodesById, {
    onMarkAsPlayed,
    podcastsCatalogReady: true,
    podcastsLoading: false,
  });

  useEffect(() => {
    onReady({
      playEpisode: result.playEpisode,
      togglePlayback: result.togglePlayback,
    });
  }, [onReady, result.playEpisode, result.togglePlayback]);

  return null;
}

type PlayEpisodeOnlyHarnessProps = {
  episodesById: Map<string, PodcastEpisode>;
  onReady: (playEpisode: (e: PodcastEpisode) => Promise<void>) => void;
};

function PlayEpisodeOnlyHarness({episodesById, onReady}: PlayEpisodeOnlyHarnessProps) {
  const result = usePlayer(episodesById, {
    onMarkAsPlayed: async () => undefined,
    podcastsCatalogReady: true,
    podcastsLoading: false,
  });

  useEffect(() => {
    onReady(result.playEpisode);
  }, [onReady, result.playEpisode]);

  return null;
}

function flushPromises(): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(() => resolve(), 0);
  });
}

function expectResult(result: PlayerHookSnapshot | null): PlayerHookSnapshot {
  if (!result) {
    throw new Error('Expected hook result to be available.');
  }

  return result;
}

describe('usePlayer restore state', () => {
  const readPlaylistMock = readPlaylistCoalesced as jest.MockedFunction<
    typeof readPlaylistCoalesced
  >;
  const clearPlaylistMock = clearPlaylist as jest.MockedFunction<typeof clearPlaylist>;
  const writePlaylistMock = writePlaylist as jest.MockedFunction<typeof writePlaylist>;
  const useVaultContextMock = useVaultContext as jest.MockedFunction<
    typeof useVaultContext
  >;
  const getAudioPlayerMock = getAudioPlayer as jest.MockedFunction<
    typeof getAudioPlayer
  >;
  let ensureSetupMock: jest.MockedFunction<() => Promise<void>>;
  let stopMock: jest.MockedFunction<() => Promise<void>>;
  let playerReportedState: string;
  const playlistSyncGenRef = {current: 0};

  const episode: PodcastEpisode = {
    date: '2026-03-20',
    id: 'https://example.com/a.mp3',
    isListened: false,
    mp3Url: 'https://example.com/a.mp3',
    sectionTitle: 'Demo',
    seriesName: 'Series A',
    sourceFile: '2026 Demo - podcasts.md',
    title: 'Episode A',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    playlistSyncGenRef.current = 0;
    ensureSetupMock = jest.fn(async () => undefined);
    playerReportedState = 'paused';
    stopMock = jest.fn(async () => {
      playerReportedState = 'idle';
    });

    useVaultContextMock.mockImplementation(() => ({
      baseUri: 'content://vault-root',
      clearInboxContentCache: jest.fn(),
      consumeInboxPrefetch: jest.fn(() => null),
      getInboxNoteContentFromCache: () => undefined,
      isLoading: false,
      pruneInboxNoteContentFromCache: jest.fn(),
      refreshSession: jest.fn(async () => undefined),
      replaceInboxContentFromSession: jest.fn(),
      setInboxNoteContentInCache: jest.fn(),
      localSettings: {
        deviceInstanceId: 'test-device-instance',
        deviceName: '',
        displayName: '',
        playlistKnownControlRevision: null,
        playlistKnownUpdatedAtMs: null,
      },
      setLocalSettings: jest.fn(),
      settings: null,
      setSessionUri: jest.fn(async () => undefined),
      setSettings: jest.fn(),
      playlistSyncGeneration: playlistSyncGenRef.current,
      notifyPlaylistSyncAfterVaultRefresh: jest.fn(),
    }));

    writePlaylistMock.mockImplementation(async (_uri, entry) => ({
      kind: 'saved',
      entry: {...entry, updatedAt: entry.updatedAt > 0 ? entry.updatedAt : 999001},
    }));

    getAudioPlayerMock.mockReturnValue({
      addEndedListener: jest.fn(() => () => undefined),
      addBufferingListener: jest.fn(() => () => undefined),
      addProgressListener: jest.fn(() => () => undefined),
      addStateListener: jest.fn(() => () => undefined),
      destroy: jest.fn(async () => undefined),
      ensureSetup: ensureSetupMock,
      getProgress: jest.fn(async () => ({durationMs: 120_000, positionMs: 30_000})),
      getState: jest.fn(async () => playerReportedState),
      pause: jest.fn(async () => {
        playerReportedState = 'paused';
      }),
      play: jest.fn(async () => {
        playerReportedState = 'playing';
      }),
      resume: jest.fn(async () => {
        playerReportedState = 'playing';
      }),
      seekTo: jest.fn(async () => undefined),
      stop: stopMock,
    });
  });

  test('does not clear playlist before episodes are loaded and restores after map update', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 123456,
      updatedAt: 1,
    });

    let latestResult: PlayerHookSnapshot | null = null;
    const handleResult = (result: PlayerHookSnapshot) => {
      latestResult = result;
    };

    let episodesById = new Map<string, PodcastEpisode>();
    const rendererRef: {current: TestRenderer.ReactTestRenderer | null} = {
      current: null,
    };

    await act(async () => {
      rendererRef.current = TestRenderer.create(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: false,
        }),
      );
      await flushPromises();
    });

    expect(clearPlaylistMock).not.toHaveBeenCalled();
    expect(expectResult(latestResult).activeEpisode).toBeNull();

    episodesById = new Map([[episode.id, episode]]);
    const mountedRenderer = rendererRef.current;
    if (!mountedRenderer) {
      throw new Error('Expected renderer to be mounted.');
    }

    await act(async () => {
      mountedRenderer.update(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: true,
        }),
      );
      await flushPromises();
    });

    const restoredResult = expectResult(latestResult);
    expect(restoredResult.activeEpisode).toEqual(episode);
    expect(restoredResult.progress).toEqual({
      durationMs: 900000,
      positionMs: 123456,
    });
    expect(restoredResult.state).toBe('paused');
    // Cold restore + initial remote-sync effect each read coalesced playlist once.
    expect(readPlaylistMock).toHaveBeenCalledTimes(2);
    expect(ensureSetupMock).toHaveBeenCalledTimes(2);
  });

  test('restore sends HYDRATE before ensureSetup promise settles', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 123456,
      updatedAt: 1,
    });

    let releaseSetup: (() => void) | undefined;
    const setupBarrier = new Promise<void>(resolve => {
      releaseSetup = resolve;
    });
    ensureSetupMock.mockImplementation(() => setupBarrier);

    let latestResult: PlayerHookSnapshot | null = null;
    const handleResult = (result: PlayerHookSnapshot) => {
      latestResult = result;
    };

    const episodesById = new Map([[episode.id, episode]]);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: true,
          podcastsLoading: false,
        }),
      );
      await flushPromises();
    });

    expect(ensureSetupMock).toHaveBeenCalled();
    expect(expectResult(latestResult).activeEpisode).toEqual(episode);

    await act(async () => {
      releaseSetup?.();
      await flushPromises();
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  test('reads playlist once even when episodes map updates multiple times', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 123456,
      updatedAt: 1,
    });

    let latestResult: PlayerHookSnapshot | null = null;
    const handleResult = (result: PlayerHookSnapshot) => {
      latestResult = result;
    };

    let episodesById = new Map<string, PodcastEpisode>();
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: false,
        }),
      );
      await flushPromises();
    });

    episodesById = new Map([[episode.id, episode]]);
    await act(async () => {
      renderer?.update(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: true,
        }),
      );
      await flushPromises();
    });

    const enrichedEpisode: PodcastEpisode = {
      ...episode,
      rssFeedUrl: 'https://feed.example.com/rss.xml',
    };
    episodesById = new Map([[episode.id, enrichedEpisode]]);
    await act(async () => {
      renderer?.update(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: true,
        }),
      );
      await flushPromises();
    });

    expect(readPlaylistMock).toHaveBeenCalledTimes(2);
    expect(ensureSetupMock).toHaveBeenCalledTimes(2);
    expect(expectResult(latestResult).activeEpisode).toEqual(enrichedEpisode);
    await act(async () => {
      renderer?.unmount();
    });
  });

  test('clears stale playlist when catalog is ready and episode is missing', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: 'orphan-id',
      mp3Url: 'https://example.com/orphan.mp3',
      positionMs: 1000,
      updatedAt: 1,
    });

    let latestResult: PlayerHookSnapshot | null = null;
    const handleResult = (result: PlayerHookSnapshot) => {
      latestResult = result;
    };

    const episodesById = new Map<string, PodcastEpisode>();

    await act(async () => {
      TestRenderer.create(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: true,
          podcastsLoading: false,
        }),
      );
      await flushPromises();
    });

    expect(clearPlaylistMock).toHaveBeenCalled();
    expect(stopMock).toHaveBeenCalled();
    expect(expectResult(latestResult).activeEpisode).toBeNull();
  });

  test('playEpisode does not call player.play when audio is already playing', async () => {
    const playMock = jest.fn(async () => undefined);
    const getStateMock = jest
      .fn()
      .mockResolvedValueOnce('paused' as const)
      .mockResolvedValue('playing' as const);

    getAudioPlayerMock.mockReturnValue({
      addEndedListener: jest.fn(() => () => undefined),
      addBufferingListener: jest.fn(() => () => undefined),
      addProgressListener: jest.fn(() => () => undefined),
      addStateListener: jest.fn(() => () => undefined),
      destroy: jest.fn(async () => undefined),
      ensureSetup: ensureSetupMock,
      getProgress: jest.fn(async () => ({durationMs: 120_000, positionMs: 30_000})),
      getState: getStateMock,
      pause: jest.fn(async () => undefined),
      play: playMock,
      resume: jest.fn(async () => undefined),
      seekTo: jest.fn(async () => undefined),
      stop: stopMock,
    });

    readPlaylistMock.mockResolvedValue(null);

    const episodesById = new Map([[episode.id, episode]]);
    let playEpisodeRef: ((e: PodcastEpisode) => Promise<void>) | null = null;

    await act(async () => {
      TestRenderer.create(
        React.createElement(PlayEpisodeOnlyHarness, {
          episodesById,
          onReady: fn => {
            playEpisodeRef = fn;
          },
        }),
      );
      await flushPromises();
    });

    if (!playEpisodeRef) {
      throw new Error('playEpisode not wired.');
    }

    await act(async () => {
      await playEpisodeRef!(episode);
    });

    expect(getStateMock).toHaveBeenCalled();
    expect(playMock).toHaveBeenCalledTimes(1);
    playMock.mockClear();

    await act(async () => {
      await playEpisodeRef!(episode);
      await flushPromises();
    });

    expect(playMock).not.toHaveBeenCalled();
  });

  test('playEpisode sets state from getState after play (e.g. loading while buffering)', async () => {
    const playMock = jest.fn(async () => undefined);
    const getStateMock = jest
      .fn()
      .mockResolvedValueOnce('paused')
      .mockResolvedValue('loading');

    getAudioPlayerMock.mockReturnValue({
      addEndedListener: jest.fn(() => () => undefined),
      addBufferingListener: jest.fn(() => () => undefined),
      addProgressListener: jest.fn(() => () => undefined),
      addStateListener: jest.fn(() => () => undefined),
      destroy: jest.fn(async () => undefined),
      ensureSetup: ensureSetupMock,
      getProgress: jest.fn(async () => ({durationMs: 120_000, positionMs: 30_000})),
      getState: getStateMock,
      pause: jest.fn(async () => undefined),
      play: playMock,
      resume: jest.fn(async () => undefined),
      seekTo: jest.fn(async () => undefined),
      stop: stopMock,
    });

    readPlaylistMock.mockResolvedValue(null);

    const episodesById = new Map([[episode.id, episode]]);
    let playEpisodeRef: ((e: PodcastEpisode) => Promise<void>) | null = null;
    let getHookState: (() => string) | null = null;

    function PlayStateHarness() {
      const result = usePlayer(episodesById, {
        onMarkAsPlayed: async () => undefined,
        podcastsCatalogReady: true,
        podcastsLoading: false,
      });

      useEffect(() => {
        playEpisodeRef = result.playEpisode;
        getHookState = () => result.state;
      });

      return null;
    }

    await act(async () => {
      TestRenderer.create(React.createElement(PlayStateHarness));
      await flushPromises();
    });

    if (!playEpisodeRef || !getHookState) {
      throw new Error('harness not ready.');
    }

    await act(async () => {
      await playEpisodeRef!(episode);
      await flushPromises();
    });

    expect(playMock).toHaveBeenCalled();
    expect(getHookState!()).toBe('loading');
  });

  test('near-end progress marks played without dismiss while playback continues', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 120_000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 60_000,
    });

    const episodesById = new Map([[episode.id, episode]]);
    const onMarkAsPlayed = jest.fn(async () => undefined);
    let progressCb: ((p: {durationMs: number | null; positionMs: number}) => void) | null =
      null;
    let stateListener: ((s: 'playing' | 'paused' | 'loading' | 'idle' | 'ended' | 'error') => void) | null =
      null;

    getAudioPlayerMock.mockReturnValue({
      addEndedListener: jest.fn(() => () => undefined),
      addBufferingListener: jest.fn(() => () => undefined),
      addProgressListener: jest.fn(cb => {
        progressCb = cb;
        return () => {
          progressCb = null;
        };
      }),
      addStateListener: jest.fn(cb => {
        stateListener = cb;
        return () => {
          stateListener = null;
        };
      }),
      destroy: jest.fn(async () => undefined),
      ensureSetup: ensureSetupMock,
      getProgress: jest.fn(async () => ({durationMs: 120_000, positionMs: 115_000})),
      getState: jest.fn(async () => 'playing'),
      pause: jest.fn(async () => undefined),
      play: jest.fn(async () => {
        stateListener?.('playing');
      }),
      resume: jest.fn(async () => undefined),
      seekTo: jest.fn(async () => undefined),
      stop: stopMock,
    });

    let controls: {
      playEpisode: (e: PodcastEpisode) => Promise<void>;
      togglePlayback: () => Promise<void>;
    } | null = null;

    await act(async () => {
      TestRenderer.create(
        React.createElement(PlayToggleHarness, {
          episodesById,
          onMarkAsPlayed,
          onReady: c => {
            controls = c;
          },
        }),
      );
      await flushPromises();
    });

    if (!controls) {
      throw new Error('controls not ready.');
    }

    await act(async () => {
      await controls!.playEpisode(episode);
      await flushPromises();
    });

    clearPlaylistMock.mockClear();
    writePlaylistMock.mockClear();

    await act(async () => {
      progressCb?.({durationMs: 120_000, positionMs: 115_000});
      await flushPromises();
    });

    expect(onMarkAsPlayed).toHaveBeenCalledTimes(1);
    expect(onMarkAsPlayed).toHaveBeenCalledWith(episode, {dismissNowPlaying: false});
    expect(clearPlaylistMock).toHaveBeenCalledWith('content://vault-root');
  });

  test('clears disk-backed playlist when saved episode is listened but still in catalog', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 1000,
      updatedAt: 1,
    });

    const listenedEpisode = {...episode, isListened: true};
    const episodesById = new Map([[episode.id, listenedEpisode]]);

    let latestResult: PlayerHookSnapshot | null = null;
    const handleResult = (result: PlayerHookSnapshot) => {
      latestResult = result;
    };

    await act(async () => {
      TestRenderer.create(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: true,
          podcastsLoading: false,
        }),
      );
      await flushPromises();
    });

    expect(clearPlaylistMock).toHaveBeenCalled();
    expect(stopMock).toHaveBeenCalled();
    expect(expectResult(latestResult).activeEpisode).toBeNull();
  });

  test('seekTo does not call writePlaylist without R2 playlist sync', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 120_000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 0,
      updatedAt: 1,
    });

    const episodesById = new Map([[episode.id, episode]]);
    let seekToRef: ((ms: number) => Promise<void>) | null = null;

    await act(async () => {
      TestRenderer.create(
        React.createElement(SeekHarness, {
          episodesById,
          onSeekTo: fn => {
            seekToRef = fn;
          },
        }),
      );
      await flushPromises();
    });

    if (!seekToRef) {
      throw new Error('seekTo not wired.');
    }

    await act(async () => {
      await seekToRef!(45_000);
    });

    expect(writePlaylistMock).not.toHaveBeenCalled();
  });

  test('clearNowPlayingIfMatchesEpisode stops playback and clears playlist when id matches', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 123456,
      updatedAt: 1,
    });

    const episodesById = new Map([[episode.id, episode]]);
    let clearFn: ((episodeId: string) => Promise<void>) | null = null;
    let latestResult: PlayerHookSnapshot | null = null;

    await act(async () => {
      TestRenderer.create(
        React.createElement(ClearSnapshotHarness, {
          episodesById,
          onClearReady: fn => {
            clearFn = fn;
          },
          onSnapshot: snapshot => {
            latestResult = snapshot;
          },
        }),
      );
      await flushPromises();
    });

    if (!clearFn) {
      throw new Error('clearNowPlayingIfMatchesEpisode not wired.');
    }

    expect(expectResult(latestResult).activeEpisode).toEqual(episode);

    await act(async () => {
      await clearFn!(episode.id);
    });

    expect(stopMock).toHaveBeenCalled();
    expect(clearPlaylistMock).toHaveBeenCalledWith('content://vault-root');
    expect(expectResult(latestResult).activeEpisode).toBeNull();
  });

  test('clearNowPlayingIfMatchesEpisode no-ops when id does not match playlist or active', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 123456,
      updatedAt: 1,
    });

    const episodesById = new Map([[episode.id, episode]]);
    let clearFn: ((episodeId: string) => Promise<void>) | null = null;

    await act(async () => {
      TestRenderer.create(
        React.createElement(ClearHarness, {
          episodesById,
          onClearReady: fn => {
            clearFn = fn;
          },
        }),
      );
      await flushPromises();
    });

    if (!clearFn) {
      throw new Error('clearNowPlayingIfMatchesEpisode not wired.');
    }

    clearPlaylistMock.mockClear();
    stopMock.mockClear();

    await act(async () => {
      await clearFn!('https://other.example/episode.mp3');
    });

    expect(stopMock).not.toHaveBeenCalled();
    expect(clearPlaylistMock).not.toHaveBeenCalled();
  });

  test('resyncPlaylistFromDisk reads playlist from storage again', async () => {
    readPlaylistMock.mockResolvedValueOnce({
      durationMs: 120_000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 0,
      updatedAt: 1,
    });

    const episodesById = new Map([[episode.id, episode]]);
    let resyncFn: (() => Promise<void>) | null = null;

    await act(async () => {
      TestRenderer.create(
        React.createElement(ResyncHarness, {
          episodesById,
          onResyncReady: fn => {
            resyncFn = fn;
          },
        }),
      );
      await flushPromises();
    });

    readPlaylistMock.mockResolvedValueOnce({
      durationMs: 200_000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 50_000,
      updatedAt: 2,
    });

    if (!resyncFn) {
      throw new Error('resyncPlaylistFromDisk not wired.');
    }

    await act(async () => {
      await resyncFn!();
      await flushPromises();
    });

    expect(readPlaylistMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(ensureSetupMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('playlistSyncGeneration bump clears hydrated episode when coalesced read returns null', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 123456,
      updatedAt: 1,
    });

    let latestResult: PlayerHookSnapshot | null = null;
    const handleResult = (result: PlayerHookSnapshot) => {
      latestResult = result;
    };

    const episodesById = new Map([[episode.id, episode]]);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: true,
          podcastsLoading: false,
        }),
      );
      await flushPromises();
    });

    expect(expectResult(latestResult).activeEpisode).toEqual(episode);
    const readsAfterHydrate = readPlaylistMock.mock.calls.length;

    readPlaylistMock.mockResolvedValue(null);
    playlistSyncGenRef.current = 1;
    await act(async () => {
      renderer?.update(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: true,
          podcastsLoading: false,
        }),
      );
      await flushPromises();
    });

    expect(readPlaylistMock.mock.calls.length).toBeGreaterThan(readsAfterHydrate);
    expect(expectResult(latestResult).activeEpisode).toBeNull();
    await act(async () => {
      renderer?.unmount();
    });
  });

  test('playlistSyncGeneration bump with null playlist does not reset while in near end zone', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 120_000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 60_000,
      updatedAt: 1,
    });

    const episodesById = new Map([[episode.id, episode]]);
    const onMarkAsPlayed = jest.fn(async () => undefined);
    let progressCb: ((p: {durationMs: number | null; positionMs: number}) => void) | null =
      null;
    let stateListener: ((s: 'playing' | 'paused' | 'loading' | 'idle' | 'ended' | 'error') => void) | null =
      null;

    getAudioPlayerMock.mockReturnValue({
      addEndedListener: jest.fn(() => () => undefined),
      addBufferingListener: jest.fn(() => () => undefined),
      addProgressListener: jest.fn(cb => {
        progressCb = cb;
        return () => {
          progressCb = null;
        };
      }),
      addStateListener: jest.fn(cb => {
        stateListener = cb;
        return () => {
          stateListener = null;
        };
      }),
      destroy: jest.fn(async () => undefined),
      ensureSetup: ensureSetupMock,
      getProgress: jest.fn(async () => ({durationMs: 120_000, positionMs: 115_000})),
      getState: jest.fn(async () => 'playing'),
      pause: jest.fn(async () => undefined),
      play: jest.fn(async () => {
        stateListener?.('playing');
      }),
      resume: jest.fn(async () => undefined),
      seekTo: jest.fn(async () => undefined),
      stop: stopMock,
    });

    let latestResult: PlayerHookSnapshot | null = null;
    const handleResult = (result: PlayerHookSnapshot) => {
      latestResult = result;
    };
    let controls: {
      playEpisode: (e: PodcastEpisode) => Promise<void>;
    } | null = null;

    let renderer: TestRenderer.ReactTestRenderer | null = null;

    function NearEndSyncHarness() {
      const result = usePlayer(episodesById, {
        onMarkAsPlayed,
        podcastsCatalogReady: true,
        podcastsLoading: false,
      });

      useEffect(() => {
        handleResult({
          activeEpisode: result.activeEpisode,
          progress: result.progress,
          state: result.state,
        });
      }, [result.activeEpisode, result.progress, result.state]);

      useEffect(() => {
        controls = {playEpisode: result.playEpisode};
      }, [result.playEpisode]);

      return null;
    }

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(NearEndSyncHarness));
      await flushPromises();
    });

    if (!controls) {
      throw new Error('controls not ready.');
    }

    await act(async () => {
      await controls.playEpisode(episode);
      await flushPromises();
    });

    await act(async () => {
      progressCb?.({durationMs: 120_000, positionMs: 115_000});
      await flushPromises();
    });

    expect(onMarkAsPlayed).toHaveBeenCalled();

    readPlaylistMock.mockResolvedValue(null);
    playlistSyncGenRef.current = 1;
    await act(async () => {
      renderer?.update(React.createElement(NearEndSyncHarness));
      await flushPromises();
    });

    expect(expectResult(latestResult).activeEpisode).toEqual(episode);

    await act(async () => {
      renderer?.unmount();
    });
  });

  test('playlistSyncGeneration bump while native playing skips sync so episode stays', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 120_000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 0,
      updatedAt: 1,
    });

    const episodesById = new Map([[episode.id, episode]]);
    let stateListener: ((s: 'playing' | 'paused' | 'loading' | 'idle' | 'ended' | 'error') => void) | null =
      null;

    getAudioPlayerMock.mockReturnValue({
      addEndedListener: jest.fn(() => () => undefined),
      addBufferingListener: jest.fn(() => () => undefined),
      addProgressListener: jest.fn(() => () => undefined),
      addStateListener: jest.fn(cb => {
        stateListener = cb;
        return () => {
          stateListener = null;
        };
      }),
      destroy: jest.fn(async () => undefined),
      ensureSetup: ensureSetupMock,
      getProgress: jest.fn(async () => ({durationMs: 120_000, positionMs: 0})),
      getState: jest.fn(async () => 'paused'),
      pause: jest.fn(async () => undefined),
      play: jest.fn(async () => {
        stateListener?.('playing');
      }),
      resume: jest.fn(async () => undefined),
      seekTo: jest.fn(async () => undefined),
      stop: stopMock,
    });

    let latestResult: PlayerHookSnapshot | null = null;
    const handleResult = (result: PlayerHookSnapshot) => {
      latestResult = result;
    };
    let playEpisodeRef: ((e: PodcastEpisode) => Promise<void>) | null = null;

    function PlayingSyncHarness() {
      const result = usePlayer(episodesById, {
        onMarkAsPlayed: async () => undefined,
        podcastsCatalogReady: true,
        podcastsLoading: false,
      });

      useEffect(() => {
        handleResult({
          activeEpisode: result.activeEpisode,
          progress: result.progress,
          state: result.state,
        });
      }, [result.activeEpisode, result.progress, result.state]);

      useEffect(() => {
        playEpisodeRef = result.playEpisode;
      }, [result.playEpisode]);

      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(PlayingSyncHarness));
      await flushPromises();
    });

    await act(async () => {
      await playEpisodeRef!(episode);
      await flushPromises();
    });

    expect(expectResult(latestResult).state).toBe('playing');

    const readsBeforeBump = readPlaylistMock.mock.calls.length;
    readPlaylistMock.mockResolvedValue(null);
    playlistSyncGenRef.current = 1;
    await act(async () => {
      renderer?.update(React.createElement(PlayingSyncHarness));
      await flushPromises();
    });

    expect(readPlaylistMock.mock.calls.length).toBe(readsBeforeBump);
    expect(expectResult(latestResult).activeEpisode).toEqual(episode);

    await act(async () => {
      renderer?.unmount();
    });
  });

  test('playlistSyncGeneration bump with same remote entry keeps active episode and updates progress', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 111,
      updatedAt: 1,
    });

    let latestResult: PlayerHookSnapshot | null = null;
    const handleResult = (result: PlayerHookSnapshot) => {
      latestResult = result;
    };

    const episodesById = new Map([[episode.id, episode]]);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: true,
          podcastsLoading: false,
        }),
      );
      await flushPromises();
    });

    expect(expectResult(latestResult).progress.positionMs).toBe(111);

    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 222222,
      updatedAt: 2,
    });
    playlistSyncGenRef.current = 1;
    await act(async () => {
      renderer?.update(
        React.createElement(HookHarness, {
          episodesById,
          onResult: handleResult,
          podcastsCatalogReady: true,
          podcastsLoading: false,
        }),
      );
      await flushPromises();
    });

    expect(expectResult(latestResult).activeEpisode).toEqual(episode);
    expect(expectResult(latestResult).progress.positionMs).toBe(222222);
    await act(async () => {
      renderer?.unmount();
    });
  });
});

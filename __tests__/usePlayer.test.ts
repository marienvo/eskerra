import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import {usePlayer} from '../src/features/podcasts/hooks/usePlayer';
import {
  clearPlaylist,
  readPlaylistCoalesced,
} from '../src/core/storage/noteboxStorage';
import {useVaultContext} from '../src/core/vault/VaultContext';
import {getAudioPlayer} from '../src/features/podcasts/services/audioPlayer';
import {PodcastEpisode} from '../src/types';

jest.mock('../src/core/storage/noteboxStorage', () => ({
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
};

function HookHarness({episodesById, onResult}: HookHarnessProps) {
  const result = usePlayer(episodesById, {
    onMarkAsPlayed: async () => undefined,
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
  const useVaultContextMock = useVaultContext as jest.MockedFunction<
    typeof useVaultContext
  >;
  const getAudioPlayerMock = getAudioPlayer as jest.MockedFunction<
    typeof getAudioPlayer
  >;
  let ensureSetupMock: jest.MockedFunction<() => Promise<void>>;

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
    ensureSetupMock = jest.fn(async () => undefined);

    useVaultContextMock.mockReturnValue({
      baseUri: 'content://vault-root',
      consumeInboxPrefetch: jest.fn(() => null),
      isLoading: false,
      refreshSession: jest.fn(async () => undefined),
      settings: null,
      setSessionUri: jest.fn(async () => undefined),
      setSettings: jest.fn(),
    });

    getAudioPlayerMock.mockReturnValue({
      addEndedListener: jest.fn(() => () => undefined),
      addProgressListener: jest.fn(() => () => undefined),
      addStateListener: jest.fn(() => () => undefined),
      destroy: jest.fn(async () => undefined),
      ensureSetup: ensureSetupMock,
      getProgress: jest.fn(async () => ({durationMs: null, positionMs: 0})),
      getState: jest.fn(async () => 'idle'),
      pause: jest.fn(async () => undefined),
      play: jest.fn(async () => undefined),
      resume: jest.fn(async () => undefined),
      seekTo: jest.fn(async () => undefined),
    });
  });

  test('does not clear playlist before episodes are loaded and restores after map update', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 123456,
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
    expect(readPlaylistMock).toHaveBeenCalledTimes(1);
    expect(ensureSetupMock).toHaveBeenCalledTimes(1);
  });

  test('reads playlist once even when episodes map updates multiple times', async () => {
    readPlaylistMock.mockResolvedValue({
      durationMs: 900000,
      episodeId: episode.id,
      mp3Url: episode.mp3Url,
      positionMs: 123456,
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
        }),
      );
      await flushPromises();
    });

    expect(readPlaylistMock).toHaveBeenCalledTimes(1);
    expect(ensureSetupMock).toHaveBeenCalledTimes(1);
    expect(expectResult(latestResult).activeEpisode).toEqual(enrichedEpisode);
    await act(async () => {
      renderer?.unmount();
    });
  });
});

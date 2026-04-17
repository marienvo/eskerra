jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    setupPlayer: jest.fn(() => Promise.resolve()),
    updateOptions: jest.fn(() => Promise.resolve()),
    reset: jest.fn(() => Promise.resolve()),
    add: jest.fn(() => Promise.resolve()),
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(() => Promise.resolve()),
    seekTo: jest.fn(() => Promise.resolve()),
    getProgress: jest.fn(() => Promise.resolve({position: 0, duration: 0})),
    getPlaybackState: jest.fn(() => Promise.resolve({state: 'paused'})),
    addEventListener: jest.fn(() => ({remove: jest.fn()})),
  },
  Capability: {
    Play: 'play',
    Pause: 'pause',
    SeekTo: 'seek',
    Stop: 'stop',
  },
  Event: {
    PlaybackProgressUpdated: 'progress',
    PlaybackState: 'state',
    PlaybackQueueEnded: 'ended',
  },
  State: {
    None: 'none',
    Ready: 'ready',
    Playing: 'playing',
    Paused: 'paused',
    Stopped: 'stopped',
    Buffering: 'buffering',
    Loading: 'loading',
    Ended: 'ended',
    Error: 'error',
  },
}));

import TrackPlayer from 'react-native-track-player';

import {TrackPlayerAdapter} from '../src/features/podcasts/services/trackPlayerAdapter';

describe('TrackPlayerAdapter.ensureSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (TrackPlayer.setupPlayer as jest.Mock).mockResolvedValue(undefined);
    (TrackPlayer.updateOptions as jest.Mock).mockResolvedValue(undefined);
  });

  test('calls setupPlayer at most once when ensureSetup is invoked in parallel', async () => {
    let resolveSetup!: () => void;
    const deferred = new Promise<void>(resolve => {
      resolveSetup = resolve;
    });
    (TrackPlayer.setupPlayer as jest.Mock).mockImplementation(() => deferred);

    const adapter = new TrackPlayerAdapter();
    const outcomes = Promise.all([
      adapter.ensureSetup(),
      adapter.ensureSetup(),
      adapter.ensureSetup(),
      adapter.ensureSetup(),
      adapter.ensureSetup(),
    ]);

    expect(TrackPlayer.setupPlayer).toHaveBeenCalledTimes(1);
    resolveSetup();
    await outcomes;

    expect(TrackPlayer.updateOptions).toHaveBeenCalledTimes(1);
  });

  test('absorbs already-initialized error from setupPlayer and still calls updateOptions', async () => {
    (TrackPlayer.setupPlayer as jest.Mock).mockRejectedValueOnce(
      new Error('The player had already been initialized via setupPlayer'),
    );

    const adapter = new TrackPlayerAdapter();
    await adapter.ensureSetup();

    expect(TrackPlayer.updateOptions).toHaveBeenCalledTimes(1);

    await adapter.ensureSetup();
    expect(TrackPlayer.setupPlayer).toHaveBeenCalledTimes(1);
  });

  test('propagates other setupPlayer errors and allows retry on next ensureSetup', async () => {
    (TrackPlayer.setupPlayer as jest.Mock)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(undefined);

    const adapter = new TrackPlayerAdapter();
    await expect(adapter.ensureSetup()).rejects.toThrow('network down');

    await adapter.ensureSetup();

    expect(TrackPlayer.setupPlayer).toHaveBeenCalledTimes(2);
    expect(TrackPlayer.updateOptions).toHaveBeenCalledTimes(1);
  });
});

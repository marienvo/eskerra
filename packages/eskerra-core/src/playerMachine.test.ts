import {describe, expect, it, vi} from 'vitest';
import {createActor} from 'xstate';

import {NEAR_END_WINDOW_MS} from './playlist';
import {podcastPlayerMachine} from './playerMachine';

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
});

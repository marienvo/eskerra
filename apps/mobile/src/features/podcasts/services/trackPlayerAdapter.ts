import {
  Capability,
  Event,
  State,
  type PlaybackState,
} from 'react-native-track-player';
import TrackPlayer from 'react-native-track-player';

import type {
  AudioPlayer,
  AudioTrack,
  PlayerProgress,
  PlayerState,
  Unsubscribe,
} from '@eskerra/core';

function toMilliseconds(seconds: number | undefined): number {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
    return 0;
  }

  return Math.max(0, Math.round(seconds * 1000));
}

function toSeconds(milliseconds: number): number {
  return Math.max(0, milliseconds) / 1000;
}

function isAlreadyInitializedError(error: unknown): boolean {
  let message = '';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }
  return /already.*initialized/i.test(message);
}

function mapPlaybackState(playbackState: PlaybackState): PlayerState {
  switch (playbackState.state) {
    case State.Loading:
    case State.Buffering:
      return 'loading';
    case State.Playing:
      return 'playing';
    case State.Paused:
    case State.Ready:
    case State.Stopped:
      return 'paused';
    case State.Ended:
      return 'ended';
    case State.Error:
      return 'error';
    case State.None:
    default:
      return 'idle';
  }
}

export class TrackPlayerAdapter implements AudioPlayer {
  private isSetup = false;
  private setupPromise: Promise<void> | null = null;

  public async ensureSetup(): Promise<void> {
    if (this.isSetup) {
      return;
    }

    if (this.setupPromise) {
      await this.setupPromise;
      return;
    }

    this.setupPromise = this.runEnsureSetupChain().finally(() => {
      this.setupPromise = null;
    });

    await this.setupPromise;
  }

  private async runEnsureSetupChain(): Promise<void> {
    try {
      try {
        await TrackPlayer.setupPlayer();
      } catch (error) {
        if (!isAlreadyInitializedError(error)) {
          throw error;
        }
      }

      await TrackPlayer.updateOptions({
        capabilities: [Capability.Play, Capability.Pause, Capability.SeekTo, Capability.Stop],
        notificationCapabilities: [Capability.Play, Capability.Pause, Capability.SeekTo, Capability.Stop],
        progressUpdateEventInterval: 1,
      });
      this.isSetup = true;
    } catch (error) {
      this.isSetup = false;
      throw error;
    }
  }

  public async play(track: AudioTrack, positionMs = 0): Promise<void> {
    await this.ensureSetup();
    await TrackPlayer.reset();
    await TrackPlayer.add({
      artist: track.artist,
      artwork: track.artwork,
      id: track.id,
      title: track.title,
      url: track.url,
    });

    if (positionMs > 0) {
      await TrackPlayer.seekTo(toSeconds(positionMs));
    }

    await TrackPlayer.play();
  }

  public async pause(): Promise<void> {
    await this.ensureSetup();
    await TrackPlayer.pause();
  }

  public async resume(): Promise<void> {
    await this.ensureSetup();
    await TrackPlayer.play();
  }

  public async seekTo(positionMs: number): Promise<void> {
    await this.ensureSetup();
    await TrackPlayer.seekTo(toSeconds(positionMs));
  }

  public async stop(): Promise<void> {
    await this.ensureSetup();
    await TrackPlayer.reset();
  }

  public async getProgress(): Promise<PlayerProgress> {
    await this.ensureSetup();
    const progress = await TrackPlayer.getProgress();

    return {
      durationMs:
        typeof progress.duration === 'number'
          ? toMilliseconds(progress.duration)
          : null,
      positionMs: toMilliseconds(progress.position),
    };
  }

  public async getState(): Promise<PlayerState> {
    await this.ensureSetup();
    const state = await TrackPlayer.getPlaybackState();
    return mapPlaybackState(state);
  }

  public addBufferingListener(_callback: (buffering: boolean) => void): Unsubscribe {
    return () => {
      // Desktop-only: HtmlAudioPlayer drives buffering; mobile uses native loading state.
    };
  }

  public addProgressListener(
    callback: (progress: PlayerProgress) => void,
  ): Unsubscribe {
    const subscription = TrackPlayer.addEventListener(
      Event.PlaybackProgressUpdated,
      progressEvent => {
        callback({
          durationMs:
            typeof progressEvent.duration === 'number'
              ? toMilliseconds(progressEvent.duration)
              : null,
          positionMs: toMilliseconds(progressEvent.position),
        });
      },
    );

    return () => {
      subscription.remove();
    };
  }

  public addStateListener(callback: (state: PlayerState) => void): Unsubscribe {
    const subscription = TrackPlayer.addEventListener(Event.PlaybackState, event => {
      callback(mapPlaybackState(event));
    });

    return () => {
      subscription.remove();
    };
  }

  public addEndedListener(callback: () => void): Unsubscribe {
    const subscription = TrackPlayer.addEventListener(
      Event.PlaybackQueueEnded,
      () => {
        callback();
      },
    );

    return () => {
      subscription.remove();
    };
  }

  public async destroy(): Promise<void> {
    if (this.setupPromise) {
      try {
        await this.setupPromise;
      } catch {
        // Ignore failed or racing setup so teardown can continue.
      }
    }
    this.setupPromise = null;

    if (!this.isSetup) {
      return;
    }

    await TrackPlayer.reset();
    this.isSetup = false;
  }
}

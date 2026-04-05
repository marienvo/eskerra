import type {AudioPlayer} from '@eskerra/core';

export type {
  AudioPlayer,
  AudioTrack,
  PlayerProgress,
  PlayerState,
  Unsubscribe,
} from '@eskerra/core';

import {TrackPlayerAdapter} from './trackPlayerAdapter';

let audioPlayerInstance: AudioPlayer | null = null;

export function getAudioPlayer(): AudioPlayer {
  if (!audioPlayerInstance) {
    audioPlayerInstance = new TrackPlayerAdapter();
  }

  return audioPlayerInstance;
}

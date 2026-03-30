import type {AudioPlayer} from '@notebox/core';

export type {
  AudioPlayer,
  AudioTrack,
  PlayerProgress,
  PlayerState,
  Unsubscribe,
} from '@notebox/core';

import {TrackPlayerAdapter} from './trackPlayerAdapter';

let audioPlayerInstance: AudioPlayer | null = null;

export function getAudioPlayer(): AudioPlayer {
  if (!audioPlayerInstance) {
    audioPlayerInstance = new TrackPlayerAdapter();
  }

  return audioPlayerInstance;
}

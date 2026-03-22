import {TrackPlayerAdapter} from './trackPlayerAdapter';

export type PlayerState = 'ended' | 'error' | 'idle' | 'loading' | 'paused' | 'playing';

export type AudioTrack = {
  artist: string;
  artwork?: string;
  id: string;
  title: string;
  url: string;
};

export type PlayerProgress = {
  durationMs: number | null;
  positionMs: number;
};

export type Unsubscribe = () => void;

export interface AudioPlayer {
  addEndedListener(callback: () => void): Unsubscribe;
  addProgressListener(callback: (progress: PlayerProgress) => void): Unsubscribe;
  addStateListener(callback: (state: PlayerState) => void): Unsubscribe;
  destroy(): Promise<void>;
  ensureSetup(): Promise<void>;
  getProgress(): Promise<PlayerProgress>;
  getState(): Promise<PlayerState>;
  pause(): Promise<void>;
  play(track: AudioTrack, positionMs?: number): Promise<void>;
  resume(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
}

let audioPlayerInstance: AudioPlayer | null = null;

export function getAudioPlayer(): AudioPlayer {
  if (!audioPlayerInstance) {
    audioPlayerInstance = new TrackPlayerAdapter();
  }

  return audioPlayerInstance;
}

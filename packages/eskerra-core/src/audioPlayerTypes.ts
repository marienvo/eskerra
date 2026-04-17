export type PlayerState =
  | 'ended'
  | 'error'
  | 'idle'
  | 'loading'
  | 'paused'
  | 'playing';

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
  addBufferingListener(callback: (buffering: boolean) => void): Unsubscribe;
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
  /** Clears the current queue (stops playback). */
  stop(): Promise<void>;
}

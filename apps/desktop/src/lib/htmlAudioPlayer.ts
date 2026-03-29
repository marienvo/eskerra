import {invoke} from '@tauri-apps/api/core';
import type {
  AudioPlayer,
  AudioTrack,
  PlayerProgress,
  PlayerState,
  Unsubscribe,
} from '@notebox/core';

function clampMs(n: number): number {
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.floor(n);
}

function mapAudioPaused(audio: HTMLAudioElement, ended: boolean): PlayerState {
  if (ended) {
    return 'ended';
  }
  if (audio.error) {
    return 'error';
  }
  if (!audio.src) {
    return 'idle';
  }
  if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
    return 'loading';
  }
  return audio.paused ? 'paused' : 'playing';
}

async function syncMprisMetadata(
  track: AudioTrack,
  durationMs: number,
  positionMs: number,
  playing: boolean,
): Promise<void> {
  try {
    const dur = Math.max(durationMs, 1);
    await invoke('media_set_metadata', {
      title: track.title,
      artist: track.artist,
      coverUrl: track.artwork ?? null,
      durationMs: dur,
    });
    await invoke('media_set_playback', {playing, positionMs: clampMs(positionMs)});
  } catch {
    // MPRIS may be unavailable outside Linux sessions; ignore.
  }
}

export class HtmlAudioPlayer implements AudioPlayer {
  private readonly audio = new Audio();
  private endedFlag = false;
  private progressListeners = new Set<(p: PlayerProgress) => void>();
  private stateListeners = new Set<(s: PlayerState) => void>();
  private endedListeners = new Set<() => void>();
  private currentTrack: AudioTrack | null = null;
  private lastProgressEmit = 0;

  constructor() {
    const emitProgress = () => {
      const now = Date.now();
      if (now - this.lastProgressEmit < 800) {
        return;
      }
      this.lastProgressEmit = now;
      const durationMs = Number.isFinite(this.audio.duration)
        ? clampMs(this.audio.duration * 1000)
        : null;
      const positionMs = clampMs(this.audio.currentTime * 1000);
      const progress: PlayerProgress = {durationMs, positionMs};
      for (const cb of this.progressListeners) {
        cb(progress);
      }
      void invoke('media_set_playback', {
        playing: !this.audio.paused,
        positionMs,
      }).catch(() => undefined);
    };

    this.audio.addEventListener('timeupdate', emitProgress);
    this.audio.addEventListener('loadedmetadata', () => {
      if (!this.currentTrack) {
        return;
      }
      const durationMs = clampMs(this.audio.duration * 1000);
      void syncMprisMetadata(
        this.currentTrack,
        durationMs,
        clampMs(this.audio.currentTime * 1000),
        !this.audio.paused,
      );
    });
    this.audio.addEventListener('play', () => {
      this.endedFlag = false;
      this.emitState();
    });
    this.audio.addEventListener('pause', () => {
      this.emitState();
    });
    this.audio.addEventListener('ended', () => {
      this.endedFlag = true;
      this.emitState();
      for (const cb of this.endedListeners) {
        cb();
      }
    });
    this.audio.addEventListener('error', () => {
      this.emitState();
    });
  }

  private emitState(): void {
    const state = mapAudioPaused(this.audio, this.endedFlag);
    for (const cb of this.stateListeners) {
      cb(state);
    }
  }

  async ensureSetup(): Promise<void> {
    return Promise.resolve();
  }

  async destroy(): Promise<void> {
    this.audio.pause();
    this.audio.src = '';
    this.currentTrack = null;
    await invoke('media_clear_session').catch(() => undefined);
  }

  addEndedListener(callback: () => void): Unsubscribe {
    this.endedListeners.add(callback);
    return () => {
      this.endedListeners.delete(callback);
    };
  }

  addProgressListener(callback: (progress: PlayerProgress) => void): Unsubscribe {
    this.progressListeners.add(callback);
    return () => {
      this.progressListeners.delete(callback);
    };
  }

  addStateListener(callback: (state: PlayerState) => void): Unsubscribe {
    this.stateListeners.add(callback);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  async getProgress(): Promise<PlayerProgress> {
    const durationMs = Number.isFinite(this.audio.duration)
      ? clampMs(this.audio.duration * 1000)
      : null;
    return {
      durationMs,
      positionMs: clampMs(this.audio.currentTime * 1000),
    };
  }

  async getState(): Promise<PlayerState> {
    return mapAudioPaused(this.audio, this.endedFlag);
  }

  async pause(): Promise<void> {
    this.audio.pause();
    this.emitState();
    const positionMs = clampMs(this.audio.currentTime * 1000);
    await invoke('media_set_playback', {playing: false, positionMs}).catch(() => undefined);
  }

  async resume(): Promise<void> {
    await this.audio.play();
    this.emitState();
  }

  async play(track: AudioTrack, positionMs?: number): Promise<void> {
    this.endedFlag = false;
    this.currentTrack = track;
    this.audio.src = track.url;
    if (positionMs !== undefined && positionMs > 0) {
      this.audio.currentTime = positionMs / 1000;
    }
    await this.audio.play();
    this.emitState();
  }

  async seekTo(positionMs: number): Promise<void> {
    this.audio.currentTime = positionMs / 1000;
    this.emitState();
  }

  async stop(): Promise<void> {
    this.audio.pause();
    this.audio.src = '';
    this.currentTrack = null;
    this.endedFlag = false;
    this.emitState();
    await invoke('media_clear_session').catch(() => undefined);
  }

  /** Handles OS media keys / MPRIS toggle when the shell sends "play" or "toggle". */
  async resumeOrToggleFromOs(): Promise<void> {
    if (this.endedFlag || !this.audio.src) {
      return;
    }
    if (this.audio.paused) {
      await this.audio.play();
    } else {
      this.audio.pause();
    }
    this.emitState();
  }
}

let desktopPlayer: HtmlAudioPlayer | null = null;

export function getDesktopAudioPlayer(): HtmlAudioPlayer {
  if (!desktopPlayer) {
    desktopPlayer = new HtmlAudioPlayer();
  }
  return desktopPlayer;
}

import {invoke} from '@tauri-apps/api/core';
import type {
  AudioPlayer,
  AudioTrack,
  PlayerProgress,
  PlayerState,
  Unsubscribe,
} from '@eskerra/core';

function clampMs(n: number): number {
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.floor(n);
}

/** HTMLMediaElement.play() rejects with AbortError when a newer play() supersedes the previous one (not a user-facing failure). */
export function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') {
    return true;
  }
  return e instanceof Error && e.message === 'The operation was aborted';
}

async function playIgnoringSuperseded(audio: HTMLAudioElement): Promise<void> {
  try {
    await audio.play();
  } catch (e) {
    if (isAbortError(e)) {
      return;
    }
    throw e;
  }
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
  // Do not treat an explicit pause as `loading` only because readyState fell below
  // HAVE_FUTURE_DATA (WebKit can report that after pause while buffered data is still valid).
  if (
    audio.paused &&
    (audio.readyState >= HTMLMediaElement.HAVE_METADATA ||
      audio.currentTime > 0 ||
      audio.played.length > 0)
  ) {
    return 'paused';
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

const BUFFERING_DEBOUNCE_MS = 800;
const STUCK_POSITION_THRESHOLD_MS = 800;

export class HtmlAudioPlayer implements AudioPlayer {
  private readonly audio = new Audio();
  private endedFlag = false;
  private progressListeners = new Set<(p: PlayerProgress) => void>();
  private stateListeners = new Set<(s: PlayerState) => void>();
  private bufferingListeners = new Set<(b: boolean) => void>();
  private endedListeners = new Set<() => void>();
  private currentTrack: AudioTrack | null = null;
  private lastProgressEmit = 0;
  private waitingHold = false;
  private stuckHold = false;
  private lastBufferingEmit = false;
  private bufferingDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastKnownPositionMs = -1;
  private lastAdvanceAtMs = Date.now();

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
      this.updateStuckHoldFromProgress(positionMs, now);
      for (const cb of this.progressListeners) {
        cb(progress);
      }
      void invoke('media_set_playback', {
        playing: !this.audio.paused,
        positionMs,
      }).catch(() => undefined);
    };

    const emitFinalProgressOnEnded = () => {
      const durationMs = Number.isFinite(this.audio.duration)
        ? clampMs(this.audio.duration * 1000)
        : null;
      const positionMs =
        durationMs != null && durationMs > 0
          ? durationMs
          : clampMs(this.audio.currentTime * 1000);
      const progress: PlayerProgress = {durationMs, positionMs};
      this.lastProgressEmit = Date.now();
      for (const cb of this.progressListeners) {
        cb(progress);
      }
      void invoke('media_set_playback', {
        playing: false,
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
    this.audio.addEventListener('waiting', () => {
      this.waitingHold = true;
      this.scheduleBufferingEval();
    });
    this.audio.addEventListener('playing', () => {
      this.waitingHold = false;
      this.scheduleBufferingEval();
    });
    this.audio.addEventListener('canplay', () => {
      this.waitingHold = false;
      this.scheduleBufferingEval();
    });
    this.audio.addEventListener('play', () => {
      this.endedFlag = false;
      this.lastAdvanceAtMs = Date.now();
      this.stuckHold = false;
      this.scheduleBufferingEval();
      this.emitState();
    });
    this.audio.addEventListener('pause', () => {
      this.waitingHold = false;
      this.stuckHold = false;
      this.scheduleBufferingEval();
      this.emitState();
    });
    this.audio.addEventListener('ended', () => {
      emitFinalProgressOnEnded();
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

  private getBufferingCandidate(): boolean {
    return this.waitingHold || this.stuckHold;
  }

  private emitBufferingIfChanged(next: boolean): void {
    if (next === this.lastBufferingEmit) {
      return;
    }
    this.lastBufferingEmit = next;
    for (const cb of this.bufferingListeners) {
      cb(next);
    }
  }

  private clearBufferingDebounceTimer(): void {
    if (this.bufferingDebounceTimer != null) {
      clearTimeout(this.bufferingDebounceTimer);
      this.bufferingDebounceTimer = null;
    }
  }

  /** Debounce showing buffering; hide immediately when the candidate clears. */
  private scheduleBufferingEval(): void {
    const candidate = this.getBufferingCandidate();
    if (!candidate) {
      this.clearBufferingDebounceTimer();
      this.emitBufferingIfChanged(false);
      return;
    }
    if (this.bufferingDebounceTimer != null) {
      return;
    }
    this.bufferingDebounceTimer = setTimeout(() => {
      this.bufferingDebounceTimer = null;
      if (this.getBufferingCandidate()) {
        this.emitBufferingIfChanged(true);
      }
    }, BUFFERING_DEBOUNCE_MS);
  }

  private updateStuckHoldFromProgress(positionMs: number, now: number): void {
    const native = mapAudioPaused(this.audio, this.endedFlag);
    if (this.audio.paused || native !== 'playing') {
      this.stuckHold = false;
      this.scheduleBufferingEval();
      return;
    }
    if (this.lastKnownPositionMs < 0) {
      this.lastKnownPositionMs = positionMs;
      this.lastAdvanceAtMs = now;
      this.stuckHold = false;
      this.scheduleBufferingEval();
      return;
    }
    if (positionMs > this.lastKnownPositionMs || positionMs < this.lastKnownPositionMs) {
      this.lastKnownPositionMs = positionMs;
      this.lastAdvanceAtMs = now;
      this.stuckHold = false;
      this.scheduleBufferingEval();
      return;
    }
    if (now - this.lastAdvanceAtMs >= STUCK_POSITION_THRESHOLD_MS) {
      this.stuckHold = true;
      this.scheduleBufferingEval();
    }
  }

  private resetBufferingTracking(): void {
    this.waitingHold = false;
    this.stuckHold = false;
    this.clearBufferingDebounceTimer();
    this.lastKnownPositionMs = -1;
    this.lastAdvanceAtMs = Date.now();
    this.emitBufferingIfChanged(false);
  }

  async ensureSetup(): Promise<void> {
    return Promise.resolve();
  }

  async destroy(): Promise<void> {
    this.resetBufferingTracking();
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

  addBufferingListener(callback: (buffering: boolean) => void): Unsubscribe {
    this.bufferingListeners.add(callback);
    return () => {
      this.bufferingListeners.delete(callback);
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

  /** Episode id of the loaded track, for playlist priming / reconciliation. */
  getCurrentTrackEpisodeId(): string | null {
    return this.currentTrack?.id ?? null;
  }

  /** Track metadata if a URL is loaded (used to avoid redundant `src` reloads when only position changed). */
  getLoadedTrack(): AudioTrack | null {
    return this.currentTrack;
  }

  /**
   * After channel artwork is resolved and cached to a `file://` URI, refresh MPRIS metadata
   * if this episode is still the loaded track.
   */
  async syncArtworkIfCurrentEpisode(episodeId: string, coverFileUrl: string): Promise<void> {
    if (this.currentTrack?.id !== episodeId) {
      return;
    }
    this.currentTrack = {...this.currentTrack, artwork: coverFileUrl};
    const durationSec = this.audio.duration;
    const durationMs = Number.isFinite(durationSec) ? clampMs(durationSec * 1000) : 1;
    await syncMprisMetadata(
      this.currentTrack,
      Math.max(durationMs, 1),
      clampMs(this.audio.currentTime * 1000),
      !this.audio.paused,
    );
  }

  async pause(): Promise<void> {
    this.audio.pause();
    this.emitState();
    const positionMs = clampMs(this.audio.currentTime * 1000);
    await invoke('media_set_playback', {playing: false, positionMs}).catch(() => undefined);
  }

  async resume(): Promise<void> {
    await playIgnoringSuperseded(this.audio);
    this.emitState();
  }

  async play(track: AudioTrack, positionMs?: number): Promise<void> {
    this.endedFlag = false;
    const sameResource =
      this.currentTrack != null &&
      this.currentTrack.id === track.id &&
      this.currentTrack.url === track.url &&
      Boolean(this.audio.src) &&
      !this.audio.error;

    this.currentTrack = track;

    if (sameResource) {
      if (positionMs !== undefined) {
        this.audio.currentTime = Math.max(0, positionMs) / 1000;
      }
      this.resetBufferingTracking();
      await playIgnoringSuperseded(this.audio);
      this.emitState();
      return;
    }

    this.resetBufferingTracking();
    this.audio.src = track.url;
    if (positionMs !== undefined) {
      this.audio.currentTime = Math.max(0, positionMs) / 1000;
    }
    await playIgnoringSuperseded(this.audio);
    this.emitState();
  }

  /**
   * Loads a track and seeks to `positionMs` without starting playback — parity with mobile
   * restoring now-playing from `playlist.json` while staying paused until the user plays.
   */
  async primePausedAt(track: AudioTrack, positionMs: number): Promise<void> {
    this.endedFlag = false;
    this.resetBufferingTracking();
    this.currentTrack = track;
    this.audio.pause();
    this.audio.src = track.url;

    await new Promise<void>((resolve, reject) => {
      const LOAD_TIMEOUT_MS = 30_000;
      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('Audio metadata load timed out.'));
      }, LOAD_TIMEOUT_MS);

      const applySeekAndPause = () => {
        window.clearTimeout(timeoutId);
        const durationSec = this.audio.duration;
        const durationMs = Number.isFinite(durationSec) ? clampMs(durationSec * 1000) : null;
        const clampedPosition = Math.max(0, positionMs);
        let safeMs = clampedPosition;
        if (durationMs !== null && durationMs > 0) {
          safeMs = Math.min(clampedPosition, durationMs);
        }
        this.audio.currentTime = safeMs / 1000;
        this.audio.pause();

        const posOut = clampMs(this.audio.currentTime * 1000);
        const durOut = Number.isFinite(durationSec) ? clampMs(durationSec * 1000) : 0;
        void syncMprisMetadata(track, Math.max(durOut, 1), posOut, false);
        void invoke('media_set_playback', {playing: false, positionMs: posOut}).catch(() => undefined);

        const progress: PlayerProgress = {
          durationMs: Number.isFinite(durationSec) ? clampMs(durationSec * 1000) : null,
          positionMs: posOut,
        };
        for (const cb of this.progressListeners) {
          cb(progress);
        }
        this.emitState();
        resolve();
      };

      const onError = () => {
        window.clearTimeout(timeoutId);
        cleanup();
        reject(new Error('Audio load error'));
      };

      const cleanup = () => {
        this.audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        this.audio.removeEventListener('error', onError);
      };

      const onLoadedMetadata = () => {
        cleanup();
        try {
          applySeekAndPause();
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      };

      this.audio.addEventListener('loadedmetadata', onLoadedMetadata);
      this.audio.addEventListener('error', onError);

      if (this.audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        window.clearTimeout(timeoutId);
        cleanup();
        try {
          applySeekAndPause();
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      }
    });
  }

  async seekTo(positionMs: number): Promise<void> {
    this.endedFlag = false;
    this.audio.currentTime = positionMs / 1000;
    this.lastKnownPositionMs = clampMs(this.audio.currentTime * 1000);
    this.lastAdvanceAtMs = Date.now();
    this.stuckHold = false;
    this.scheduleBufferingEval();
    this.emitState();
    const positionOut = clampMs(this.audio.currentTime * 1000);
    await invoke('media_set_playback', {
      playing: !this.audio.paused,
      positionMs: positionOut,
    }).catch(() => undefined);
  }

  async stop(): Promise<void> {
    this.resetBufferingTracking();
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
      await playIgnoringSuperseded(this.audio);
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

/** Call after `media_cache_artwork` when artwork was not known at `play()` / `primePausedAt()`. */
export async function notifyDesktopMprisArtworkReady(
  episodeId: string,
  coverFileUrl: string,
): Promise<void> {
  await getDesktopAudioPlayer().syncArtworkIfCurrentEpisode(episodeId, coverFileUrl);
}

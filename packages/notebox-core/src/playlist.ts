export type PlaylistEntry = {
  durationMs: number | null;
  episodeId: string;
  mp3Url: string;
  positionMs: number;
  /** Unix ms; required on new writes and in R2. Legacy local files may omit (normalized to 0). */
  updatedAt: number;
  /**
   * `deviceInstanceId` of the device that last performed a **control** write (metadata only; not used to gate writes).
   * Empty string means legacy / unset until a control write sets it.
   */
  playbackOwnerId: string;
  /**
   * Increments on control intents (play, pause, seek, episode change, resume).
   * Progress-only writes must not bump this.
   */
  controlRevision: number;
};

export type PlaylistWriteResult =
  | {kind: 'saved'; entry: PlaylistEntry}
  | {kind: 'superseded'; entry: PlaylistEntry};

/** Minimum playback position (ms) before persisting playlist on pause; below this clears playlist instead. */
export const MIN_PLAYLIST_PERSIST_POSITION_MS = 10_000;

function isDurationFieldValid(durationMs: unknown): boolean {
  return durationMs === null || typeof durationMs === 'number';
}

/** Raw JSON shape before normalization (legacy may omit optional fields). */
function isValidPlaylistCoreShape(value: unknown): value is Omit<
  PlaylistEntry,
  'updatedAt' | 'playbackOwnerId' | 'controlRevision'
> & {
  updatedAt?: unknown;
  playbackOwnerId?: unknown;
  controlRevision?: unknown;
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const entry = value as Partial<PlaylistEntry> & {updatedAt?: unknown};
  if (
    typeof entry.episodeId !== 'string' ||
    typeof entry.mp3Url !== 'string' ||
    typeof entry.positionMs !== 'number' ||
    !isDurationFieldValid(entry.durationMs)
  ) {
    return false;
  }

  if (entry.updatedAt !== undefined) {
    if (typeof entry.updatedAt !== 'number' || !Number.isFinite(entry.updatedAt)) {
      return false;
    }
  }

  if (entry.playbackOwnerId !== undefined && typeof entry.playbackOwnerId !== 'string') {
    return false;
  }

  if (
    entry.controlRevision !== undefined &&
    (typeof entry.controlRevision !== 'number' || !Number.isFinite(entry.controlRevision))
  ) {
    return false;
  }

  return true;
}

/**
 * True if JSON matches playlist shape. Legacy objects may omit `updatedAt` (use
 * {@link normalizePlaylistEntryForSync} before treating as {@link PlaylistEntry}).
 */
export function isValidPlaylistEntry(value: unknown): boolean {
  return isValidPlaylistCoreShape(value);
}

/**
 * Returns a canonical {@link PlaylistEntry} or null if the shape is invalid.
 */
export function normalizePlaylistEntryForSync(value: unknown): PlaylistEntry | null {
  if (!isValidPlaylistCoreShape(value)) {
    return null;
  }
  const updatedAt =
    typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;
  const playbackOwnerId =
    typeof value.playbackOwnerId === 'string' ? value.playbackOwnerId : '';
  const controlRevision =
    typeof value.controlRevision === 'number' && Number.isFinite(value.controlRevision)
      ? value.controlRevision
      : 0;
  return {
    durationMs: value.durationMs,
    episodeId: value.episodeId,
    mp3Url: value.mp3Url,
    positionMs: value.positionMs,
    updatedAt,
    playbackOwnerId,
    controlRevision,
  };
}

export function parsePlaylistEntryOrThrow(rawJson: unknown): PlaylistEntry {
  const entry = normalizePlaylistEntryForSync(rawJson);
  if (!entry) {
    throw new Error('playlist.json has an invalid structure.');
  }
  return entry;
}

export function serializePlaylistEntry(entry: PlaylistEntry): string {
  return `${JSON.stringify(entry, null, 2)}\n`;
}

/**
 * Prefer the entry with the greater `controlRevision`; if equal, prefer greater `updatedAt`;
 * on full tie, prefer `second` (e.g. remote).
 */
export function pickNewerPlaylistEntry(
  first: PlaylistEntry | null,
  second: PlaylistEntry | null,
): PlaylistEntry | null {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  if (first.controlRevision !== second.controlRevision) {
    return first.controlRevision > second.controlRevision ? first : second;
  }
  if (first.updatedAt > second.updatedAt) {
    return first;
  }
  if (second.updatedAt > first.updatedAt) {
    return second;
  }
  return second;
}

export type PlaylistWriteMode = 'progress' | 'control';

/** Remote is newer than what this device last merged (`known` from local settings). */
export function isRemotePlaylistNewerThanKnown(
  remote: PlaylistEntry,
  knownUpdatedAtMs: number,
  knownControlRevision: number,
): boolean {
  if (remote.controlRevision > knownControlRevision) {
    return true;
  }
  if (remote.controlRevision < knownControlRevision) {
    return false;
  }
  return remote.updatedAt > knownUpdatedAtMs;
}

/**
 * Merges remote baseline with caller fields and applies control or progress semantics.
 * For `control`, bumps `controlRevision` and sets `playbackOwnerId`.
 */
export function buildPlaylistEntryForWrite(
  base: PlaylistEntry,
  patch: Partial<Pick<PlaylistEntry, 'durationMs' | 'positionMs' | 'episodeId' | 'mp3Url'>>,
  deviceInstanceId: string,
  mode: PlaylistWriteMode,
  nowMs: number,
): PlaylistEntry {
  const merged: PlaylistEntry = {
    ...base,
    ...patch,
  };

  if (mode === 'control') {
    return {
      ...merged,
      playbackOwnerId: deviceInstanceId,
      controlRevision: merged.controlRevision + 1,
      updatedAt: Math.max(nowMs, merged.updatedAt),
    };
  }

  return {
    ...merged,
    updatedAt: Math.max(nowMs, merged.updatedAt),
  };
}

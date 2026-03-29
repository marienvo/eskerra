export type PlaylistEntry = {
  durationMs: number | null;
  episodeId: string;
  mp3Url: string;
  positionMs: number;
  /** Unix ms; required on new writes and in R2. Legacy local files may omit (normalized to 0). */
  updatedAt: number;
};

export type PlaylistWriteResult =
  | {kind: 'saved'; entry: PlaylistEntry}
  | {kind: 'superseded'; entry: PlaylistEntry};

function isDurationFieldValid(durationMs: unknown): boolean {
  return durationMs === null || typeof durationMs === 'number';
}

/** Raw JSON shape before normalization (legacy may omit `updatedAt`). */
function isValidPlaylistCoreShape(value: unknown): value is Omit<PlaylistEntry, 'updatedAt'> & {
  updatedAt?: unknown;
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
  return {
    durationMs: value.durationMs,
    episodeId: value.episodeId,
    mp3Url: value.mp3Url,
    positionMs: value.positionMs,
    updatedAt,
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

/** Prefer the entry with the greater `updatedAt`; on tie, prefer `second` (e.g. remote). */
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
  if (first.updatedAt > second.updatedAt) {
    return first;
  }
  if (second.updatedAt > first.updatedAt) {
    return second;
  }
  return second;
}

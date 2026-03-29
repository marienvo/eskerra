export type PlaylistEntry = {
  durationMs: number | null;
  episodeId: string;
  mp3Url: string;
  positionMs: number;
};

export function isValidPlaylistEntry(value: unknown): value is PlaylistEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const entry = value as Partial<PlaylistEntry>;
  const isDurationValid =
    entry.durationMs === null || typeof entry.durationMs === 'number';

  return (
    typeof entry.episodeId === 'string' &&
    typeof entry.mp3Url === 'string' &&
    typeof entry.positionMs === 'number' &&
    isDurationValid
  );
}

export function serializePlaylistEntry(entry: PlaylistEntry): string {
  return `${JSON.stringify(entry, null, 2)}\n`;
}

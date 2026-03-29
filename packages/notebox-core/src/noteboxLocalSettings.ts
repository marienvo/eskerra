export type NoteboxLocalSettings = {
  deviceName: string;
  /** Per-device vault label (not synced via shared JSON). */
  displayName: string;
  /**
   * Last playlist `updatedAt` (Unix ms) the device accepted as authoritative after a successful
   * R2 or fallback local read/write. `null` until first sync Baseline for this vault.
   */
  playlistKnownUpdatedAtMs: number | null;
};

export const defaultNoteboxLocalSettings: NoteboxLocalSettings = {
  deviceName: '',
  displayName: '',
  playlistKnownUpdatedAtMs: null,
};

export function serializeNoteboxLocalSettings(settings: NoteboxLocalSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export function parseNoteboxLocalSettings(raw: string): NoteboxLocalSettings {
  const parsed = JSON.parse(raw) as Partial<NoteboxLocalSettings>;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('settings-local.json has an invalid structure.');
  }

  const deviceName =
    typeof parsed.deviceName === 'string' ? parsed.deviceName : defaultNoteboxLocalSettings.deviceName;

  const displayName =
    typeof parsed.displayName === 'string'
      ? parsed.displayName
      : defaultNoteboxLocalSettings.displayName;

  let playlistKnownUpdatedAtMs: number | null = defaultNoteboxLocalSettings.playlistKnownUpdatedAtMs;
  if (parsed.playlistKnownUpdatedAtMs !== undefined && parsed.playlistKnownUpdatedAtMs !== null) {
    if (typeof parsed.playlistKnownUpdatedAtMs !== 'number' || !Number.isFinite(parsed.playlistKnownUpdatedAtMs)) {
      throw new Error('settings-local.json has an invalid structure.');
    }
    playlistKnownUpdatedAtMs = parsed.playlistKnownUpdatedAtMs;
  }

  return {deviceName, displayName, playlistKnownUpdatedAtMs};
}

export type NoteboxLocalSettings = {
  deviceName: string;
  /** Per-device vault label (not synced via shared JSON). */
  displayName: string;
  /**
   * Stable id for this app install; written into `playbackOwnerId` on playlist **control** writes (metadata).
   * Not synced; persisted only in `settings-local.json`.
   */
  deviceInstanceId: string;
  /**
   * Last playlist `updatedAt` (Unix ms) the device accepted as authoritative after a successful
   * R2 or fallback local read/write. `null` until first sync Baseline for this vault.
   */
  playlistKnownUpdatedAtMs: number | null;
  /**
   * Last playlist `controlRevision` accepted after a successful merge (see `playlistKnownUpdatedAtMs`).
   */
  playlistKnownControlRevision: number | null;
};

export const defaultNoteboxLocalSettings: NoteboxLocalSettings = {
  deviceInstanceId: '',
  deviceName: '',
  displayName: '',
  playlistKnownControlRevision: null,
  playlistKnownUpdatedAtMs: null,
};

/** Random UUID for `deviceInstanceId` when missing (works in modern browsers and Node 19+). */
export function newDeviceInstanceId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `nb-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Ensures `deviceInstanceId` is non-empty. Call after reading local settings; persist when `changed`.
 */
export function ensureDeviceInstanceId(settings: NoteboxLocalSettings): {
  changed: boolean;
  settings: NoteboxLocalSettings;
} {
  const id = typeof settings.deviceInstanceId === 'string' ? settings.deviceInstanceId.trim() : '';
  if (id !== '') {
    return {changed: false, settings};
  }
  return {
    changed: true,
    settings: {...settings, deviceInstanceId: newDeviceInstanceId()},
  };
}

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

  let deviceInstanceId =
    typeof parsed.deviceInstanceId === 'string'
      ? parsed.deviceInstanceId
      : defaultNoteboxLocalSettings.deviceInstanceId;

  let playlistKnownControlRevision: number | null =
    defaultNoteboxLocalSettings.playlistKnownControlRevision;
  if (parsed.playlistKnownControlRevision !== undefined && parsed.playlistKnownControlRevision !== null) {
    if (
      typeof parsed.playlistKnownControlRevision !== 'number' ||
      !Number.isFinite(parsed.playlistKnownControlRevision)
    ) {
      throw new Error('settings-local.json has an invalid structure.');
    }
    playlistKnownControlRevision = parsed.playlistKnownControlRevision;
  }

  return {deviceName, displayName, deviceInstanceId, playlistKnownUpdatedAtMs, playlistKnownControlRevision};
}

export type NoteboxLocalSettings = {
  deviceName: string;
  /** Per-device vault label (not synced via shared JSON). */
  displayName: string;
};

export const defaultNoteboxLocalSettings: NoteboxLocalSettings = {
  deviceName: '',
  displayName: '',
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

  return {deviceName, displayName};
}

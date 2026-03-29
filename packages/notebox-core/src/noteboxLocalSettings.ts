export type NoteboxLocalSettings = {
  deviceName: string;
};

export const defaultNoteboxLocalSettings: NoteboxLocalSettings = {
  deviceName: 'This device',
};

export function serializeNoteboxLocalSettings(settings: NoteboxLocalSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export function parseNoteboxLocalSettings(raw: string): NoteboxLocalSettings {
  const parsed = JSON.parse(raw) as Partial<NoteboxLocalSettings>;

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof parsed.deviceName !== 'string'
  ) {
    throw new Error('settings-local.json has an invalid structure.');
  }

  return {deviceName: parsed.deviceName};
}

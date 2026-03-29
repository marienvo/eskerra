export type NoteboxSettings = {
  displayName: string;
};

export const defaultNoteboxSettings: NoteboxSettings = {
  displayName: 'My Notebox',
};

export function serializeNoteboxSettings(settings: NoteboxSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export function parseNoteboxSettings(rawSettings: string): NoteboxSettings {
  const parsed = JSON.parse(rawSettings) as Partial<NoteboxSettings>;

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof parsed.displayName !== 'string'
  ) {
    throw new Error('settings.json has an invalid structure.');
  }

  return {displayName: parsed.displayName};
}

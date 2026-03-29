export type NoteboxR2Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type NoteboxSettings = {
  displayName: string;
  r2?: NoteboxR2Config;
};

function parseR2Block(value: unknown): NoteboxR2Config {
  if (typeof value !== 'object' || value === null) {
    throw new Error('settings-shared.json has an invalid structure.');
  }

  const o = value as Record<string, unknown>;
  if (
    typeof o.endpoint !== 'string' ||
    typeof o.bucket !== 'string' ||
    typeof o.accessKeyId !== 'string' ||
    typeof o.secretAccessKey !== 'string'
  ) {
    throw new Error('settings-shared.json has an invalid structure.');
  }

  return {
    endpoint: o.endpoint,
    bucket: o.bucket,
    accessKeyId: o.accessKeyId,
    secretAccessKey: o.secretAccessKey,
  };
}

export const defaultNoteboxSettings: NoteboxSettings = {
  displayName: 'My Notebox',
  r2: {
    endpoint: 'https://00000000000000000000000000000000.r2.cloudflarestorage.com',
    bucket: 'mock-bucket',
    accessKeyId: 'mock_access_key_id',
    secretAccessKey: 'mock_secret_access_key',
  },
};

export function serializeNoteboxSettings(settings: NoteboxSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export function parseNoteboxSettings(rawSettings: string): NoteboxSettings {
  const parsed = JSON.parse(rawSettings) as Partial<NoteboxSettings>;

  if (typeof parsed !== 'object' || parsed === null || typeof parsed.displayName !== 'string') {
    throw new Error('settings-shared.json has an invalid structure.');
  }

  const out: NoteboxSettings = {displayName: parsed.displayName};

  if (parsed.r2 !== undefined) {
    out.r2 = parseR2Block(parsed.r2);
  }

  return out;
}

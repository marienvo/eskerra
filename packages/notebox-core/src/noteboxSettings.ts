export type NoteboxR2Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Shared vault JSON: optional R2 only. Display name lives in `settings-local.json`. */
export type NoteboxSettings = {
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

export type R2FormFields = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/**
 * Builds shared vault settings from R2 form fields. R2 is optional: if any field is non-empty,
 * all four must be non-empty after trim.
 */
export function buildNoteboxSettingsFromForm(
  r2: R2FormFields,
):
  | {ok: true; settings: NoteboxSettings}
  | {ok: false; message: string} {
  const e = r2.endpoint.trim();
  const b = r2.bucket.trim();
  const k = r2.accessKeyId.trim();
  const s = r2.secretAccessKey.trim();
  const anyNonEmpty = Boolean(e || b || k || s);
  const allNonEmpty = Boolean(e && b && k && s);

  if (anyNonEmpty && !allNonEmpty) {
    return {
      ok: false,
      message: 'Complete all Cloudflare R2 fields or clear them all.',
    };
  }

  const settings: NoteboxSettings = {};
  if (allNonEmpty) {
    settings.r2 = {endpoint: e, bucket: b, accessKeyId: k, secretAccessKey: s};
  }

  return {ok: true, settings};
}

/**
 * Parses shared settings. Legacy `displayName` in JSON is ignored (migrate to local via storage layer).
 */
export function parseNoteboxSettings(rawSettings: string): NoteboxSettings {
  const parsed = JSON.parse(rawSettings) as Record<string, unknown>;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('settings-shared.json has an invalid structure.');
  }

  const out: NoteboxSettings = {};

  if (parsed.r2 !== undefined) {
    out.r2 = parseR2Block(parsed.r2);
  }

  return out;
}

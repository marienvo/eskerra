import type {NoteboxR2Config, NoteboxSettings} from './noteboxSettings';

function isNonEmpty(s: string): boolean {
  return s.trim().length > 0;
}

/** True when shared settings include a complete R2 configuration (playlist uses bucket root key). */
export function isVaultR2PlaylistConfigured(settings: NoteboxSettings): settings is NoteboxSettings & {
  r2: NoteboxR2Config;
} {
  const r2 = settings.r2;
  if (!r2) {
    return false;
  }
  return (
    isNonEmpty(r2.endpoint) &&
    isNonEmpty(r2.bucket) &&
    isNonEmpty(r2.accessKeyId) &&
    isNonEmpty(r2.secretAccessKey)
  );
}

export const ESKERRA_DIRECTORY_NAME = '.eskerra';
/** Legacy hidden settings directory; migrated to {@link ESKERRA_DIRECTORY_NAME} on access. */
export const LEGACY_NOTEBOX_DIRECTORY_NAME = '.notebox';
export const GENERAL_DIRECTORY_NAME = 'General';
export const INBOX_DIRECTORY_NAME = 'Inbox';
export const ASSETS_DIRECTORY_NAME = 'Assets';
export const ATTACHMENTS_DIRECTORY_NAME = 'Attachments';
export const PLAYLIST_FILE_NAME = 'playlist.json';
/** R2 object key and optional shared-settings mirror filename for theme selection (light/dark/auto + theme id). */
export const THEME_PREFERENCE_FILE_NAME = 'theme-preference.json';
export const THEMES_DIRECTORY_NAME = 'themes';
export const SETTINGS_SHARED_FILE_NAME = 'settings-shared.json';
/** Legacy filename; read-only for migration. */
export const SETTINGS_LEGACY_FILE_NAME = 'settings.json';
export const SETTINGS_LOCAL_FILE_NAME = 'settings-local.json';
export const MARKDOWN_EXTENSION = '.md';
export const SYNC_CONFLICT_MARKER = 'sync-conflict';

/** Vault root: SAF tree URI or absolute POSIX path (no trailing slash). */

export function getEskerraDirectoryUri(baseUri: string): string {
  return `${normalizeVaultBaseUri(baseUri)}/${ESKERRA_DIRECTORY_NAME}`;
}

export function getSharedSettingsUri(baseUri: string): string {
  return `${getEskerraDirectoryUri(baseUri)}/${SETTINGS_SHARED_FILE_NAME}`;
}

export function getLegacySettingsUri(baseUri: string): string {
  return `${getEskerraDirectoryUri(baseUri)}/${SETTINGS_LEGACY_FILE_NAME}`;
}

export function getLocalSettingsUri(baseUri: string): string {
  return `${getEskerraDirectoryUri(baseUri)}/${SETTINGS_LOCAL_FILE_NAME}`;
}

export function getPlaylistUri(baseUri: string): string {
  return `${getEskerraDirectoryUri(baseUri)}/${PLAYLIST_FILE_NAME}`;
}

export function getThemesDirectoryUri(baseUri: string): string {
  return `${getEskerraDirectoryUri(baseUri)}/${THEMES_DIRECTORY_NAME}`;
}

export function getInboxDirectoryUri(baseUri: string): string {
  return `${baseUri}/${INBOX_DIRECTORY_NAME}`;
}

export function getGeneralDirectoryUri(baseUri: string): string {
  return `${baseUri}/${GENERAL_DIRECTORY_NAME}`;
}

export function getAssetsDirectoryUri(baseUri: string): string {
  return `${baseUri}/${ASSETS_DIRECTORY_NAME}`;
}

export function getAssetsAttachmentsDirectoryUri(baseUri: string): string {
  return `${getAssetsDirectoryUri(baseUri)}/${ATTACHMENTS_DIRECTORY_NAME}`;
}

export function normalizeVaultBaseUri(baseUri: string): string {
  const normalizedUri = baseUri.trim();

  if (!normalizedUri) {
    throw new Error('Base URI cannot be empty.');
  }

  return normalizedUri;
}

export function isSyncConflictFileName(fileName: string): boolean {
  return fileName.toLowerCase().includes(SYNC_CONFLICT_MARKER);
}

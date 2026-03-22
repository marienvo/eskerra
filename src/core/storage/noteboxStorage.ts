import {
  exists,
  listFiles,
  mkdir,
  readFile,
  writeFile,
} from 'react-native-saf-x';

import {
  NoteDetail,
  NoteSummary,
  NoteboxSettings,
  PodcastImageCacheEntry,
  PlaylistEntry,
  RootMarkdownFile,
} from '../../types';

const NOTEBOX_DIRECTORY_NAME = '.notebox';
const GENERAL_DIRECTORY_NAME = 'General';
const INBOX_DIRECTORY_NAME = 'Inbox';
const PLAYLIST_FILE_NAME = 'playlist.json';
const PODCAST_IMAGES_DIRECTORY_NAME = 'podcast-images';
const SETTINGS_FILE_NAME = 'settings.json';
const MARKDOWN_EXTENSION = '.md';

const defaultSettings: NoteboxSettings = {
  displayName: 'My Notebox',
};
const isDevMockVaultEnabled =
  __DEV__ &&
  !(globalThis as {process?: {env?: Record<string, string | undefined>}}).process
    ?.env?.JEST_WORKER_ID;

function getDevStorage() {
  return require('../../dev/devStorage') as typeof import('../../dev/devStorage');
}

function getNoteboxDirectoryUri(baseUri: string): string {
  return `${baseUri}/${NOTEBOX_DIRECTORY_NAME}`;
}

function getSettingsUri(baseUri: string): string {
  return `${getNoteboxDirectoryUri(baseUri)}/${SETTINGS_FILE_NAME}`;
}

function getPlaylistUri(baseUri: string): string {
  return `${getNoteboxDirectoryUri(baseUri)}/${PLAYLIST_FILE_NAME}`;
}

function getPodcastImagesDirectoryUri(baseUri: string): string {
  return `${getNoteboxDirectoryUri(baseUri)}/${PODCAST_IMAGES_DIRECTORY_NAME}`;
}

function getPodcastImageEntryUri(baseUri: string, cacheKey: string): string {
  return `${getPodcastImagesDirectoryUri(baseUri)}/${cacheKey}.json`;
}

function getPodcastImageFileUri(baseUri: string, cacheKey: string, extension: string): string {
  return `${getPodcastImagesDirectoryUri(baseUri)}/${cacheKey}.${extension}`;
}

function getInboxDirectoryUri(baseUri: string): string {
  return `${baseUri}/${INBOX_DIRECTORY_NAME}`;
}

function getGeneralDirectoryUri(baseUri: string): string {
  return `${baseUri}/${GENERAL_DIRECTORY_NAME}`;
}

function normalizeBaseUri(baseUri: string): string {
  const normalizedUri = baseUri.trim();

  if (!normalizedUri) {
    throw new Error('Base URI cannot be empty.');
  }

  return normalizedUri;
}

function normalizeNoteUri(noteUri: string): string {
  const normalizedUri = noteUri.trim();

  if (!normalizedUri) {
    throw new Error('Note URI cannot be empty.');
  }

  return normalizedUri;
}

function serializeSettings(settings: NoteboxSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function serializePlaylist(entry: PlaylistEntry): string {
  return `${JSON.stringify(entry, null, 2)}\n`;
}

function serializePodcastImageCacheEntry(entry: PodcastImageCacheEntry): string {
  return `${JSON.stringify(entry, null, 2)}\n`;
}

function sanitizeFileName(rawName: string): string {
  const normalized = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  return normalized || `note-${Date.now()}`;
}

function titleFromNoteName(fileName: string): string {
  const baseName = fileName.endsWith(MARKDOWN_EXTENSION)
    ? fileName.slice(0, -MARKDOWN_EXTENSION.length)
    : fileName;

  return baseName.replace(/[-_]+/g, ' ').trim() || 'Untitled note';
}

type SafDocumentFile = {
  lastModified?: number | null;
  name?: string;
  type?: 'directory' | 'file' | string;
  uri: string;
};

function isValidPlaylistEntry(value: unknown): value is PlaylistEntry {
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

function isValidPodcastImageCacheEntry(
  value: unknown,
): value is PodcastImageCacheEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const entry = value as Partial<PodcastImageCacheEntry>;
  const hasValidOptionalUri =
    entry.localImageUri === undefined || typeof entry.localImageUri === 'string';
  const hasValidOptionalMime =
    entry.mimeType === undefined || typeof entry.mimeType === 'string';

  return (
    typeof entry.fetchedAt === 'string' &&
    typeof entry.imageUrl === 'string' &&
    hasValidOptionalUri &&
    hasValidOptionalMime
  );
}

function parseSettings(rawSettings: string): NoteboxSettings {
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

export async function initNotebox(baseUri: string): Promise<void> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    await devStorage.initNotebox(baseUri);
    return;
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const noteboxDirectoryUri = getNoteboxDirectoryUri(normalizedBaseUri);
  const settingsUri = getSettingsUri(normalizedBaseUri);

  if (!(await exists(noteboxDirectoryUri))) {
    await mkdir(noteboxDirectoryUri);
  }

  if (!(await exists(settingsUri))) {
    await writeFile(settingsUri, serializeSettings(defaultSettings), {
      encoding: 'utf8',
      mimeType: 'application/json',
    });
  }
}

export async function readSettings(baseUri: string): Promise<NoteboxSettings> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    return devStorage.readSettings(baseUri);
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const settingsUri = getSettingsUri(normalizedBaseUri);
  const rawSettings = await readFile(settingsUri, {encoding: 'utf8'});

  return parseSettings(rawSettings);
}

export async function writeSettings(
  baseUri: string,
  settings: NoteboxSettings,
): Promise<void> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    await devStorage.writeSettings(baseUri, settings);
    return;
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const settingsUri = getSettingsUri(normalizedBaseUri);

  await writeFile(settingsUri, serializeSettings(settings), {
    encoding: 'utf8',
    mimeType: 'application/json',
  });
}

export async function listNotes(baseUri: string): Promise<NoteSummary[]> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    return devStorage.listNotes(baseUri);
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const inboxDirectoryUri = getInboxDirectoryUri(normalizedBaseUri);

  if (!(await exists(inboxDirectoryUri))) {
    return [];
  }

  const documents = (await listFiles(inboxDirectoryUri)) as SafDocumentFile[];

  return documents
    .filter(document => {
      const isFile = document.type === 'file' || document.type === undefined;
      return (
        isFile &&
        typeof document.name === 'string' &&
        document.name.endsWith(MARKDOWN_EXTENSION)
      );
    })
    .map(document => ({
      lastModified:
        typeof document.lastModified === 'number' ? document.lastModified : null,
      name: document.name as string,
      uri: document.uri,
    }))
    .sort((a, b) => {
      const left = a.lastModified ?? 0;
      const right = b.lastModified ?? 0;
      return right - left;
    });
}

export async function listGeneralMarkdownFiles(
  baseUri: string,
): Promise<RootMarkdownFile[]> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    return devStorage.listGeneralMarkdownFiles(baseUri);
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const generalDirectoryUri = getGeneralDirectoryUri(normalizedBaseUri);

  if (!(await exists(generalDirectoryUri))) {
    return [];
  }

  const documents = (await listFiles(generalDirectoryUri)) as SafDocumentFile[];

  return documents
    .filter(document => {
      const isFile = document.type === 'file' || document.type === undefined;
      return (
        isFile &&
        typeof document.name === 'string' &&
        document.name.endsWith(MARKDOWN_EXTENSION)
      );
    })
    .map(document => ({
      lastModified:
        typeof document.lastModified === 'number' ? document.lastModified : null,
      name: document.name as string,
      uri: document.uri,
    }))
    .sort((a, b) => {
      const left = a.lastModified ?? 0;
      const right = b.lastModified ?? 0;
      return right - left;
    });
}

export async function readNote(noteUri: string): Promise<NoteDetail> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    return devStorage.readNote(noteUri);
  }

  const normalizedNoteUri = normalizeNoteUri(noteUri);
  const content = await readFile(normalizedNoteUri, {encoding: 'utf8'});

  const nameFromUri = normalizedNoteUri.split('/').pop() ?? 'Untitled.md';
  const summary: NoteSummary = {
    lastModified: null,
    name: nameFromUri,
    uri: normalizedNoteUri,
  };

  return {content, summary};
}

export async function readPodcastFileContent(fileUri: string): Promise<string> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    return devStorage.readPodcastFileContent(fileUri);
  }

  const normalizedFileUri = normalizeNoteUri(fileUri);
  return readFile(normalizedFileUri, {encoding: 'utf8'});
}

export async function writePodcastFileContent(
  fileUri: string,
  content: string,
): Promise<void> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    await devStorage.writePodcastFileContent(fileUri, content);
    return;
  }

  const normalizedFileUri = normalizeNoteUri(fileUri);
  const fileBody = `${content}\n`;

  await writeFile(normalizedFileUri, fileBody, {
    encoding: 'utf8',
    mimeType: 'text/markdown',
  });
}

export async function createNote(
  baseUri: string,
  title: string,
  content: string,
): Promise<NoteSummary> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    return devStorage.createNote(baseUri, title, content);
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const inboxDirectoryUri = getInboxDirectoryUri(normalizedBaseUri);

  if (!(await exists(inboxDirectoryUri))) {
    await mkdir(inboxDirectoryUri);
  }

  const fileName = `${sanitizeFileName(title)}${MARKDOWN_EXTENSION}`;
  const noteUri = `${inboxDirectoryUri}/${fileName}`;
  const trimmedContent = content.trim();
  const noteBody = trimmedContent ? `${trimmedContent}\n` : '';

  await writeFile(noteUri, noteBody, {
    encoding: 'utf8',
    mimeType: 'text/markdown',
  });

  return {
    lastModified: Date.now(),
    name: fileName,
    uri: noteUri,
  };
}

export async function writeNoteContent(
  noteUri: string,
  content: string,
): Promise<void> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    await devStorage.writeNoteContent(noteUri, content);
    return;
  }

  const normalizedNoteUri = normalizeNoteUri(noteUri);
  const noteBody = `${content}\n`;

  await writeFile(normalizedNoteUri, noteBody, {
    encoding: 'utf8',
    mimeType: 'text/markdown',
  });
}

export async function readPlaylist(baseUri: string): Promise<PlaylistEntry | null> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    return devStorage.readPlaylist(baseUri);
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const playlistUri = getPlaylistUri(normalizedBaseUri);

  if (!(await exists(playlistUri))) {
    return null;
  }

  const rawPlaylist = await readFile(playlistUri, {encoding: 'utf8'});
  if (!rawPlaylist.trim()) {
    return null;
  }
  const parsed = JSON.parse(rawPlaylist) as unknown;

  if (!isValidPlaylistEntry(parsed)) {
    throw new Error('playlist.json has an invalid structure.');
  }

  return parsed;
}

export async function writePlaylist(
  baseUri: string,
  entry: PlaylistEntry,
): Promise<void> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    await devStorage.writePlaylist(baseUri, entry);
    return;
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const noteboxDirectoryUri = getNoteboxDirectoryUri(normalizedBaseUri);
  const playlistUri = getPlaylistUri(normalizedBaseUri);

  if (!(await exists(noteboxDirectoryUri))) {
    await mkdir(noteboxDirectoryUri);
  }

  await writeFile(playlistUri, serializePlaylist(entry), {
    encoding: 'utf8',
    mimeType: 'application/json',
  });
}

export async function clearPlaylist(baseUri: string): Promise<void> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    await devStorage.clearPlaylist(baseUri);
    return;
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const playlistUri = getPlaylistUri(normalizedBaseUri);

  if (!(await exists(playlistUri))) {
    return;
  }

  await writeFile(playlistUri, '', {
    encoding: 'utf8',
    mimeType: 'application/json',
  });
}

export async function readPodcastImageCacheEntry(
  baseUri: string,
  cacheKey: string,
): Promise<PodcastImageCacheEntry | null> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    return devStorage.readPodcastImageCacheEntry(baseUri, cacheKey);
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const normalizedCacheKey = cacheKey.trim();
  if (!normalizedCacheKey) {
    throw new Error('Cache key cannot be empty.');
  }

  const entryUri = getPodcastImageEntryUri(normalizedBaseUri, normalizedCacheKey);
  if (!(await exists(entryUri))) {
    return null;
  }

  const rawEntry = await readFile(entryUri, {encoding: 'utf8'});
  if (!rawEntry.trim()) {
    return null;
  }

  const parsed = JSON.parse(rawEntry) as unknown;
  if (!isValidPodcastImageCacheEntry(parsed)) {
    throw new Error('Podcast image cache entry has an invalid structure.');
  }

  return parsed;
}

export async function writePodcastImageCacheEntry(
  baseUri: string,
  cacheKey: string,
  entry: PodcastImageCacheEntry,
): Promise<void> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    await devStorage.writePodcastImageCacheEntry(baseUri, cacheKey, entry);
    return;
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const normalizedCacheKey = cacheKey.trim();
  if (!normalizedCacheKey) {
    throw new Error('Cache key cannot be empty.');
  }

  const noteboxDirectoryUri = getNoteboxDirectoryUri(normalizedBaseUri);
  const podcastImagesDirectoryUri = getPodcastImagesDirectoryUri(normalizedBaseUri);
  const entryUri = getPodcastImageEntryUri(normalizedBaseUri, normalizedCacheKey);

  if (!(await exists(noteboxDirectoryUri))) {
    await mkdir(noteboxDirectoryUri);
  }

  if (!(await exists(podcastImagesDirectoryUri))) {
    await mkdir(podcastImagesDirectoryUri);
  }

  await writeFile(entryUri, serializePodcastImageCacheEntry(entry), {
    encoding: 'utf8',
    mimeType: 'application/json',
  });
}

export async function writePodcastImageFile(
  baseUri: string,
  cacheKey: string,
  base64Data: string,
  extension: string,
  mimeType: string,
): Promise<string> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    return devStorage.writePodcastImageFile(baseUri, cacheKey, base64Data, extension, mimeType);
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const normalizedCacheKey = cacheKey.trim();
  const normalizedExtension = extension.trim().toLowerCase();
  const normalizedBase64Data = base64Data.trim();
  const normalizedMimeType = mimeType.trim();
  if (!normalizedCacheKey) {
    throw new Error('Cache key cannot be empty.');
  }
  if (!normalizedExtension) {
    throw new Error('Image extension cannot be empty.');
  }
  if (!normalizedBase64Data) {
    throw new Error('Image payload cannot be empty.');
  }

  const noteboxDirectoryUri = getNoteboxDirectoryUri(normalizedBaseUri);
  const podcastImagesDirectoryUri = getPodcastImagesDirectoryUri(normalizedBaseUri);
  const imageUri = getPodcastImageFileUri(
    normalizedBaseUri,
    normalizedCacheKey,
    normalizedExtension,
  );

  if (!(await exists(noteboxDirectoryUri))) {
    await mkdir(noteboxDirectoryUri);
  }

  if (!(await exists(podcastImagesDirectoryUri))) {
    await mkdir(podcastImagesDirectoryUri);
  }

  await writeFile(imageUri, normalizedBase64Data, {
    encoding: 'base64',
    mimeType: normalizedMimeType || 'image/*',
  });
  return imageUri;
}

export async function clearPodcastImageCacheEntry(
  baseUri: string,
  cacheKey: string,
): Promise<void> {
  if (isDevMockVaultEnabled) {
    const devStorage = getDevStorage();
    await devStorage.clearPodcastImageCacheEntry(baseUri, cacheKey);
    return;
  }

  const normalizedBaseUri = normalizeBaseUri(baseUri);
  const normalizedCacheKey = cacheKey.trim();
  if (!normalizedCacheKey) {
    return;
  }

  const entryUri = getPodcastImageEntryUri(normalizedBaseUri, normalizedCacheKey);
  if (!(await exists(entryUri))) {
    return;
  }

  await writeFile(entryUri, '', {
    encoding: 'utf8',
    mimeType: 'application/json',
  });
}

export function getNoteTitle(noteName: string): string {
  return titleFromNoteName(noteName);
}

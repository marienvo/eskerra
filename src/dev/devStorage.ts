import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  NoteDetail,
  NoteSummary,
  NoteboxSettings,
  PodcastImageCacheEntry,
  PlaylistEntry,
  RootMarkdownFile,
} from '../types';
import {NOTES_DIRECTORY_URI_KEY} from '../core/storage/keys';
import {
  DEV_MOCK_VAULT_URI,
  MOCK_NOTES,
  MOCK_PODCAST_FILES,
  MOCK_SETTINGS,
} from './mockVaultData';

const DEV_STORAGE_PREFIX = '@notebox_dev';
const DEV_SEEDED_KEY = `${DEV_STORAGE_PREFIX}:seeded`;
const DEV_SETTINGS_KEY = `${DEV_STORAGE_PREFIX}:settings`;
const DEV_NOTES_INDEX_KEY = `${DEV_STORAGE_PREFIX}:notes:index`;
const DEV_PODCAST_INDEX_KEY = `${DEV_STORAGE_PREFIX}:podcasts:index`;
const DEV_PLAYLIST_KEY = `${DEV_STORAGE_PREFIX}:playlist`;
const DEV_PODCAST_IMAGE_PREFIX = `${DEV_STORAGE_PREFIX}:podcast-image`;
const GENERAL_DIRECTORY_NAME = 'General';
const INBOX_DIRECTORY_NAME = 'Inbox';
const MARKDOWN_EXTENSION = '.md';
const SYNC_CONFLICT_MARKER = 'sync-conflict';

type NotesIndex = Record<string, number>;
type PodcastIndex = Record<string, number>;

function devNoteKey(noteName: string): string {
  return `${DEV_STORAGE_PREFIX}:note:${noteName}`;
}

function devPodcastKey(fileName: string): string {
  return `${DEV_STORAGE_PREFIX}:podcast:${encodeURIComponent(fileName)}`;
}

function devPodcastImageKey(cacheKey: string): string {
  return `${DEV_PODCAST_IMAGE_PREFIX}:${cacheKey}`;
}

function normalizeBaseUri(baseUri: string): string {
  const normalizedBaseUri = baseUri.trim();

  if (!normalizedBaseUri) {
    throw new Error('Base URI cannot be empty.');
  }

  return normalizedBaseUri;
}

function normalizeNoteUri(noteUri: string): string {
  const normalizedNoteUri = noteUri.trim();

  if (!normalizedNoteUri) {
    throw new Error('Note URI cannot be empty.');
  }

  return normalizedNoteUri;
}

function serializeSettings(settings: NoteboxSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
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

function noteUriFromName(noteName: string): string {
  return `${DEV_MOCK_VAULT_URI}/${noteName}`;
}

function rootMarkdownUriFromName(fileName: string): string {
  return `${DEV_MOCK_VAULT_URI}/${fileName}`;
}

function inInboxPath(fileName: string): string {
  return `${INBOX_DIRECTORY_NAME}/${fileName}`;
}

function noteNameFromUri(noteUri: string): string {
  const normalizedNoteUri = normalizeNoteUri(noteUri);
  const prefix = `${DEV_MOCK_VAULT_URI}/`;

  if (!normalizedNoteUri.startsWith(prefix)) {
    throw new Error('Invalid note URI.');
  }

  const noteName = normalizedNoteUri.slice(prefix.length);

  if (!noteName) {
    throw new Error('Invalid note URI.');
  }

  return noteName;
}

function normalizeNoteContent(content: string): string {
  const trimmedContent = content.trim();
  return trimmedContent ? `${trimmedContent}\n` : '';
}

function isSyncConflictFileName(fileName: string): boolean {
  return fileName.toLowerCase().includes(SYNC_CONFLICT_MARKER);
}

async function readNotesIndex(): Promise<NotesIndex> {
  const rawIndex = await AsyncStorage.getItem(DEV_NOTES_INDEX_KEY);

  if (!rawIndex) {
    return {};
  }

  const parsed = JSON.parse(rawIndex) as NotesIndex;
  return parsed ?? {};
}

async function writeNotesIndex(index: NotesIndex): Promise<void> {
  await AsyncStorage.setItem(DEV_NOTES_INDEX_KEY, JSON.stringify(index));
}

async function readPodcastIndex(): Promise<PodcastIndex> {
  const rawIndex = await AsyncStorage.getItem(DEV_PODCAST_INDEX_KEY);

  if (!rawIndex) {
    return {};
  }

  const parsed = JSON.parse(rawIndex) as PodcastIndex;
  return parsed ?? {};
}

async function writePodcastIndex(index: PodcastIndex): Promise<void> {
  await AsyncStorage.setItem(DEV_PODCAST_INDEX_KEY, JSON.stringify(index));
}

async function ensureSeeded(): Promise<void> {
  const seeded = await AsyncStorage.getItem(DEV_SEEDED_KEY);

  if (seeded === '4') {
    return;
  }

  const timestamp = Date.now();
  const notesIndex: NotesIndex = {};
  const podcastIndex: PodcastIndex = {};

  for (const note of MOCK_NOTES) {
    const inboxNoteName = inInboxPath(note.name);
    notesIndex[inboxNoteName] = timestamp;
    await AsyncStorage.setItem(devNoteKey(inboxNoteName), note.content);
  }

  for (const podcastFile of MOCK_PODCAST_FILES) {
    podcastIndex[podcastFile.name] = timestamp;
    await AsyncStorage.setItem(
      devPodcastKey(podcastFile.name),
      normalizeNoteContent(podcastFile.content),
    );
  }

  await writeNotesIndex(notesIndex);
  await writePodcastIndex(podcastIndex);
  await AsyncStorage.setItem(DEV_SETTINGS_KEY, serializeSettings(MOCK_SETTINGS));
  await AsyncStorage.setItem(DEV_SEEDED_KEY, '4');
}

function assertMockBaseUri(baseUri: string): void {
  const normalizedBaseUri = normalizeBaseUri(baseUri);

  if (normalizedBaseUri !== DEV_MOCK_VAULT_URI) {
    throw new Error('Invalid dev mock vault URI.');
  }
}

export async function getSavedUri(): Promise<string | null> {
  const savedUri = await AsyncStorage.getItem(NOTES_DIRECTORY_URI_KEY);
  const normalizedSavedUri = savedUri?.trim();

  if (normalizedSavedUri) {
    return normalizedSavedUri;
  }

  await saveUri(DEV_MOCK_VAULT_URI);
  return DEV_MOCK_VAULT_URI;
}

export async function saveUri(uri: string): Promise<void> {
  const normalizedUri = uri.trim();

  if (!normalizedUri) {
    throw new Error('Directory URI cannot be empty.');
  }

  await AsyncStorage.setItem(NOTES_DIRECTORY_URI_KEY, DEV_MOCK_VAULT_URI);
}

export function clearUri(): Promise<void> {
  return AsyncStorage.removeItem(NOTES_DIRECTORY_URI_KEY);
}

export async function initNotebox(baseUri: string): Promise<void> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();
}

export async function readSettings(baseUri: string): Promise<NoteboxSettings> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const rawSettings = await AsyncStorage.getItem(DEV_SETTINGS_KEY);

  if (!rawSettings) {
    throw new Error('settings.json was not found in dev mock vault.');
  }

  return parseSettings(rawSettings);
}

export async function writeSettings(
  baseUri: string,
  settings: NoteboxSettings,
): Promise<void> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  await AsyncStorage.setItem(DEV_SETTINGS_KEY, serializeSettings(settings));
}

export async function listNotes(baseUri: string): Promise<NoteSummary[]> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const index = await readNotesIndex();

  return Object.keys(index)
    .filter(
      name =>
        name.startsWith(`${INBOX_DIRECTORY_NAME}/`) &&
        name.endsWith(MARKDOWN_EXTENSION) &&
        !isSyncConflictFileName(name),
    )
    .map(name => ({
      lastModified: index[name] ?? null,
      name,
      uri: noteUriFromName(name),
    }))
    .sort((left, right) => {
      const leftValue = left.lastModified ?? 0;
      const rightValue = right.lastModified ?? 0;
      return rightValue - leftValue;
    });
}

export async function readNote(noteUri: string): Promise<NoteDetail> {
  await ensureSeeded();
  const name = noteNameFromUri(noteUri);
  const content = await AsyncStorage.getItem(devNoteKey(name));

  if (content === null) {
    throw new Error('Note was not found in dev mock vault.');
  }

  return {
    content,
    summary: {
      lastModified: null,
      name,
      uri: noteUriFromName(name),
    },
  };
}

export async function listGeneralMarkdownFiles(
  baseUri: string,
): Promise<RootMarkdownFile[]> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const index = await readPodcastIndex();

  return Object.keys(index)
    .filter(
      name =>
        name.startsWith(`${GENERAL_DIRECTORY_NAME}/`) &&
        name.endsWith(MARKDOWN_EXTENSION) &&
        !isSyncConflictFileName(name),
    )
    .map(name => ({
      lastModified: index[name] ?? null,
      name: name.split('/').pop() ?? name,
      uri: rootMarkdownUriFromName(name),
    }))
    .sort((left, right) => {
      const leftValue = left.lastModified ?? 0;
      const rightValue = right.lastModified ?? 0;
      return rightValue - leftValue;
    });
}

export async function readPodcastFileContent(fileUri: string): Promise<string> {
  await ensureSeeded();
  const fileName = noteNameFromUri(fileUri);
  const content = await AsyncStorage.getItem(devPodcastKey(fileName));

  if (content === null) {
    throw new Error('Podcast file was not found in dev mock vault.');
  }

  return content;
}

export async function writePodcastFileContent(
  fileUri: string,
  content: string,
): Promise<void> {
  await ensureSeeded();
  const fileName = noteNameFromUri(fileUri);
  const index = await readPodcastIndex();

  if (!Object.prototype.hasOwnProperty.call(index, fileName)) {
    throw new Error('Podcast file was not found in dev mock vault.');
  }

  await AsyncStorage.setItem(devPodcastKey(fileName), normalizeNoteContent(content));
  index[fileName] = Date.now();
  await writePodcastIndex(index);
}

export async function createNote(
  baseUri: string,
  title: string,
  content: string,
): Promise<NoteSummary> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const index = await readNotesIndex();
  const baseName = sanitizeFileName(title);
  let fileName = inInboxPath(`${baseName}${MARKDOWN_EXTENSION}`);
  let nextSuffix = 2;

  while (Object.prototype.hasOwnProperty.call(index, fileName)) {
    fileName = inInboxPath(`${baseName}-${nextSuffix}${MARKDOWN_EXTENSION}`);
    nextSuffix += 1;
  }

  const lastModified = Date.now();
  await AsyncStorage.setItem(devNoteKey(fileName), normalizeNoteContent(content));
  index[fileName] = lastModified;
  await writeNotesIndex(index);

  return {
    lastModified,
    name: fileName,
    uri: noteUriFromName(fileName),
  };
}

export async function writeNoteContent(
  noteUri: string,
  content: string,
): Promise<void> {
  await ensureSeeded();
  const fileName = noteNameFromUri(noteUri);
  const index = await readNotesIndex();

  if (!Object.prototype.hasOwnProperty.call(index, fileName)) {
    throw new Error('Note was not found in dev mock vault.');
  }

  await AsyncStorage.setItem(devNoteKey(fileName), `${content}\n`);
  index[fileName] = Date.now();
  await writeNotesIndex(index);
}

export async function readPlaylist(baseUri: string): Promise<PlaylistEntry | null> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const rawPlaylist = await AsyncStorage.getItem(DEV_PLAYLIST_KEY);
  if (!rawPlaylist) {
    return null;
  }

  return JSON.parse(rawPlaylist) as PlaylistEntry;
}

export async function writePlaylist(
  baseUri: string,
  entry: PlaylistEntry,
): Promise<void> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  await AsyncStorage.setItem(DEV_PLAYLIST_KEY, JSON.stringify(entry));
}

export async function clearPlaylist(baseUri: string): Promise<void> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  await AsyncStorage.removeItem(DEV_PLAYLIST_KEY);
}

export async function readPodcastImageCacheEntry(
  baseUri: string,
  cacheKey: string,
): Promise<PodcastImageCacheEntry | null> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const normalizedCacheKey = cacheKey.trim();
  if (!normalizedCacheKey) {
    throw new Error('Cache key cannot be empty.');
  }

  const rawEntry = await AsyncStorage.getItem(devPodcastImageKey(normalizedCacheKey));
  if (!rawEntry) {
    return null;
  }

  return JSON.parse(rawEntry) as PodcastImageCacheEntry;
}

export async function writePodcastImageCacheEntry(
  baseUri: string,
  cacheKey: string,
  entry: PodcastImageCacheEntry,
): Promise<void> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const normalizedCacheKey = cacheKey.trim();
  if (!normalizedCacheKey) {
    throw new Error('Cache key cannot be empty.');
  }

  await AsyncStorage.setItem(
    devPodcastImageKey(normalizedCacheKey),
    JSON.stringify(entry),
  );
}

export async function writePodcastImageFile(
  baseUri: string,
  cacheKey: string,
  base64Data: string,
  extension: string,
  mimeType: string,
): Promise<string> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const normalizedCacheKey = cacheKey.trim();
  const normalizedExtension = extension.trim().toLowerCase();
  const normalizedPayload = base64Data.trim();
  if (!normalizedCacheKey) {
    throw new Error('Cache key cannot be empty.');
  }
  if (!normalizedExtension) {
    throw new Error('Image extension cannot be empty.');
  }
  if (!normalizedPayload) {
    throw new Error('Image payload cannot be empty.');
  }

  const normalizedMimeType = mimeType.trim();
  const imageUri = `${DEV_MOCK_VAULT_URI}/.notebox/podcast-images/${normalizedCacheKey}.${normalizedExtension}`;
  await AsyncStorage.setItem(
    `${devPodcastImageKey(normalizedCacheKey)}:file`,
    JSON.stringify({
      base64Data: normalizedPayload,
      imageUri,
      mimeType: normalizedMimeType || 'image/*',
    }),
  );
  return imageUri;
}

export async function clearPodcastImageCacheEntry(
  baseUri: string,
  cacheKey: string,
): Promise<void> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const normalizedCacheKey = cacheKey.trim();
  if (!normalizedCacheKey) {
    return;
  }

  await AsyncStorage.removeItem(devPodcastImageKey(normalizedCacheKey));
}

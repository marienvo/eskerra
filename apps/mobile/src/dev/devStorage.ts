import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  normalizePlaylistEntryForSync,
  parseNoteboxLocalSettings,
  parseNoteboxSettings,
  serializeNoteboxLocalSettings,
  serializeNoteboxSettings,
} from '@notebox/core';

import {
  NoteDetail,
  NoteSummary,
  NoteboxLocalSettings,
  NoteboxSettings,
  PlaylistEntry,
  RootMarkdownFile,
} from '../types';
import {NOTES_DIRECTORY_URI_KEY} from '../core/storage/keys';
import {pickNextInboxMarkdownFileName} from '../core/storage/noteboxStorage';
import {
  DEV_MOCK_VAULT_URI,
  MOCK_LOCAL_SETTINGS,
  MOCK_NOTES,
  MOCK_PODCAST_FILES,
  MOCK_SETTINGS,
} from './mockVaultData';

const DEV_STORAGE_PREFIX = '@notebox_dev';
const DEV_SEEDED_KEY = `${DEV_STORAGE_PREFIX}:seeded`;
const DEV_SETTINGS_KEY = `${DEV_STORAGE_PREFIX}:settings`;
const DEV_LOCAL_SETTINGS_KEY = `${DEV_STORAGE_PREFIX}:local_settings`;
const DEV_NOTES_INDEX_KEY = `${DEV_STORAGE_PREFIX}:notes:index`;
const DEV_PODCAST_INDEX_KEY = `${DEV_STORAGE_PREFIX}:podcasts:index`;
const DEV_PLAYLIST_KEY = `${DEV_STORAGE_PREFIX}:playlist`;
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

function sanitizeFileName(rawName: string): string {
  const withoutControlChars = Array.from(rawName.trim())
    .filter(ch => ch >= ' ' && ch !== '\u007f')
    .join('');
  const normalized = withoutControlChars
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '');

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

function stemFromMarkdownBasename(basename: string): string {
  return basename.endsWith(MARKDOWN_EXTENSION)
    ? basename.slice(0, -MARKDOWN_EXTENSION.length)
    : basename;
}

function buildInboxMarkdownIndexBodyFromBasenames(markdownBasenames: string[]): string {
  const stems = markdownBasenames
    .map(name => stemFromMarkdownBasename(name))
    .sort((a, b) => a.localeCompare(b));
  const lines = ['# Inbox', '', ...stems.map(stem => `- [[Inbox/${stem}|${stem}]]`)];
  return `${lines.join('\n')}\n`;
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

  if (seeded === '7') {
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
  await AsyncStorage.setItem(DEV_SETTINGS_KEY, serializeNoteboxSettings(MOCK_SETTINGS));
  await AsyncStorage.setItem(
    DEV_LOCAL_SETTINGS_KEY,
    serializeNoteboxLocalSettings(MOCK_LOCAL_SETTINGS),
  );
  await AsyncStorage.setItem(DEV_SEEDED_KEY, '7');
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
    throw new Error('settings-shared.json was not found in dev mock vault.');
  }

  return parseNoteboxSettings(rawSettings);
}

export async function writeSettings(
  baseUri: string,
  settings: NoteboxSettings,
): Promise<void> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  await AsyncStorage.setItem(DEV_SETTINGS_KEY, serializeNoteboxSettings(settings));
}

export async function readLocalSettings(baseUri: string): Promise<NoteboxLocalSettings> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const raw = await AsyncStorage.getItem(DEV_LOCAL_SETTINGS_KEY);

  if (!raw) {
    throw new Error('settings-local.json was not found in dev mock vault.');
  }

  return parseNoteboxLocalSettings(raw);
}

export async function writeLocalSettings(
  baseUri: string,
  settings: NoteboxLocalSettings,
): Promise<void> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  await AsyncStorage.setItem(
    DEV_LOCAL_SETTINGS_KEY,
    serializeNoteboxLocalSettings(settings),
  );
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
  const occupiedBasenames = new Set(
    Object.keys(index)
      .filter(name => name.startsWith(`${INBOX_DIRECTORY_NAME}/`))
      .map(name => name.slice(INBOX_DIRECTORY_NAME.length + 1)),
  );
  const fileName = inInboxPath(
    pickNextInboxMarkdownFileName(baseName, occupiedBasenames),
  );

  const lastModified = Date.now();
  await AsyncStorage.setItem(devNoteKey(fileName), normalizeNoteContent(content));
  index[fileName] = lastModified;
  await writeNotesIndex(index);
  await refreshInboxMarkdownIndex(baseUri);

  return {
    lastModified,
    name: fileName,
    uri: noteUriFromName(fileName),
  };
}

async function syncInboxMarkdownIndexFromSummaries(
  baseUri: string,
  summaries: NoteSummary[],
): Promise<void> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const basenames = summaries.map(summary => {
    const segments = summary.name.split('/');
    return segments[segments.length - 1] ?? summary.name;
  });
  const body = buildInboxMarkdownIndexBodyFromBasenames(basenames);
  const indexPath = `${GENERAL_DIRECTORY_NAME}/Inbox.md`;
  const podcastIndex = await readPodcastIndex();
  podcastIndex[indexPath] = Date.now();
  await writePodcastIndex(podcastIndex);
  await AsyncStorage.setItem(devPodcastKey(indexPath), body);
}

export async function refreshInboxMarkdownIndex(baseUri: string): Promise<void> {
  const summaries = await listNotes(baseUri);
  await syncInboxMarkdownIndexFromSummaries(baseUri, summaries);
}

export async function listInboxNotesAndSyncIndex(baseUri: string): Promise<NoteSummary[]> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();
  const summaries = await listNotes(baseUri);
  await syncInboxMarkdownIndexFromSummaries(baseUri, summaries);
  return summaries;
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

export async function deleteInboxNotes(
  baseUri: string,
  noteUris: readonly string[],
): Promise<void> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const index = await readNotesIndex();
  for (const noteUri of noteUris) {
    const fileName = noteNameFromUri(noteUri);
    if (!fileName.startsWith(`${INBOX_DIRECTORY_NAME}/`)) {
      throw new Error('Only Log entries can be deleted.');
    }
    delete index[fileName];
    await AsyncStorage.removeItem(devNoteKey(fileName));
  }

  await writeNotesIndex(index);
  await refreshInboxMarkdownIndex(baseUri);
}

export async function readPlaylist(baseUri: string): Promise<PlaylistEntry | null> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const rawPlaylist = await AsyncStorage.getItem(DEV_PLAYLIST_KEY);
  if (!rawPlaylist) {
    return null;
  }

  const parsed: unknown = JSON.parse(rawPlaylist);
  const entry = normalizePlaylistEntryForSync(parsed);
  if (!entry) {
    throw new Error('playlist.json has an invalid structure.');
  }
  return entry;
}

export async function writePlaylist(
  baseUri: string,
  entry: PlaylistEntry,
): Promise<PlaylistEntry> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  const next: PlaylistEntry = {...entry, updatedAt: Math.max(Date.now(), entry.updatedAt)};
  await AsyncStorage.setItem(DEV_PLAYLIST_KEY, JSON.stringify(next));
  return next;
}

export async function clearPlaylist(baseUri: string): Promise<void> {
  assertMockBaseUri(baseUri);
  await ensureSeeded();

  await AsyncStorage.removeItem(DEV_PLAYLIST_KEY);
}

/**
 * Dev mock: treat non-empty URIs as resolvable (vault paths are not backed by real SAF in dev).
 */
export async function safUriExists(uri: string): Promise<boolean> {
  const normalizedUri = uri.trim();
  if (!normalizedUri) {
    return false;
  }

  return true;
}

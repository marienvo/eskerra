import {
  buildInboxMarkdownIndexContent,
  getGeneralDirectoryUri,
  getInboxDirectoryUri,
  getInboxIndexUri,
  getNoteboxDirectoryUri,
  getPlaylistUri,
  getSettingsUri,
  isSyncConflictFileName,
  isValidPlaylistEntry,
  MARKDOWN_EXTENSION,
  initNoteboxVault,
  normalizeVaultBaseUri,
  parseNoteboxSettings,
  pickNextInboxMarkdownFileName,
  sanitizeFileName,
  serializeNoteboxSettings,
  serializePlaylistEntry,
  type NoteboxSettings,
  type PlaylistEntry,
} from '@notebox/core';

import {tryListMarkdownFilesNative} from './androidVaultListing';
import {normalizeNoteUri} from './noteUriNormalize';
import {safVaultFilesystem} from './safVaultFilesystem';
import {DEV_MOCK_VAULT_URI} from '../../dev/mockVaultData';
import {
  NoteDetail,
  NoteSummary,
  RootMarkdownFile,
} from '../../types';

const vaultFs = safVaultFilesystem;

const playlistReadCoalescer = new Map<string, Promise<PlaylistEntry | null>>();
/** AsyncStorage-backed mock vault; never SAF. */
function isDevMockVaultBaseUri(baseUri: string): boolean {
  return baseUri.trim() === DEV_MOCK_VAULT_URI;
}

/** True when [baseUri] is the in-app mock vault (no SAF / no native RSS sync). */
export function isNoteboxDevMockVaultBaseUri(baseUri: string): boolean {
  return isDevMockVaultBaseUri(baseUri);
}

/** `${normalizedBaseUri}/General` for vault tree or mock roots. */
export function getVaultGeneralDirectoryUri(baseUri: string): string {
  return getGeneralDirectoryUri(normalizeVaultBaseUri(baseUri));
}

function isDevMockVaultScopedUri(uri: string): boolean {
  const normalized = uri.trim();
  return (
    normalized === DEV_MOCK_VAULT_URI ||
    normalized.startsWith(`${DEV_MOCK_VAULT_URI}/`)
  );
}

function getDevStorage() {
  return require('../../dev/devStorage') as typeof import('../../dev/devStorage');
}

export {normalizeNoteUri} from './noteUriNormalize';
export {parseNoteboxSettings} from '@notebox/core';
export {pickNextInboxMarkdownFileName} from '@notebox/core';

type MarkdownDirRow = {lastModified: number | null; name: string; uri: string};

/**
 * SAF-backed listing via VaultFilesystem. Used in parallel with native listing so a slow or
 * failing Kotlin `listMarkdownFiles` call does not block the fast JS path.
 */
async function listMarkdownFilesViaSaf(
  directoryUri: string,
  getShouldCancel?: () => boolean,
): Promise<MarkdownDirRow[]> {
  if (getShouldCancel?.()) {
    return [];
  }
  if (!(await vaultFs.exists(directoryUri))) {
    return [];
  }
  if (getShouldCancel?.()) {
    return [];
  }
  const documents = await vaultFs.listFiles(directoryUri);

  return documents
    .filter(document => {
      const isFile = document.type === 'file' || document.type === undefined;
      return (
        isFile &&
        typeof document.name === 'string' &&
        document.name.length > 0 &&
        document.name.endsWith(MARKDOWN_EXTENSION) &&
        !isSyncConflictFileName(document.name)
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

async function listMarkdownFilesInDirectory(
  directoryUri: string,
): Promise<MarkdownDirRow[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (rows: MarkdownDirRow[]) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(rows);
    };

    (async () => {
      try {
        const rows = await listMarkdownFilesViaSaf(directoryUri, () => settled);
        if (!settled) {
          settle(rows);
        }
      } catch (error) {
        if (!settled) {
          reject(error);
        }
      }
    })();

    (async () => {
      const native = await tryListMarkdownFilesNative(directoryUri);
      if (!settled && native !== null) {
        settle(native);
      }
    })();
  });
}

export async function initNotebox(baseUri: string): Promise<void> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    await devStorage.initNotebox(baseUri);
    return;
  }

  await initNoteboxVault(baseUri, vaultFs);
}

export async function readSettings(baseUri: string): Promise<NoteboxSettings> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    return devStorage.readSettings(baseUri);
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const settingsUri = getSettingsUri(normalizedBaseUri);
  const rawSettings = await vaultFs.readFile(settingsUri, {encoding: 'utf8'});

  return parseNoteboxSettings(rawSettings);
}

export async function writeSettings(
  baseUri: string,
  settings: NoteboxSettings,
): Promise<void> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    await devStorage.writeSettings(baseUri, settings);
    return;
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const settingsUri = getSettingsUri(normalizedBaseUri);

  await vaultFs.writeFile(settingsUri, serializeNoteboxSettings(settings), {
    encoding: 'utf8',
    mimeType: 'application/json',
  });
}

export async function listNotes(baseUri: string): Promise<NoteSummary[]> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    return devStorage.listNotes(baseUri);
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const inboxDirectoryUri = getInboxDirectoryUri(normalizedBaseUri);

  return listMarkdownFilesInDirectory(inboxDirectoryUri);
}

/**
 * Lists Inbox markdown notes and writes `General/Inbox.md` from that single directory scan.
 * Prefer this over `listNotes` + `refreshInboxMarkdownIndex` to avoid duplicate SAF work.
 */
export async function listInboxNotesAndSyncIndex(baseUri: string): Promise<NoteSummary[]> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    return devStorage.listInboxNotesAndSyncIndex(baseUri);
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const inboxRows = await listMarkdownFilesInDirectory(
    getInboxDirectoryUri(normalizedBaseUri),
  );
  await writeInboxMarkdownIndexFromMarkdownFileNames(
    normalizedBaseUri,
    inboxRows.map(row => row.name),
  );
  return inboxRows;
}

export async function listGeneralMarkdownFiles(
  baseUri: string,
): Promise<RootMarkdownFile[]> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    return devStorage.listGeneralMarkdownFiles(baseUri);
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const generalDirectoryUri = getGeneralDirectoryUri(normalizedBaseUri);

  return listMarkdownFilesInDirectory(generalDirectoryUri);
}

export function isNoteUriInInbox(noteUri: string, baseUri: string): boolean {
  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const normalizedNoteUri = normalizeNoteUri(noteUri);
  const inboxDirectoryUri = getInboxDirectoryUri(normalizedBaseUri);
  if (normalizedNoteUri.startsWith(`${inboxDirectoryUri}/`)) {
    return true;
  }

  // Some SAF providers return canonical document URIs (`.../document/<docId>`) where the
  // Inbox path is embedded in `<docId>` instead of a plain `<base>/Inbox/<file>` prefix.
  // Decode and check for an Inbox segment to avoid false negatives on valid Inbox notes.
  try {
    const decoded = decodeURIComponent(normalizedNoteUri);
    return /(?:^|[/:])Inbox\//.test(decoded);
  } catch {
    return false;
  }
}

async function writeInboxMarkdownIndexFromMarkdownFileNames(
  normalizedBaseUri: string,
  markdownFileNames: string[],
): Promise<void> {
  const body = buildInboxMarkdownIndexContent(markdownFileNames);
  const generalDirectoryUri = getGeneralDirectoryUri(normalizedBaseUri);

  if (!(await vaultFs.exists(generalDirectoryUri))) {
    await vaultFs.mkdir(generalDirectoryUri);
  }

  const inboxIndexUri = getInboxIndexUri(normalizedBaseUri);
  try {
    const existing = await vaultFs.readFile(inboxIndexUri, {encoding: 'utf8'});
    if (existing === body) {
      return;
    }
  } catch {
    // Missing or unreadable: write a new index below.
  }

  await vaultFs.writeFile(inboxIndexUri, body, {
    encoding: 'utf8',
    mimeType: 'text/markdown',
  });
}

export async function refreshInboxMarkdownIndex(baseUri: string): Promise<void> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    await devStorage.refreshInboxMarkdownIndex(baseUri);
    return;
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const inboxRows = await listMarkdownFilesInDirectory(
    getInboxDirectoryUri(normalizedBaseUri),
  );
  await writeInboxMarkdownIndexFromMarkdownFileNames(
    normalizedBaseUri,
    inboxRows.map(row => row.name),
  );
}

export async function readNote(noteUri: string): Promise<NoteDetail> {
  if (isDevMockVaultScopedUri(noteUri)) {
    const devStorage = getDevStorage();
    return devStorage.readNote(noteUri);
  }

  const normalizedNoteUri = normalizeNoteUri(noteUri);
  const content = await vaultFs.readFile(normalizedNoteUri, {encoding: 'utf8'});

  const nameFromUri = normalizedNoteUri.split('/').pop() ?? 'Untitled.md';
  const summary: NoteSummary = {
    lastModified: null,
    name: nameFromUri,
    uri: normalizedNoteUri,
  };

  return {content, summary};
}

export async function readPodcastFileContent(fileUri: string): Promise<string> {
  if (isDevMockVaultScopedUri(fileUri)) {
    const devStorage = getDevStorage();
    return devStorage.readPodcastFileContent(fileUri);
  }

  const normalizedFileUri = normalizeNoteUri(fileUri);
  return vaultFs.readFile(normalizedFileUri, {encoding: 'utf8'});
}

export async function writePodcastFileContent(
  fileUri: string,
  content: string,
): Promise<void> {
  if (isDevMockVaultScopedUri(fileUri)) {
    const devStorage = getDevStorage();
    await devStorage.writePodcastFileContent(fileUri, content);
    return;
  }

  const normalizedFileUri = normalizeNoteUri(fileUri);
  const fileBody = `${content}\n`;

  await vaultFs.writeFile(normalizedFileUri, fileBody, {
    encoding: 'utf8',
    mimeType: 'text/markdown',
  });
}

export async function createNote(
  baseUri: string,
  title: string,
  content: string,
  occupiedInboxMarkdownNames: ReadonlySet<string> = new Set(),
): Promise<NoteSummary> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    return devStorage.createNote(baseUri, title, content);
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const inboxDirectoryUri = getInboxDirectoryUri(normalizedBaseUri);

  if (!(await vaultFs.exists(inboxDirectoryUri))) {
    await vaultFs.mkdir(inboxDirectoryUri);
  }

  const baseStem = sanitizeFileName(title);
  let fileName = pickNextInboxMarkdownFileName(baseStem, occupiedInboxMarkdownNames);
  let noteUri = `${inboxDirectoryUri}/${fileName}`;

  if (await vaultFs.exists(noteUri)) {
    const inboxRows = await listMarkdownFilesInDirectory(inboxDirectoryUri);
    const occupiedFromDisk = new Set(inboxRows.map(row => row.name));
    fileName = pickNextInboxMarkdownFileName(baseStem, occupiedFromDisk);
    noteUri = `${inboxDirectoryUri}/${fileName}`;
  }

  const trimmedContent = content.trim();
  const noteBody = trimmedContent ? `${trimmedContent}\n` : '';

  await vaultFs.writeFile(noteUri, noteBody, {
    encoding: 'utf8',
    mimeType: 'text/markdown',
  });

  await refreshInboxMarkdownIndex(normalizedBaseUri);

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
  if (isDevMockVaultScopedUri(noteUri)) {
    const devStorage = getDevStorage();
    await devStorage.writeNoteContent(noteUri, content);
    return;
  }

  const normalizedNoteUri = normalizeNoteUri(noteUri);
  const noteBody = `${content}\n`;

  await vaultFs.writeFile(normalizedNoteUri, noteBody, {
    encoding: 'utf8',
    mimeType: 'text/markdown',
  });
}

export async function deleteInboxNotes(
  baseUri: string,
  noteUris: readonly string[],
): Promise<void> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    await devStorage.deleteInboxNotes(baseUri, noteUris);
    return;
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  for (const noteUri of noteUris) {
    const normalizedNoteUri = normalizeNoteUri(noteUri);
    if (!isNoteUriInInbox(normalizedNoteUri, normalizedBaseUri)) {
      throw new Error('Could not verify that the selected entry belongs to Log.');
    }
    await vaultFs.unlink(normalizedNoteUri);
  }

  await refreshInboxMarkdownIndex(normalizedBaseUri);
}

export async function readPlaylist(baseUri: string): Promise<PlaylistEntry | null> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    return devStorage.readPlaylist(baseUri);
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const playlistUri = getPlaylistUri(normalizedBaseUri);

  if (!(await vaultFs.exists(playlistUri))) {
    return null;
  }

  const rawPlaylist = await vaultFs.readFile(playlistUri, {encoding: 'utf8'});
  if (!rawPlaylist.trim()) {
    return null;
  }
  const parsed = JSON.parse(rawPlaylist) as unknown;

  if (!isValidPlaylistEntry(parsed)) {
    throw new Error('playlist.json has an invalid structure.');
  }

  return parsed;
}

/**
 * Coalesces concurrent `readPlaylist` calls per baseUri.
 *
 * Unlike a simple in-flight cache that gets deleted on settle, we intentionally keep the settled
 * promise so a bootstrap “prime” can be reused by `usePlayer` without a second SAF roundtrip.
 */
export async function readPlaylistCoalesced(
  baseUri: string,
): Promise<PlaylistEntry | null> {
  const cacheKey = baseUri.trim();
  if (!cacheKey) {
    return readPlaylist(baseUri);
  }

  const existing = playlistReadCoalescer.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = readPlaylist(baseUri);
  playlistReadCoalescer.set(cacheKey, promise);
  return promise;
}

export function clearPlaylistReadCoalescerForBaseUri(baseUri: string): void {
  playlistReadCoalescer.delete(baseUri.trim());
}

export function clearAllPlaylistReadCoalescer(): void {
  playlistReadCoalescer.clear();
}

/**
 * Clears the playlist coalescer (in-memory) to avoid cross-test pollution.
 */
export function resetPlaylistReadCoalescerForTesting(): void {
  playlistReadCoalescer.clear();
}

export async function writePlaylist(
  baseUri: string,
  entry: PlaylistEntry,
): Promise<void> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    await devStorage.writePlaylist(baseUri, entry);
    playlistReadCoalescer.set(baseUri.trim(), Promise.resolve(entry));
    return;
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const cacheKey = normalizedBaseUri;
  const noteboxDirectoryUri = getNoteboxDirectoryUri(normalizedBaseUri);
  const playlistUri = getPlaylistUri(normalizedBaseUri);

  if (!(await vaultFs.exists(noteboxDirectoryUri))) {
    await vaultFs.mkdir(noteboxDirectoryUri);
  }

  await vaultFs.writeFile(playlistUri, serializePlaylistEntry(entry), {
    encoding: 'utf8',
    mimeType: 'application/json',
  });

  playlistReadCoalescer.set(cacheKey, Promise.resolve(entry));
}

export async function clearPlaylist(baseUri: string): Promise<void> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    await devStorage.clearPlaylist(baseUri);
    playlistReadCoalescer.set(baseUri.trim(), Promise.resolve(null));
    return;
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const cacheKey = normalizedBaseUri;
  const playlistUri = getPlaylistUri(normalizedBaseUri);

  if (!(await vaultFs.exists(playlistUri))) {
    return;
  }

  await vaultFs.writeFile(playlistUri, '', {
    encoding: 'utf8',
    mimeType: 'application/json',
  });

  playlistReadCoalescer.set(cacheKey, Promise.resolve(null));
}

/**
 * Returns whether a SAF-backed content URI or other react-native-saf-x path still exists.
 * Used when validating legacy vault podcast artwork (content://) and vault documents.
 */
export async function safUriExists(uri: string): Promise<boolean> {
  const normalizedUri = uri.trim();
  if (!normalizedUri) {
    return false;
  }

  if (isDevMockVaultScopedUri(normalizedUri)) {
    const devStorage = getDevStorage();
    return devStorage.safUriExists(normalizedUri);
  }

  return vaultFs.exists(normalizedUri);
}

export {getNoteTitle} from '@notebox/core';

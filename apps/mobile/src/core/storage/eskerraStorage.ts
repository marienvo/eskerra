import {
  buildInboxMarkdownIndexContent,
  deleteR2PlaylistObject,
  ensureDeviceInstanceId,
  getGeneralDirectoryUri,
  getInboxDirectoryUri,
  getInboxIndexUri,
  getLocalSettingsUri,
  getEskerraDirectoryUri,
  getPlaylistUri,
  getR2PlaylistObject,
  getSharedSettingsUri,
  isRemotePlaylistNewerThanKnown,
  isSyncConflictFileName,
  isVaultR2PlaylistConfigured,
  MARKDOWN_EXTENSION,
  defaultEskerraLocalSettings,
  initEskerraVault,
  normalizePlaylistEntryForSync,
  normalizeVaultBaseUri,
  parseEskerraLocalSettings,
  parseEskerraSettings,
  pickNewerPlaylistEntry,
  pickNextInboxMarkdownFileName,
  putR2PlaylistObject,
  readVaultSharedSettingsRaw,
  sanitizeFileName,
  serializeEskerraLocalSettings,
  serializeEskerraSettings,
  serializePlaylistEntry,
  type EskerraLocalSettings,
  type EskerraSettings,
  type PlaylistEntry,
  type PlaylistWriteMode,
  type PlaylistWriteResult,
} from '@eskerra/core';

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

export type {PlaylistWriteResult} from '@eskerra/core';

export function invalidatePlaylistReadCache(baseUri: string): void {
  playlistReadCoalescer.delete(normalizeVaultBaseUri(baseUri).trim());
}
/** AsyncStorage-backed mock vault; never SAF. */
function isDevMockVaultBaseUri(baseUri: string): boolean {
  return baseUri.trim() === DEV_MOCK_VAULT_URI;
}

/** True when [baseUri] is the in-app mock vault (no SAF / no native RSS sync). */
export function isEskerraDevMockVaultBaseUri(baseUri: string): boolean {
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
export {parseEskerraSettings} from '@eskerra/core';
export {pickNextInboxMarkdownFileName} from '@eskerra/core';

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
      const delta = right - left;
      if (delta !== 0) {
        return delta;
      }
      return a.name.localeCompare(b.name);
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

export async function initEskerra(baseUri: string): Promise<void> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    await devStorage.initEskerra(baseUri);
    return;
  }

  await initEskerraVault(baseUri, vaultFs);
}

/**
 * If shared JSON still has legacy `displayName`, copy it to local when local `displayName` is empty,
 * then rewrite shared without that key.
 */
export async function migrateLegacySharedDisplayNameIfNeeded(
  baseUri: string,
  rawShared: string,
  normalizedSettings: EskerraSettings,
): Promise<void> {
  if (isDevMockVaultBaseUri(baseUri)) {
    return;
  }

  let loose: Record<string, unknown>;
  try {
    loose = JSON.parse(rawShared) as Record<string, unknown>;
  } catch {
    return;
  }

  if (!('displayName' in loose)) {
    return;
  }

  const legacy = typeof loose.displayName === 'string' ? loose.displayName : '';
  const legacyDisplay = legacy.trim();
  if (legacyDisplay !== '') {
    const local = await readLocalSettings(baseUri);
    if (local.displayName === '') {
      await writeLocalSettings(baseUri, {...local, displayName: legacyDisplay});
    }
  }

  await writeSettings(baseUri, normalizedSettings);
}

export async function readSettings(baseUri: string): Promise<EskerraSettings> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    return devStorage.readSettings(baseUri);
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const rawSettings = await readVaultSharedSettingsRaw(normalizedBaseUri, vaultFs);
  const settings = parseEskerraSettings(rawSettings);
  await migrateLegacySharedDisplayNameIfNeeded(baseUri, rawSettings, settings);
  return settings;
}

export async function writeSettings(
  baseUri: string,
  settings: EskerraSettings,
): Promise<void> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    await devStorage.writeSettings(baseUri, settings);
    return;
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const settingsUri = getSharedSettingsUri(normalizedBaseUri);

  await vaultFs.writeFile(settingsUri, serializeEskerraSettings(settings), {
    encoding: 'utf8',
    mimeType: 'application/json',
  });
}

export async function readLocalSettings(baseUri: string): Promise<EskerraLocalSettings> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    return devStorage.readLocalSettings(baseUri);
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const localUri = getLocalSettingsUri(normalizedBaseUri);
  if (!(await vaultFs.exists(localUri))) {
    return defaultEskerraLocalSettings;
  }
  const raw = await vaultFs.readFile(localUri, {encoding: 'utf8'});
  return parseEskerraLocalSettings(raw);
}

export async function writeLocalSettings(
  baseUri: string,
  settings: EskerraLocalSettings,
): Promise<void> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    await devStorage.writeLocalSettings(baseUri, settings);
    return;
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const eskerraDir = getEskerraDirectoryUri(normalizedBaseUri);
  if (!(await vaultFs.exists(eskerraDir))) {
    await vaultFs.mkdir(eskerraDir);
  }
  const localUri = getLocalSettingsUri(normalizedBaseUri);
  await vaultFs.writeFile(localUri, serializeEskerraLocalSettings(settings), {
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

  await vaultFs.writeFile(noteUri, content, {
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

  await vaultFs.writeFile(normalizedNoteUri, content, {
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

async function readLocalPlaylistFileOnly(baseUri: string): Promise<PlaylistEntry | null> {
  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const playlistUri = getPlaylistUri(normalizedBaseUri);

  if (!(await vaultFs.exists(playlistUri))) {
    return null;
  }

  const rawPlaylist = await vaultFs.readFile(playlistUri, {encoding: 'utf8'});
  if (!rawPlaylist.trim()) {
    return null;
  }
  const parsed: unknown = JSON.parse(rawPlaylist);
  const entry = normalizePlaylistEntryForSync(parsed);
  if (!entry) {
    throw new Error('playlist.json has an invalid structure.');
  }
  return entry;
}

async function persistPlaylistKnownSync(
  baseUri: string,
  nextUpdatedAtMs: number | null,
  nextControlRevision: number | null,
): Promise<void> {
  const local = await readLocalSettings(baseUri);
  if (
    local.playlistKnownUpdatedAtMs === nextUpdatedAtMs &&
    local.playlistKnownControlRevision === nextControlRevision
  ) {
    return;
  }
  await writeLocalSettings(baseUri, {
    ...local,
    playlistKnownUpdatedAtMs: nextUpdatedAtMs,
    playlistKnownControlRevision: nextControlRevision,
  });
}

export async function readPlaylist(baseUri: string): Promise<PlaylistEntry | null> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    return devStorage.readPlaylist(baseUri);
  }

  const settings = await readSettings(baseUri);
  const diskEntry = await readLocalPlaylistFileOnly(baseUri);

  if (!isVaultR2PlaylistConfigured(settings)) {
    const winner = diskEntry;
    await persistPlaylistKnownSync(
      baseUri,
      winner?.updatedAt ?? null,
      winner?.controlRevision ?? null,
    );
    return winner;
  }

  let r2Entry: PlaylistEntry | null = null;
  let r2Ok = false;
  try {
    r2Entry = await getR2PlaylistObject(settings.r2);
    r2Ok = true;
  } catch {
    r2Ok = false;
  }

  if (!r2Ok) {
    const winner = diskEntry;
    await persistPlaylistKnownSync(
      baseUri,
      winner?.updatedAt ?? null,
      winner?.controlRevision ?? null,
    );
    return winner;
  }

  const winner = pickNewerPlaylistEntry(diskEntry, r2Entry);
  await persistPlaylistKnownSync(
    baseUri,
    winner?.updatedAt ?? null,
    winner?.controlRevision ?? null,
  );
  return winner;
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

  const promise = readPlaylist(baseUri).finally(() => {
    if (playlistReadCoalescer.get(cacheKey) === promise) {
      playlistReadCoalescer.delete(cacheKey);
    }
  });
  playlistReadCoalescer.set(cacheKey, promise);
  return promise;
}

export async function syncPlaylistAfterVaultRefresh(
  baseUri: string,
): Promise<PlaylistEntry | null> {
  invalidatePlaylistReadCache(baseUri);
  return readPlaylistCoalesced(baseUri);
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

async function writeLocalPlaylistOnly(
  baseUri: string,
  entry: PlaylistEntry,
): Promise<PlaylistEntry> {
  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const eskerraDirectoryUri = getEskerraDirectoryUri(normalizedBaseUri);
  const playlistUri = getPlaylistUri(normalizedBaseUri);

  if (!(await vaultFs.exists(eskerraDirectoryUri))) {
    await vaultFs.mkdir(eskerraDirectoryUri);
  }

  await vaultFs.writeFile(playlistUri, serializePlaylistEntry(entry), {
    encoding: 'utf8',
    mimeType: 'application/json',
  });

  return entry;
}

export async function writePlaylist(
  baseUri: string,
  entry: PlaylistEntry,
  // Retained for API parity (`{mode: 'progress' | 'control'}`); merge path does not branch on mode.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- see above
  options?: {mode?: PlaylistWriteMode},
): Promise<PlaylistWriteResult> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    const saved = await devStorage.writePlaylist(baseUri, entry);
    playlistReadCoalescer.set(baseUri.trim(), Promise.resolve(saved));
    return {kind: 'saved', entry: saved};
  }

  let localMeta = await readLocalSettings(baseUri);
  const ensured = ensureDeviceInstanceId(localMeta);
  if (ensured.changed) {
    localMeta = ensured.settings;
    await writeLocalSettings(baseUri, localMeta);
  }

  const knownUpdated = localMeta.playlistKnownUpdatedAtMs ?? 0;
  const knownRev = localMeta.playlistKnownControlRevision ?? 0;

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const cacheKey = normalizedBaseUri.trim();
  const settings = await readSettings(baseUri);

  const hasR2 = isVaultR2PlaylistConfigured(settings);

  if (!hasR2) {
    const nextTs = Math.max(Date.now(), entry.updatedAt, knownUpdated);
    const saved: PlaylistEntry = {...entry, updatedAt: nextTs};
    await persistPlaylistKnownSync(baseUri, saved.updatedAt, saved.controlRevision);
    const persisted = await writeLocalPlaylistOnly(baseUri, saved);
    playlistReadCoalescer.set(cacheKey, Promise.resolve(persisted));
    return {kind: 'saved', entry: persisted};
  }

  try {
    const remote = await getR2PlaylistObject(settings.r2);
    if (remote != null && isRemotePlaylistNewerThanKnown(remote, knownUpdated, knownRev)) {
      await persistPlaylistKnownSync(baseUri, remote.updatedAt, remote.controlRevision);
      playlistReadCoalescer.set(cacheKey, Promise.resolve(remote));
      return {kind: 'superseded', entry: remote};
    }

    const nextTs = Math.max(Date.now(), remote?.updatedAt ?? 0, knownUpdated, entry.updatedAt);
    const saved: PlaylistEntry = {...entry, updatedAt: nextTs};
    await putR2PlaylistObject(settings.r2, saved);
    await persistPlaylistKnownSync(baseUri, saved.updatedAt, saved.controlRevision);
    playlistReadCoalescer.set(cacheKey, Promise.resolve(saved));
    return {kind: 'saved', entry: saved};
  } catch {
    const nextTs = Math.max(Date.now(), entry.updatedAt, knownUpdated);
    const saved: PlaylistEntry = {...entry, updatedAt: nextTs};
    await persistPlaylistKnownSync(baseUri, saved.updatedAt, saved.controlRevision);
    const persisted = await writeLocalPlaylistOnly(baseUri, saved);
    playlistReadCoalescer.set(cacheKey, Promise.resolve(persisted));
    return {kind: 'saved', entry: persisted};
  }
}

export async function clearPlaylist(baseUri: string): Promise<void> {
  if (isDevMockVaultBaseUri(baseUri)) {
    const devStorage = getDevStorage();
    await devStorage.clearPlaylist(baseUri);
    playlistReadCoalescer.set(baseUri.trim(), Promise.resolve(null));
    return;
  }

  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const cacheKey = normalizedBaseUri.trim();
  const playlistUri = getPlaylistUri(normalizedBaseUri);
  const settings = await readSettings(baseUri);

  if (isVaultR2PlaylistConfigured(settings)) {
    try {
      await deleteR2PlaylistObject(settings.r2);
      await persistPlaylistKnownSync(baseUri, null, null);
      if (await vaultFs.exists(playlistUri)) {
        await vaultFs.unlink(playlistUri);
      }
      playlistReadCoalescer.set(cacheKey, Promise.resolve(null));
      return;
    } catch {
      /* fallback local */
    }
  }

  await persistPlaylistKnownSync(baseUri, null, null);

  if (!(await vaultFs.exists(playlistUri))) {
    playlistReadCoalescer.set(cacheKey, Promise.resolve(null));
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

export {getNoteTitle} from '@eskerra/core';

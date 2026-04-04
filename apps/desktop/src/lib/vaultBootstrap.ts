import {desktopR2SignedTransport} from './desktopR2Transport';

import {
  assertVaultMarkdownNoteUriForCrud,
  buildInboxMarkdownIndexContent,
  defaultNoteboxLocalSettings,
  deleteR2PlaylistObject,
  ensureDeviceInstanceId,
  getAssetsAttachmentsDirectoryUri,
  getGeneralDirectoryUri,
  getInboxDirectoryUri,
  getInboxIndexUri,
  getLocalSettingsUri,
  getNoteboxDirectoryUri,
  getPlaylistUri,
  getR2PlaylistObject,
  getSharedSettingsUri,
  initNoteboxVault,
  isRemotePlaylistNewerThanKnown,
  isSyncConflictFileName,
  isVaultR2PlaylistConfigured,
  MARKDOWN_EXTENSION,
  normalizePlaylistEntryForSync,
  normalizeVaultBaseUri,
  parseNoteboxLocalSettings,
  parseNoteboxSettings,
  pickNewerPlaylistEntry,
  pickNextInboxMarkdownFileName,
  putR2PlaylistObject,
  readVaultSharedSettingsRaw,
  sanitizeFileName,
  sanitizeInboxNoteStem,
  serializeNoteboxLocalSettings,
  serializeNoteboxSettings,
  serializePlaylistEntry,
  vaultPathDirname,
  type NoteboxLocalSettings,
  type NoteboxSettings,
  type PlaylistEntry,
  type PlaylistWriteMode,
  type PlaylistWriteResult,
  type VaultFilesystem,
} from '@notebox/core';

const DESKTOP_R2_HTTP = {transport: desktopR2SignedTransport} as const;

export async function bootstrapVaultLayout(
  root: string,
  fs: VaultFilesystem,
): Promise<void> {
  const base = normalizeVaultBaseUri(root);
  await initNoteboxVault(base, fs);
  const inbox = getInboxDirectoryUri(base);
  const general = getGeneralDirectoryUri(base);
  if (!(await fs.exists(inbox))) {
    await fs.mkdir(inbox);
  }
  if (!(await fs.exists(general))) {
    await fs.mkdir(general);
  }
  const attachments = getAssetsAttachmentsDirectoryUri(base);
  if (!(await fs.exists(attachments))) {
    await fs.mkdir(attachments);
  }
}

/**
 * Rewrites `General/Inbox.md` from **top-level** `Inbox/*.md` filenames only (not nested paths).
 * Vault-wide delete/rename still calls this so **flat** inbox notes stay listed in that index; for
 * nested or non-inbox paths the scan is unchanged and the write is usually skipped (existing === body).
 */
export async function syncInboxMarkdownIndex(
  root: string,
  fs: VaultFilesystem,
): Promise<void> {
  const base = normalizeVaultBaseUri(root);
  const inbox = getInboxDirectoryUri(base);
  if (!(await fs.exists(inbox))) {
    return;
  }
  const rows = await fs.listFiles(inbox);
  const names = rows
    .filter(
      r =>
        (r.type === 'file' || r.type === undefined) &&
        r.name.endsWith(MARKDOWN_EXTENSION) &&
        !isSyncConflictFileName(r.name),
    )
    .map(r => r.name)
    .sort((a, b) => a.localeCompare(b));
  const body = buildInboxMarkdownIndexContent(names);
  const indexUri = getInboxIndexUri(base);
  try {
    const existing = await fs.readFile(indexUri, {encoding: 'utf8'});
    if (existing === body) {
      return;
    }
  } catch {
    // write fresh
  }
  await fs.writeFile(indexUri, body, {encoding: 'utf8', mimeType: 'text/markdown'});
}

async function migrateLegacySharedDisplayNameIfNeeded(
  root: string,
  fs: VaultFilesystem,
  rawShared: string,
  normalizedSettings: NoteboxSettings,
): Promise<void> {
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
    const local = await readVaultLocalSettings(root, fs);
    if (local.displayName === '') {
      await writeVaultLocalSettings(root, fs, {...local, displayName: legacyDisplay});
    }
  }

  await writeVaultSettings(root, fs, normalizedSettings);
}

export async function readVaultSettings(
  root: string,
  fs: VaultFilesystem,
): Promise<NoteboxSettings> {
  const base = normalizeVaultBaseUri(root);
  const raw = await readVaultSharedSettingsRaw(base, fs);
  const settings = parseNoteboxSettings(raw);
  await migrateLegacySharedDisplayNameIfNeeded(root, fs, raw, settings);
  return settings;
}

export async function writeVaultSettings(
  root: string,
  fs: VaultFilesystem,
  settings: NoteboxSettings,
): Promise<void> {
  const base = normalizeVaultBaseUri(root);
  const settingsUri = getSharedSettingsUri(base);
  await fs.writeFile(settingsUri, serializeNoteboxSettings(settings), {
    encoding: 'utf8',
    mimeType: 'application/json',
  });
}

export async function readVaultLocalSettings(
  root: string,
  fs: VaultFilesystem,
): Promise<NoteboxLocalSettings> {
  const base = normalizeVaultBaseUri(root);
  const localUri = getLocalSettingsUri(base);
  if (!(await fs.exists(localUri))) {
    return defaultNoteboxLocalSettings;
  }
  const raw = await fs.readFile(localUri, {encoding: 'utf8'});
  return parseNoteboxLocalSettings(raw);
}

export async function writeVaultLocalSettings(
  root: string,
  fs: VaultFilesystem,
  settings: NoteboxLocalSettings,
): Promise<void> {
  const base = normalizeVaultBaseUri(root);
  const noteboxDir = getNoteboxDirectoryUri(base);
  if (!(await fs.exists(noteboxDir))) {
    await fs.mkdir(noteboxDir);
  }
  const localUri = getLocalSettingsUri(base);
  await fs.writeFile(localUri, serializeNoteboxLocalSettings(settings), {
    encoding: 'utf8',
    mimeType: 'application/json',
  });
}

export async function listInboxNotes(root: string, fs: VaultFilesystem) {
  const base = normalizeVaultBaseUri(root);
  const inbox = getInboxDirectoryUri(base);
  if (!(await fs.exists(inbox))) {
    return [];
  }
  const rows = await fs.listFiles(inbox);
  return rows
    .filter(
      r =>
        (r.type === 'file' || r.type === undefined) &&
        r.name.endsWith(MARKDOWN_EXTENSION) &&
        !isSyncConflictFileName(r.name),
    )
    .map(r => ({
      lastModified: r.lastModified,
      name: r.name,
      uri: r.uri,
    }))
    .sort((a, b) => {
      // Most recently modified first (same comparator as mobile sortByLastModifiedDesc).
      const delta = (b.lastModified ?? 0) - (a.lastModified ?? 0);
      if (delta !== 0) {
        return delta;
      }
      return a.name.localeCompare(b.name);
    });
}

async function readLocalPlaylistFileOnly(
  root: string,
  fs: VaultFilesystem,
): Promise<PlaylistEntry | null> {
  const base = normalizeVaultBaseUri(root);
  const uri = getPlaylistUri(base);
  if (!(await fs.exists(uri))) {
    return null;
  }
  const raw = await fs.readFile(uri, {encoding: 'utf8'});
  if (!raw.trim()) {
    return null;
  }
  const parsed: unknown = JSON.parse(raw);
  const entry = normalizePlaylistEntryForSync(parsed);
  if (!entry) {
    throw new Error('playlist.json has an invalid structure.');
  }
  return entry;
}

async function persistPlaylistKnownDesktop(
  root: string,
  fs: VaultFilesystem,
  nextUpdatedAtMs: number | null,
  nextControlRevision: number | null,
): Promise<void> {
  const local = await readVaultLocalSettings(root, fs);
  if (
    local.playlistKnownUpdatedAtMs === nextUpdatedAtMs &&
    local.playlistKnownControlRevision === nextControlRevision
  ) {
    return;
  }
  await writeVaultLocalSettings(root, fs, {
    ...local,
    playlistKnownUpdatedAtMs: nextUpdatedAtMs,
    playlistKnownControlRevision: nextControlRevision,
  });
}

async function writeLocalPlaylistOnlyDesktop(
  root: string,
  fs: VaultFilesystem,
  entry: PlaylistEntry,
): Promise<PlaylistEntry> {
  const base = normalizeVaultBaseUri(root);
  const uri = getPlaylistUri(base);
  const noteboxDir = getNoteboxDirectoryUri(base);
  if (!(await fs.exists(noteboxDir))) {
    await fs.mkdir(noteboxDir);
  }
  await fs.writeFile(uri, serializePlaylistEntry(entry), {
    encoding: 'utf8',
    mimeType: 'application/json',
  });
  return entry;
}

export async function readPlaylistEntry(
  root: string,
  fs: VaultFilesystem,
): Promise<PlaylistEntry | null> {
  const settings = await readVaultSettings(root, fs);
  const diskEntry = await readLocalPlaylistFileOnly(root, fs);

  if (!isVaultR2PlaylistConfigured(settings)) {
    const winner = diskEntry;
    await persistPlaylistKnownDesktop(
      root,
      fs,
      winner?.updatedAt ?? null,
      winner?.controlRevision ?? null,
    );
    return winner;
  }

  let r2Entry: PlaylistEntry | null = null;
  let r2Ok = false;
  try {
    r2Entry = await getR2PlaylistObject(settings.r2, DESKTOP_R2_HTTP);
    r2Ok = true;
  } catch {
    r2Ok = false;
  }

  if (!r2Ok) {
    const winner = diskEntry;
    await persistPlaylistKnownDesktop(
      root,
      fs,
      winner?.updatedAt ?? null,
      winner?.controlRevision ?? null,
    );
    return winner;
  }

  const winner = pickNewerPlaylistEntry(diskEntry, r2Entry);
  await persistPlaylistKnownDesktop(
    root,
    fs,
    winner?.updatedAt ?? null,
    winner?.controlRevision ?? null,
  );
  return winner;
}

export async function writePlaylistEntry(
  root: string,
  fs: VaultFilesystem,
  entry: PlaylistEntry,
  // Retained for API parity (`{mode: 'progress' | 'control'}`); merge path does not branch on mode.
  _options?: {mode?: PlaylistWriteMode},
): Promise<PlaylistWriteResult> {
  let localMeta = await readVaultLocalSettings(root, fs);
  const ensured = ensureDeviceInstanceId(localMeta);
  if (ensured.changed) {
    localMeta = ensured.settings;
    await writeVaultLocalSettings(root, fs, localMeta);
  }

  const knownUpdated = localMeta.playlistKnownUpdatedAtMs ?? 0;
  const knownRev = localMeta.playlistKnownControlRevision ?? 0;

  const settings = await readVaultSettings(root, fs);
  const hasR2 = isVaultR2PlaylistConfigured(settings);

  if (!hasR2) {
    const nextTs = Math.max(Date.now(), entry.updatedAt, knownUpdated);
    const saved: PlaylistEntry = {...entry, updatedAt: nextTs};
    await persistPlaylistKnownDesktop(root, fs, saved.updatedAt, saved.controlRevision);
    await writeLocalPlaylistOnlyDesktop(root, fs, saved);
    return {kind: 'saved', entry: saved};
  }

  try {
    const remote = await getR2PlaylistObject(settings.r2, DESKTOP_R2_HTTP);
    if (remote != null && isRemotePlaylistNewerThanKnown(remote, knownUpdated, knownRev)) {
      await persistPlaylistKnownDesktop(root, fs, remote.updatedAt, remote.controlRevision);
      return {kind: 'superseded', entry: remote};
    }

    const nextTs = Math.max(Date.now(), remote?.updatedAt ?? 0, knownUpdated, entry.updatedAt);
    const saved: PlaylistEntry = {...entry, updatedAt: nextTs};
    await putR2PlaylistObject(settings.r2, saved, DESKTOP_R2_HTTP);
    await writeLocalPlaylistOnlyDesktop(root, fs, saved);
    await persistPlaylistKnownDesktop(root, fs, saved.updatedAt, saved.controlRevision);
    return {kind: 'saved', entry: saved};
  } catch {
    const nextTs = Math.max(Date.now(), entry.updatedAt, knownUpdated);
    const saved: PlaylistEntry = {...entry, updatedAt: nextTs};
    await persistPlaylistKnownDesktop(root, fs, saved.updatedAt, saved.controlRevision);
    const persisted = await writeLocalPlaylistOnlyDesktop(root, fs, saved);
    return {kind: 'saved', entry: persisted};
  }
}

/** Removes remote and/or local `playlist.json` when stale or cleared. */
export async function clearPlaylistEntry(root: string, fs: VaultFilesystem): Promise<void> {
  const base = normalizeVaultBaseUri(root);
  const uri = getPlaylistUri(base);
  const settings = await readVaultSettings(root, fs);

  if (isVaultR2PlaylistConfigured(settings)) {
    try {
      await deleteR2PlaylistObject(settings.r2, DESKTOP_R2_HTTP);
      await persistPlaylistKnownDesktop(root, fs, null, null);
      if (await fs.exists(uri)) {
        await fs.unlink(uri);
      }
      return;
    } catch {
      /* fallback local */
    }
  }

  await persistPlaylistKnownDesktop(root, fs, null, null);

  if (await fs.exists(uri)) {
    await fs.unlink(uri);
  }
}

export async function createInboxMarkdownNote(
  root: string,
  fs: VaultFilesystem,
  title: string,
  markdownBody: string,
): Promise<{lastModified: number; name: string; uri: string}> {
  const base = normalizeVaultBaseUri(root);
  const inbox = getInboxDirectoryUri(base);
  if (!(await fs.exists(inbox))) {
    await fs.mkdir(inbox);
  }
  const rows = await fs.listFiles(inbox);
  const occupied = new Set(
    rows
      .filter(
        r =>
          (r.type === 'file' || r.type === undefined) &&
          r.name.endsWith(MARKDOWN_EXTENSION),
      )
      .map(r => r.name),
  );
  const stem = sanitizeFileName(title);
  const fileName = pickNextInboxMarkdownFileName(stem, occupied);
  const uri = `${inbox}/${fileName}`;
  const trimmed = markdownBody.trim();
  const body = trimmed ? `${trimmed}\n` : '';
  await fs.writeFile(uri, body, {encoding: 'utf8', mimeType: 'text/markdown'});
  await syncInboxMarkdownIndex(root, fs);
  return {lastModified: Date.now(), name: fileName, uri};
}

export async function deleteVaultMarkdownNote(
  root: string,
  noteUri: string,
  fs: VaultFilesystem,
): Promise<void> {
  const normalized = assertVaultMarkdownNoteUriForCrud(root, noteUri);
  await fs.unlink(normalized);
  await syncInboxMarkdownIndex(root, fs);
}

export async function renameVaultMarkdownNote(
  root: string,
  noteUri: string,
  nextDisplayName: string,
  fs: VaultFilesystem,
): Promise<string> {
  const normalized = assertVaultMarkdownNoteUriForCrud(root, noteUri);

  const sanitizedStem = sanitizeInboxNoteStem(nextDisplayName);
  if (!sanitizedStem) {
    throw new Error('Note name cannot be empty.');
  }
  const nextName = `${sanitizedStem}${MARKDOWN_EXTENSION}`;
  const currentFileName = normalized.split('/').pop() ?? '';
  if (nextName === currentFileName) {
    return normalized;
  }
  const parentDir = vaultPathDirname(normalized);
  const nextUri = `${parentDir}/${nextName}`;
  if (await fs.exists(nextUri)) {
    throw new Error('A note with this name already exists.');
  }
  await fs.renameFile(normalized, nextUri);
  await syncInboxMarkdownIndex(root, fs);
  return nextUri;
}

export async function saveNoteMarkdown(
  noteUri: string,
  fs: VaultFilesystem,
  markdownBody: string,
): Promise<void> {
  const trimmed = markdownBody.trim();
  const body = trimmed ? `${trimmed}\n` : '';
  await fs.writeFile(noteUri, body, {encoding: 'utf8', mimeType: 'text/markdown'});
}
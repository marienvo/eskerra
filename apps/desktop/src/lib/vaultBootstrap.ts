import {
  buildInboxMarkdownIndexContent,
  defaultNoteboxLocalSettings,
  getGeneralDirectoryUri,
  getInboxDirectoryUri,
  getInboxIndexUri,
  getLocalSettingsUri,
  getNoteboxDirectoryUri,
  getPlaylistUri,
  getSharedSettingsUri,
  initNoteboxVault,
  isSyncConflictFileName,
  isValidPlaylistEntry,
  MARKDOWN_EXTENSION,
  normalizeVaultBaseUri,
  parseNoteboxLocalSettings,
  parseNoteboxSettings,
  pickNextInboxMarkdownFileName,
  readVaultSharedSettingsRaw,
  sanitizeFileName,
  serializeNoteboxLocalSettings,
  serializeNoteboxSettings,
  type NoteboxLocalSettings,
  type NoteboxSettings,
  type PlaylistEntry,
  type VaultFilesystem,
} from '@notebox/core';

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
}

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
    .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
}

export async function readPlaylistEntry(
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
  if (!isValidPlaylistEntry(parsed)) {
    throw new Error('playlist.json has an invalid structure.');
  }
  return parsed;
}

export async function writePlaylistEntry(
  root: string,
  fs: VaultFilesystem,
  entry: PlaylistEntry,
): Promise<void> {
  const base = normalizeVaultBaseUri(root);
  const uri = getPlaylistUri(base);
  const noteboxDir = getNoteboxDirectoryUri(base);
  if (!(await fs.exists(noteboxDir))) {
    await fs.mkdir(noteboxDir);
  }
  const body = `${JSON.stringify(entry, null, 2)}\n`;
  await fs.writeFile(uri, body, {encoding: 'utf8', mimeType: 'application/json'});
}

/** Removes `playlist.json` if present (matches mobile `clearPlaylist` when the entry is stale). */
export async function clearPlaylistEntry(root: string, fs: VaultFilesystem): Promise<void> {
  const base = normalizeVaultBaseUri(root);
  const uri = getPlaylistUri(base);
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

export async function saveNoteMarkdown(
  noteUri: string,
  fs: VaultFilesystem,
  markdownBody: string,
): Promise<void> {
  const trimmed = markdownBody.trim();
  const body = trimmed ? `${trimmed}\n` : '';
  await fs.writeFile(noteUri, body, {encoding: 'utf8', mimeType: 'text/markdown'});
}
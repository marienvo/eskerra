import {
  assertVaultMarkdownNoteUriForCrud,
  assertVaultTreeDirectoryUriForCrud,
  buildInboxMarkdownFromCompose,
  getInboxDirectoryUri,
  normalizeVaultBaseUri,
  resolveInboxWikiLinkTarget,
  resolveVaultRelativeMarkdownHref,
  stemFromMarkdownFileName,
  vaultPathDirname,
  wikiLinkInnerBrowserOpenableHref,
  type InboxWikiLinkNoteRef,
  type InboxWikiLinkResolveResult,
  type VaultFilesystem,
} from '@eskerra/core';

import {createVaultMarkdownNoteInDirectory} from './vaultBootstrap';

export type InboxWikiLinkNavigationResult =
  | {kind: 'open'; uri: string; canonicalInner?: string}
  | {kind: 'created'; uri: string}
  | {
      kind: 'ambiguous';
      targetStem: string;
      title: string;
      notes: ReadonlyArray<InboxWikiLinkNoteRef>;
    }
  | {kind: 'unsupported'; reason: 'empty_target' | 'path_not_supported'};

/**
 * Shell-owned wiki-link flow: resolve against the vault markdown ref index, or create a new note
 * beside the active note’s folder (else Inbox) using the shared title→filename policy.
 * When {@link newNoteParentDirectory} is set, it overrides the create parent (e.g. Today hub → General).
 */
export async function openOrCreateInboxWikiLinkTarget(options: {
  inner: string;
  notes: ReadonlyArray<InboxWikiLinkNoteRef>;
  vaultRoot: string;
  fs: VaultFilesystem;
  /** Open `.md` URI whose parent directory receives new notes; omit or null → Inbox. */
  activeMarkdownUri?: string | null;
  /** Vault directory URI for new notes; wins over Inbox / active note parent when creating. */
  newNoteParentDirectory?: string | null;
}): Promise<InboxWikiLinkNavigationResult> {
  const {inner, notes, vaultRoot, fs, activeMarkdownUri, newNoteParentDirectory} = options;
  const resolved: InboxWikiLinkResolveResult = resolveInboxWikiLinkTarget(
    notes,
    inner,
  );

  if (resolved.kind === 'open') {
    return {
      kind: 'open',
      uri: resolved.note.uri,
      canonicalInner: resolved.canonicalInner,
    };
  }
  if (resolved.kind === 'ambiguous') {
    return {
      kind: 'ambiguous',
      targetStem: resolved.targetStem,
      title: resolved.title,
      notes: resolved.notes,
    };
  }
  if (resolved.kind === 'unsupported') {
    return {kind: 'unsupported', reason: resolved.reason};
  }

  const base = normalizeVaultBaseUri(vaultRoot);
  const inbox = getInboxDirectoryUri(base);
  let parentDir = inbox;
  if (newNoteParentDirectory) {
    parentDir = assertVaultTreeDirectoryUriForCrud(vaultRoot, newNoteParentDirectory)
      .replace(/\\/g, '/')
      .replace(/\/+$/, '');
  } else if (activeMarkdownUri) {
    const noteUri = assertVaultMarkdownNoteUriForCrud(vaultRoot, activeMarkdownUri);
    parentDir = vaultPathDirname(noteUri);
  }

  const markdown = buildInboxMarkdownFromCompose(resolved.title, '');
  const created = await createVaultMarkdownNoteInDirectory(
    vaultRoot,
    fs,
    parentDir,
    resolved.title,
    markdown,
  );
  return {kind: 'created', uri: created.uri};
}

/**
 * True when `inner` resolves to exactly one existing inbox note (same rule as navigation `open`),
 * or when the target is a browser-openable `http` / `https` / `mailto` URL (desktop external wiki).
 */
export function inboxWikiLinkTargetIsResolved(
  notes: ReadonlyArray<InboxWikiLinkNoteRef>,
  inner: string,
): boolean {
  if (wikiLinkInnerBrowserOpenableHref(inner) != null) {
    return true;
  }
  return resolveInboxWikiLinkTarget(notes, inner).kind === 'open';
}

export type InboxRelativeMarkdownLinkNavigationResult =
  | {kind: 'open'; uri: string; canonicalHref?: string}
  | {kind: 'created'; uri: string}
  | {kind: 'unsupported'};

function normVaultUri(u: string): string {
  return u.trim().replace(/\\/g, '/');
}

/**
 * Opens or creates the vault note targeted by a relative `[](*.md)` href from the current note
 * (or Inbox directory when composing).
 */
export async function openOrCreateVaultRelativeMarkdownLink(options: {
  href: string;
  notes: ReadonlyArray<InboxWikiLinkNoteRef>;
  vaultRoot: string;
  fs: VaultFilesystem;
  /** Directory or open `.md` URI — see `resolveVaultRelativeMarkdownHref` in `@eskerra/core`. */
  sourceMarkdownUriOrDir: string;
}): Promise<InboxRelativeMarkdownLinkNavigationResult> {
  const {href, notes, vaultRoot, fs, sourceMarkdownUriOrDir} = options;
  const resolved = resolveVaultRelativeMarkdownHref(
    vaultRoot,
    sourceMarkdownUriOrDir,
    href,
    notes,
  );
  if (!resolved) {
    return {kind: 'unsupported'};
  }

  const exists = notes.some(
    n => normVaultUri(n.uri).toLowerCase() === normVaultUri(resolved.uri).toLowerCase(),
  );

  if (exists) {
    return {
      kind: 'open',
      uri: resolved.uri,
      canonicalHref: resolved.canonicalHref,
    };
  }

  const fileName = resolved.uri.split('/').pop() ?? '';
  const stem = stemFromMarkdownFileName(fileName);
  const parentDir = vaultPathDirname(resolved.uri);
  const markdown = buildInboxMarkdownFromCompose(stem, '');
  const created = await createVaultMarkdownNoteInDirectory(
    vaultRoot,
    fs,
    parentDir,
    stem,
    markdown,
  );
  return {kind: 'created', uri: created.uri};
}

export function inboxRelativeMarkdownLinkHrefIsResolved(
  notes: ReadonlyArray<InboxWikiLinkNoteRef>,
  sourceMarkdownUriOrDir: string,
  vaultRoot: string,
  href: string,
): boolean {
  const resolved = resolveVaultRelativeMarkdownHref(
    vaultRoot,
    sourceMarkdownUriOrDir,
    href,
    notes,
  );
  if (!resolved) {
    return false;
  }
  return notes.some(
    n => normVaultUri(n.uri).toLowerCase() === normVaultUri(resolved.uri).toLowerCase(),
  );
}

import {
  assertVaultMarkdownNoteUriForCrud,
  buildInboxMarkdownFromCompose,
  getInboxDirectoryUri,
  normalizeVaultBaseUri,
  resolveInboxWikiLinkTarget,
  vaultPathDirname,
  type InboxWikiLinkNoteRef,
  type InboxWikiLinkResolveResult,
  type VaultFilesystem,
} from '@notebox/core';

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
 */
export async function openOrCreateInboxWikiLinkTarget(options: {
  inner: string;
  notes: ReadonlyArray<InboxWikiLinkNoteRef>;
  vaultRoot: string;
  fs: VaultFilesystem;
  /** Open `.md` URI whose parent directory receives new notes; omit or null → Inbox. */
  activeMarkdownUri?: string | null;
}): Promise<InboxWikiLinkNavigationResult> {
  const {inner, notes, vaultRoot, fs, activeMarkdownUri} = options;
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
  if (activeMarkdownUri) {
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

/** True when `inner` resolves to exactly one existing inbox note (same rule as navigation `open`). */
export function inboxWikiLinkTargetIsResolved(
  notes: ReadonlyArray<InboxWikiLinkNoteRef>,
  inner: string,
): boolean {
  return resolveInboxWikiLinkTarget(notes, inner).kind === 'open';
}

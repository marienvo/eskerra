import {
  buildInboxMarkdownFromCompose,
  resolveInboxWikiLinkTarget,
  type InboxWikiLinkNoteRef,
  type InboxWikiLinkResolveResult,
  type VaultFilesystem,
} from '@notebox/core';

import {createInboxMarkdownNote} from './vaultBootstrap';

export type InboxWikiLinkNavigationResult =
  | {kind: 'open'; uri: string}
  | {kind: 'created'; uri: string}
  | {
      kind: 'ambiguous';
      targetStem: string;
      title: string;
      notes: ReadonlyArray<InboxWikiLinkNoteRef>;
    }
  | {kind: 'unsupported'; reason: 'empty_target' | 'path_not_supported'};

/**
 * Shell-owned wiki-link flow for Inbox notes:
 * resolve existing note deterministically or create a new inbox note
 * using the existing title->filename and markdown compose policy.
 */
export async function openOrCreateInboxWikiLinkTarget(options: {
  inner: string;
  notes: ReadonlyArray<InboxWikiLinkNoteRef>;
  vaultRoot: string;
  fs: VaultFilesystem;
}): Promise<InboxWikiLinkNavigationResult> {
  const {inner, notes, vaultRoot, fs} = options;
  const resolved: InboxWikiLinkResolveResult = resolveInboxWikiLinkTarget(
    notes,
    inner,
  );

  if (resolved.kind === 'open') {
    return {kind: 'open', uri: resolved.note.uri};
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

  const markdown = buildInboxMarkdownFromCompose(resolved.title, '');
  const created = await createInboxMarkdownNote(vaultRoot, fs, resolved.title, markdown);
  return {kind: 'created', uri: created.uri};
}

/** True when `inner` resolves to exactly one existing inbox note (same rule as navigation `open`). */
export function inboxWikiLinkTargetIsResolved(
  notes: ReadonlyArray<InboxWikiLinkNoteRef>,
  inner: string,
): boolean {
  return resolveInboxWikiLinkTarget(notes, inner).kind === 'open';
}

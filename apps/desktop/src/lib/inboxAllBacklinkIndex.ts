import {
  listInboxRelativeMarkdownLinkBacklinkReferrersForTarget,
  type InboxWikiLinkNoteRef,
} from '@notebox/core';

import {listInboxWikiLinkBacklinkReferrersForTarget} from './inboxWikiLinkBacklinkIndex';

/** Union of wiki-style and relative inline `.md` link referrers, sorted. */
export function listInboxAllBacklinkReferrersForTarget(options: {
  targetUri: string;
  notes: ReadonlyArray<InboxWikiLinkNoteRef>;
  contentByUri: Readonly<Record<string, string>>;
  activeUri: string | null;
  activeBody: string;
  vaultRoot: string;
}): readonly string[] {
  const wiki = listInboxWikiLinkBacklinkReferrersForTarget({
    targetUri: options.targetUri,
    notes: options.notes,
    contentByUri: options.contentByUri,
    activeUri: options.activeUri,
    activeBody: options.activeBody,
  });
  const md = listInboxRelativeMarkdownLinkBacklinkReferrersForTarget({
    targetUri: options.targetUri,
    notes: options.notes,
    contentByUri: options.contentByUri,
    activeUri: options.activeUri,
    activeBody: options.activeBody,
    vaultRoot: options.vaultRoot,
  });
  return [...new Set([...wiki, ...md])].sort((a, b) => a.localeCompare(b));
}

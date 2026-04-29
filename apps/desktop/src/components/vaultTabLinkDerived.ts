import {
  buildInboxWikiLinkCompletionCandidates,
  getGeneralDirectoryUri,
  getInboxDirectoryUri,
  normalizeVaultBaseUri,
  type VaultMarkdownRef,
} from '@eskerra/core';

import {
  inboxRelativeMarkdownLinkHrefIsResolved,
  inboxWikiLinkTargetIsResolved,
} from '../lib/inboxWikiLinkNavigation';

export type VaultTabWikiLinkCompletionCandidates = ReturnType<
  typeof buildInboxWikiLinkCompletionCandidates
>;

export type VaultTabLinkDerivedData = {
  relativeMarkdownSourceUriOrDir: string;
  wikiLinkTargetIsResolved: (inner: string) => boolean;
  relativeMarkdownLinkHrefIsResolved: (href: string) => boolean;
  wikiLinkCompletionCandidates: VaultTabWikiLinkCompletionCandidates;
};

export function buildVaultTabLinkDerivedData(args: {
  vaultRoot: string;
  vaultMarkdownRefs: readonly VaultMarkdownRef[];
  composingNewEntry: boolean;
  selectedUri: string | null;
  showTodayHubCanvas: boolean;
}): VaultTabLinkDerivedData {
  const {
    vaultRoot,
    vaultMarkdownRefs,
    composingNewEntry,
    selectedUri,
    showTodayHubCanvas,
  } = args;
  const refs = vaultMarkdownRefs.map(r => ({name: r.name, uri: r.uri}));
  const base = normalizeVaultBaseUri(vaultRoot);
  const relativeMarkdownSourceUriOrDir = (() => {
    if (composingNewEntry) {
      return getInboxDirectoryUri(base);
    }
    if (showTodayHubCanvas) {
      return getGeneralDirectoryUri(base);
    }
    return selectedUri ?? getInboxDirectoryUri(base);
  })();

  return {
    relativeMarkdownSourceUriOrDir,
    wikiLinkTargetIsResolved: (inner: string) =>
      inboxWikiLinkTargetIsResolved(
        refs,
        inner,
        {vaultRoot, sourceMarkdownUriOrDir: relativeMarkdownSourceUriOrDir},
      ),
    relativeMarkdownLinkHrefIsResolved: (href: string) =>
      inboxRelativeMarkdownLinkHrefIsResolved(
        refs,
        relativeMarkdownSourceUriOrDir,
        vaultRoot,
        href,
      ),
    wikiLinkCompletionCandidates: buildInboxWikiLinkCompletionCandidates(refs),
  };
}

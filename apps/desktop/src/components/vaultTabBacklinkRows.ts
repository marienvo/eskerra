import {
  extractFirstMarkdownH1,
  getNoteTitle,
  type VaultMarkdownRef,
} from '@eskerra/core';

export type VaultTabBacklinkRow = {
  uri: string;
  fileName: string;
  title: string;
};

export function buildVaultTabBacklinkRows(args: {
  backlinkUris: readonly string[];
  vaultMarkdownRefs: readonly VaultMarkdownRef[];
  composingNewEntry: boolean;
  selectedUri: string | null;
  editorBody: string;
  inboxContentByUri: Readonly<Record<string, string>>;
}): VaultTabBacklinkRow[] {
  const {
    backlinkUris,
    vaultMarkdownRefs,
    composingNewEntry,
    selectedUri,
    editorBody,
    inboxContentByUri,
  } = args;
  const norm = (u: string) => u.trim().replace(/\\/g, '/');
  return backlinkUris
    .map(uri => {
      const ref = vaultMarkdownRefs.find(r => norm(r.uri) === norm(uri));
      const fileName = (ref?.name ?? uri.split(/[/\\]/).pop() ?? '').trim();
      if (!fileName) {
        return null;
      }
      const markdownSource =
        !composingNewEntry && uri === selectedUri
          ? editorBody
          : inboxContentByUri[uri];
      const title =
        markdownSource !== undefined
          ? extractFirstMarkdownH1(markdownSource) ?? getNoteTitle(fileName)
          : getNoteTitle(fileName);
      return {uri, fileName, title};
    })
    .filter((row): row is VaultTabBacklinkRow => row != null);
}

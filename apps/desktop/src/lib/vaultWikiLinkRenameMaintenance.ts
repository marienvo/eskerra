import {
  buildInboxWikiLinkResolveLookup,
  planInboxWikiLinkRenameInMarkdown,
  type InboxWikiLinkNoteRef,
  type VaultFilesystem,
} from '@notebox/core';

function markdownUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export type VaultWikiLinkRenameFileUpdate = {
  uri: string;
  markdown: string;
  updatedLinkCount: number;
};

export type VaultWikiLinkRenamePlanResult = {
  updates: readonly VaultWikiLinkRenameFileUpdate[];
  scannedFileCount: number;
  touchedFileCount: number;
  touchedBytes: number;
  updatedLinkCount: number;
  skippedAmbiguousLinkCount: number;
};

function yieldToBrowserFrame(): Promise<void> {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return new Promise(resolve => {
      window.requestAnimationFrame(() => resolve());
    });
  }
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

export function planVaultWikiLinkRenameMaintenance(options: {
  oldTargetUri: string;
  renamedStem: string;
  notes: ReadonlyArray<InboxWikiLinkNoteRef>;
  contentByUri: Readonly<Record<string, string>>;
  activeUri: string | null;
  activeBody: string;
}): VaultWikiLinkRenamePlanResult {
  const {oldTargetUri, renamedStem, notes, contentByUri, activeUri, activeBody} = options;
  const lookup = buildInboxWikiLinkResolveLookup(notes);
  const updates: VaultWikiLinkRenameFileUpdate[] = [];
  let touchedBytes = 0;
  let updatedLinkCount = 0;
  let skippedAmbiguousLinkCount = 0;

  for (const source of notes) {
    const sourceBody =
      activeUri != null && source.uri === activeUri
        ? activeBody
        : (contentByUri[source.uri] ?? '');
    const rewrite = planInboxWikiLinkRenameInMarkdown({
      markdown: sourceBody,
      lookup,
      oldTargetUri,
      renamedStem,
    });
    updatedLinkCount += rewrite.updatedLinkCount;
    skippedAmbiguousLinkCount += rewrite.skippedAmbiguousLinkCount;
    if (!rewrite.changed) {
      continue;
    }
    touchedBytes += markdownUtf8ByteLength(rewrite.markdown);
    updates.push({
      uri: source.uri,
      markdown: rewrite.markdown,
      updatedLinkCount: rewrite.updatedLinkCount,
    });
  }

  return {
    updates,
    scannedFileCount: notes.length,
    touchedFileCount: updates.length,
    touchedBytes,
    updatedLinkCount,
    skippedAmbiguousLinkCount,
  };
}

export type VaultWikiLinkRenameApplyResult = {
  succeededUris: readonly string[];
  failed: readonly {uri: string; reason: string}[];
};

export async function applyVaultWikiLinkRenameMaintenance(options: {
  fs: VaultFilesystem;
  oldUri: string;
  newUri: string;
  updates: ReadonlyArray<VaultWikiLinkRenameFileUpdate>;
  onProgress?: (done: number, total: number) => void;
  yieldEveryWrites?: number;
}): Promise<VaultWikiLinkRenameApplyResult> {
  const {fs, oldUri, newUri, updates, onProgress, yieldEveryWrites = 0} = options;
  const succeededUris: string[] = [];
  const failed: Array<{uri: string; reason: string}> = [];
  const total = updates.length;
  let done = 0;

  for (const update of updates) {
    const writeUri = update.uri === oldUri ? newUri : update.uri;
    try {
      await fs.writeFile(writeUri, update.markdown, {
        encoding: 'utf8',
        mimeType: 'text/markdown',
      });
      succeededUris.push(writeUri);
    } catch (error) {
      failed.push({
        uri: writeUri,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    done += 1;
    onProgress?.(done, total);
    if (yieldEveryWrites > 0 && done % yieldEveryWrites === 0) {
      await yieldToBrowserFrame();
    }
  }

  return {succeededUris, failed};
}

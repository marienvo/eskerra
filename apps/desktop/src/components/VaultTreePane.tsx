import type {VaultFilesystem} from '@eskerra/core';

import type {VaultTreeBulkItem} from '../lib/vaultTreeBulkPlan';

import {MaterialIcon} from './MaterialIcon';
import {VaultPaneTree} from './VaultPaneTree';

export type VaultTreePaneProps = {
  vaultRoot: string;
  fs: VaultFilesystem;
  fsRefreshNonce: number;
  vaultTreeSelectionClearNonce: number;
  editorActiveMarkdownUri: string | null;
  revealActiveNoteNonce: number;
  onRevealActiveNoteInTree: () => void;
  revealActiveNoteDisabled: boolean;
  busy: boolean;
  onAddEntry: () => void;
  onOpenMarkdownNote: (uri: string) => void;
  onRenameMarkdownRequest: (uri: string) => void;
  onDeleteMarkdownRequest: (uri: string) => void;
  onRenameFolderRequest: (uri: string) => void;
  onDeleteFolderRequest: (uri: string) => void;
  onBulkDeleteRequest: (items: VaultTreeBulkItem[]) => void;
  onMoveVaultTreeItem: (
    sourceUri: string,
    sourceKind: 'folder' | 'article',
    targetDirectoryUri: string,
  ) => void;
  onBulkMoveVaultTreeItems: (
    items: VaultTreeBulkItem[],
    targetDirectoryUri: string,
  ) => void;
};

export function VaultTreePane({
  vaultRoot,
  fs,
  fsRefreshNonce,
  vaultTreeSelectionClearNonce,
  editorActiveMarkdownUri,
  revealActiveNoteNonce,
  onRevealActiveNoteInTree,
  revealActiveNoteDisabled,
  busy,
  onAddEntry,
  onOpenMarkdownNote,
  onRenameMarkdownRequest,
  onDeleteMarkdownRequest,
  onRenameFolderRequest,
  onDeleteFolderRequest,
  onBulkDeleteRequest,
  onMoveVaultTreeItem,
  onBulkMoveVaultTreeItems,
}: VaultTreePaneProps) {
  return (
    <div className="panel-surface" data-app-surface="capture">
      <div className="pane-header">
        <span className="pane-title">Vault</span>
        <div className="pane-header-trailing-actions">
          <button
            type="button"
            className="pane-header-add-btn icon-btn-ghost app-tooltip-trigger"
            onClick={onRevealActiveNoteInTree}
            disabled={busy || revealActiveNoteDisabled}
            aria-label="Show active note in tree"
            data-tooltip="Show active note in tree"
            data-tooltip-placement="inline-start"
          >
            <span className="pane-header-add-btn__glyph" aria-hidden>
              <MaterialIcon name="location_searching" size={12} />
            </span>
          </button>
          <button
            type="button"
            className="pane-header-add-btn icon-btn-ghost app-tooltip-trigger"
            onClick={onAddEntry}
            disabled={busy}
            aria-label="Add entry"
            data-tooltip="Add entry"
            data-tooltip-placement="inline-start"
          >
            <span className="pane-header-add-btn__glyph" aria-hidden>
              <MaterialIcon name="add" size={12} />
            </span>
          </button>
        </div>
      </div>
      <div className="vault-tree-panel">
        <VaultPaneTree
          vaultRoot={vaultRoot}
          fs={fs}
          fsRefreshNonce={fsRefreshNonce}
          vaultTreeSelectionClearNonce={vaultTreeSelectionClearNonce}
          editorActiveMarkdownUri={editorActiveMarkdownUri}
          revealActiveNoteNonce={revealActiveNoteNonce}
          busy={busy}
          onOpenMarkdownNote={onOpenMarkdownNote}
          onRenameMarkdownRequest={onRenameMarkdownRequest}
          onDeleteMarkdownRequest={onDeleteMarkdownRequest}
          onRenameFolderRequest={onRenameFolderRequest}
          onDeleteFolderRequest={onDeleteFolderRequest}
          onBulkDeleteRequest={onBulkDeleteRequest}
          onMoveVaultTreeItem={onMoveVaultTreeItem}
          onBulkMoveVaultTreeItems={onBulkMoveVaultTreeItems}
        />
      </div>
    </div>
  );
}

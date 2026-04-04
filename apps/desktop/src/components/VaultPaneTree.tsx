import {
  asyncDataLoaderFeature,
  hotkeysCoreFeature,
  selectionFeature,
  type TreeInstance,
} from '@headless-tree/core';
import {AssistiveTreeDescription, useTree} from '@headless-tree/react';
import {normalizeVaultBaseUri, type VaultFilesystem} from '@notebox/core';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {useVirtualizer} from '@tanstack/react-virtual';
import {useEffect, useMemo, useRef, useState} from 'react';

import {loadVaultTreeVisibleChildRows, type VaultTreeItemData} from '../lib/vaultTreeLoadChildren';
import {MaterialIcon} from './MaterialIcon';

/** Must match `.vault-tree-row` height in `App.css` and virtual row wrapper height. */
const VAULT_TREE_ROW_HEIGHT_PX = 40;

const VAULT_TREE_DND_MIME = 'application/x-notebox-vault-tree';

export type VaultPaneTreeProps = {
  vaultRoot: string;
  fs: VaultFilesystem;
  /** Bumps when vault files change; expanded branches refetch without remounting the tree. */
  fsRefreshNonce: number;
  selectedMarkdownUri: string | null;
  busy: boolean;
  onOpenMarkdownNote: (uri: string) => void;
  onFolderFocused: () => void;
  onRenameMarkdownRequest: (uri: string) => void;
  onDeleteMarkdownRequest: (uri: string) => void;
  onRenameFolderRequest: (uri: string) => void;
  onDeleteFolderRequest: (uri: string) => void;
  onMoveVaultTreeItem: (
    sourceUri: string,
    sourceKind: 'folder' | 'article',
    targetDirectoryUri: string,
  ) => void | Promise<void>;
};

export function VaultPaneTree({
  vaultRoot,
  fs,
  fsRefreshNonce,
  selectedMarkdownUri,
  busy,
  onOpenMarkdownNote,
  onFolderFocused,
  onRenameMarkdownRequest,
  onDeleteMarkdownRequest,
  onRenameFolderRequest,
  onDeleteFolderRequest,
  onMoveVaultTreeItem,
}: VaultPaneTreeProps) {
  const rootId = useMemo(
    () => normalizeVaultBaseUri(vaultRoot).replace(/\\/g, '/').replace(/\/+$/, ''),
    [vaultRoot],
  );
  const itemStoreRef = useRef<Record<string, VaultTreeItemData>>({});
  const primedRootForStoreRef = useRef<string | null>(null);
  if (primedRootForStoreRef.current !== rootId) {
    primedRootForStoreRef.current = rootId;
    itemStoreRef.current = {
      [rootId]: {
        kind: 'folder',
        name: 'Vault',
        uri: rootId,
        lastModified: null,
      },
    };
  }

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<TreeInstance<VaultTreeItemData> | null>(null);
  const [dropTargetUri, setDropTargetUri] = useState<string | null>(null);

  const clearDropTarget = () => setDropTargetUri(null);

  useEffect(() => {
    const onDocDragEnd = () => clearDropTarget();
    document.addEventListener('dragend', onDocDragEnd);
    return () => document.removeEventListener('dragend', onDocDragEnd);
  }, []);

  const tree = useTree<VaultTreeItemData>({
    rootItemId: rootId,
    getItemName: item => item.getItemData()?.name ?? '…',
    isItemFolder: item => (item.getItemData()?.kind ?? 'folder') !== 'article',
    onPrimaryAction: item => {
      const data = item.getItemData();
      if (!data?.uri) {
        return;
      }
      if (data.kind === 'article') {
        onOpenMarkdownNote(data.uri);
      } else {
        onFolderFocused();
      }
    },
    createLoadingItemData: () => ({
      kind: 'folder',
      name: '…',
      uri: '',
      lastModified: null,
    }),
    dataLoader: {
      getItem: async id => {
        const hit = itemStoreRef.current[id];
        if (hit) {
          return hit;
        }
        return {
          kind: 'folder',
          name: id.split(/[/\\]/).pop() ?? '…',
          uri: id,
          lastModified: null,
        };
      },
      getChildrenWithData: async parentId =>
        loadVaultTreeVisibleChildRows({
          parentUri: parentId,
          fs,
          itemStoreRef,
        }),
    },
    features: [asyncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
    initialState: {
      expandedItems: [rootId],
      focusedItem: null,
      selectedItems: [],
    },
    hotkeys: {
      toggleSelectedItem: {isEnabled: () => false},
    },
  });

  treeRef.current = tree;

  const fsRefreshBaselineRef = useRef(fsRefreshNonce);
  useEffect(() => {
    if (fsRefreshNonce === fsRefreshBaselineRef.current) {
      return;
    }
    fsRefreshBaselineRef.current = fsRefreshNonce;
    const t = treeRef.current;
    if (!t) {
      return;
    }
    const expanded = [...(t.getState().expandedItems ?? [])];
    const pathDepth = (uri: string) => uri.split('/').filter(Boolean).length;
    expanded.sort((a, b) => pathDepth(a) - pathDepth(b) || a.localeCompare(b));
    void (async () => {
      for (const id of expanded) {
        const inst = t.getItemInstance(id);
        if (inst) {
          await inst.invalidateChildrenIds(true);
        }
      }
    })();
  }, [fsRefreshNonce]);

  const items = tree.getItems();
  /* eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual uses functional refs; safe here */
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => VAULT_TREE_ROW_HEIGHT_PX,
    overscan: 12,
  });

  useEffect(() => {
    if (
      !selectedMarkdownUri
      || (!selectedMarkdownUri.startsWith(`${rootId}/`) && selectedMarkdownUri !== rootId)
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const t = treeRef.current;
      if (!t) {
        return;
      }
      const rel = selectedMarkdownUri.slice(rootId.length).replace(/^\//, '');
      const segments = rel.split('/').filter(Boolean);
      if (segments.length === 0) {
        return;
      }
      let acc = rootId;
      const folderSegs = segments.length > 1 ? segments.slice(0, -1) : [];
      for (const seg of folderSegs) {
        acc = `${acc}/${seg}`;
        await t.loadChildrenIds(acc);
        if (cancelled) {
          return;
        }
        t.getItemInstance(acc)?.expand();
      }
      if (cancelled) {
        return;
      }
      t.setSelectedItems([selectedMarkdownUri]);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMarkdownUri, rootId]);

  const containerProps = tree.getContainerProps('Vault');

  return (
    <>
      <AssistiveTreeDescription tree={tree} className="visually-hidden" />
      <div
        {...containerProps}
        className="vault-tree"
        ref={el => {
          scrollRef.current = el;
          const r = (containerProps as {ref?: (node: HTMLDivElement | null) => void}).ref;
          if (typeof r === 'function') {
            r(el);
          }
        }}
      >
        <div
          className="vault-tree__inner"
          style={{height: `${virtualizer.getTotalSize()}px`, position: 'relative'}}
        >
          {virtualizer.getVirtualItems().map(virtualRow => {
            const item = items[virtualRow.index];
            if (!item) {
              return null;
            }
            /** Integer Y avoids sub-pixel anti-alias “fake bold” on translated row layers (WebKit/Chromium). */
            const rowOffsetYPx = Math.round(virtualRow.start);
            const data = item.getItemData();
            if (!data?.uri) {
              return (
                <div
                  key={item.getKey()}
                  className="vault-tree-row-virtual-wrap vault-tree-row-virtual-wrap--placeholder"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: VAULT_TREE_ROW_HEIGHT_PX,
                    transform: `translate3d(0, ${rowOffsetYPx}px, 0)`,
                  }}
                  aria-hidden
                />
              );
            }
            const rowProps = item.getProps();
            const level = item.getItemMeta().level;
            const pad = 8 + level * 14;
            const isFolder = data.kind === 'folder';
            const selected = item.isSelected();
            const isVaultRoot = data.uri === rootId;

            const canDragFromRow = Boolean(data.uri) && data.uri !== rootId && !busy;
            const rowButton = (
              <button
                {...rowProps}
                type="button"
                className={[
                  selected ? 'vault-tree-row vault-tree-row--selected' : 'vault-tree-row',
                  isFolder && dropTargetUri === data.uri ? 'vault-tree-row--drop-target' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{paddingInlineStart: pad}}
                disabled={busy}
                draggable={canDragFromRow}
                onDragStart={e => {
                  if (!canDragFromRow) {
                    return;
                  }
                  e.dataTransfer.setData(
                    VAULT_TREE_DND_MIME,
                    JSON.stringify({uri: data.uri, kind: data.kind}),
                  );
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => clearDropTarget()}
                onDragOver={
                  isFolder
                    ? e => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDropTargetUri(data.uri);
                      }
                    : undefined
                }
                onDragLeave={
                  isFolder
                    ? e => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                          setDropTargetUri(null);
                        }
                      }
                    : undefined
                }
                onDrop={
                  isFolder
                    ? e => {
                        e.preventDefault();
                        clearDropTarget();
                        if (busy) {
                          return;
                        }
                        const raw = e.dataTransfer.getData(VAULT_TREE_DND_MIME);
                        if (!raw) {
                          return;
                        }
                        let parsed: {uri?: string; kind?: string};
                        try {
                          parsed = JSON.parse(raw) as {uri?: string; kind?: string};
                        } catch {
                          return;
                        }
                        if (
                          typeof parsed.uri !== 'string'
                          || (parsed.kind !== 'folder' && parsed.kind !== 'article')
                        ) {
                          return;
                        }
                        onMoveVaultTreeItem(parsed.uri, parsed.kind, data.uri);
                      }
                    : undefined
                }
              >
                <span className="vault-tree-row__chevron" aria-hidden>
                  {isFolder ? (
                    <MaterialIcon
                      name={item.isExpanded() ? 'expand_more' : 'chevron_right'}
                      size={12}
                    />
                  ) : (
                    <span className="vault-tree-row__chevron-spacer" />
                  )}
                </span>
                <span className="vault-tree-row__icon" aria-hidden>
                  <MaterialIcon
                    name={isFolder ? 'folder' : 'description'}
                    size={12}
                  />
                </span>
                <span className="vault-tree-row__label">{data.name}</span>
              </button>
            );

            return (
              <div
                key={item.getKey()}
                className="vault-tree-row-virtual-wrap"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: VAULT_TREE_ROW_HEIGHT_PX,
                  transform: `translate3d(0, ${rowOffsetYPx}px, 0)`,
                }}
              >
                <ContextMenu.Root>
                  <ContextMenu.Trigger asChild>{rowButton}</ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content
                      className="note-list-context-menu"
                      alignOffset={4}
                      collisionPadding={8}
                    >
                      <ContextMenu.Item
                        className="note-list-context-menu__item"
                        disabled={busy}
                        onSelect={() => {
                          if (data.kind === 'article') {
                            onOpenMarkdownNote(data.uri);
                          } else {
                            void item.expand();
                          }
                        }}
                      >
                        Open
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="note-list-context-menu__item"
                        disabled={busy || isVaultRoot}
                        onSelect={() => {
                          if (data.kind === 'article') {
                            onRenameMarkdownRequest(data.uri);
                          } else {
                            onRenameFolderRequest(data.uri);
                          }
                        }}
                      >
                        Rename
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="note-list-context-menu__item note-list-context-menu__item--danger"
                        disabled={busy || isVaultRoot}
                        onSelect={() => {
                          if (data.kind === 'article') {
                            onDeleteMarkdownRequest(data.uri);
                          } else {
                            onDeleteFolderRequest(data.uri);
                          }
                        }}
                      >
                        Delete
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

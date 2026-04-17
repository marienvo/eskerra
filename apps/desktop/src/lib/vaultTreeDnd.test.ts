import {describe, expect, it} from 'vitest';

import {
  resolveVaultTreeDropFromMime,
  serializeVaultTreeDragPayload,
  VAULT_TREE_DND_MIME,
} from './vaultTreeDnd';
import type {VaultTreeItemData} from './vaultTreeLoadChildren';

const root = '/vault/Inbox';

function row(uri: string, kind: VaultTreeItemData['kind']): VaultTreeItemData {
  return {kind, name: uri.split('/').pop() ?? 'x', uri, lastModified: null};
}

describe('serializeVaultTreeDragPayload', () => {
  it('serializes single item without items array when not multi-drag', () => {
    const raw = serializeVaultTreeDragPayload({
      draggedUri: `${root}/a.md`,
      draggedKind: 'article',
      selectedItemIds: [`${root}/a.md`],
      rootId: root,
      getRow: id => row(id, 'article'),
    });
    const parsed = JSON.parse(raw) as {items?: unknown};
    expect(parsed.items).toBeUndefined();
  });

  it('includes items when dragging one of several selected rows', () => {
    const a = `${root}/a.md`;
    const b = `${root}/b.md`;
    const c = `${root}/c.md`;
    const raw = serializeVaultTreeDragPayload({
      draggedUri: a,
      draggedKind: 'article',
      selectedItemIds: [a, b, c],
      rootId: root,
      getRow: id => row(id, 'article'),
    });
    const parsed = JSON.parse(raw) as {uri: string; items: {uri: string}[]};
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items.map(i => i.uri).sort()).toEqual([a, b, c].sort());
  });

  it('exports stable MIME type for tree DnD', () => {
    expect(VAULT_TREE_DND_MIME).toBe('application/x-eskerra-vault-tree');
  });
});

describe('resolveVaultTreeDropFromMime', () => {
  it('resolves bulk when payload has multiple items including primary', () => {
    const raw = JSON.stringify({
      uri: `${root}/a.md`,
      kind: 'article',
      items: [
        {uri: `${root}/a.md`, kind: 'article'},
        {uri: `${root}/b.md`, kind: 'article'},
        {uri: `${root}/c.md`, kind: 'article'},
      ],
    });
    const r = resolveVaultTreeDropFromMime(raw);
    expect(r.ok && r.mode === 'bulk').toBe(true);
    if (r.ok && r.mode === 'bulk') {
      expect(r.items).toHaveLength(3);
    }
  });

  it('resolves single when items missing', () => {
    const raw = JSON.stringify({uri: `${root}/a.md`, kind: 'article'});
    const r = resolveVaultTreeDropFromMime(raw);
    expect(r).toEqual({
      ok: true,
      mode: 'single',
      sourceUri: `${root}/a.md`,
      sourceKind: 'article',
    });
  });

  it('resolves single when items length is 1', () => {
    const raw = JSON.stringify({
      uri: `${root}/a.md`,
      kind: 'article',
      items: [{uri: `${root}/a.md`, kind: 'article'}],
    });
    const r = resolveVaultTreeDropFromMime(raw);
    expect(r.ok && r.mode === 'single').toBe(true);
  });

  it('resolves single when primary uri not in items list', () => {
    const raw = JSON.stringify({
      uri: `${root}/a.md`,
      kind: 'article',
      items: [
        {uri: `${root}/b.md`, kind: 'article'},
        {uri: `${root}/c.md`, kind: 'article'},
      ],
    });
    const r = resolveVaultTreeDropFromMime(raw);
    expect(r.ok && r.mode === 'single').toBe(true);
  });

  it('maps todayHub primary to folder move kind', () => {
    const raw = JSON.stringify({uri: `${root}/Today`, kind: 'todayHub'});
    const r = resolveVaultTreeDropFromMime(raw);
    expect(r).toEqual({
      ok: true,
      mode: 'single',
      sourceUri: `${root}/Today`,
      sourceKind: 'folder',
    });
  });
});

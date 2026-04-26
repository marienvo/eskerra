import {describe, expect, it} from 'vitest';

import {createEditorWorkspaceTab} from '../lib/editorWorkspaceTabs';
import {
  collectDeletedPathsFromBulkPlan,
  pruneEditorTabsAfterBulkTreeDelete,
} from './workspaceVaultTreeMutations';

describe('workspaceVaultTreeMutations', () => {
  it('collectDeletedPathsFromBulkPlan normalizes file URIs and folder prefixes', () => {
    const {deletedFiles, deletedFolders} = collectDeletedPathsFromBulkPlan([
      {kind: 'article', uri: 'vault/Inbox/a.md'},
      {kind: 'folder', uri: 'vault/Projects/old/'},
    ]);
    expect(deletedFiles.has('vault/Inbox/a.md')).toBe(true);
    expect(deletedFolders).toContain('vault/Projects/old');
  });

  it('pruneEditorTabsAfterBulkTreeDelete removes tabs under deleted folder and matching scroll keys', () => {
    const t1 = createEditorWorkspaceTab('vault/Inbox/keep.md');
    const t2 = createEditorWorkspaceTab('vault/Projects/old/nested/x.md');
    const {newTabs, nextActive, scrollKeysToRemove} = pruneEditorTabsAfterBulkTreeDelete({
      editorWorkspaceTabs: [t1, t2],
      activeEditorTabId: t2.id,
      plan: [{kind: 'folder', uri: 'vault/Projects/old'}],
      scrollMapKeys: ['vault/Inbox/keep.md', 'vault/Projects/old/nested/x.md', 'vault/Other/y.md'],
    });
    expect(newTabs.map(t => t.history.entries[t.history.index])).toEqual(['vault/Inbox/keep.md']);
    expect(nextActive).toBe(t1.id);
    expect(scrollKeysToRemove.sort()).toEqual(
      ['vault/Projects/old/nested/x.md'].sort(),
    );
  });
});

import {describe, expect, it} from 'vitest';

import {filterTopLevelInboxFolderFromChildRows} from './vaultTreeFilterTopLevelInbox';

describe('filterTopLevelInboxFolderFromChildRows', () => {
  const vaultRootUri = '/vault';

  it('removes only the top-level Inbox folder under the vault root', () => {
    const rows = [
      {
        id: '/vault/Inbox',
        data: {
          kind: 'folder' as const,
          name: 'Inbox',
          uri: '/vault/Inbox',
          lastModified: null,
        },
      },
      {
        id: '/vault/General',
        data: {
          kind: 'folder' as const,
          name: 'General',
          uri: '/vault/General',
          lastModified: null,
        },
      },
    ];
    const out = filterTopLevelInboxFolderFromChildRows({
      rows,
      parentUri: vaultRootUri,
      vaultRootUri,
    });
    expect(out.map(r => r.id)).toEqual(['/vault/General']);
  });

  it('does not remove Inbox-named folders under other parents', () => {
    const rows = [
      {
        id: '/vault/Deep/Inbox',
        data: {
          kind: 'folder' as const,
          name: 'Inbox',
          uri: '/vault/Deep/Inbox',
          lastModified: null,
        },
      },
    ];
    const out = filterTopLevelInboxFolderFromChildRows({
      rows,
      parentUri: '/vault/Deep',
      vaultRootUri,
    });
    expect(out).toEqual(rows);
  });
});

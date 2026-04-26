import {describe, expect, it} from 'vitest';

import {buildRestoredEditorWorkspace} from './inboxShellRestoreHelpers';

describe('buildRestoredEditorWorkspace', () => {
  it('returns current URIs from tab history without crashing', () => {
    const restored = buildRestoredEditorWorkspace({
      chosenTabsSource: [
        {
          id: 'tab-1',
          entries: ['file:///vault/Inbox/A.md', 'file:///vault/Inbox/B.md'],
          index: 1,
        },
        {
          id: 'tab-2',
          entries: ['file:///vault/General/C.md'],
          index: 0,
        },
      ],
      chosenActiveEditorTabId: 'tab-2',
      filter: () => true,
    });

    expect(restored).not.toBeNull();
    expect(restored!.uris).toEqual([
      'file:///vault/Inbox/B.md',
      'file:///vault/General/C.md',
    ]);
    expect(restored!.activeEditorTabId).toBe('tab-2');
  });
});

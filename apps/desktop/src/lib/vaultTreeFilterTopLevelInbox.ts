import {INBOX_DIRECTORY_NAME} from '@eskerra/core';

import type {VaultTreeChildRow} from './vaultTreeLoadChildren';

/**
 * Hides the canonical vault `Inbox/` folder from the main vault tree only (direct child of vault root).
 */
export function filterTopLevelInboxFolderFromChildRows(options: {
  rows: VaultTreeChildRow[];
  parentUri: string;
  vaultRootUri: string;
}): VaultTreeChildRow[] {
  const {rows, parentUri, vaultRootUri} = options;
  if (parentUri !== vaultRootUri) {
    return rows;
  }
  return rows.filter(
    r => !(r.data.kind === 'folder' && r.data.name === INBOX_DIRECTORY_NAME),
  );
}

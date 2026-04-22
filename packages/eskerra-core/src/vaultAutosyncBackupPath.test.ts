import {describe, expect, it} from 'vitest';

import {getAutosyncBackupRootUri, isVaultPathUnderAutosyncBackup} from './vaultAutosyncBackupPath';

describe('isVaultPathUnderAutosyncBackup', () => {
  it('returns true for _autosync-backup-nuc at vault root', () => {
    expect(
      isVaultPathUnderAutosyncBackup(
        '/vault/_autosync-backup-nuc/General/x--20260315-145001.md',
      ),
    ).toBe(true);
  });

  it('returns true for nested _autosync-backup without machine suffix', () => {
    expect(
      isVaultPathUnderAutosyncBackup('/vault/General/_autosync-backup/x.md'),
    ).toBe(true);
  });

  it('returns false for ordinary General paths', () => {
    expect(isVaultPathUnderAutosyncBackup('/vault/General/Note.md')).toBe(false);
  });

  it('returns false for Inbox (no false positive on "backup" token)', () => {
    expect(isVaultPathUnderAutosyncBackup('/vault/Inbox/a.md')).toBe(false);
  });
});

describe('getAutosyncBackupRootUri', () => {
  it('returns the _autosync-backup-* directory uri', () => {
    expect(
      getAutosyncBackupRootUri('/vault/_autosync-backup-nuc/General/x--20260315.md'),
    ).toBe('/vault/_autosync-backup-nuc');
  });

  it('works for _autosync-backup without machine suffix', () => {
    expect(
      getAutosyncBackupRootUri('/vault/_autosync-backup/note.md'),
    ).toBe('/vault/_autosync-backup');
  });

  it('returns null for paths not under an autosync-backup dir', () => {
    expect(getAutosyncBackupRootUri('/vault/Inbox/note.md')).toBeNull();
  });
});

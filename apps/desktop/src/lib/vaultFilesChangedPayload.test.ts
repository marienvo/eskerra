import {describe, expect, it} from 'vitest';

import {
  vaultFilesChangedIsCoarse,
  type VaultFilesChangedPayload,
} from './vaultFilesChangedPayload';

describe('vaultFilesChangedIsCoarse', () => {
  it('treats missing payload as coarse', () => {
    expect(vaultFilesChangedIsCoarse(undefined)).toBe(true);
    expect(vaultFilesChangedIsCoarse(null)).toBe(true);
  });

  it('treats empty path batches as coarse', () => {
    const payload: VaultFilesChangedPayload = {paths: []};
    expect(vaultFilesChangedIsCoarse(payload)).toBe(true);
  });

  it('treats explicit coarse payload as coarse', () => {
    const payload: VaultFilesChangedPayload = {
      paths: ['/vault/Inbox/note.md'],
      coarse: true,
      coarseReason: 'notify_error:poll:overflow',
    };
    expect(vaultFilesChangedIsCoarse(payload)).toBe(true);
  });

  it('treats non-empty non-coarse payload as precise', () => {
    const payload: VaultFilesChangedPayload = {paths: ['/vault/Inbox/note.md']};
    expect(vaultFilesChangedIsCoarse(payload)).toBe(false);
  });
});

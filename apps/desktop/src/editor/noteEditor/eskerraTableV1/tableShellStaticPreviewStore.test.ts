import {describe, expect, it} from 'vitest';

import {
  bumpTableShellStaticPreview,
  getTableShellStaticPreviewVersion,
  subscribeTableShellStaticPreview,
} from './tableShellStaticPreviewStore';

describe('tableShellStaticPreviewStore', () => {
  it('coalesces multiple synchronous bumps into one version step per microtask', async () => {
    const v0 = getTableShellStaticPreviewVersion();
    let calls = 0;
    const unsub = subscribeTableShellStaticPreview(() => {
      calls += 1;
    });
    try {
      bumpTableShellStaticPreview();
      bumpTableShellStaticPreview();
      bumpTableShellStaticPreview();
      expect(getTableShellStaticPreviewVersion()).toBe(v0);
      expect(calls).toBe(0);
      await Promise.resolve();
      expect(getTableShellStaticPreviewVersion()).toBe(v0 + 1);
      expect(calls).toBe(1);
    } finally {
      unsub();
    }
  });
});

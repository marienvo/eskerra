import {beforeEach, describe, expect, it, vi} from 'vitest';

import {persistTransientMarkdownImages} from './persistTransientMarkdownImages';

vi.mock('./desktopVaultAttachments', () => ({
  saveVaultImageBytes: vi
    .fn()
    .mockResolvedValue('../Assets/Attachments/out.png'),
}));

import {saveVaultImageBytes} from './desktopVaultAttachments';

describe('persistTransientMarkdownImages', () => {
  beforeEach(() => {
    vi.mocked(saveVaultImageBytes).mockClear();
  });

  it('returns input unchanged when no transient URLs', async () => {
    const md = '![](../Assets/Attachments/x.png)';
    expect(await persistTransientMarkdownImages(md, '/vault')).toBe(md);
    expect(saveVaultImageBytes).not.toHaveBeenCalled();
  });

  it('rewrites data:image URLs and syncs duplicate src values once', async () => {
    const md =
      '![a](data:image/png;base64,iVBORw0KGgo=) ![b](data:image/png;base64,iVBORw0KGgo=)';
    const out = await persistTransientMarkdownImages(md, '/vault');
    expect(out).toBe(
      '![a](../Assets/Attachments/out.png) ![b](../Assets/Attachments/out.png)',
    );
    expect(saveVaultImageBytes).toHaveBeenCalledTimes(1);
  });
});

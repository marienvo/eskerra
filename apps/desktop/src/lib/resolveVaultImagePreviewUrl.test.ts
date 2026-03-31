import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((p: string) => `mock:${p}`),
}));

import {convertFileSrc} from '@tauri-apps/api/core';

import {resolveVaultImagePreviewUrl} from './resolveVaultImagePreviewUrl';

describe('resolveVaultImagePreviewUrl', () => {
  beforeEach(() => {
    vi.mocked(convertFileSrc).mockClear();
  });

  it('passes through http and data URLs', () => {
    expect(
      resolveVaultImagePreviewUrl('/v', '/v/Inbox/n.md', 'https://x/y.png'),
    ).toBe('https://x/y.png');
    expect(
      resolveVaultImagePreviewUrl('/v', '/v/Inbox/n.md', 'data:image/png;base64,xx'),
    ).toBe('data:image/png;base64,xx');
  });

  it('resolves attachment path to convertFileSrc', () => {
    const out = resolveVaultImagePreviewUrl(
      '/vault',
      '/vault/Inbox/note.md',
      '../Assets/Attachments/a.png',
    );
    expect(out).toBe('mock:/vault/Assets/Attachments/a.png');
    expect(convertFileSrc).toHaveBeenCalledWith('/vault/Assets/Attachments/a.png');
  });

  it('uses Inbox as base when composing (no active path)', () => {
    resolveVaultImagePreviewUrl('/vault', null, '../Assets/Attachments/a.png');
    expect(convertFileSrc).toHaveBeenCalledWith('/vault/Assets/Attachments/a.png');
  });

  it('decodes percent-encoding in path before resolving', () => {
    resolveVaultImagePreviewUrl(
      '/vault',
      '/vault/Inbox/note.md',
      '../Assets/Attachments/hello%20world.png',
    );
    expect(convertFileSrc).toHaveBeenCalledWith(
      '/vault/Assets/Attachments/hello world.png',
    );
  });
});

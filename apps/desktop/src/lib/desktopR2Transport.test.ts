import {beforeEach, describe, expect, it, vi} from 'vitest';

const {mockInvoke} = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {desktopR2SignedTransport} from './desktopR2Transport';

const presignedUrl =
  'https://account.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=test&X-Amz-Credential=x';

describe('desktopR2SignedTransport', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('uses null body for 204 so Response construction does not throw', async () => {
    mockInvoke.mockResolvedValue({
      status: 204,
      body: '',
    });
    const req = new Request(presignedUrl, {method: 'DELETE'});
    const res = await desktopR2SignedTransport(req);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('uses null body for 304 and forwards etag header', async () => {
    mockInvoke.mockResolvedValue({
      status: 304,
      body: '',
      etag: '"abc123"',
    });
    const req = new Request(presignedUrl, {
      method: 'GET',
      headers: {'If-None-Match': '"prior"'},
    });
    const res = await desktopR2SignedTransport(req);
    expect(res.status).toBe(304);
    expect(res.headers.get('etag')).toBe('"abc123"');
    expect(await res.text()).toBe('');
    expect(mockInvoke).toHaveBeenCalledWith(
      'r2_signed_fetch',
      expect.objectContaining({
        method: 'GET',
        headers: expect.arrayContaining([['if-none-match', '"prior"']]),
      }),
    );
  });

  it('passes body through for 200 OK', async () => {
    mockInvoke.mockResolvedValue({
      status: 200,
      body: '{"episodeId":"e1"}',
      etag: '"xyz"',
    });
    const req = new Request(presignedUrl, {method: 'GET'});
    const res = await desktopR2SignedTransport(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"episodeId":"e1"}');
    expect(res.headers.get('etag')).toBe('"xyz"');
  });
});

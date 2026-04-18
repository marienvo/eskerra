import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createPlaylistEtagPoller} from './playlistEtagPoller';
import type {R2PlaylistConditionalResult} from './r2PlaylistConditional';

describe('createPlaylistEtagPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call onDataChanged for not_modified', async () => {
    const fetchConditional = vi.fn().mockResolvedValue({kind: 'not_modified'} as R2PlaylistConditionalResult);
    const onDataChanged = vi.fn();
    const poller = createPlaylistEtagPoller({
      intervalMs: 1000,
      fetchConditional,
      onDataChanged,
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(1));
    expect(onDataChanged).not.toHaveBeenCalled();
    poller.dispose();
  });

  it('calls onDataChanged on updated and stores etag', async () => {
    const entry = {
      controlRevision: 0,
      durationMs: 0,
      episodeId: 'e',
      mp3Url: 'u',
      playbackOwnerId: '',
      positionMs: 0,
      updatedAt: 1,
    };
    const fetchConditional = vi
      .fn()
      .mockResolvedValue({kind: 'updated', entry, etag: '"x"'} as R2PlaylistConditionalResult);
    const onDataChanged = vi.fn();
    const poller = createPlaylistEtagPoller({
      intervalMs: 1000,
      fetchConditional,
      onDataChanged,
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(onDataChanged).toHaveBeenCalledWith(entry));
    expect(poller.getEtag()).toBe('"x"');
    poller.dispose();
  });

  it('skips a tick while a fetch is in flight', async () => {
    let finish: (r: R2PlaylistConditionalResult) => void = () => undefined;
    const hanging = new Promise<R2PlaylistConditionalResult>(resolve => {
      finish = resolve;
    });
    const fetchConditional = vi.fn().mockReturnValue(hanging);
    const poller = createPlaylistEtagPoller({
      intervalMs: 500,
      fetchConditional,
      onDataChanged: () => undefined,
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchConditional).toHaveBeenCalledTimes(1);
    finish({kind: 'not_modified'});
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(2));
    poller.dispose();
  });

  it('runs an immediate check when becoming active', async () => {
    const fetchConditional = vi.fn().mockResolvedValue({kind: 'not_modified'} as R2PlaylistConditionalResult);
    const poller = createPlaylistEtagPoller({
      intervalMs: 1000,
      fetchConditional,
      onDataChanged: () => undefined,
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(1));
    poller.dispose();
  });

  it('stops polling and aborts when becoming inactive', async () => {
    let rejectPromise: ((e: Error) => void) | undefined;
    const fetchConditional = vi.fn(() => {
      return new Promise<R2PlaylistConditionalResult>((_res, rej) => {
        rejectPromise = rej;
      });
    });
    const poller = createPlaylistEtagPoller({
      intervalMs: 1000,
      fetchConditional,
      onDataChanged: () => undefined,
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(1));
    poller.setActive(false);
    rejectPromise?.(new DOMException('Aborted', 'AbortError'));
    await Promise.resolve();
    poller.dispose();
  });

  it('clears etag on missing and calls onRemotePlaylistCleared once after updated', async () => {
    const entry = {
      controlRevision: 0,
      durationMs: 0,
      episodeId: 'e',
      mp3Url: 'u',
      playbackOwnerId: '',
      positionMs: 0,
      updatedAt: 1,
    };
    const fetchConditional = vi
      .fn()
      .mockResolvedValueOnce({kind: 'updated', etag: '"a"', entry})
      .mockResolvedValueOnce({kind: 'missing'} as R2PlaylistConditionalResult);
    const onRemotePlaylistCleared = vi.fn();
    const poller = createPlaylistEtagPoller({
      intervalMs: 10,
      fetchConditional,
      onDataChanged: () => undefined,
      onRemotePlaylistCleared,
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(poller.getEtag()).toBe('"a"'));
    await vi.advanceTimersByTimeAsync(20);
    await vi.waitFor(() => expect(poller.getEtag()).toBeNull());
    expect(onRemotePlaylistCleared).toHaveBeenCalledTimes(1);
    poller.dispose();
  });

  it('does not call onRemotePlaylistCleared on first tick missing', async () => {
    const fetchConditional = vi.fn().mockResolvedValue({kind: 'missing'} as R2PlaylistConditionalResult);
    const onRemotePlaylistCleared = vi.fn();
    const poller = createPlaylistEtagPoller({
      intervalMs: 1000,
      fetchConditional,
      onDataChanged: vi.fn(),
      onRemotePlaylistCleared,
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(1));
    expect(onRemotePlaylistCleared).not.toHaveBeenCalled();
    poller.dispose();
  });

  it('calls onRemotePlaylistCleared once for updated then not_modified then missing', async () => {
    const entry = {
      controlRevision: 0,
      durationMs: 0,
      episodeId: 'e',
      mp3Url: 'u',
      playbackOwnerId: '',
      positionMs: 0,
      updatedAt: 1,
    };
    const fetchConditional = vi
      .fn()
      .mockResolvedValueOnce({kind: 'updated', etag: '"a"', entry})
      .mockResolvedValueOnce({kind: 'not_modified'} as R2PlaylistConditionalResult)
      .mockResolvedValueOnce({kind: 'missing'} as R2PlaylistConditionalResult);
    const onRemotePlaylistCleared = vi.fn();
    const poller = createPlaylistEtagPoller({
      intervalMs: 60_000,
      fetchConditional,
      onDataChanged: vi.fn(),
      onRemotePlaylistCleared,
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(1));
    poller.triggerCheck();
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(2));
    poller.triggerCheck();
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(3));
    expect(onRemotePlaylistCleared).toHaveBeenCalledTimes(1);
    poller.dispose();
  });

  it('calls onRemotePlaylistCleared only once for updated then missing twice', async () => {
    const entry = {
      controlRevision: 0,
      durationMs: 0,
      episodeId: 'e',
      mp3Url: 'u',
      playbackOwnerId: '',
      positionMs: 0,
      updatedAt: 1,
    };
    const fetchConditional = vi
      .fn()
      .mockResolvedValueOnce({kind: 'updated', etag: '"a"', entry})
      .mockResolvedValueOnce({kind: 'missing'} as R2PlaylistConditionalResult)
      .mockResolvedValue({kind: 'missing'} as R2PlaylistConditionalResult);
    const onRemotePlaylistCleared = vi.fn();
    const poller = createPlaylistEtagPoller({
      intervalMs: 60_000,
      fetchConditional,
      onDataChanged: vi.fn(),
      onRemotePlaylistCleared,
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(1));
    poller.triggerCheck();
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(2));
    expect(onRemotePlaylistCleared).toHaveBeenCalledTimes(1);
    poller.triggerCheck();
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(3));
    expect(onRemotePlaylistCleared).toHaveBeenCalledTimes(1);
    poller.dispose();
  });

  it('notifies onTransientError for non-abort failures', async () => {
    const fetchConditional = vi.fn().mockRejectedValue(new Error('network'));
    const onTransientError = vi.fn();
    const poller = createPlaylistEtagPoller({
      intervalMs: 1000,
      fetchConditional,
      onDataChanged: () => undefined,
      onTransientError,
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(onTransientError).toHaveBeenCalledWith(expect.any(Error)));
    poller.dispose();
  });

  it('setIntervalMs reschedules without immediate tick and preserves etag', async () => {
    const entry = {
      controlRevision: 0,
      durationMs: 0,
      episodeId: 'e',
      mp3Url: 'u',
      playbackOwnerId: '',
      positionMs: 0,
      updatedAt: 1,
    };
    const fetchConditional = vi
      .fn()
      .mockResolvedValue({kind: 'not_modified'} as R2PlaylistConditionalResult);
    fetchConditional.mockResolvedValueOnce({kind: 'updated', entry, etag: '"etag1"'} as R2PlaylistConditionalResult);
    const poller = createPlaylistEtagPoller({
      intervalMs: 1000,
      fetchConditional,
      onDataChanged: vi.fn(),
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(1));
    expect(poller.getEtag()).toBe('"etag1"');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(2));
    poller.setIntervalMs(5000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchConditional).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(3));
    expect(poller.getEtag()).toBe('"etag1"');
    poller.dispose();
  });

  it('setIntervalMs while inactive updates next schedule after activate', async () => {
    const fetchConditional = vi.fn().mockResolvedValue({kind: 'not_modified'} as R2PlaylistConditionalResult);
    const poller = createPlaylistEtagPoller({
      intervalMs: 1000,
      fetchConditional,
      onDataChanged: () => undefined,
    });
    poller.setIntervalMs(3000);
    poller.setActive(true);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchConditional).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(fetchConditional).toHaveBeenCalledTimes(2));
    poller.dispose();
  });
});

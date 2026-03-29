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
      durationMs: 0,
      episodeId: 'e',
      mp3Url: 'u',
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

  it('clears etag on missing', async () => {
    const entry = {
      durationMs: 0,
      episodeId: 'e',
      mp3Url: 'u',
      positionMs: 0,
      updatedAt: 1,
    };
    const fetchConditional = vi
      .fn()
      .mockResolvedValueOnce({kind: 'updated', etag: '"a"', entry})
      .mockResolvedValueOnce({kind: 'missing'} as R2PlaylistConditionalResult);
    const poller = createPlaylistEtagPoller({
      intervalMs: 10,
      fetchConditional,
      onDataChanged: () => undefined,
    });
    poller.setActive(true);
    await vi.waitFor(() => expect(poller.getEtag()).toBe('"a"'));
    await vi.advanceTimersByTimeAsync(20);
    await vi.waitFor(() => expect(poller.getEtag()).toBeNull());
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
});

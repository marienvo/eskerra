import {act, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {VaultSearchDonePayload, VaultSearchUpdatePayload} from '../lib/vaultSearchTypes';
import {useVaultContentSearch, isVaultSearchEventCurrent} from './useVaultContentSearch';

const tauriCtx = vi.hoisted(() => {
  const state = {
    emitUpdate: (_payload: VaultSearchUpdatePayload) => {},
    emitDone: (_payload: VaultSearchDonePayload) => {},
  };
  const listen = vi.fn(async (channel: string, handler: (e: {payload: unknown}) => void) => {
    if (channel === 'vault-search:update') {
      state.emitUpdate = (payload: VaultSearchUpdatePayload) => handler({payload});
    } else if (channel === 'vault-search:done') {
      state.emitDone = (payload: VaultSearchDonePayload) => handler({payload});
    }
    return vi.fn();
  });
  return {listen, state};
});

const vaultSearchStartMock = vi.hoisted(() =>
  vi.fn((_options: {searchId: string; query: string}) => Promise.resolve()),
);
const vaultSearchCancelMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriCtx.listen,
}));

vi.mock('../lib/tauriVaultSearch', () => ({
  vaultSearchStart: vaultSearchStartMock,
  vaultSearchCancel: vaultSearchCancelMock,
}));

describe('isVaultSearchEventCurrent', () => {
  it('returns false when current id is null', () => {
    expect(isVaultSearchEventCurrent('a', null)).toBe(false);
  });

  it('returns false on mismatch', () => {
    expect(isVaultSearchEventCurrent('a', 'b')).toBe(false);
  });

  it('returns true when ids match', () => {
    expect(isVaultSearchEventCurrent('same', 'same')).toBe(true);
  });
});

describe('useVaultContentSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(0), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      window.clearTimeout(handle);
    });
    vaultSearchStartMock.mockClear();
    vaultSearchCancelMock.mockClear();
    tauriCtx.listen.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function flushListeners() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  /** Drain `requestAnimationFrame` flushes from `useVaultContentSearch` (stubbed as `setTimeout(0)`). */
  async function flushSearchRaf() {
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
  }

  it('does not start a run until debounce elapses (no searching phase yet)', async () => {
    const {result} = renderHook(() =>
      useVaultContentSearch({open: true, vaultRoot: '/vault', debounceMs: 300}),
    );
    await flushListeners();

    await act(async () => {
      result.current.setQuery('x');
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(vaultSearchStartMock).not.toHaveBeenCalled();
    expect(result.current.scanDone).toBe(true);
    expect(result.current.awaitingDebouncedRun).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(vaultSearchStartMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(vaultSearchStartMock).toHaveBeenCalledTimes(1);
    expect(result.current.scanDone).toBe(false);
    expect(result.current.awaitingDebouncedRun).toBe(false);
    expect(result.current.searchingStatusVisible).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(99);
    });
    expect(result.current.searchingStatusVisible).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.searchingStatusVisible).toBe(true);
  });

  it('does not expose searchingStatusVisible when the run finishes before the status delay', async () => {
    const {result} = renderHook(() =>
      useVaultContentSearch({open: true, vaultRoot: '/vault', debounceMs: 300}),
    );
    await flushListeners();

    await act(async () => {
      result.current.setQuery('x');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const id = vaultSearchStartMock.mock.calls[0]![0].searchId as string;
    expect(result.current.searchingStatusVisible).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    await act(async () => {
      tauriCtx.state.emitDone({
        searchId: id,
        cancelled: false,
        progress: {scannedFiles: 1, totalHits: 0, skippedLargeFiles: 0},
      });
    });
    expect(result.current.scanDone).toBe(true);
    expect(result.current.searchingStatusVisible).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.searchingStatusVisible).toBe(false);
  });

  it('keeps hits during debounce, then holds prior hits briefly when a new run starts', async () => {
    const {result} = renderHook(() =>
      useVaultContentSearch({open: true, vaultRoot: '/vault', debounceMs: 300}),
    );
    await flushListeners();

    await act(async () => {
      result.current.setQuery('foo');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(vaultSearchStartMock).toHaveBeenCalledTimes(1);
    const firstSearchId = vaultSearchStartMock.mock.calls[0]![0].searchId as string;

    const hit = {uri: 'file:///a.md', lineNumber: 1, snippet: 'x'};
    await act(async () => {
      tauriCtx.state.emitUpdate({
        searchId: firstSearchId,
        hits: [hit],
        progress: {scannedFiles: 1, totalHits: 1, skippedLargeFiles: 0},
      });
    });
    await flushSearchRaf();
    expect(result.current.hits).toEqual([hit]);
    expect(result.current.scanDone).toBe(false);

    await act(async () => {
      result.current.setQuery('food');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.awaitingDebouncedRun).toBe(true);
    expect(result.current.scanDone).toBe(true);
    expect(result.current.hits).toEqual([hit]);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(vaultSearchStartMock).toHaveBeenCalledTimes(2);
    expect(result.current.hits).toEqual([hit]);
    expect(result.current.holdingPreviousResults).toBe(true);
    expect(result.current.scanDone).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(99);
    });
    expect(result.current.hits).toEqual([hit]);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.hits).toEqual([]);
    expect(result.current.progress).toBeNull();
    expect(result.current.holdingPreviousResults).toBe(false);
    expect(result.current.scanDone).toBe(false);
  });

  it('replaces held prior hits when the first update arrives before the hold timeout', async () => {
    const {result} = renderHook(() =>
      useVaultContentSearch({open: true, vaultRoot: '/vault', debounceMs: 300}),
    );
    await flushListeners();

    await act(async () => {
      result.current.setQuery('foo');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const firstId = vaultSearchStartMock.mock.calls[0]![0].searchId as string;
    const oldHit = {uri: 'file:///old.md', lineNumber: 1, snippet: 'old'};
    await act(async () => {
      tauriCtx.state.emitUpdate({
        searchId: firstId,
        hits: [oldHit],
        progress: {scannedFiles: 1, totalHits: 1, skippedLargeFiles: 0},
      });
    });
    await flushSearchRaf();

    await act(async () => {
      result.current.setQuery('food');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const secondId = vaultSearchStartMock.mock.calls[1]![0].searchId as string;
    expect(result.current.holdingPreviousResults).toBe(true);
    expect(result.current.hits).toEqual([oldHit]);

    const newHit = {uri: 'file:///new.md', lineNumber: 1, snippet: 'new'};
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    await act(async () => {
      tauriCtx.state.emitUpdate({
        searchId: secondId,
        hits: [newHit],
        progress: {scannedFiles: 2, totalHits: 1, skippedLargeFiles: 0},
      });
    });
    await flushSearchRaf();

    expect(result.current.holdingPreviousResults).toBe(false);
    expect(result.current.hits).toEqual([newHit]);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.hits).toEqual([newHit]);
  });

  it('clears held prior hits when done arrives before the first update', async () => {
    const {result} = renderHook(() =>
      useVaultContentSearch({open: true, vaultRoot: '/vault', debounceMs: 300}),
    );
    await flushListeners();

    await act(async () => {
      result.current.setQuery('foo');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const firstId = vaultSearchStartMock.mock.calls[0]![0].searchId as string;
    await act(async () => {
      tauriCtx.state.emitUpdate({
        searchId: firstId,
        hits: [{uri: 'file:///a.md', lineNumber: 1, snippet: 'x'}],
        progress: {scannedFiles: 1, totalHits: 1, skippedLargeFiles: 0},
      });
    });
    await flushSearchRaf();

    await act(async () => {
      result.current.setQuery('food');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const secondId = vaultSearchStartMock.mock.calls[1]![0].searchId as string;

    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    await act(async () => {
      tauriCtx.state.emitDone({
        searchId: secondId,
        cancelled: false,
        progress: {scannedFiles: 0, totalHits: 0, skippedLargeFiles: 0},
      });
    });

    expect(result.current.holdingPreviousResults).toBe(false);
    expect(result.current.hits).toEqual([]);
    expect(result.current.scanDone).toBe(true);
  });

  it('ignores updates for a stale searchId after input moved on', async () => {
    const {result} = renderHook(() =>
      useVaultContentSearch({open: true, vaultRoot: '/vault', debounceMs: 300}),
    );
    await flushListeners();

    await act(async () => {
      result.current.setQuery('a');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const firstId = vaultSearchStartMock.mock.calls[0]![0].searchId as string;

    await act(async () => {
      tauriCtx.state.emitUpdate({
        searchId: firstId,
        hits: [{uri: 'file:///old.md', lineNumber: 1, snippet: 'old'}],
        progress: {scannedFiles: 5, totalHits: 1, skippedLargeFiles: 0},
      });
    });
    await flushSearchRaf();
    expect(result.current.hits).toHaveLength(1);

    await act(async () => {
      result.current.setQuery('ab');
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      tauriCtx.state.emitUpdate({
        searchId: firstId,
        hits: [{uri: 'file:///stale.md', lineNumber: 2, snippet: 'no'}],
        progress: {scannedFiles: 99, totalHits: 2, skippedLargeFiles: 0},
      });
    });
    expect(result.current.hits).toHaveLength(1);
    expect(result.current.hits[0]!.uri).toBe('file:///old.md');
  });

  it('applies done only for the active searchId', async () => {
    const {result} = renderHook(() =>
      useVaultContentSearch({open: true, vaultRoot: '/vault', debounceMs: 300}),
    );
    await flushListeners();

    await act(async () => {
      result.current.setQuery('q');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const id = vaultSearchStartMock.mock.calls[0]![0].searchId as string;

    await act(async () => {
      tauriCtx.state.emitDone({
        searchId: 'other-id',
        cancelled: false,
        progress: {scannedFiles: 1, totalHits: 0, skippedLargeFiles: 0},
      });
    });
    expect(result.current.scanDone).toBe(false);

    await act(async () => {
      tauriCtx.state.emitDone({
        searchId: id,
        cancelled: false,
        progress: {scannedFiles: 10, totalHits: 3, skippedLargeFiles: 0},
      });
    });
    expect(result.current.scanDone).toBe(true);
    expect(result.current.progress?.totalHits).toBe(3);
  });

  it('debounces repeated query changes into one start call', async () => {
    const {result} = renderHook(() =>
      useVaultContentSearch({open: true, vaultRoot: '/vault', debounceMs: 300}),
    );
    await flushListeners();

    await act(async () => {
      result.current.setQuery('a');
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      result.current.setQuery('ab');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(vaultSearchStartMock).toHaveBeenCalledTimes(1);
    expect(vaultSearchStartMock.mock.calls[0]![0].query).toBe('ab');
  });

  it('coalesces rapid vault-search:update events into one rAF flush', async () => {
    const {result} = renderHook(() =>
      useVaultContentSearch({open: true, vaultRoot: '/vault', debounceMs: 300}),
    );
    await flushListeners();

    await act(async () => {
      result.current.setQuery('q');
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const id = vaultSearchStartMock.mock.calls[0]![0].searchId as string;
    expect(result.current.hits).toEqual([]);

    const h1 = {uri: 'file:///a.md', lineNumber: 1, snippet: '1'};
    const h2 = {uri: 'file:///b.md', lineNumber: 1, snippet: '2'};
    const h3 = {uri: 'file:///c.md', lineNumber: 1, snippet: '3'};

    await act(async () => {
      tauriCtx.state.emitUpdate({
        searchId: id,
        hits: [h1],
        progress: {scannedFiles: 1, totalHits: 1, skippedLargeFiles: 0},
      });
      tauriCtx.state.emitUpdate({
        searchId: id,
        hits: [h2],
        progress: {scannedFiles: 2, totalHits: 2, skippedLargeFiles: 0},
      });
      tauriCtx.state.emitUpdate({
        searchId: id,
        hits: [h3],
        progress: {scannedFiles: 3, totalHits: 3, skippedLargeFiles: 0},
      });
    });
    expect(result.current.hits).toEqual([]);

    await flushSearchRaf();
    expect(result.current.hits).toEqual([h1, h2, h3]);
    expect(result.current.progress?.scannedFiles).toBe(3);
  });
});

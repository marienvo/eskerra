import {act, renderHook} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {VaultSearchDonePayload, VaultSearchUpdatePayload} from '@eskerra/core';
import {useVaultContentSearch, isVaultSearchEventCurrent} from './useVaultContentSearch';

function progress(partial: Partial<VaultSearchDonePayload['progress']> = {}): VaultSearchDonePayload['progress'] {
  return {
    scannedFiles: 0,
    totalHits: 0,
    skippedLargeFiles: 0,
    indexStatus: 'ready',
    indexReady: true,
    ...partial,
  };
}

/** Hoisted mock bridge: {@link resetTauriVaultSearchBridge} runs each test so stale handlers cannot accumulate. */
const tauriTest = vi.hoisted(() => {
  const state = {
    emitUpdate: (_payload: VaultSearchUpdatePayload) => {},
    emitDone: (_payload: VaultSearchDonePayload) => {},
  };
  const resetTauriVaultSearchBridge = (): void => {
    state.emitUpdate = (_payload: VaultSearchUpdatePayload) => {};
    state.emitDone = (_payload: VaultSearchDonePayload) => {};
  };
  const listen = vi.fn(async (channel: string, handler: (e: {payload: unknown}) => void) => {
    if (channel === 'vault-search:update') {
      state.emitUpdate = (payload: VaultSearchUpdatePayload) => handler({payload});
    } else if (channel === 'vault-search:done') {
      state.emitDone = (payload: VaultSearchDonePayload) => handler({payload});
    }
    return vi.fn();
  });
  return {listen, state, resetTauriVaultSearchBridge};
});

const vaultSearchStartMock = vi.hoisted(() =>
  vi.fn((_options: {searchId: string; query: string}) => Promise.resolve()),
);
const vaultSearchCancelMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriTest.listen,
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
    tauriTest.resetTauriVaultSearchBridge();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(0), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      window.clearTimeout(handle);
    });
    vaultSearchStartMock.mockClear();
    vaultSearchCancelMock.mockClear();
    tauriTest.listen.mockClear();
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
      tauriTest.state.emitDone({
        searchId: id,
        cancelled: false,
        progress: progress({scannedFiles: 1, totalHits: 0}),
      });
    });
    expect(result.current.scanDone).toBe(true);
    expect(result.current.searchingStatusVisible).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.searchingStatusVisible).toBe(false);
  });

  it('keeps notes during debounce, then holds prior notes briefly when a new run starts', async () => {
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

    const note = {
      uri: 'file:///a.md',
      relativePath: 'a.md',
      title: 'a',
      bestField: 'body' as const,
      matchCount: 1,
      score: 1,
      snippets: [{lineNumber: 1, text: 'x'}],
    };
    await act(async () => {
      tauriTest.state.emitUpdate({
        searchId: firstSearchId,
        notes: [note],
        progress: progress({scannedFiles: 1, totalHits: 1}),
      });
    });
    await flushSearchRaf();
    expect(result.current.notes).toEqual([note]);
    expect(result.current.scanDone).toBe(false);

    await act(async () => {
      result.current.setQuery('food');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.awaitingDebouncedRun).toBe(true);
    expect(result.current.scanDone).toBe(true);
    expect(result.current.notes).toEqual([note]);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(vaultSearchStartMock).toHaveBeenCalledTimes(2);
    expect(result.current.notes).toEqual([note]);
    expect(result.current.holdingPreviousResults).toBe(true);
    expect(result.current.scanDone).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(99);
    });
    expect(result.current.notes).toEqual([note]);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.notes).toEqual([]);
    expect(result.current.progress).toBeNull();
    expect(result.current.holdingPreviousResults).toBe(false);
    expect(result.current.scanDone).toBe(false);
  });

  it('replaces held prior notes when the first update arrives before the hold timeout', async () => {
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
    const oldNote = {
      uri: 'file:///old.md',
      relativePath: 'old.md',
      title: 'old',
      bestField: 'body' as const,
      matchCount: 1,
      score: 1,
      snippets: [{lineNumber: 1, text: 'old'}],
    };
    await act(async () => {
      tauriTest.state.emitUpdate({
        searchId: firstId,
        notes: [oldNote],
        progress: progress({scannedFiles: 1, totalHits: 1}),
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
    expect(result.current.notes).toEqual([oldNote]);

    const newNote = {
      uri: 'file:///new.md',
      relativePath: 'new.md',
      title: 'new',
      bestField: 'body' as const,
      matchCount: 1,
      score: 2,
      snippets: [{lineNumber: 1, text: 'new'}],
    };
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    await act(async () => {
      tauriTest.state.emitUpdate({
        searchId: secondId,
        notes: [newNote],
        progress: progress({scannedFiles: 2, totalHits: 1}),
      });
    });
    await flushSearchRaf();

    expect(result.current.holdingPreviousResults).toBe(false);
    expect(result.current.notes).toEqual([newNote]);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.notes).toEqual([newNote]);
  });

  it('clears held prior notes when done arrives before the first update', async () => {
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
      tauriTest.state.emitUpdate({
        searchId: firstId,
        notes: [
          {
            uri: 'file:///a.md',
            relativePath: 'a.md',
            title: 'a',
            bestField: 'body',
            matchCount: 1,
            score: 1,
            snippets: [{lineNumber: 1, text: 'x'}],
          },
        ],
        progress: progress({scannedFiles: 1, totalHits: 1}),
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
      tauriTest.state.emitDone({
        searchId: secondId,
        cancelled: false,
        progress: progress({scannedFiles: 0, totalHits: 0}),
      });
    });

    expect(result.current.holdingPreviousResults).toBe(false);
    expect(result.current.notes).toEqual([]);
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
      tauriTest.state.emitUpdate({
        searchId: firstId,
        notes: [
          {
            uri: 'file:///old.md',
            relativePath: 'old.md',
            title: 'old',
            bestField: 'body',
            matchCount: 1,
            score: 1,
            snippets: [{lineNumber: 1, text: 'old'}],
          },
        ],
        progress: progress({scannedFiles: 5, totalHits: 1}),
      });
    });
    await flushSearchRaf();
    expect(result.current.notes).toHaveLength(1);

    await act(async () => {
      result.current.setQuery('ab');
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await act(async () => {
      tauriTest.state.emitUpdate({
        searchId: firstId,
        notes: [
          {
            uri: 'file:///stale.md',
            relativePath: 'stale.md',
            title: 'stale',
            bestField: 'body',
            matchCount: 1,
            score: 1,
            snippets: [{lineNumber: 2, text: 'no'}],
          },
        ],
        progress: progress({scannedFiles: 99, totalHits: 2}),
      });
    });
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0]!.uri).toBe('file:///old.md');
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
      tauriTest.state.emitDone({
        searchId: 'other-id',
        cancelled: false,
        progress: progress({scannedFiles: 1, totalHits: 0}),
      });
    });
    expect(result.current.scanDone).toBe(false);

    await act(async () => {
      tauriTest.state.emitDone({
        searchId: id,
        cancelled: false,
        progress: progress({scannedFiles: 10, totalHits: 3}),
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

  it('coalesces rapid vault-search:update events into one rAF flush (last payload wins)', async () => {
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
    expect(result.current.notes).toEqual([]);

    const mk = (uri: string, text: string) => ({
      uri,
      relativePath: uri.replace('file:///', ''),
      title: text,
      bestField: 'body' as const,
      matchCount: 1,
      score: 1,
      snippets: [{lineNumber: 1, text}],
    });

    await act(async () => {
      tauriTest.state.emitUpdate({
        searchId: id,
        notes: [mk('file:///a.md', '1')],
        progress: progress({scannedFiles: 1, totalHits: 1}),
      });
      tauriTest.state.emitUpdate({
        searchId: id,
        notes: [mk('file:///b.md', '2')],
        progress: progress({scannedFiles: 2, totalHits: 1}),
      });
      tauriTest.state.emitUpdate({
        searchId: id,
        notes: [mk('file:///c.md', '3')],
        progress: progress({scannedFiles: 3, totalHits: 1}),
      });
    });
    expect(result.current.notes).toEqual([]);

    await flushSearchRaf();
    expect(result.current.notes).toEqual([mk('file:///c.md', '3')]);
    expect(result.current.progress?.scannedFiles).toBe(3);
  });
});

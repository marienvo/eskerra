/**
 * @format
 */
import React, {useEffect} from 'react';
import {DeviceEventEmitter, NativeModules} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';

import type {VaultSearchDonePayload, VaultSearchUpdatePayload} from '@eskerra/core';

import {
  getDroppedVaultSearchEventsCountForTest,
  resetDroppedVaultSearchEventsCountForTest,
  useVaultContentSearch,
} from '../src/features/vault/hooks/useVaultContentSearch';

jest.mock('../src/native/eskerraVaultSearch', () => ({
  eskerraVaultSearch: {
    isAvailable: () => true,
    cancel: jest.fn(() => Promise.resolve()),
    reconcile: jest.fn(() => Promise.resolve()),
    start: jest.fn(() => Promise.resolve()),
  },
}));

const {eskerraVaultSearch} = jest.requireMock('../src/native/eskerraVaultSearch') as {
  eskerraVaultSearch: {cancel: jest.Mock; reconcile: jest.Mock; start: jest.Mock};
};

type HarnessProps = {
  baseUri: string;
  indexReady?: boolean;
  lastReconciledAt?: number | null;
  onRender: (api: ReturnType<typeof useVaultContentSearch>) => void;
  open: boolean;
  vaultInstanceId: string | null;
};

function SearchHarness({
  baseUri,
  indexReady = true,
  lastReconciledAt = 0,
  onRender,
  open,
  vaultInstanceId,
}: HarnessProps) {
  const api = useVaultContentSearch({
    open,
    baseUri,
    vaultInstanceId,
    indexReady,
    lastReconciledAt,
  });
  useEffect(() => {
    onRender(api);
  }, [api, onRender]);
  return null;
}

function emitDone(payload: VaultSearchDonePayload) {
  DeviceEventEmitter.emit('vault-search:done', payload);
}

function emitUpdate(payload: VaultSearchUpdatePayload) {
  DeviceEventEmitter.emit('vault-search:update', payload);
}

describe('useVaultContentSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    resetDroppedVaultSearchEventsCountForTest();
    (NativeModules as {EskerraVaultSearch?: object}).EskerraVaultSearch = {
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('debounces start then applies done notes', async () => {
    const onRender = jest.fn();
    let inst: TestRenderer.ReactTestRenderer;

    await act(async () => {
      inst = TestRenderer.create(
        <SearchHarness
          baseUri="content://v"
          lastReconciledAt={Number.MAX_SAFE_INTEGER}
          onRender={onRender}
          open
          vaultInstanceId="vault-1"
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const api = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;

    await act(async () => {
      api.setQuery('hello');
    });

    expect(eskerraVaultSearch.start).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(eskerraVaultSearch.start).toHaveBeenCalledTimes(1);
    const searchId = (eskerraVaultSearch.start.mock.calls[0] as [string, string, string])[1];

    await act(async () => {
      emitUpdate({
        notes: [],
        progress: {
          indexReady: true,
          indexStatus: 'ready',
          scannedFiles: 0,
          skippedLargeFiles: 0,
          totalHits: 0,
        },
        searchId,
        vaultInstanceId: 'vault-1',
      } satisfies VaultSearchUpdatePayload);
    });

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      emitDone({
        cancelled: false,
        notes: [
          {
            bestField: 'body',
            matchCount: 1,
            relativePath: 'a.md',
            score: 1,
            snippets: [{lineNumber: null, text: 'snippet'}],
            title: 'A',
            uri: 'content://v/a.md',
          },
        ],
        progress: {
          indexReady: true,
          indexStatus: 'ready',
          scannedFiles: 1,
          skippedLargeFiles: 0,
          totalHits: 1,
        },
        searchId,
        vaultInstanceId: 'vault-1',
      } satisfies VaultSearchDonePayload);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const last = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;
    expect(last.notes).toHaveLength(1);
    expect(last.notes[0].snippets[0].lineNumber).toBeNull();

    await act(async () => {
      inst!.unmount();
    });
  });

  test('drops done when vaultInstanceId mismatches', async () => {
    const onRender = jest.fn();
    let inst: TestRenderer.ReactTestRenderer;

    await act(async () => {
      inst = TestRenderer.create(
        <SearchHarness
          baseUri="content://v"
          lastReconciledAt={Number.MAX_SAFE_INTEGER}
          onRender={onRender}
          open
          vaultInstanceId="vault-1"
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const api = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;

    await act(async () => {
      api.setQuery('x');
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    const searchId = (eskerraVaultSearch.start.mock.calls[0] as [string, string, string])[1];

    await act(async () => {
      emitDone({
        cancelled: false,
        notes: [
          {
            bestField: 'title',
            matchCount: 1,
            relativePath: 'b.md',
            score: 9,
            snippets: [],
            title: 'B',
            uri: 'content://v/b.md',
          },
        ],
        progress: {
          indexReady: true,
          indexStatus: 'ready',
          scannedFiles: 1,
          skippedLargeFiles: 0,
          totalHits: 1,
        },
        searchId,
        vaultInstanceId: 'other',
      } satisfies VaultSearchDonePayload);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const last = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;
    expect(last.notes).toHaveLength(0);
    expect(getDroppedVaultSearchEventsCountForTest()).toBeGreaterThan(0);

    await act(async () => {
      inst!.unmount();
    });
  });

  test('ignores done when searchId mismatches', async () => {
    const onRender = jest.fn();
    let inst: TestRenderer.ReactTestRenderer;

    await act(async () => {
      inst = TestRenderer.create(
        <SearchHarness
          baseUri="content://v"
          lastReconciledAt={Number.MAX_SAFE_INTEGER}
          onRender={onRender}
          open
          vaultInstanceId="vault-1"
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const api = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;
    await act(async () => {
      api.setQuery('z');
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      emitDone({
        cancelled: false,
        notes: [{bestField: 'body', matchCount: 1, relativePath: 'x.md', score: 1, snippets: [], title: 'X', uri: 'u'}],
        progress: {
          indexReady: true,
          indexStatus: 'ready',
          scannedFiles: 1,
          skippedLargeFiles: 0,
          totalHits: 1,
        },
        searchId: 'wrong-id',
        vaultInstanceId: 'vault-1',
      } satisfies VaultSearchDonePayload);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const last = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;
    expect(last.notes).toHaveLength(0);
    await act(async () => {
      inst!.unmount();
    });
  });

  test('holds previous notes briefly when starting a new search', async () => {
    const onRender = jest.fn();
    let inst: TestRenderer.ReactTestRenderer;

    await act(async () => {
      inst = TestRenderer.create(
        <SearchHarness
          baseUri="content://v"
          lastReconciledAt={Number.MAX_SAFE_INTEGER}
          onRender={onRender}
          open
          vaultInstanceId="vault-1"
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const api = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;

    await act(async () => {
      api.setQuery('one');
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    const id1 = (eskerraVaultSearch.start.mock.calls[0] as [string, string, string])[1];
    await act(async () => {
      emitDone({
        cancelled: false,
        notes: [
          {
            bestField: 'title',
            matchCount: 1,
            relativePath: 'a.md',
            score: 1,
            snippets: [],
            title: 'A',
            uri: 'u1',
          },
        ],
        progress: {
          indexReady: true,
          indexStatus: 'ready',
          scannedFiles: 1,
          skippedLargeFiles: 0,
          totalHits: 1,
        },
        searchId: id1,
        vaultInstanceId: 'vault-1',
      } satisfies VaultSearchDonePayload);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      api.setQuery('onet');
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    const mid = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;
    expect(mid.holdingPreviousResults).toBe(true);
    expect(mid.notes.map(n => n.title)).toContain('A');

    const id2 = (eskerraVaultSearch.start.mock.calls.at(-1)! as [string, string, string])[1];
    await act(async () => {
      emitDone({
        cancelled: false,
        notes: [
          {
            bestField: 'title',
            matchCount: 1,
            relativePath: 'b.md',
            score: 2,
            snippets: [],
            title: 'B',
            uri: 'u2',
          },
        ],
        progress: {
          indexReady: true,
          indexStatus: 'ready',
          scannedFiles: 1,
          skippedLargeFiles: 0,
          totalHits: 1,
        },
        searchId: id2,
        vaultInstanceId: 'vault-1',
      } satisfies VaultSearchDonePayload);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const last = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;
    expect(last.notes.some(n => n.title === 'B')).toBe(true);
    await act(async () => {
      inst!.unmount();
    });
  });

  test('calls cancel when unmounted with active query', async () => {
    const onRender = jest.fn();
    let inst: TestRenderer.ReactTestRenderer;

    await act(async () => {
      inst = TestRenderer.create(
        <SearchHarness
          baseUri="content://v"
          lastReconciledAt={Number.MAX_SAFE_INTEGER}
          onRender={onRender}
          open
          vaultInstanceId="vault-1"
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const api = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;
    await act(async () => {
      api.setQuery('q');
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      inst!.unmount();
    });
    expect(eskerraVaultSearch.cancel.mock.calls.length).toBeGreaterThan(0);
  });

  test('pre-search reconcile runs at most once per open session when stale', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000_000);
    const onRender = jest.fn();
    let inst: TestRenderer.ReactTestRenderer;

    await act(async () => {
      inst = TestRenderer.create(
        <SearchHarness
          baseUri="content://v"
          indexReady
          lastReconciledAt={0}
          onRender={onRender}
          open
          vaultInstanceId="vault-1"
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const api = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;

    await act(async () => {
      api.setQuery('a');
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(eskerraVaultSearch.reconcile).toHaveBeenCalledTimes(1);

    await act(async () => {
      api.setQuery('ab');
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(eskerraVaultSearch.reconcile).toHaveBeenCalledTimes(1);

    (Date.now as jest.Mock).mockRestore();
    await act(async () => {
      inst!.unmount();
    });
  });

  test('skips reconcile when index is not ready', async () => {
    const onRender = jest.fn();
    let inst: TestRenderer.ReactTestRenderer;

    await act(async () => {
      inst = TestRenderer.create(
        <SearchHarness
          baseUri="content://v"
          indexReady={false}
          lastReconciledAt={0}
          onRender={onRender}
          open
          vaultInstanceId="vault-1"
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const api = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;
    await act(async () => {
      api.setQuery('a');
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(eskerraVaultSearch.reconcile).not.toHaveBeenCalled();
    await act(async () => {
      inst!.unmount();
    });
  });

  test('auto-retries search when vault-search:index-status becomes ready', async () => {
    const onRender = jest.fn();
    let inst: TestRenderer.ReactTestRenderer;

    await act(async () => {
      inst = TestRenderer.create(
        <SearchHarness
          baseUri="content://v"
          lastReconciledAt={Number.MAX_SAFE_INTEGER}
          onRender={onRender}
          open
          vaultInstanceId="vault-1"
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const api = onRender.mock.calls.at(-1)![0] as ReturnType<typeof useVaultContentSearch>;

    await act(async () => {
      api.setQuery('hello');
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const searchId = (eskerraVaultSearch.start.mock.calls[0] as [string, string, string])[1];
    expect(eskerraVaultSearch.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      emitDone({
        cancelled: false,
        notes: [],
        progress: {
          indexReady: false,
          indexStatus: 'idle',
          scannedFiles: 0,
          skippedLargeFiles: 0,
          totalHits: 0,
        },
        searchId,
        vaultInstanceId: 'vault-1',
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      DeviceEventEmitter.emit('vault-search:index-status', {
        lastReconciledAt: 99,
        status: 'ready',
        vaultInstanceId: 'vault-1',
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(eskerraVaultSearch.start.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lastCall = eskerraVaultSearch.start.mock.calls.at(-1)! as [string, string, string];
    expect(lastCall[1]).not.toBe(searchId);
    expect(lastCall[2]).toBe('hello');

    await act(async () => {
      inst!.unmount();
    });
  });
});

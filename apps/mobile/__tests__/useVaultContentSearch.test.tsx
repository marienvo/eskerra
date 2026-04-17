/**
 * @format
 */
import React, {useEffect} from 'react';
import {DeviceEventEmitter, NativeModules} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';

import type {VaultSearchDonePayload, VaultSearchUpdatePayload} from '@eskerra/core';

import {useVaultContentSearch} from '../src/features/vault/hooks/useVaultContentSearch';

jest.mock('../src/native/eskerraVaultSearch', () => ({
  eskerraVaultSearch: {
    isAvailable: () => true,
    cancel: jest.fn(() => Promise.resolve()),
    start: jest.fn(() => Promise.resolve()),
  },
}));

const {eskerraVaultSearch} = jest.requireMock('../src/native/eskerraVaultSearch') as {
  eskerraVaultSearch: {cancel: jest.Mock; start: jest.Mock};
};

type HarnessProps = {
  baseUri: string;
  onRender: (api: ReturnType<typeof useVaultContentSearch>) => void;
  open: boolean;
  vaultInstanceId: string | null;
};

function SearchHarness({baseUri, onRender, open, vaultInstanceId}: HarnessProps) {
  const api = useVaultContentSearch({open, baseUri, vaultInstanceId});
  useEffect(() => {
    onRender(api);
  }, [api, onRender]);
  return null;
}

describe('useVaultContentSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
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
        <SearchHarness baseUri="content://v" onRender={onRender} open vaultInstanceId="vault-1" />,
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
      DeviceEventEmitter.emit('vault-search:update', {
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
      DeviceEventEmitter.emit('vault-search:done', {
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
        <SearchHarness baseUri="content://v" onRender={onRender} open vaultInstanceId="vault-1" />,
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
      DeviceEventEmitter.emit('vault-search:done', {
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

    await act(async () => {
      inst!.unmount();
    });
  });
});

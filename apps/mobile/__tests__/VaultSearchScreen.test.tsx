/**
 * @format
 */
import React from 'react';
import {DeviceEventEmitter, NativeModules, Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';

import type {VaultSearchDonePayload} from '@eskerra/core';

import {VaultSearchScreen} from '../src/features/vault/screens/VaultSearchScreen';

jest.mock('../src/native/eskerraVaultSearch', () => ({
  eskerraVaultSearch: {
    isAvailable: () => true,
    cancel: jest.fn(() => Promise.resolve()),
    open: jest.fn(() =>
      Promise.resolve({
        baseUriHash: 'ab',
        indexedNotes: 0,
        indexReady: true,
        isBuilding: false,
        lastFullBuildAt: 0,
        lastReconciledAt: Number.MAX_SAFE_INTEGER,
        schemaVersion: 1,
        vaultInstanceId: 'v1',
      }),
    ),
    reconcile: jest.fn(() => Promise.resolve()),
    start: jest.fn(() => Promise.resolve()),
  },
}));

const {eskerraVaultSearch} = jest.requireMock('../src/native/eskerraVaultSearch') as {
  eskerraVaultSearch: {cancel: jest.Mock; open: jest.Mock; start: jest.Mock};
};

jest.mock('../src/core/vault/VaultContext', () => ({
  useVaultContext: () => ({baseUri: 'content://tree/v'}),
}));

jest.mock('@react-navigation/native', () => {
  const ReactTest = require('react');
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useFocusEffect: (cb: () => void | (() => void)) => {
      ReactTest.useEffect(() => {
        const out = cb();
        return typeof out === 'function' ? out : undefined;
      }, [cb]);
    },
  };
});

function findByTestId(root: TestRenderer.ReactTestInstance, testID: string): TestRenderer.ReactTestInstance | null {
  try {
    return root.findByProps({testID});
  } catch {
    return null;
  }
}

function findTextContaining(root: TestRenderer.ReactTestInstance, substr: string): boolean {
  const texts = root.findAllByType(Text);
  return texts.some(t => {
    const ch = t.props.children;
    if (typeof ch === 'string') {
      return ch.includes(substr);
    }
    if (Array.isArray(ch)) {
      return ch.some(x => typeof x === 'string' && x.includes(substr));
    }
    return false;
  });
}

describe('VaultSearchScreen', () => {
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

  test('shows empty hint before typing', async () => {
    const setOptions = jest.fn();
    const navigation = {
      getParent: () => ({setOptions}),
      goBack: jest.fn(),
      navigate: jest.fn(),
    };

    let inst: TestRenderer.ReactTestRenderer;
    await act(async () => {
      inst = TestRenderer.create(
        <VaultSearchScreen navigation={navigation as never} route={{} as never} />,
      );
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });

    expect(findTextContaining(inst.root, 'Type to search markdown')).toBe(true);
    expect(setOptions).toHaveBeenCalled();
  });

  test('renders result title and navigates on pick', async () => {
    const setOptions = jest.fn();
    const navigation = {
      getParent: () => ({setOptions}),
      goBack: jest.fn(),
      navigate: jest.fn(),
    };

    let inst: TestRenderer.ReactTestRenderer;
    await act(async () => {
      inst = TestRenderer.create(
        <VaultSearchScreen navigation={navigation as never} route={{} as never} />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const input = findByTestId(inst.root, 'vault-search-input');
    expect(input).not.toBeNull();

    await act(async () => {
      input!.props.onChangeText('hi');
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const searchId = (eskerraVaultSearch.start.mock.calls[0] as [string, string, string])[1];

    await act(async () => {
      DeviceEventEmitter.emit('vault-search:done', {
        cancelled: false,
        notes: [
          {
            bestField: 'title',
            matchCount: 1,
            relativePath: 'notes/N.md',
            score: 10,
            snippets: [{lineNumber: null, text: 'line'}],
            title: 'MyNote',
            uri: 'content://tree/v/doc.md',
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
        vaultInstanceId: 'v1',
      } satisfies VaultSearchDonePayload);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(findTextContaining(inst.root, 'MyNote')).toBe(true);

    const pressables = inst.root.findAll((node: TestRenderer.ReactTestInstance) => typeof node.props.onPress === 'function');
    const row = pressables.find(
      (p: TestRenderer.ReactTestInstance) => p.props.accessibilityLabel !== 'Clear' && p.props.onPress != null,
    );
    expect(row).toBeDefined();

    await act(async () => {
      row!.props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('Vault', {
      noteUri: 'content://tree/v/doc.md',
      noteTitle: 'MyNote',
    });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  test('unmount triggers cancel from focus cleanup', async () => {
    const setOptions = jest.fn();
    const navigation = {
      getParent: () => ({setOptions}),
      goBack: jest.fn(),
      navigate: jest.fn(),
    };

    let inst: TestRenderer.ReactTestRenderer;
    await act(async () => {
      inst = TestRenderer.create(
        <VaultSearchScreen navigation={navigation as never} route={{} as never} />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      inst.unmount();
    });
    expect(eskerraVaultSearch.cancel).toHaveBeenCalled();
  });
});

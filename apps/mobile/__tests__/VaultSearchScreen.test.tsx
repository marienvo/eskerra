/**
 * @format
 */
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import {VaultSearchScreen} from '../src/features/vault/screens/VaultSearchScreen';

jest.mock('../src/native/eskerraVaultSearch', () => ({
  eskerraVaultSearch: {
    isAvailable: () => true,
    open: jest.fn(() =>
      Promise.resolve({
        baseUriHash: 'ab',
        indexedNotes: 0,
        indexReady: true,
        isBuilding: false,
        lastFullBuildAt: 0,
        lastReconciledAt: 0,
        schemaVersion: 1,
        vaultInstanceId: 'v1',
      }),
    ),
    cancel: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../src/core/vault/VaultContext', () => ({
  useVaultContext: () => ({baseUri: 'content://tree/v'}),
}));

jest.mock('../src/features/vault/hooks/useVaultContentSearch', () => ({
  useVaultContentSearch: () => ({
    awaitingDebouncedRun: false,
    notes: [],
    progress: null,
    query: '',
    scanDone: true,
    searchingStatusVisible: false,
    setQuery: jest.fn(),
  }),
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

describe('VaultSearchScreen', () => {
  test('mounts without throwing', async () => {
    const setOptions = jest.fn();
    const navigation = {
      getParent: () => ({setOptions}),
      goBack: jest.fn(),
    };

    await act(async () => {
      TestRenderer.create(
        <VaultSearchScreen navigation={navigation as never} route={{} as never} />,
      );
    });

    expect(setOptions).toHaveBeenCalled();
  });
});

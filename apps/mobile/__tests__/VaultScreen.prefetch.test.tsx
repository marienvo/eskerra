/**
 * @format
 * VaultScreen hub load uses NotesContext.read, which serves session-prefetched Today bodies
 * from cache without calling `readNote` for intro + week row.
 */
import {enumerateTodayHubWeekStarts, todayHubRowUriFromTodayNoteUri} from '@eskerra/core';
import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import * as eskerraStorage from '../src/core/storage/eskerraStorage';
import {NotesProvider, useNotesContext} from '../src/core/vault/NotesContext';
import {VaultProvider} from '../src/core/vault/VaultContext';
import {MOCK_LOCAL_SETTINGS, MOCK_SETTINGS} from '../src/dev/mockVaultData';

jest.mock('../src/core/storage/eskerraStorage', () => ({
  ...jest.requireActual('../src/core/storage/eskerraStorage'),
  readNote: jest.fn(),
}));

jest.mock('../src/core/storage/sessionTodayHubPrefetch', () => ({
  resolveTodayHubPrefetchUrisForSession: jest.fn(() => Promise.resolve(undefined)),
}));

const readNoteMock = eskerraStorage.readNote as jest.MockedFunction<typeof eskerraStorage.readNote>;

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function ReadHarness({
  introUri,
  rowUri,
  onDone,
}: {
  introUri: string;
  rowUri: string;
  onDone: () => void;
}) {
  const {read} = useNotesContext();
  useEffect(() => {
    (async () => {
      await read(introUri);
      await read(rowUri);
      onDone();
    })().catch(() => undefined);
  }, [introUri, read, rowUri, onDone]);
  return null;
}

describe('Today hub prefetch (VaultScreen hub load path)', () => {
  const vaultUri = 'content://tree/v';
  const introUri = `${vaultUri}/Daily/Today.md`;
  const rowUri = todayHubRowUriFromTodayNoteUri(
    introUri,
    enumerateTodayHubWeekStarts(new Date(), 'monday')[0]!,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('read uses today hub cache for intro and row without readNote', async () => {
    let done = false;
    await act(async () => {
      TestRenderer.create(
        <VaultProvider
          initialSession={{
            uri: vaultUri,
            settings: MOCK_SETTINGS,
            localSettings: MOCK_LOCAL_SETTINGS,
            inboxContentByUri: null,
            inboxPrefetch: [],
            todayHubContentByUri: {
              [introUri]: '---\nstart: monday\n---\n# Today',
              [rowUri]: '| A |',
            },
          }}>
          <NotesProvider>
            <ReadHarness introUri={introUri} rowUri={rowUri} onDone={() => (done = true)} />
          </NotesProvider>
        </VaultProvider>,
      );
      await flushPromises();
    });

    expect(done).toBe(true);
    expect(readNoteMock).not.toHaveBeenCalled();
  });
});

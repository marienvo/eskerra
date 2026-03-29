import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import {tryPrepareNoteboxSessionNative} from '../src/core/storage/androidVaultListing';
import {listInboxNotesAndSyncIndex} from '../src/core/storage/noteboxStorage';
import {NotesProvider, useNotesContext} from '../src/core/vault/NotesContext';
import {VaultProvider, useVaultContext} from '../src/core/vault/VaultContext';

jest.mock('../src/core/storage/androidVaultListing', () => ({
  tryPrepareNoteboxSessionNative: jest.fn(),
}));

jest.mock('../src/core/storage/noteboxStorage', () => ({
  createNote: jest.fn(),
  deleteInboxNotes: jest.fn(),
  listInboxNotesAndSyncIndex: jest.fn(),
  readNote: jest.fn(),
  writeNoteContent: jest.fn(),
}));

jest.mock('../src/core/storage/appStorage', () => ({
  getSavedUri: jest.fn(() => Promise.resolve('content://v')),
}));

const tryPrepareMock = tryPrepareNoteboxSessionNative as jest.MockedFunction<
  typeof tryPrepareNoteboxSessionNative
>;
const listInboxMock = listInboxNotesAndSyncIndex as jest.MockedFunction<
  typeof listInboxNotesAndSyncIndex
>;

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

type HarnessSnapshot = {
  getInbox: (noteUri: string) => string | undefined;
  noteCount: number;
};

function NotesHarness({onSnapshot}: {onSnapshot: (s: HarnessSnapshot) => void}) {
  const {notes} = useNotesContext();
  const {getInboxNoteContentFromCache} = useVaultContext();

  useEffect(() => {
    onSnapshot({
      getInbox: getInboxNoteContentFromCache,
      noteCount: notes.length,
    });
  }, [getInboxNoteContentFromCache, notes, onSnapshot]);

  return null;
}

describe('NotesContext refresh', () => {
  const vaultUri = 'content://v';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('after prefetch is consumed, native prepare repopulates inbox content cache for H1 titles', async () => {
    const noteUri = `${vaultUri}/Inbox/a.md`;
    tryPrepareMock.mockResolvedValue({
      inboxContentByUri: {[noteUri]: '# Title From H1\n'},
      inboxPrefetch: [{lastModified: 1, name: 'a.md', uri: noteUri}],
      settingsJson: '{"displayName":"Vault"}\n',
    });

    const snapshotHolder: {current: HarnessSnapshot | null} = {current: null};
    const onSnapshot = (s: HarnessSnapshot) => {
      snapshotHolder.current = s;
    };

    await act(async () => {
      TestRenderer.create(
        <VaultProvider
          initialSession={{
            inboxContentByUri: null,
            inboxPrefetch: null,
            settings: {},
            localSettings: {deviceName: '', displayName: 'Vault', playlistKnownUpdatedAtMs: null},
            uri: vaultUri,
          }}>
          <NotesProvider>
            <NotesHarness onSnapshot={onSnapshot} />
          </NotesProvider>
        </VaultProvider>,
      );
      await flushPromises();
    });

    expect(tryPrepareMock).toHaveBeenCalledWith(vaultUri);
    expect(listInboxMock).not.toHaveBeenCalled();
    const snap1 = snapshotHolder.current;
    expect(snap1).not.toBeNull();
    expect(snap1!.noteCount).toBe(1);
    expect(snap1!.getInbox(noteUri)).toBe('# Title From H1\n');
  });

  test('falls back to listInboxNotesAndSyncIndex when native prepare returns null', async () => {
    tryPrepareMock.mockResolvedValue(null);
    listInboxMock.mockResolvedValue([
      {lastModified: 2, name: 'b.md', uri: `${vaultUri}/Inbox/b.md`},
    ]);

    const snapshotHolder: {current: HarnessSnapshot | null} = {current: null};
    const capture = (s: HarnessSnapshot) => {
      snapshotHolder.current = s;
    };

    await act(async () => {
      TestRenderer.create(
        <VaultProvider
          initialSession={{
            inboxContentByUri: null,
            inboxPrefetch: null,
            settings: {},
            localSettings: {deviceName: '', displayName: 'Vault', playlistKnownUpdatedAtMs: null},
            uri: vaultUri,
          }}>
          <NotesProvider>
            <NotesHarness onSnapshot={capture} />
          </NotesProvider>
        </VaultProvider>,
      );
      await flushPromises();
    });

    expect(tryPrepareMock).toHaveBeenCalledWith(vaultUri);
    expect(listInboxMock).toHaveBeenCalledWith(vaultUri);
    const snap2 = snapshotHolder.current;
    expect(snap2).not.toBeNull();
    expect(snap2!.noteCount).toBe(1);
    expect(snap2!.getInbox(`${vaultUri}/Inbox/b.md`)).toBeUndefined();
  });
});

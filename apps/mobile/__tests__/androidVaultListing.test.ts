import {NativeModules, Platform} from 'react-native';

import {DEV_MOCK_VAULT_URI} from '../src/dev/mockVaultData';
import {tryPrepareNoteboxSessionNative} from '../src/core/storage/androidVaultListing';

describe('tryPrepareNoteboxSessionNative', () => {
  const settingsSample = '{\n}\n';

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      enumerable: true,
      value: 'android',
      writable: true,
    });
    (NativeModules as {NoteboxVaultListing?: unknown}).NoteboxVaultListing = {
      listMarkdownFiles: jest.fn(),
      prepareNoteboxSession: jest.fn(),
    };
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      enumerable: true,
      value: 'ios',
      writable: true,
    });
  });

  it('parses structured map and returns inbox prefetch', async () => {
    const prepare = (
      NativeModules.NoteboxVaultListing as {prepareNoteboxSession: jest.Mock}
    ).prepareNoteboxSession;
    prepare.mockResolvedValue({
      inboxNotes: [{lastModified: 2, name: 'b.md', uri: 'content://in/b.md'}],
      settings: settingsSample,
    });

    await expect(tryPrepareNoteboxSessionNative('content://root')).resolves.toEqual({
      inboxContentByUri: null,
      inboxPrefetch: [{lastModified: 2, name: 'b.md', uri: 'content://in/b.md'}],
      settingsJson: settingsSample,
    });
  });

  it('treats legacy string response as settings-only (no prefetch)', async () => {
    const prepare = (
      NativeModules.NoteboxVaultListing as {prepareNoteboxSession: jest.Mock}
    ).prepareNoteboxSession;
    prepare.mockResolvedValue(settingsSample);

    await expect(tryPrepareNoteboxSessionNative('content://root')).resolves.toEqual({
      inboxContentByUri: null,
      inboxPrefetch: null,
      settingsJson: settingsSample,
    });
  });

  it('returns null when settings field is missing on structured payload', async () => {
    const prepare = (
      NativeModules.NoteboxVaultListing as {prepareNoteboxSession: jest.Mock}
    ).prepareNoteboxSession;
    prepare.mockResolvedValue({inboxNotes: []});

    await expect(tryPrepareNoteboxSessionNative('content://root')).resolves.toBeNull();
  });

  it('returns null for dev mock vault URI without calling native (AsyncStorage-backed inbox)', async () => {
    const prepare = (
      NativeModules.NoteboxVaultListing as {prepareNoteboxSession: jest.Mock}
    ).prepareNoteboxSession;

    await expect(tryPrepareNoteboxSessionNative(DEV_MOCK_VAULT_URI)).resolves.toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('maps null lastModified to null in summaries', async () => {
    const prepare = (
      NativeModules.NoteboxVaultListing as {prepareNoteboxSession: jest.Mock}
    ).prepareNoteboxSession;
    prepare.mockResolvedValue({
      inboxNotes: [{name: 'n.md', uri: 'u'}],
      settings: settingsSample,
    });

    await expect(tryPrepareNoteboxSessionNative('content://root')).resolves.toEqual({
      inboxContentByUri: null,
      inboxPrefetch: [{lastModified: null, name: 'n.md', uri: 'u'}],
      settingsJson: settingsSample,
    });
  });

  it('maps optional content into inboxContentByUri by normalized uri', async () => {
    const prepare = (
      NativeModules.NoteboxVaultListing as {prepareNoteboxSession: jest.Mock}
    ).prepareNoteboxSession;
    prepare.mockResolvedValue({
      inboxNotes: [
        {
          content: '# Hello',
          lastModified: 2,
          name: 'b.md',
          uri: 'content://in/b.md',
        },
      ],
      settings: settingsSample,
    });

    await expect(tryPrepareNoteboxSessionNative('content://root')).resolves.toEqual({
      inboxContentByUri: {'content://in/b.md': '# Hello'},
      inboxPrefetch: [{lastModified: 2, name: 'b.md', uri: 'content://in/b.md'}],
      settingsJson: settingsSample,
    });
  });
});

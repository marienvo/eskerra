import {NativeModules, Platform} from 'react-native';

import {DEV_MOCK_VAULT_URI} from '../src/dev/mockVaultData';
import {tryPrepareEskerraSessionNative} from '../src/core/storage/androidVaultListing';

describe('tryPrepareEskerraSessionNative', () => {
  const settingsSample = '{\n}\n';

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      enumerable: true,
      value: 'android',
      writable: true,
    });
    (NativeModules as {EskerraVaultListing?: unknown}).EskerraVaultListing = {
      listMarkdownFiles: jest.fn(),
      prepareEskerraSession: jest.fn(),
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
      NativeModules.EskerraVaultListing as {prepareEskerraSession: jest.Mock}
    ).prepareEskerraSession;
    prepare.mockResolvedValue({
      inboxNotes: [{lastModified: 2, name: 'b.md', uri: 'content://in/b.md'}],
      settings: settingsSample,
    });

    await expect(tryPrepareEskerraSessionNative('content://root')).resolves.toEqual({
      inboxContentByUri: null,
      inboxPrefetch: [{lastModified: 2, name: 'b.md', uri: 'content://in/b.md'}],
      settingsJson: settingsSample,
      todayHubContentByUri: null,
    });
    expect(prepare).toHaveBeenCalledWith('content://root', null);
  });

  it('treats legacy string response as settings-only (no prefetch)', async () => {
    const prepare = (
      NativeModules.EskerraVaultListing as {prepareEskerraSession: jest.Mock}
    ).prepareEskerraSession;
    prepare.mockResolvedValue(settingsSample);

    await expect(tryPrepareEskerraSessionNative('content://root')).resolves.toEqual({
      inboxContentByUri: null,
      inboxPrefetch: null,
      settingsJson: settingsSample,
      todayHubContentByUri: null,
    });
  });

  it('returns null when settings field is missing on structured payload', async () => {
    const prepare = (
      NativeModules.EskerraVaultListing as {prepareEskerraSession: jest.Mock}
    ).prepareEskerraSession;
    prepare.mockResolvedValue({inboxNotes: []});

    await expect(tryPrepareEskerraSessionNative('content://root')).resolves.toBeNull();
  });

  it('returns null for dev mock vault URI without calling native (AsyncStorage-backed inbox)', async () => {
    const prepare = (
      NativeModules.EskerraVaultListing as {prepareEskerraSession: jest.Mock}
    ).prepareEskerraSession;

    await expect(tryPrepareEskerraSessionNative(DEV_MOCK_VAULT_URI)).resolves.toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('maps null lastModified to null in summaries', async () => {
    const prepare = (
      NativeModules.EskerraVaultListing as {prepareEskerraSession: jest.Mock}
    ).prepareEskerraSession;
    prepare.mockResolvedValue({
      inboxNotes: [{name: 'n.md', uri: 'u'}],
      settings: settingsSample,
    });

    await expect(tryPrepareEskerraSessionNative('content://root')).resolves.toEqual({
      inboxContentByUri: null,
      inboxPrefetch: [{lastModified: null, name: 'n.md', uri: 'u'}],
      settingsJson: settingsSample,
      todayHubContentByUri: null,
    });
  });

  it('maps optional content into inboxContentByUri by normalized uri', async () => {
    const prepare = (
      NativeModules.EskerraVaultListing as {prepareEskerraSession: jest.Mock}
    ).prepareEskerraSession;
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

    await expect(tryPrepareEskerraSessionNative('content://root')).resolves.toEqual({
      inboxContentByUri: {'content://in/b.md': '# Hello'},
      inboxPrefetch: [{lastModified: 2, name: 'b.md', uri: 'content://in/b.md'}],
      settingsJson: settingsSample,
      todayHubContentByUri: null,
    });
  });

  it('maps todayHubPrefetch into todayHubContentByUri', async () => {
    const prepare = (
      NativeModules.EskerraVaultListing as {prepareEskerraSession: jest.Mock}
    ).prepareEskerraSession;
    prepare.mockResolvedValue({
      inboxNotes: [],
      settings: settingsSample,
      todayHubPrefetch: [
        {uri: 'content://hub/Today.md', content: 'intro body'},
        {uri: 'content://hub/2025-04-14.md', content: 'row body'},
      ],
    });

    await expect(
      tryPrepareEskerraSessionNative('content://root', {
        prefetchNoteUris: ['content://hub/Today.md', 'content://hub/2025-04-14.md'],
      }),
    ).resolves.toEqual({
      inboxContentByUri: null,
      inboxPrefetch: [],
      settingsJson: settingsSample,
      todayHubContentByUri: {
        'content://hub/Today.md': 'intro body',
        'content://hub/2025-04-14.md': 'row body',
      },
    });
  });
});

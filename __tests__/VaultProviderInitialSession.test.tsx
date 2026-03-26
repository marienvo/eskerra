import React, {useEffect} from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import {useVaultContext, VaultProvider} from '../src/core/vault/VaultContext';
import {prepareVaultSession} from '../src/core/vault/applyVaultSession';
import {getSavedUri} from '../src/core/storage/appStorage';
import {NoteSummary} from '../src/types';

jest.mock('../src/core/vault/applyVaultSession', () => ({
  prepareVaultSession: jest.fn(),
}));

jest.mock('../src/core/storage/appStorage', () => ({
  getSavedUri: jest.fn(),
  clearUri: jest.fn(),
}));

jest.mock('../src/core/observability', () => ({
  appBreadcrumb: jest.fn(),
  reportUnexpectedError: jest.fn(),
  syncVaultSessionContext: jest.fn(),
}));

type VaultInitialSession = {
  uri: string;
  settings: {displayName: string};
  inboxPrefetch: NoteSummary[] | null;
};

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function Harness({
  uri,
  onResult,
}: {
  uri: string;
  onResult: (result: {
    baseUri: string | null;
    isLoading: boolean;
    settings: {displayName: string} | null;
    inboxPrefetch: NoteSummary[] | null;
  }) => void;
}) {
  const ctx = useVaultContext();

  useEffect(() => {
    onResult({
      baseUri: ctx.baseUri,
      isLoading: ctx.isLoading,
      settings: ctx.settings ? {displayName: ctx.settings.displayName} : null,
      inboxPrefetch: ctx.consumeInboxPrefetch(uri),
    });
    // Intentionally run once. We only care about the post-mount state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

describe('VaultProvider initialSession hydration', () => {
  const prepareVaultSessionMock = prepareVaultSession as jest.MockedFunction<
    typeof prepareVaultSession
  >;
  const getSavedUriMock = getSavedUri as jest.MockedFunction<typeof getSavedUri>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('skips refreshSession/apply when savedUri matches initialSession.uri', async () => {
    const initialInboxPrefetch: NoteSummary[] = [
      {
        lastModified: 1,
        name: 'a.md',
        uri: 'content://vault/a.md',
      },
    ];

    const initialSession: VaultInitialSession = {
      uri: 'content://vault-root',
      settings: {displayName: 'Dev Notebox'},
      inboxPrefetch: initialInboxPrefetch,
    };

    getSavedUriMock.mockResolvedValue(initialSession.uri);
    prepareVaultSessionMock.mockResolvedValue({
      inboxPrefetch: null,
      sessionPrep: 'legacy',
      settings: initialSession.settings,
    });

    let result:
      | {
          baseUri: string | null;
          isLoading: boolean;
          settings: {displayName: string} | null;
          inboxPrefetch: NoteSummary[] | null;
        }
      | null = null;

    await act(async () => {
      TestRenderer.create(
        <VaultProvider initialSession={initialSession as any}>
          <Harness uri={initialSession.uri} onResult={next => (result = next)} />
        </VaultProvider>,
      );
      await flushPromises();
    });

    if (result == null) {
      throw new Error('Expected VaultProvider to report initial session state.');
    }

    const nonNullResult = result as any;

    expect(nonNullResult.baseUri).toBe(initialSession.uri);
    expect(nonNullResult.isLoading).toBe(false);
    expect(nonNullResult.settings).toEqual(initialSession.settings);
    expect(nonNullResult.inboxPrefetch).toEqual(initialInboxPrefetch);

    // Because savedUri matches initialSession, we should not do a second apply.
    expect(prepareVaultSessionMock).not.toHaveBeenCalled();
  });
});


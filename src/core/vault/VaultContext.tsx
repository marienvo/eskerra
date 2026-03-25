import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {appBreadcrumb, reportUnexpectedError, syncVaultSessionContext} from '../observability';
import {elapsedMsSinceJsBundleEval} from '../observability/startupTiming';
import {getSavedUri} from '../storage/appStorage';
import {clearAllPlaylistReadCoalescer} from '../storage/noteboxStorage';
import {clearPodcastBootstrapCache} from '../../features/podcasts/services/podcastBootstrapCache';
import {NoteboxSettings, NoteSummary} from '../../types';
import {prepareVaultSession} from './applyVaultSession';

type VaultContextValue = {
  baseUri: string | null;
  consumeInboxPrefetch: (forUri: string) => NoteSummary[] | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  setSessionUri: (nextUri: string | null) => Promise<void>;
  settings: NoteboxSettings | null;
  setSettings: (nextSettings: NoteboxSettings) => void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

type VaultProviderProps = {
  children: ReactNode;
  initialSession?: {
    uri: string;
    settings: NoteboxSettings;
    inboxPrefetch: NoteSummary[] | null;
  } | null;
};

export function VaultProvider({children, initialSession}: VaultProviderProps) {
  const [baseUri, setBaseUri] = useState<string | null>(initialSession?.uri ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(initialSession != null ? false : true);
  const [settings, setSettings] = useState<NoteboxSettings | null>(
    initialSession?.settings ?? null,
  );
  const inboxPrefetchRef = useRef<{notes: NoteSummary[]; uri: string} | null>(
    initialSession?.inboxPrefetch
      ? {uri: initialSession.uri, notes: initialSession.inboxPrefetch}
      : null,
  );

  const consumeInboxPrefetch = useCallback((forUri: string): NoteSummary[] | null => {
    const pending = inboxPrefetchRef.current;
    if (pending == null || pending.uri !== forUri) {
      return null;
    }
    inboxPrefetchRef.current = null;
    return pending.notes;
  }, []);

  const applyVaultSessionUri = useCallback(async (nextUri: string) => {
    inboxPrefetchRef.current = null;

    const prepared = await prepareVaultSession(nextUri);
    if (prepared.inboxPrefetch !== null) {
      inboxPrefetchRef.current = {uri: nextUri, notes: prepared.inboxPrefetch};
    }

    setBaseUri(nextUri);
    setSettings(prepared.settings);
  }, []);

  const setSessionUri = useCallback(
    async (nextUri: string | null) => {
      if (!nextUri) {
        inboxPrefetchRef.current = null;
        setBaseUri(null);
        setSettings(null);
        clearAllPlaylistReadCoalescer();
        clearPodcastBootstrapCache();
        return;
      }

      try {
        clearAllPlaylistReadCoalescer();
        clearPodcastBootstrapCache();
        await applyVaultSessionUri(nextUri);
      } catch (error) {
        reportUnexpectedError(error, {flow: 'vault_session', step: 'apply'});
        throw error;
      }
    },
    [applyVaultSessionUri],
  );

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const savedUri = await getSavedUri();

      appBreadcrumb({
        category: 'vault',
        message: 'vault.session.restore.start',
        data: {has_saved_uri: Boolean(savedUri)},
      });

      if (!savedUri) {
        inboxPrefetchRef.current = null;
        setBaseUri(null);
        setSettings(null);
        appBreadcrumb({
          category: 'vault',
          message: 'vault.session.restore.complete',
          data: {
            has_session: false,
            elapsed_ms: elapsedMsSinceJsBundleEval(),
          },
        });
        return;
      }

      await applyVaultSessionUri(savedUri);
      appBreadcrumb({
        category: 'vault',
        message: 'vault.session.restore.complete',
        data: {
          has_session: true,
          elapsed_ms: elapsedMsSinceJsBundleEval(),
        },
      });
    } catch (error) {
      inboxPrefetchRef.current = null;
      setBaseUri(null);
      setSettings(null);
      reportUnexpectedError(error, {flow: 'vault_restore'});
      appBreadcrumb({
        category: 'vault',
        message: 'vault.session.restore.fail',
        level: 'error',
        data: {},
      });
    } finally {
      setIsLoading(false);
    }
  }, [applyVaultSessionUri]);

  useEffect(() => {
    let isActive = true;

    const hydrateInitialSessionOrRefresh = async () => {
      if (initialSession == null) {
        await refreshSession();
        return;
      }

      try {
        const savedUri = await getSavedUri();
        if (!isActive) {
          return;
        }

        if (savedUri && savedUri.trim() === initialSession.uri.trim()) {
          return;
        }
      } catch {
        // If savedUri read fails, keep existing initial session if present.
        return;
      }

      await refreshSession();
    };

    hydrateInitialSessionOrRefresh().catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [initialSession, refreshSession]);

  useEffect(() => {
    syncVaultSessionContext(Boolean(baseUri));
  }, [baseUri]);

  const value = useMemo(
    () => ({
      baseUri,
      consumeInboxPrefetch,
      isLoading,
      refreshSession,
      setSessionUri,
      settings,
      setSettings,
    }),
    [baseUri, consumeInboxPrefetch, isLoading, refreshSession, setSessionUri, settings],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVaultContext(): VaultContextValue {
  const context = useContext(VaultContext);

  if (!context) {
    throw new Error('useVaultContext must be used inside VaultProvider.');
  }

  return context;
}

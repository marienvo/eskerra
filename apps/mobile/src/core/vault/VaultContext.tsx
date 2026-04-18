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
import {Platform} from 'react-native';

import {appBreadcrumb, reportUnexpectedError, syncVaultSessionContext} from '../observability';
import {elapsedMsSinceJsBundleEval} from '../observability/startupTiming';
import {getSavedUri} from '../storage/appStorage';
import {
  clearAllPlaylistReadCoalescer,
  invalidatePlaylistReadCache,
} from '../storage/eskerraStorage';
import {normalizeNoteUri} from '../storage/noteUriNormalize';
import {clearPodcastBootstrapCache} from '../../features/podcasts/services/podcastBootstrapCache';
import {EskerraLocalSettings, EskerraSettings, NoteSummary} from '../../types';
import {eskerraVaultSearch} from '../../native/eskerraVaultSearch';
import {requestVaultSearchIndexWarmup} from '../../features/vault/vaultSearchIndexMaintenance';
import {prepareVaultSession} from './applyVaultSession';

type InboxContentCacheSession = {
  map: Map<string, string>;
  uri: string;
};

type VaultContextValue = {
  baseUri: string | null;
  clearInboxContentCache: () => void;
  consumeInboxPrefetch: (forUri: string) => NoteSummary[] | null;
  getInboxNoteContentFromCache: (noteUri: string) => string | undefined;
  isLoading: boolean;
  pruneInboxNoteContentFromCache: (noteUris: readonly string[]) => void;
  refreshSession: () => Promise<void>;
  replaceInboxContentFromSession: (
    inboxContentByUri: Record<string, string> | null | undefined,
  ) => void;
  setInboxNoteContentInCache: (noteUri: string, content: string) => void;
  setSessionUri: (nextUri: string | null) => Promise<void>;
  settings: EskerraSettings | null;
  setSettings: (nextSettings: EskerraSettings) => void;
  localSettings: EskerraLocalSettings | null;
  setLocalSettings: (next: EskerraLocalSettings) => void;
  playlistSyncGeneration: number;
  notifyPlaylistSyncAfterVaultRefresh: () => void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

type VaultProviderProps = {
  children: ReactNode;
  initialSession?: {
    uri: string;
    settings: EskerraSettings;
    localSettings: EskerraLocalSettings;
    inboxContentByUri: Record<string, string> | null;
    inboxPrefetch: NoteSummary[] | null;
  } | null;
};

function recordToInboxContentCache(
  vaultUri: string,
  record: Record<string, string> | null | undefined,
): InboxContentCacheSession | null {
  if (!record) {
    return null;
  }
  const entries = Object.entries(record);
  if (entries.length === 0) {
    return null;
  }
  const map = new Map<string, string>();
  for (const [k, v] of entries) {
    map.set(normalizeNoteUri(k), v);
  }
  return {map, uri: vaultUri};
}

export function VaultProvider({children, initialSession}: VaultProviderProps) {
  const [baseUri, setBaseUri] = useState<string | null>(initialSession?.uri ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(initialSession != null ? false : true);
  const [settings, setSettings] = useState<EskerraSettings | null>(
    initialSession?.settings ?? null,
  );
  const [localSettings, setLocalSettings] = useState<EskerraLocalSettings | null>(
    initialSession?.localSettings ?? null,
  );
  const [playlistSyncGeneration, setPlaylistSyncGeneration] = useState(0);
  const inboxPrefetchRef = useRef<{notes: NoteSummary[]; uri: string} | null>(
    initialSession?.inboxPrefetch
      ? {uri: initialSession.uri, notes: initialSession.inboxPrefetch}
      : null,
  );

  const inboxContentCacheRef = useRef<InboxContentCacheSession | null>(
    initialSession
      ? recordToInboxContentCache(
          initialSession.uri,
          initialSession.inboxContentByUri,
        )
      : null,
  );

  const clearSessionPrefetchRefs = useCallback(() => {
    inboxPrefetchRef.current = null;
    inboxContentCacheRef.current = null;
  }, []);

  const clearInboxContentCache = useCallback(() => {
    inboxContentCacheRef.current = null;
  }, []);

  const replaceInboxContentFromSession = useCallback(
    (inboxContentByUri: Record<string, string> | null | undefined) => {
      if (baseUri == null) {
        return;
      }
      inboxContentCacheRef.current = recordToInboxContentCache(
        baseUri,
        inboxContentByUri,
      );
    },
    [baseUri],
  );

  const getInboxNoteContentFromCache = useCallback(
    (noteUri: string): string | undefined => {
      const session = inboxContentCacheRef.current;
      if (session == null || baseUri == null || session.uri !== baseUri) {
        return undefined;
      }
      return session.map.get(normalizeNoteUri(noteUri));
    },
    [baseUri],
  );

  const setInboxNoteContentInCache = useCallback(
    (noteUri: string, content: string) => {
      if (baseUri == null) {
        return;
      }
      let session = inboxContentCacheRef.current;
      if (session == null || session.uri !== baseUri) {
        session = {map: new Map(), uri: baseUri};
        inboxContentCacheRef.current = session;
      }
      session.map.set(normalizeNoteUri(noteUri), content);
    },
    [baseUri],
  );

  const notifyPlaylistSyncAfterVaultRefresh = useCallback(() => {
    if (baseUri) {
      invalidatePlaylistReadCache(baseUri);
    }
    setPlaylistSyncGeneration(g => g + 1);
  }, [baseUri]);

  const pruneInboxNoteContentFromCache = useCallback(
    (noteUris: readonly string[]) => {
      const session = inboxContentCacheRef.current;
      if (session == null || baseUri == null || session.uri !== baseUri) {
        return;
      }
      for (const u of noteUris) {
        session.map.delete(normalizeNoteUri(u));
      }
    },
    [baseUri],
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
    clearSessionPrefetchRefs();

    const prepared = await prepareVaultSession(nextUri);
    if (prepared.inboxPrefetch !== null) {
      inboxPrefetchRef.current = {uri: nextUri, notes: prepared.inboxPrefetch};
    }
    inboxContentCacheRef.current = recordToInboxContentCache(
      nextUri,
      prepared.inboxContentByUri,
    );

    setBaseUri(nextUri);
    setSettings(prepared.settings);
    setLocalSettings(prepared.localSettings);

    if (Platform.OS === 'android' && eskerraVaultSearch.isAvailable()) {
      eskerraVaultSearch.open(nextUri).catch(() => undefined);
    }
  }, [clearSessionPrefetchRefs]);

  const setSessionUri = useCallback(
    async (nextUri: string | null) => {
      if (!nextUri) {
        clearSessionPrefetchRefs();
        setBaseUri(null);
        setSettings(null);
        setLocalSettings(null);
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
    [applyVaultSessionUri, clearSessionPrefetchRefs],
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
        clearSessionPrefetchRefs();
        setBaseUri(null);
        setSettings(null);
        setLocalSettings(null);
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
      clearSessionPrefetchRefs();
      setBaseUri(null);
      setSettings(null);
      setLocalSettings(null);
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
  }, [applyVaultSessionUri, clearSessionPrefetchRefs]);

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

  useEffect(() => {
    if (Platform.OS === 'android' && baseUri != null && baseUri.trim() !== '') {
      requestVaultSearchIndexWarmup(baseUri);
    }
  }, [baseUri]);

  const value = useMemo(
    () => ({
      baseUri,
      clearInboxContentCache,
      consumeInboxPrefetch,
      getInboxNoteContentFromCache,
      isLoading,
      pruneInboxNoteContentFromCache,
      refreshSession,
      replaceInboxContentFromSession,
      setInboxNoteContentInCache,
      setSessionUri,
      settings,
      setSettings,
      localSettings,
      setLocalSettings,
      playlistSyncGeneration,
      notifyPlaylistSyncAfterVaultRefresh,
    }),
    [
      baseUri,
      clearInboxContentCache,
      consumeInboxPrefetch,
      getInboxNoteContentFromCache,
      isLoading,
      localSettings,
      notifyPlaylistSyncAfterVaultRefresh,
      playlistSyncGeneration,
      pruneInboxNoteContentFromCache,
      refreshSession,
      replaceInboxContentFromSession,
      setInboxNoteContentInCache,
      setSessionUri,
      settings,
    ],
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

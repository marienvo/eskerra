import {
  collectVaultMarkdownRefs,
  stemFromMarkdownFileName,
  type VaultMarkdownRef,
} from '@eskerra/core';
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

import {runAfterInteractions} from '../scheduling/afterInteractions';
import {tryListVaultMarkdownRefsNative} from '../storage/androidVaultListing';
import {safVaultFilesystem} from '../storage/safVaultFilesystem';
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
import {
  installVaultSearchAutoRefresh,
  requestVaultSearchIndexWarmup,
} from '../../features/vault/vaultSearchIndexMaintenance';
import {
  parseVaultSearchIndexStatus,
  VAULT_SEARCH_SUPPORTED_SCHEMA_VERSION,
} from '../../features/vault/vaultSearchLifecycle';
import {prepareVaultSession} from './applyVaultSession';
import {
  buildMockVaultMarkdownRefs,
  isDevMockVaultBaseUri,
  normalizeVaultMarkdownRefsBaseUri,
} from './vaultMarkdownRefsSession';

function fireAndForgetAsyncWalk(run: () => Promise<void>): void {
  run().catch(() => undefined);
}

type InboxContentCacheSession = {
  map: Map<string, string>;
  uri: string;
};

type TodayHubContentCacheSession = {
  map: Map<string, string>;
  uri: string;
};

export type VaultMarkdownRefsStatus = 'idle' | 'loading' | 'ready' | 'error';

type VaultContextValue = {
  baseUri: string | null;
  clearInboxContentCache: () => void;
  consumeInboxPrefetch: (forUri: string) => NoteSummary[] | null;
  getInboxNoteContentFromCache: (noteUri: string) => string | undefined;
  getTodayHubNoteContentFromCache: (noteUri: string) => string | undefined;
  isLoading: boolean;
  pruneInboxNoteContentFromCache: (noteUris: readonly string[]) => void;
  pruneTodayHubNoteContentFromCache: (noteUris: readonly string[]) => void;
  refreshSession: () => Promise<void>;
  replaceInboxContentFromSession: (
    inboxContentByUri: Record<string, string> | null | undefined,
  ) => void;
  replaceTodayHubContentFromSession: (
    todayHubContentByUri: Record<string, string> | null | undefined,
  ) => void;
  setInboxNoteContentInCache: (noteUri: string, content: string) => void;
  setTodayHubNoteContentInCache: (noteUri: string, content: string) => void;
  setSessionUri: (nextUri: string | null) => Promise<void>;
  settings: EskerraSettings | null;
  setSettings: (nextSettings: EskerraSettings) => void;
  localSettings: EskerraLocalSettings | null;
  setLocalSettings: (next: EskerraLocalSettings) => void;
  playlistSyncGeneration: number;
  notifyPlaylistSyncAfterVaultRefresh: () => void;
  vaultMarkdownRefs: readonly VaultMarkdownRef[];
  vaultMarkdownRefsStatus: VaultMarkdownRefsStatus;
  vaultMarkdownRefsError: string | null;
  refreshVaultMarkdownRefs: () => void;
  scheduleDebouncedVaultMarkdownRefsRefresh: () => void;
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
    todayHubContentByUri?: Record<string, string> | null;
  } | null;
};

function recordToContentCache(
  vaultUri: string,
  record: Record<string, string> | null | undefined,
): {map: Map<string, string>; uri: string} | null {
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
  const baseUriRef = useRef<string | null>(baseUri);
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
      ? recordToContentCache(
          initialSession.uri,
          initialSession.inboxContentByUri,
        )
      : null,
  );

  const todayHubContentCacheRef = useRef<TodayHubContentCacheSession | null>(
    initialSession
      ? recordToContentCache(
          initialSession.uri,
          initialSession.todayHubContentByUri ?? null,
        )
      : null,
  );

  const [vaultMarkdownRefs, setVaultMarkdownRefs] = useState<readonly VaultMarkdownRef[]>([]);
  const [vaultMarkdownRefsStatus, setVaultMarkdownRefsStatus] =
    useState<VaultMarkdownRefsStatus>('idle');
  const [vaultMarkdownRefsError, setVaultMarkdownRefsError] = useState<string | null>(null);
  const [vaultMarkdownRefsRefreshNonce, setVaultMarkdownRefsRefreshNonce] = useState(0);
  const vaultMarkdownRefsAbortRef = useRef<AbortController | null>(null);
  const vaultMarkdownRefsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshVaultMarkdownRefs = useCallback(() => {
    setVaultMarkdownRefsRefreshNonce(n => n + 1);
  }, []);

  const scheduleDebouncedVaultMarkdownRefsRefresh = useCallback(() => {
    if (vaultMarkdownRefsDebounceRef.current) {
      clearTimeout(vaultMarkdownRefsDebounceRef.current);
    }
    vaultMarkdownRefsDebounceRef.current = setTimeout(() => {
      vaultMarkdownRefsDebounceRef.current = null;
      setVaultMarkdownRefsRefreshNonce(n => n + 1);
    }, 1000);
  }, []);

  const clearSessionPrefetchRefs = useCallback(() => {
    inboxPrefetchRef.current = null;
    inboxContentCacheRef.current = null;
    todayHubContentCacheRef.current = null;
  }, []);

  const clearInboxContentCache = useCallback(() => {
    inboxContentCacheRef.current = null;
  }, []);

  const replaceInboxContentFromSession = useCallback(
    (inboxContentByUri: Record<string, string> | null | undefined) => {
      if (baseUri == null) {
        return;
      }
      inboxContentCacheRef.current = recordToContentCache(
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

  const replaceTodayHubContentFromSession = useCallback(
    (todayHubContentByUri: Record<string, string> | null | undefined) => {
      if (baseUri == null) {
        return;
      }
      todayHubContentCacheRef.current = recordToContentCache(
        baseUri,
        todayHubContentByUri,
      );
    },
    [baseUri],
  );

  const getTodayHubNoteContentFromCache = useCallback(
    (noteUri: string): string | undefined => {
      const session = todayHubContentCacheRef.current;
      if (session == null || baseUri == null || session.uri !== baseUri) {
        return undefined;
      }
      return session.map.get(normalizeNoteUri(noteUri));
    },
    [baseUri],
  );

  const setTodayHubNoteContentInCache = useCallback(
    (noteUri: string, content: string) => {
      if (baseUri == null) {
        return;
      }
      let session = todayHubContentCacheRef.current;
      if (session == null || session.uri !== baseUri) {
        session = {map: new Map(), uri: baseUri};
        todayHubContentCacheRef.current = session;
      }
      session.map.set(normalizeNoteUri(noteUri), content);
    },
    [baseUri],
  );

  const pruneTodayHubNoteContentFromCache = useCallback(
    (noteUris: readonly string[]) => {
      const session = todayHubContentCacheRef.current;
      if (session == null || baseUri == null || session.uri !== baseUri) {
        return;
      }
      for (const u of noteUris) {
        session.map.delete(normalizeNoteUri(u));
      }
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

  useEffect(() => {
    vaultMarkdownRefsAbortRef.current?.abort();
    if (vaultMarkdownRefsDebounceRef.current && (baseUri == null || baseUri.trim() === '')) {
      clearTimeout(vaultMarkdownRefsDebounceRef.current);
      vaultMarkdownRefsDebounceRef.current = null;
    }

    if (baseUri == null || baseUri.trim() === '') {
      setVaultMarkdownRefs([]);
      setVaultMarkdownRefsStatus('idle');
      setVaultMarkdownRefsError(null);
      return;
    }

    const normalizedBase = normalizeVaultMarkdownRefsBaseUri(baseUri);

    if (isDevMockVaultBaseUri(normalizedBase)) {
      setVaultMarkdownRefs(buildMockVaultMarkdownRefs());
      setVaultMarkdownRefsStatus('ready');
      setVaultMarkdownRefsError(null);
      return;
    }

    const ac = new AbortController();
    vaultMarkdownRefsAbortRef.current = ac;
    setVaultMarkdownRefsStatus('loading');
    setVaultMarkdownRefsError(null);
    setVaultMarkdownRefs([]);

    const sortRefs = (rows: VaultMarkdownRef[]) =>
      [...rows].sort((a, b) => {
        const byName = a.name.localeCompare(b.name);
        return byName !== 0 ? byName : a.uri.localeCompare(b.uri);
      });

    const runMarkdownRefsFromWalk = async (): Promise<void> => {
      try {
        let rows: VaultMarkdownRef[] | undefined;

        if (Platform.OS === 'android') {
          const nativeRows = await tryListVaultMarkdownRefsNative(normalizedBase);
          if (ac.signal.aborted) {
            return;
          }
          if (nativeRows != null) {
            rows = nativeRows.map(r => ({
              name: stemFromMarkdownFileName(r.fileName),
              uri: r.uri,
            }));
            rows = sortRefs(rows);
          }
        }

        if (rows === undefined) {
          ac.signal.throwIfAborted();
          rows = await collectVaultMarkdownRefs(normalizedBase, safVaultFilesystem, {
            signal: ac.signal,
          });
          rows = sortRefs(rows);
        }

        if (ac.signal.aborted) {
          return;
        }
        setVaultMarkdownRefs(rows);
        setVaultMarkdownRefsStatus('ready');
        appBreadcrumb({
          category: 'vault',
          message: 'vault.markdown_refs.ready',
          data: {note_count: rows.length},
        });
      } catch (e) {
        if (ac.signal.aborted) {
          return;
        }
        if (e instanceof Error && e.name === 'AbortError') {
          return;
        }
        const message = e instanceof Error ? e.message : 'Could not index vault notes.';
        setVaultMarkdownRefsError(message);
        setVaultMarkdownRefs([]);
        setVaultMarkdownRefsStatus('error');
      }
    };

    const tryRegistryThenDeferWalk = async (): Promise<void> => {
      let settledFromRegistry = false;
      if (Platform.OS === 'android' && eskerraVaultSearch.isAvailable()) {
        try {
          const statusRaw = await eskerraVaultSearch.getIndexStatus(normalizedBase).catch(() => null);
          const status = statusRaw != null ? parseVaultSearchIndexStatus(statusRaw) : null;
          const registryReady =
            status != null &&
            status.schemaVersion === VAULT_SEARCH_SUPPORTED_SCHEMA_VERSION &&
            status.notesRegistryReady === true;

          if (registryReady && !ac.signal.aborted) {
            const reg = await eskerraVaultSearch.readVaultMarkdownNotes(normalizedBase);
            if (!ac.signal.aborted) {
              const rows: VaultMarkdownRef[] = reg.map(r => ({
                name: r.displayName,
                uri: r.uri,
              }));
              const sorted = sortRefs(rows);
              setVaultMarkdownRefs(sorted);
              setVaultMarkdownRefsStatus('ready');
              settledFromRegistry = true;
              appBreadcrumb({
                category: 'vault',
                message: 'vault.markdown_refs.registry_ready',
                data: {note_count: sorted.length},
              });
            }
          }
        } catch {
          // fall through to deferred walk
        }
      }

      const cancelable = runAfterInteractions(() => {
        if (ac.signal.aborted || settledFromRegistry) {
          return;
        }
        fireAndForgetAsyncWalk(runMarkdownRefsFromWalk);
      });

      ac.signal.addEventListener(
        'abort',
        () => {
          cancelable.cancel();
        },
        {once: true},
      );
    };

    tryRegistryThenDeferWalk();

    return () => {
      ac.abort();
    };
  }, [baseUri, vaultMarkdownRefsRefreshNonce]);

  useEffect(() => {
    return () => {
      if (vaultMarkdownRefsDebounceRef.current) {
        clearTimeout(vaultMarkdownRefsDebounceRef.current);
        vaultMarkdownRefsDebounceRef.current = null;
      }
    };
  }, []);

  const applyVaultSessionUri = useCallback(async (nextUri: string) => {
    clearSessionPrefetchRefs();

    const prepared = await prepareVaultSession(nextUri);
    if (prepared.inboxPrefetch !== null) {
      inboxPrefetchRef.current = {uri: nextUri, notes: prepared.inboxPrefetch};
    }
    inboxContentCacheRef.current = recordToContentCache(
      nextUri,
      prepared.inboxContentByUri,
    );
    todayHubContentCacheRef.current = recordToContentCache(
      nextUri,
      prepared.todayHubContentByUri,
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
        vaultMarkdownRefsAbortRef.current?.abort();
        setVaultMarkdownRefs([]);
        setVaultMarkdownRefsStatus('idle');
        setVaultMarkdownRefsError(null);
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
        vaultMarkdownRefsAbortRef.current?.abort();
        setVaultMarkdownRefs([]);
        setVaultMarkdownRefsStatus('idle');
        setVaultMarkdownRefsError(null);
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
      vaultMarkdownRefsAbortRef.current?.abort();
      setVaultMarkdownRefs([]);
      setVaultMarkdownRefsStatus('idle');
      setVaultMarkdownRefsError(null);
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
    baseUriRef.current = baseUri;
  }, [baseUri]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !eskerraVaultSearch.isAvailable()) {
      return;
    }
    if (baseUri == null || baseUri.trim() === '') {
      return;
    }
    const trimmed = baseUri.trim();
    requestVaultSearchIndexWarmup(trimmed);
    eskerraVaultSearch.persistActiveVaultUriForWorker(trimmed).catch(() => undefined);
    return installVaultSearchAutoRefresh(() => baseUriRef.current);
  }, [baseUri]);

  const value = useMemo(
    () => ({
      baseUri,
      clearInboxContentCache,
      consumeInboxPrefetch,
      getInboxNoteContentFromCache,
      getTodayHubNoteContentFromCache,
      isLoading,
      pruneInboxNoteContentFromCache,
      pruneTodayHubNoteContentFromCache,
      refreshSession,
      replaceInboxContentFromSession,
      replaceTodayHubContentFromSession,
      setInboxNoteContentInCache,
      setTodayHubNoteContentInCache,
      setSessionUri,
      settings,
      setSettings,
      localSettings,
      setLocalSettings,
      playlistSyncGeneration,
      notifyPlaylistSyncAfterVaultRefresh,
      vaultMarkdownRefs,
      vaultMarkdownRefsStatus,
      vaultMarkdownRefsError,
      refreshVaultMarkdownRefs,
      scheduleDebouncedVaultMarkdownRefsRefresh,
    }),
    [
      baseUri,
      clearInboxContentCache,
      consumeInboxPrefetch,
      getInboxNoteContentFromCache,
      getTodayHubNoteContentFromCache,
      isLoading,
      localSettings,
      notifyPlaylistSyncAfterVaultRefresh,
      playlistSyncGeneration,
      pruneInboxNoteContentFromCache,
      pruneTodayHubNoteContentFromCache,
      refreshSession,
      refreshVaultMarkdownRefs,
      replaceInboxContentFromSession,
      replaceTodayHubContentFromSession,
      scheduleDebouncedVaultMarkdownRefsRefresh,
      setInboxNoteContentInCache,
      setTodayHubNoteContentInCache,
      setSessionUri,
      settings,
      vaultMarkdownRefs,
      vaultMarkdownRefsError,
      vaultMarkdownRefsStatus,
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

import {createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState} from 'react';

import {appBreadcrumb, reportUnexpectedError, syncVaultSessionContext} from '../observability';
import {elapsedMsSinceJsBundleEval} from '../observability/startupTiming';
import {getSavedUri} from '../storage/appStorage';
import {initNotebox, readSettings} from '../storage/noteboxStorage';
import {NoteboxSettings} from '../../types';

type VaultContextValue = {
  baseUri: string | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  setSessionUri: (nextUri: string | null) => Promise<void>;
  settings: NoteboxSettings | null;
  setSettings: (nextSettings: NoteboxSettings) => void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

type VaultProviderProps = {
  children: ReactNode;
};

export function VaultProvider({children}: VaultProviderProps) {
  const [baseUri, setBaseUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<NoteboxSettings | null>(null);

  const applyVaultSessionUri = useCallback(async (nextUri: string) => {
    appBreadcrumb({
      category: 'vault',
      message: 'session.apply.start',
      data: {},
    });
    await initNotebox(nextUri);
    const nextSettings = await readSettings(nextUri);
    setBaseUri(nextUri);
    setSettings(nextSettings);
    appBreadcrumb({
      category: 'vault',
      message: 'session.apply.complete',
      data: {},
    });
  }, []);

  const setSessionUri = useCallback(
    async (nextUri: string | null) => {
      if (!nextUri) {
        setBaseUri(null);
        setSettings(null);
        return;
      }

      try {
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
    refreshSession().catch(() => undefined);
  }, [refreshSession]);

  useEffect(() => {
    syncVaultSessionContext(Boolean(baseUri));
  }, [baseUri]);

  const value = useMemo(
    () => ({
      baseUri,
      isLoading,
      refreshSession,
      setSessionUri,
      settings,
      setSettings,
    }),
    [baseUri, isLoading, refreshSession, setSessionUri, settings],
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

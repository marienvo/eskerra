import {
  createThemePreferenceEtagPoller,
  fetchR2ThemePreferenceConditional,
  isVaultR2PlaylistConfigured,
  type EskerraSettings,
  type ThemePreference,
} from '@eskerra/core';
import {useEffect, useLayoutEffect, useRef} from 'react';

import {desktopR2SignedTransport} from '../lib/desktopR2Transport';

import {useTauriMainWindowPollActive} from './useTauriMainWindowPollActive';

type Params = {
  vaultRoot: string | null;
  vaultSettings: EskerraSettings | null;
  mainWindowActive: boolean;
  onRemotePreferenceChanged: (next: ThemePreference) => void;
};

export function useDesktopThemePreferenceR2EtagPolling({
  vaultRoot,
  vaultSettings,
  mainWindowActive,
  onRemotePreferenceChanged,
}: Params): void {
  const onRemoteRef = useRef(onRemotePreferenceChanged);
  const settingsRef = useRef(vaultSettings);

  useLayoutEffect(() => {
    onRemoteRef.current = onRemotePreferenceChanged;
  }, [onRemotePreferenceChanged]);

  useLayoutEffect(() => {
    settingsRef.current = vaultSettings;
  }, [vaultSettings]);

  const pollerRef = useRef<ReturnType<typeof createThemePreferenceEtagPoller> | null>(null);

  useEffect(() => {
    if (!vaultRoot) {
      pollerRef.current?.dispose();
      pollerRef.current = null;
      return;
    }

    const poller = createThemePreferenceEtagPoller({
      intervalMs: 1000,
      fetchConditional: ({etag, signal}) => {
        const s = settingsRef.current;
        if (!s || !isVaultR2PlaylistConfigured(s)) {
          return Promise.resolve({kind: 'missing'} as const);
        }
        return fetchR2ThemePreferenceConditional(s.r2, {
          etag,
          signal,
          transport: desktopR2SignedTransport,
        });
      },
      onDataChanged: (preference: ThemePreference) => {
        onRemoteRef.current(preference);
      },
    });
    pollerRef.current = poller;

    return () => {
      poller.dispose();
      if (pollerRef.current === poller) {
        pollerRef.current = null;
      }
    };
  }, [vaultRoot]);

  useEffect(() => {
    const poller = pollerRef.current;
    if (!poller || !vaultRoot) {
      return;
    }
    const s = vaultSettings;
    const r2Ok = s != null && isVaultR2PlaylistConfigured(s);
    poller.setActive(r2Ok && mainWindowActive);
  }, [vaultRoot, vaultSettings, mainWindowActive]);
}

export function useDesktopThemePreferenceR2EtagPollingForMainWindow(params: {
  vaultRoot: string | null;
  vaultSettings: EskerraSettings | null;
  onRemotePreferenceChanged: (next: ThemePreference) => void;
}): void {
  const mainWindowActive = useTauriMainWindowPollActive();
  useDesktopThemePreferenceR2EtagPolling({
    ...params,
    mainWindowActive,
  });
}

import {
  createPlaylistEtagPoller,
  fetchR2PlaylistConditional,
  isVaultR2PlaylistConfigured,
  type NoteboxSettings,
} from '@notebox/core';
import {useEffect, useLayoutEffect, useRef} from 'react';

import {desktopR2SignedTransport} from '../lib/desktopR2Transport';

import {useTauriMainWindowPollActive} from './useTauriMainWindowPollActive';

type UseDesktopPlaylistR2EtagPollingParams = {
  vaultRoot: string | null;
  vaultSettings: NoteboxSettings | null;
  mainWindowActive: boolean;
  onRemotePlaylistChanged: () => void;
  /** When false, polling is paused (e.g. while audio is playing). Defaults to true. */
  allowPolling?: boolean;
};

/**
 * ETag polling for R2 playlist while the main desktop window is active (see {@link useTauriMainWindowPollActive}).
 */
export function useDesktopPlaylistR2EtagPolling({
  vaultRoot,
  vaultSettings,
  mainWindowActive,
  onRemotePlaylistChanged,
  allowPolling = true,
}: UseDesktopPlaylistR2EtagPollingParams): void {
  const onRemoteRef = useRef(onRemotePlaylistChanged);
  const settingsRef = useRef(vaultSettings);

  useLayoutEffect(() => {
    onRemoteRef.current = onRemotePlaylistChanged;
  }, [onRemotePlaylistChanged]);

  useLayoutEffect(() => {
    settingsRef.current = vaultSettings;
  }, [vaultSettings]);

  const pollerRef = useRef<ReturnType<typeof createPlaylistEtagPoller> | null>(null);

  useEffect(() => {
    if (!vaultRoot) {
      pollerRef.current?.dispose();
      pollerRef.current = null;
      return;
    }

    const poller = createPlaylistEtagPoller({
      intervalMs: 1000,
      fetchConditional: ({etag, signal}) => {
        const s = settingsRef.current;
        if (!s || !isVaultR2PlaylistConfigured(s)) {
          return Promise.resolve({kind: 'missing'} as const);
        }
        return fetchR2PlaylistConditional(s.r2, {
          etag,
          signal,
          transport: desktopR2SignedTransport,
        });
      },
      onDataChanged: () => {
        onRemoteRef.current();
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
    poller.setActive(r2Ok && mainWindowActive && allowPolling);
  }, [vaultRoot, vaultSettings, mainWindowActive, allowPolling]);
}

/** Composes window focus/visibility with R2 polling for the main app window. */
export function useDesktopPlaylistR2EtagPollingForMainWindow(params: {
  vaultRoot: string | null;
  vaultSettings: NoteboxSettings | null;
  onRemotePlaylistChanged: () => void;
  allowPolling?: boolean;
}): void {
  const mainWindowActive = useTauriMainWindowPollActive();
  useDesktopPlaylistR2EtagPolling({
    ...params,
    mainWindowActive,
  });
}

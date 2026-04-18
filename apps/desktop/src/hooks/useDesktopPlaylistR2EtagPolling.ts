import {
  createPlaylistEtagPoller,
  fetchR2PlaylistConditional,
  isPlaylistR2PollEchoFromOwnDevice,
  isVaultR2PlaylistConfigured,
  type EskerraSettings,
  type PlaylistEntry,
} from '@eskerra/core';
import {useEffect, useLayoutEffect, useRef} from 'react';

import {desktopR2SignedTransport} from '../lib/desktopR2Transport';

import {useTauriMainWindowPollActive} from './useTauriMainWindowPollActive';

const FOREGROUND_INTERVAL_MS = 1000;
const BACKGROUND_INTERVAL_MS = 5000;

type UseDesktopPlaylistR2EtagPollingParams = {
  vaultRoot: string | null;
  vaultSettings: EskerraSettings | null;
  /**
   * Used to ignore R2 ETag refreshes that only echo this device's own control writes.
   * Other devices use a different `deviceInstanceId` as `playbackOwnerId`.
   */
  deviceInstanceId: string;
  mainWindowActive: boolean;
  onRemotePlaylistChanged: () => void;
  /** When remote `playlist.json` is deleted after we had seen content (another device finished / cleared). */
  onRemotePlaylistCleared?: () => void;
  /** When false, polling is paused (e.g. while audio is playing). Defaults to true. */
  allowPolling?: boolean;
};

/**
 * ETag polling for R2 playlist while the main desktop window is active (see {@link useTauriMainWindowPollActive}).
 */
export function useDesktopPlaylistR2EtagPolling({
  vaultRoot,
  vaultSettings,
  deviceInstanceId,
  mainWindowActive,
  onRemotePlaylistChanged,
  onRemotePlaylistCleared,
  allowPolling = true,
}: UseDesktopPlaylistR2EtagPollingParams): void {
  const onRemoteRef = useRef(onRemotePlaylistChanged);
  const onRemoteClearedRef = useRef(onRemotePlaylistCleared);
  const settingsRef = useRef(vaultSettings);
  const deviceIdRef = useRef(deviceInstanceId);

  useLayoutEffect(() => {
    onRemoteRef.current = onRemotePlaylistChanged;
  }, [onRemotePlaylistChanged]);

  useLayoutEffect(() => {
    onRemoteClearedRef.current = onRemotePlaylistCleared;
  }, [onRemotePlaylistCleared]);

  useLayoutEffect(() => {
    settingsRef.current = vaultSettings;
  }, [vaultSettings]);

  useLayoutEffect(() => {
    deviceIdRef.current = deviceInstanceId;
  }, [deviceInstanceId]);

  const pollerRef = useRef<ReturnType<typeof createPlaylistEtagPoller> | null>(null);
  const prevMainWindowActiveRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!vaultRoot) {
      prevMainWindowActiveRef.current = null;
      pollerRef.current?.dispose();
      pollerRef.current = null;
      return;
    }

    const poller = createPlaylistEtagPoller({
      intervalMs: BACKGROUND_INTERVAL_MS,
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
      onDataChanged: (entry: PlaylistEntry) => {
        if (isPlaylistR2PollEchoFromOwnDevice(entry, deviceIdRef.current)) {
          return;
        }
        onRemoteRef.current();
      },
      onRemotePlaylistCleared: () => {
        onRemoteClearedRef.current?.();
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
    poller.setActive(r2Ok && allowPolling);
  }, [vaultRoot, vaultSettings, allowPolling]);

  useEffect(() => {
    const poller = pollerRef.current;
    if (!poller || !vaultRoot) {
      return;
    }
    poller.setIntervalMs(
      mainWindowActive ? FOREGROUND_INTERVAL_MS : BACKGROUND_INTERVAL_MS,
    );
    if (prevMainWindowActiveRef.current === false && mainWindowActive) {
      poller.triggerCheck();
    }
    prevMainWindowActiveRef.current = mainWindowActive;
  }, [vaultRoot, mainWindowActive]);
}

/** Composes window focus/visibility with R2 polling for the main app window. */
export function useDesktopPlaylistR2EtagPollingForMainWindow(params: {
  vaultRoot: string | null;
  vaultSettings: EskerraSettings | null;
  deviceInstanceId: string;
  onRemotePlaylistChanged: () => void;
  onRemotePlaylistCleared?: () => void;
  allowPolling?: boolean;
}): void {
  const mainWindowActive = useTauriMainWindowPollActive();
  useDesktopPlaylistR2EtagPolling({
    ...params,
    mainWindowActive,
  });
}

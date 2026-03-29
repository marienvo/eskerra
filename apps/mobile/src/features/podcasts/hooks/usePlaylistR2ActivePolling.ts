import {
  createPlaylistEtagPoller,
  fetchR2PlaylistConditional,
  isVaultR2PlaylistConfigured,
  type NoteboxSettings,
} from '@notebox/core';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';

type UsePlaylistR2ActivePollingParams = {
  baseUri: string | null;
  settings: NoteboxSettings | null;
  onRemotePlaylistUpdated: () => void;
  /** When false, polling is paused (e.g. while audio is playing). Defaults to true. */
  allowPolling?: boolean;
};

/**
 * Polls R2 `playlist.json` about once per second while the app is foregrounded, R2 is configured,
 * and `allowPolling` is true (callers typically pause while audio is playing).
 */
export function usePlaylistR2ActivePolling({
  baseUri,
  settings,
  onRemotePlaylistUpdated,
  allowPolling = true,
}: UsePlaylistR2ActivePollingParams): void {
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      setAppActive(next === 'active');
    });
    return () => sub.remove();
  }, []);

  const settingsRef = useRef(settings);
  const onRemoteRef = useRef(onRemotePlaylistUpdated);

  useLayoutEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useLayoutEffect(() => {
    onRemoteRef.current = onRemotePlaylistUpdated;
  }, [onRemotePlaylistUpdated]);

  const pollerRef = useRef<ReturnType<typeof createPlaylistEtagPoller> | null>(null);

  useEffect(() => {
    if (!baseUri) {
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
        return fetchR2PlaylistConditional(s.r2, {etag, signal});
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
  }, [baseUri]);

  useEffect(() => {
    const poller = pollerRef.current;
    if (!poller || !baseUri) {
      return;
    }
    const s = settings;
    const r2Ok = s != null && isVaultR2PlaylistConfigured(s);
    poller.setActive(r2Ok && appActive && allowPolling);
  }, [baseUri, settings, appActive, allowPolling]);
}

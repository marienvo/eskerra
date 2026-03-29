import {
  createPlaylistEtagPoller,
  fetchR2PlaylistConditional,
  isVaultR2PlaylistConfigured,
  type NoteboxSettings,
} from '@notebox/core';
import {useIsFocused} from '@react-navigation/native';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';

type UsePlaylistR2ActivePollingParams = {
  baseUri: string | null;
  settings: NoteboxSettings | null;
  onRemotePlaylistUpdated: () => void;
};

/**
 * Polls R2 `playlist.json` about once per second while the app is foregrounded and this screen is focused.
 */
export function usePlaylistR2ActivePolling({
  baseUri,
  settings,
  onRemotePlaylistUpdated,
}: UsePlaylistR2ActivePollingParams): void {
  const isFocused = useIsFocused();
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
    poller.setActive(r2Ok && appActive && isFocused);
  }, [baseUri, settings, appActive, isFocused]);
}

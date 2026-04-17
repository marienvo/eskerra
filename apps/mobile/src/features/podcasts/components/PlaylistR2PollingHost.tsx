import {useVaultContext} from '../../../core/vault/VaultContext';
import {usePlayerContext} from '../context/PlayerContext';
import {usePlaylistR2ActivePolling} from '../hooks/usePlaylistR2ActivePolling';

/**
 * Subscribes to R2 playlist ETag polling for the open vault while the main tabs are mounted.
 * Must render under PlayerProvider (for playback state).
 */
export function PlaylistR2PollingHost(): null {
  const {baseUri, notifyPlaylistSyncAfterVaultRefresh, settings} = useVaultContext();
  const {playbackState} = usePlayerContext();
  const allowPolling = playbackState !== 'playing';

  usePlaylistR2ActivePolling({
    allowPolling,
    baseUri,
    onRemotePlaylistUpdated: notifyPlaylistSyncAfterVaultRefresh,
    onRemotePlaylistCleared: notifyPlaylistSyncAfterVaultRefresh,
    settings,
  });

  return null;
}

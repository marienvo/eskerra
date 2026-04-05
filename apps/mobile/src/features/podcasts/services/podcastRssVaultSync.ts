import {Platform} from 'react-native';

import {
  getVaultGeneralDirectoryUri,
  isEskerraDevMockVaultBaseUri,
} from '../../../core/storage/eskerraStorage';
import {
  isAndroidPodcastRssSyncAvailable,
  PodcastRssSyncProgressPayload,
  runAndroidGeneralPodcastRssSync,
} from '../../../core/storage/androidPodcastRssSync';
import {
  clearPodcastMarkdownFileContentCache,
  type RefreshPodcastsOptions,
} from './podcastPhase1';

/**
 * Android-only: refresh 📻 markdown from RSS and aggregate `*- podcasts.md`, then reload podcast state.
 * No-op path for mock vault (throws); callers should gate on [isNativePodcastRssSyncSupported].
 */
export async function runNativePodcastRssSyncForVault(
  baseUri: string,
  refreshPodcasts: (options?: RefreshPodcastsOptions) => Promise<void>,
  options?: {
    onProgress?: (payload: PodcastRssSyncProgressPayload) => void;
  },
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('Native podcast RSS sync is only available on Android.');
  }
  if (isEskerraDevMockVaultBaseUri(baseUri)) {
    throw new Error('Native podcast RSS sync is not available for the dev mock vault.');
  }
  if (!isAndroidPodcastRssSyncAvailable()) {
    throw new Error('Native podcast RSS sync module is not linked in this build.');
  }
  const generalUri = getVaultGeneralDirectoryUri(baseUri);
  await runAndroidGeneralPodcastRssSync(generalUri, options);
  clearPodcastMarkdownFileContentCache();
  await refreshPodcasts({forceFullScan: true});
}

export function isNativePodcastRssSyncSupported(baseUri: string): boolean {
  return (
    Platform.OS === 'android' &&
    !isEskerraDevMockVaultBaseUri(baseUri) &&
    isAndroidPodcastRssSyncAvailable()
  );
}

/** In-flight vault refresh (native sync + cache clear + podcast reload) for coalescing callers. */
let podcastVaultRefreshChain: Promise<void> | null = null;

/**
 * Runs at most one vault podcast refresh chain at a time. Concurrent callers await the same
 * promise (e.g. pull-to-refresh plus a future background scheduler).
 */
export async function runSerializedPodcastVaultRefresh(
  baseUri: string,
  refreshPodcasts: (options?: RefreshPodcastsOptions) => Promise<void>,
  options?: {
    onProgress?: (payload: PodcastRssSyncProgressPayload) => void;
  },
): Promise<void> {
  if (podcastVaultRefreshChain != null) {
    return podcastVaultRefreshChain;
  }
  const chain = (async () => {
    try {
      if (isNativePodcastRssSyncSupported(baseUri)) {
        try {
          await runNativePodcastRssSyncForVault(baseUri, refreshPodcasts, options);
          return;
        } catch {
          await refreshPodcasts({forceFullScan: true});
          return;
        }
      }
      await refreshPodcasts({forceFullScan: true});
    } finally {
      podcastVaultRefreshChain = null;
    }
  })();
  podcastVaultRefreshChain = chain;
  return chain;
}

import {DeviceEventEmitter, NativeModules, Platform} from 'react-native';

/** Must match [PodcastRssSyncModule.EVENT_PROGRESS] in Kotlin. */
export const ESKERRA_PODCAST_RSS_SYNC_PROGRESS_EVENT = 'EskerraPodcastRssSyncProgress';

export type PodcastRssSyncProgressPayload = {
  jobId: string;
  percent: number;
  phase: string;
  detail?: string;
};

type NativePodcastRssSyncModule = {
  startPodcastRssSync: (generalDirectoryUri: string, jobId: string) => Promise<null | void>;
};

let fallbackPodcastSyncJobCounter = 0;

function getNativeModule(): NativePodcastRssSyncModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  const mod = NativeModules.EskerraPodcastRssSync as NativePodcastRssSyncModule | undefined;
  if (mod?.startPodcastRssSync == null) {
    return null;
  }
  return mod;
}

/**
 * Runs Kotlin batch RSS sync for `General/`: refreshes 📻 markdown from feeds (unchecked hub links),
 * then merges into each `*- podcasts.md`. Subscribes to progress for [jobId] until the native promise resolves.
 */
export async function runAndroidGeneralPodcastRssSync(
  generalDirectoryUri: string,
  options?: {
    onProgress?: (payload: PodcastRssSyncProgressPayload) => void;
  },
): Promise<void> {
  const mod = getNativeModule();
  if (mod == null) {
    throw new Error('Native podcast RSS sync is unavailable on this platform or build.');
  }
  const trimmedUri = generalDirectoryUri.trim();
  if (!trimmedUri) {
    throw new Error('generalDirectoryUri cannot be empty.');
  }
  const jobId =
    globalThis.crypto && 'randomUUID' in globalThis.crypto
      ? `podcast-rss-${globalThis.crypto.randomUUID()}`
      : `podcast-rss-${Date.now()}-${++fallbackPodcastSyncJobCounter}`;
  const sub = DeviceEventEmitter.addListener(
    ESKERRA_PODCAST_RSS_SYNC_PROGRESS_EVENT,
    (raw: {jobId?: string; percent?: number; phase?: string; detail?: string}) => {
      if (raw.jobId == null || String(raw.jobId) !== jobId) {
        return;
      }
      options?.onProgress?.({
        jobId,
        percent: typeof raw.percent === 'number' ? raw.percent : Number(raw.percent),
        phase: raw.phase != null ? String(raw.phase) : '',
        detail: raw.detail != null ? String(raw.detail) : undefined,
      });
    },
  );
  try {
    await mod.startPodcastRssSync(trimmedUri, jobId);
  } finally {
    sub.remove();
  }
}

export function isAndroidPodcastRssSyncAvailable(): boolean {
  return getNativeModule() != null;
}

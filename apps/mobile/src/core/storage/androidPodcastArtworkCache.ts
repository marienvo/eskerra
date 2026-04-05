import {NativeModules, Platform} from 'react-native';

type NativePodcastArtworkCacheModule = {
  ensureLocalArtworkFile: (contentUri: string) => Promise<string>;
  writeArtworkFile: (
    baseUri: string,
    cacheKey: string,
    extension: string,
    base64Payload: string,
  ) => Promise<string>;
  fileUriExists: (fileUri: string) => Promise<boolean>;
};

const resolvedFileUriByContentUri = new Map<string, string>();
const inFlightByContentUri = new Map<string, Promise<string>>();

/** Matches podcastImageCache: only SAF document URIs are safe for Image + vault artwork. */
function isRenderableVaultContentArtworkUri(uri: string): boolean {
  if (!uri.startsWith('content://')) {
    return true;
  }
  return uri.includes('/document/');
}

function getNativeDisplayModule(): Pick<
  NativePodcastArtworkCacheModule,
  'ensureLocalArtworkFile'
> | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  const mod = NativeModules.EskerraPodcastArtworkCache as
    | NativePodcastArtworkCacheModule
    | undefined;
  if (mod?.ensureLocalArtworkFile == null) {
    return null;
  }
  return mod;
}

function getNativeStorageModule(): NativePodcastArtworkCacheModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  const mod = NativeModules.EskerraPodcastArtworkCache as
    | NativePodcastArtworkCacheModule
    | undefined;
  if (mod?.writeArtworkFile == null || mod?.fileUriExists == null) {
    return null;
  }
  return mod;
}

/**
 * Writes decoded base64 image bytes into app-internal storage (Android filesDir). Returns file:// URI.
 */
export async function writePodcastArtworkFileNative(
  baseUri: string,
  cacheKey: string,
  extension: string,
  base64Payload: string,
): Promise<string> {
  const mod = getNativeStorageModule();
  if (mod == null) {
    throw new Error('Native podcast artwork storage is unavailable.');
  }
  return mod.writeArtworkFile(baseUri.trim(), cacheKey.trim(), extension.trim(), base64Payload.trim());
}

/**
 * Whether a file:// URI points at a non-empty file under the app's internal artwork directory.
 */
export async function podcastArtworkFileUriExistsNative(fileUri: string): Promise<boolean> {
  const mod = getNativeStorageModule();
  if (mod == null) {
    return false;
  }
  return mod.fileUriExists(fileUri.trim());
}

/**
 * Returns a URI safe for React Native Image: copies vault `content://` artwork to app cache on a
 * native background thread (Android) and returns `file://`. Other schemes pass through unchanged.
 */
export async function ensureLocalArtworkFileForDisplay(uri: string): Promise<string> {
  const trimmed = uri.trim();
  if (!trimmed.startsWith('content://')) {
    return trimmed;
  }
  if (!isRenderableVaultContentArtworkUri(trimmed)) {
    return trimmed;
  }

  const native = getNativeDisplayModule();
  if (native == null) {
    return trimmed;
  }

  const cached = resolvedFileUriByContentUri.get(trimmed);
  if (cached) {
    return cached;
  }

  let pending = inFlightByContentUri.get(trimmed);
  if (!pending) {
    pending = native.ensureLocalArtworkFile(trimmed).then(fileUri => {
      resolvedFileUriByContentUri.set(trimmed, fileUri);
      inFlightByContentUri.delete(trimmed);
      return fileUri;
    }).catch(err => {
      inFlightByContentUri.delete(trimmed);
      throw err;
    });
    inFlightByContentUri.set(trimmed, pending);
  }

  return pending;
}

/**
 * Clears the in-memory map (for tests).
 */
export function clearPodcastArtworkDisplayUriCacheForTesting(): void {
  resolvedFileUriByContentUri.clear();
  inFlightByContentUri.clear();
}

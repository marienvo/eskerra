/**
 * @format
 */

import {NativeModules, Platform} from 'react-native';

import {
  clearPodcastArtworkDisplayUriCacheForTesting,
  ensureLocalArtworkFileForDisplay,
} from '../src/core/storage/androidPodcastArtworkCache';

function setPlatformOs(os: 'android' | 'ios') {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: os,
  });
}

describe('ensureLocalArtworkFileForDisplay', () => {
  const initialPlatform = Platform.OS;
  const ensureMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    clearPodcastArtworkDisplayUriCacheForTesting();
    setPlatformOs('android');
    (NativeModules as {EskerraPodcastArtworkCache?: unknown}).EskerraPodcastArtworkCache = {
      ensureLocalArtworkFile: ensureMock,
    };
    ensureMock.mockResolvedValue('file:///data/user/0/com.eskerra/cache/podcast-artwork/abc123');
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: initialPlatform,
    });
  });

  test('passes through http(s) URIs without calling native', async () => {
    const uri = 'https://example.com/a.png';
    await expect(ensureLocalArtworkFileForDisplay(uri)).resolves.toBe(uri);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  test('copies renderable content:// URIs on Android', async () => {
    const content =
      'content://com.android.externalstorage.documents/tree/primary%3ANotes/document/primary%3ANotes%2F.eskerra%2Fx.jpg';
    await expect(ensureLocalArtworkFileForDisplay(content)).resolves.toBe(
      'file:///data/user/0/com.eskerra/cache/podcast-artwork/abc123',
    );
    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(ensureMock).toHaveBeenCalledWith(content);

    await expect(ensureLocalArtworkFileForDisplay(content)).resolves.toBe(
      'file:///data/user/0/com.eskerra/cache/podcast-artwork/abc123',
    );
    expect(ensureMock).toHaveBeenCalledTimes(1);
  });

  test('does not call native for non-document content URIs', async () => {
    const bad = 'content://com.example/tree/primary%3ANotes/podcast-images/x.jpg';
    await expect(ensureLocalArtworkFileForDisplay(bad)).resolves.toBe(bad);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  test('skips native module when not on Android', async () => {
    setPlatformOs('ios');
    const content =
      'content://com.android.externalstorage.documents/tree/primary/document/x.jpg';
    await expect(ensureLocalArtworkFileForDisplay(content)).resolves.toBe(content);
    expect(ensureMock).not.toHaveBeenCalled();
  });
});

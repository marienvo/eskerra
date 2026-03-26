import {useEffect, useState} from 'react';

import {
  ensureLocalArtworkFileForDisplay,
} from '../../../core/storage/androidPodcastArtworkCache';

function synchronousDisplayUri(artworkUri: string | null): string | null {
  if (artworkUri == null) {
    return null;
  }
  const trimmed = artworkUri.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.startsWith('content://')) {
    return trimmed;
  }
  return null;
}

/**
 * Resolves podcast artwork for React Native Image: internal `file://` and remote URLs are used
 * as-is. Legacy vault `content://` URIs are copied to a `file://` cache path off the UI thread
 * on Android to avoid ANRs from ContentResolver.
 */
export function usePodcastArtworkDisplayUri(
  artworkUri: string | null,
): string | null {
  const [displayUri, setDisplayUri] = useState<string | null>(() =>
    synchronousDisplayUri(artworkUri),
  );

  useEffect(() => {
    const sync = synchronousDisplayUri(artworkUri);
    if (sync !== null) {
      setDisplayUri(sync);
      return;
    }

    const trimmed = artworkUri?.trim() ?? '';
    if (!trimmed.startsWith('content://')) {
      setDisplayUri(null);
      return;
    }

    let cancelled = false;

    ensureLocalArtworkFileForDisplay(trimmed)
      .then(uri => {
        if (!cancelled) {
          setDisplayUri(uri.trim() || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDisplayUri(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artworkUri]);

  return displayUri;
}

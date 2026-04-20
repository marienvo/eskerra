import {useEffect, useRef, useState} from 'react';

import {
  getCachedLinkRichEntry,
  prefetchLinkRichPreview,
  subscribeLinkRichPreviewUpdates,
  type LinkRichMetadata,
} from '../lib/linkRichPreviewCache';

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

type Props = {
  url: string;
  /** Doc offset of the URL, forwarded to the open-link callback. */
  at: number;
  inline?: boolean;
  onOpenLink: (payload: {href: string; at: number}) => void;
};

/**
 * Rich-link preview card for read-mode surfaces. Mirrors the CodeMirror `LinkRichPreviewWidget`
 * visually; uses the same IndexedDB cache and subscriber mechanism.
 */
export function LinkRichPreviewCard({url, at, inline = false, onOpenLink}: Props): React.ReactElement {
  const [metadata, setMetadata] = useState<LinkRichMetadata | null>(() => {
    const entry = getCachedLinkRichEntry(url);
    return entry?.status === 'ok' ? entry.metadata : null;
  });

  useEffect(() => {
    if (!getCachedLinkRichEntry(url)) {
      prefetchLinkRichPreview(url);
    }
    return subscribeLinkRichPreviewUpdates(() => {
      const e = getCachedLinkRichEntry(url);
      setMetadata(e?.status === 'ok' ? e.metadata : null);
    });
  }, [url]);

  const candidates = metadata?.imageCandidates ?? [];
  const [imgIndex, setImgIndex] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [allFailed, setAllFailed] = useState(false);

  const prevFirstCandidateRef = useRef<string | undefined>(candidates[0]);
  if (prevFirstCandidateRef.current !== candidates[0]) {
    prevFirstCandidateRef.current = candidates[0];
    setImgIndex(0);
    setImgLoaded(false);
    setAllFailed(false);
  }

  const currentSrc = candidates[imgIndex];
  const noImage = allFailed || candidates.length === 0;

  const className = [
    'cm-link-rich-preview',
    inline ? 'cm-link-rich-preview--inline' : '',
    imgLoaded ? 'cm-link-rich-preview--with-image' : '',
    noImage ? 'cm-link-rich-preview--no-image' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      className={className}
      href={url}
      data-url={url}
      rel="noreferrer noopener"
      target="_blank"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        onOpenLink({href: url, at});
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="cm-link-rich-preview__thumb">
        {currentSrc != null && (
          <img
            className="cm-link-rich-preview__img"
            src={currentSrc}
            decoding="async"
            loading="lazy"
            referrerPolicy="no-referrer"
            alt=""
            onLoad={() => setImgLoaded(true)}
            onError={() => {
              if (imgIndex + 1 < candidates.length) {
                setImgIndex(i => i + 1);
              } else {
                setAllFailed(true);
              }
            }}
          />
        )}
      </div>
      <div className="cm-link-rich-preview__body">
        <div className="cm-link-rich-preview__title">{metadata?.title ?? url}</div>
        <div className="cm-link-rich-preview__site">
          {metadata?.siteName ?? hostnameOf(url)}
        </div>
      </div>
    </a>
  );
}

import {useEffect, useRef, useState} from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';

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
  onMuteDomain?: (domain: string) => void;
};

/**
 * Rich-link preview card for read-mode surfaces. Mirrors the CodeMirror `LinkRichPreviewWidget`
 * visually; uses the same IndexedDB cache and subscriber mechanism.
 */
export function LinkRichPreviewCard({url, at, inline = false, onOpenLink, onMuteDomain}: Props): React.ReactElement {
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

  const card = (
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

  if (!onMuteDomain) {
    return card;
  }

  const domain = hostnameOf(url);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{card}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="note-list-context-menu" collisionPadding={8}>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            onSelect={() => onMuteDomain(domain)}
          >
            Hide snippets from {domain}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

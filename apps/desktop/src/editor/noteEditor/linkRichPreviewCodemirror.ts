import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

import {
  getCachedLinkRichEntry,
  type LinkRichMetadata,
  prefetchLinkRichPreview,
  subscribeLinkRichPreviewUpdates,
} from '../../lib/linkRichPreviewCache';
import {parseLoneLinkLine} from '../../lib/parseLoneLinkLine';

export type LinkRichPreviewRefs = {
  /** Called when the user clicks the card. Should open the URL in the system browser. */
  onOpenLink: (href: string, at: number) => void;
};

/** Dispatched by the cache-listener ViewPlugin when new metadata is available. */
const linkRichCacheBumpEffect = StateEffect.define<null>();

class LinkRichPreviewWidget extends WidgetType {
  readonly url: string;
  readonly urlDocOffset: number;
  readonly metadata: LinkRichMetadata | null;
  readonly refs: LinkRichPreviewRefs;
  readonly inline: boolean;

  constructor(
    url: string,
    urlDocOffset: number,
    metadata: LinkRichMetadata | null,
    refs: LinkRichPreviewRefs,
    inline: boolean = false,
  ) {
    super();
    this.url = url;
    this.urlDocOffset = urlDocOffset;
    this.metadata = metadata;
    this.refs = refs;
    this.inline = inline;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof LinkRichPreviewWidget &&
      this.url === other.url &&
      this.urlDocOffset === other.urlDocOffset &&
      this.inline === other.inline &&
      metadataEq(this.metadata, other.metadata)
    );
  }

  toDOM(): HTMLElement {
    const card = document.createElement('a');
    card.className = this.inline
      ? 'cm-link-rich-preview cm-link-rich-preview--inline'
      : 'cm-link-rich-preview';
    card.setAttribute('data-url', this.url);
    card.href = this.url;
    card.rel = 'noreferrer noopener';
    card.target = '_blank';
    card.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      this.refs.onOpenLink(this.url, this.urlDocOffset);
    });
    card.addEventListener('mousedown', e => {
      e.stopPropagation();
    });

    const thumb = document.createElement('div');
    thumb.className = 'cm-link-rich-preview__thumb';
    const img = document.createElement('img');
    img.className = 'cm-link-rich-preview__img';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.alt = '';
    const candidates = (this.metadata?.imageCandidates ?? []).slice();
    const tryNextImage = () => {
      const next = candidates.shift();
      if (next == null) {
        card.classList.add('cm-link-rich-preview--no-image');
        return;
      }
      img.src = next;
    };
    img.addEventListener('error', tryNextImage);
    img.addEventListener('load', () => {
      card.classList.add('cm-link-rich-preview--with-image');
    });
    tryNextImage();
    thumb.appendChild(img);

    const body = document.createElement('div');
    body.className = 'cm-link-rich-preview__body';
    const title = document.createElement('div');
    title.className = 'cm-link-rich-preview__title';
    title.textContent = this.metadata?.title ?? this.url;
    const site = document.createElement('div');
    site.className = 'cm-link-rich-preview__site';
    site.textContent = this.metadata?.siteName ?? hostnameOf(this.url);
    body.appendChild(title);
    body.appendChild(site);

    card.appendChild(thumb);
    card.appendChild(body);
    return card;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function metadataEq(a: LinkRichMetadata | null, b: LinkRichMetadata | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.title === b.title &&
    a.siteName === b.siteName &&
    a.finalUrl === b.finalUrl &&
    a.imageCandidates.length === b.imageCandidates.length &&
    a.imageCandidates.every((u, i) => u === b.imageCandidates[i])
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function collectCaretLineFroms(state: EditorState): Set<number> {
  const {doc, selection} = state;
  const lineFroms = new Set<number>();
  for (const r of selection.ranges) {
    const startLine = doc.lineAt(r.from);
    const endLine = doc.lineAt(Math.min(r.to, doc.length));
    for (let n = startLine.number; n <= endLine.number; n++) {
      lineFroms.add(doc.line(n).from);
    }
  }
  return lineFroms;
}

function buildLinkRichDecorations(
  state: EditorState,
  refs: LinkRichPreviewRefs,
): DecorationSet {
  const {doc} = state;
  const caretLineFroms = collectCaretLineFroms(state);
  const ranges: Range<Decoration>[] = [];

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const parsed = parseLoneLinkLine(line.text);
    if (!parsed) {
      continue;
    }
    const entry = getCachedLinkRichEntry(parsed.url);
    const metadata = entry && entry.status === 'ok' ? entry.metadata : null;
    if (!entry) {
      prefetchLinkRichPreview(parsed.url);
    }
    const urlDocOffset = line.from + parsed.urlOffset;
    const prefix = line.text.slice(0, parsed.urlOffset);
    const hasListMarker = /\S/.test(prefix);

    if (caretLineFroms.has(line.from)) {
      ranges.push(
        Decoration.widget({
          widget: new LinkRichPreviewWidget(parsed.url, urlDocOffset, metadata, refs),
          block: true,
          side: 1,
        }).range(line.to),
      );
      continue;
    }

    if (hasListMarker) {
      // Replace just the URL with an inline card so the list marker stays visible on its line.
      ranges.push(
        Decoration.replace({
          widget: new LinkRichPreviewWidget(
            parsed.url,
            urlDocOffset,
            metadata,
            refs,
            true,
          ),
        }).range(urlDocOffset, line.to),
      );
      continue;
    }

    let to = line.to;
    if (to < doc.length && doc.sliceString(to, to + 1) === '\n') {
      to += 1;
    }
    ranges.push(
      Decoration.replace({
        widget: new LinkRichPreviewWidget(parsed.url, urlDocOffset, metadata, refs),
        block: true,
      }).range(line.from, to),
    );
  }

  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

/**
 * Rich link previews for lines whose sole content is an `http(s)://` URL (with optional list
 * marker). Uses {@link getCachedLinkRichEntry} / {@link prefetchLinkRichPreview} so the widget
 * flips from a URL-only placeholder to a full title + artwork card as soon as metadata arrives.
 *
 * Block-level replace/widget decorations must come from a StateField (see vaultImagePreviewCodemirror).
 */
export function linkRichPreviewExtension(refs: LinkRichPreviewRefs): Extension {
  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildLinkRichDecorations(state, refs);
    },
    update(value, tr) {
      const cacheBumped = tr.effects.some(e => e.is(linkRichCacheBumpEffect));
      if (!tr.docChanged && tr.selection === undefined && !cacheBumped) {
        return value;
      }
      return buildLinkRichDecorations(tr.state, refs);
    },
    provide: self => EditorView.decorations.from(self),
  });

  const cacheListenerPlugin = ViewPlugin.fromClass(
    class {
      unsubscribe: () => void;
      pending = false;
      constructor(view: EditorView) {
        this.unsubscribe = subscribeLinkRichPreviewUpdates(() => {
          if (this.pending) {
            return;
          }
          this.pending = true;
          queueMicrotask(() => {
            this.pending = false;
            view.dispatch({effects: linkRichCacheBumpEffect.of(null)});
          });
        });
      }
      update(_update: ViewUpdate) {
        /* no-op; rebuild is driven by StateField */
      }
      destroy() {
        this.unsubscribe();
      }
    },
  );

  return [field, cacheListenerPlugin];
}

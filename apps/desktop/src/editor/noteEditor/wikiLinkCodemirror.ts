import {Facet, type Extension, type Range} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

const WIKI_LINK_LINE_RE = /\[\[([^[\]]+)\]\]/g;

type WikiLinkTargetIsResolved = (inner: string) => boolean;

/** Read by wiki-link decorations; shell provides the predicate via `wikiLinkResolvedHighlightExtensions`. */
export const wikiLinkIsResolvedFacet = Facet.define<
  WikiLinkTargetIsResolved,
  WikiLinkTargetIsResolved
>({
  combine: values =>
    values.length > 0
      ? values[values.length - 1]!
      : () => false,
});

function buildWikiLinkDecorations(view: EditorView): DecorationSet {
  const isResolved = view.state.facet(wikiLinkIsResolvedFacet);
  const {doc} = view.state;
  const ranges: Range<Decoration>[] = [];

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    WIKI_LINK_LINE_RE.lastIndex = 0;
    let match = WIKI_LINK_LINE_RE.exec(text);
    while (match) {
      const start = match.index;
      const fullLen = match[0].length;
      const from = line.from + start;
      const to = from + fullLen;
      const inner = match[1]!;
      const innerClass = isResolved(inner)
        ? 'cm-wiki-link cm-wiki-link--resolved'
        : 'cm-wiki-link cm-wiki-link--unresolved';
      ranges.push(
        Decoration.mark({class: 'cm-md-wiki-bracket'}).range(from, from + 2),
      );
      ranges.push(Decoration.mark({class: innerClass}).range(from + 2, to - 2));
      ranges.push(
        Decoration.mark({class: 'cm-md-wiki-bracket'}).range(to - 2, to),
      );
      match = WIKI_LINK_LINE_RE.exec(text);
    }
  }

  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

/**
 * Highlights `[[wiki-style]]` spans: resolved vs unresolved using the same stem-resolve policy as navigation.
 * Opening/closing brackets use the same muted tone as other markdown marks; inner text is interactive.
 */
export function wikiLinkResolvedHighlightExtensions(
  isResolved: WikiLinkTargetIsResolved,
): Extension {
  const wikiLinkHighlight = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildWikiLinkDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildWikiLinkDecorations(update.view);
        }
      }
    },
    {decorations: instance => instance.decorations},
  );

  return [wikiLinkIsResolvedFacet.of(isResolved), wikiLinkHighlight];
}

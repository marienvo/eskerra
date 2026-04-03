import {Facet, type Extension} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

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

/**
 * Highlights `[[wiki-style]]` spans: resolved vs unresolved using the same inbox policy as navigation.
 */
export function wikiLinkResolvedHighlightExtensions(
  isResolved: WikiLinkTargetIsResolved,
): Extension {
  const wikiLinkMatcher = new MatchDecorator({
    regexp: /\[\[([^[\]]+)\]\]/g,
    decoration: (match, view) => {
      const inner = match[1];
      const resolved = view.state.facet(wikiLinkIsResolvedFacet)(inner);
      return Decoration.mark({
        class: resolved
          ? 'cm-wiki-link cm-wiki-link--resolved'
          : 'cm-wiki-link cm-wiki-link--unresolved',
      });
    },
  });

  const wikiLinkHighlight = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = wikiLinkMatcher.createDeco(view);
      }

      update(update: ViewUpdate) {
        this.decorations = wikiLinkMatcher.updateDeco(update, this.decorations);
      }
    },
    {decorations: instance => instance.decorations},
  );

  return [wikiLinkIsResolvedFacet.of(isResolved), wikiLinkHighlight];
}

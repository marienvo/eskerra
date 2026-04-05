import {ensureSyntaxTree, syntaxTree} from '@codemirror/language';
import {Facet, type Extension, type Range} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

import {isActivatableRelativeMarkdownHref} from './markdownActivatableRelativeHref';
import {relativeMarkdownLinkLabelSpan} from './relativeMarkdownLinkLabelSpan';

const TREE_ENSURE_BUDGET_MS = 200;

type RelativeMdLinkHrefIsResolved = (href: string) => boolean;

/** Shell provides the predicate for resolved vs unresolved relative `.md` href highlighting. */
export const relativeMdLinkHrefIsResolvedFacet = Facet.define<
  RelativeMdLinkHrefIsResolved,
  RelativeMdLinkHrefIsResolved
>({
  combine: values =>
    values.length > 0 ? values[values.length - 1]! : () => false,
});

/** Builds relative `.md` link highlight decorations (label + URL under `Link`). Exported for tests. */
export function buildRelativeMdLinkDecorations(view: EditorView): DecorationSet {
  const isResolved = view.state.facet(relativeMdLinkHrefIsResolvedFacet);
  ensureSyntaxTree(view.state, view.state.doc.length, TREE_ENSURE_BUDGET_MS);
  const tree = syntaxTree(view.state);
  const ranges: Range<Decoration>[] = [];
  tree.iterate({
    enter(ref) {
      if (ref.name !== 'URL') {
        return;
      }
      const parent = ref.node.parent;
      if (parent == null || parent.name !== 'Link') {
        return;
      }
      const href = view.state.sliceDoc(ref.from, ref.to);
      if (!isActivatableRelativeMarkdownHref(href)) {
        return;
      }
      const labelClass = isResolved(href)
        ? 'cm-md-rel-link cm-md-rel-link--resolved'
        : 'cm-md-rel-link cm-md-rel-link--unresolved';
      const hrefClass = `${labelClass} cm-md-rel-link-href`;
      ranges.push(Decoration.mark({class: hrefClass}).range(ref.from, ref.to));
      const labelSpan = relativeMarkdownLinkLabelSpan(parent, (a, b) =>
        view.state.sliceDoc(a, b),
      );
      if (labelSpan != null) {
        ranges.push(
          Decoration.mark({class: labelClass}).range(
            labelSpan.from,
            labelSpan.to,
          ),
        );
      }
    },
  });
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

/** Highlights inline link label and URL for relative vault `.md` targets (not images). */
export function markdownRelativeLinkHighlightExtensions(
  hrefIsResolved: RelativeMdLinkHrefIsResolved,
): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildRelativeMdLinkDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildRelativeMdLinkDecorations(update.view);
        }
      }
    },
    {decorations: instance => instance.decorations},
  );

  return [relativeMdLinkHrefIsResolvedFacet.of(hrefIsResolved), plugin];
}

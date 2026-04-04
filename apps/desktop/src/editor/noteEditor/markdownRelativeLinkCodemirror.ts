import {ensureSyntaxTree, syntaxTree} from '@codemirror/language';
import type {SyntaxNode} from '@lezer/common';
import {Facet, type Extension, type Range} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

const TREE_ENSURE_BUDGET_MS = 200;

/**
 * Visible link label span inside a Lezer `Link`.
 * Inline `[text](url)` often has no `LinkLabel` node (only `LinkMark` brackets); reference
 * links may use `LinkLabel` for the ref segment.
 */
function relativeMarkdownLinkLabelSpan(
  link: SyntaxNode,
  sliceDoc: (from: number, to: number) => string,
): {from: number; to: number} | null {
  const linkLabel = link.getChild('LinkLabel');
  if (linkLabel != null && linkLabel.to > linkLabel.from) {
    return {from: linkLabel.from, to: linkLabel.to};
  }
  const open = link.firstChild;
  if (
    open == null
    || open.name !== 'LinkMark'
    || sliceDoc(open.from, open.to) !== '['
  ) {
    return null;
  }
  const labelFrom = open.to;
  for (let c: SyntaxNode | null = open.nextSibling; c; c = c.nextSibling) {
    if (c.name === 'LinkMark' && sliceDoc(c.from, c.to) === ']') {
      const labelTo = c.from;
      return labelTo > labelFrom ? {from: labelFrom, to: labelTo} : null;
    }
  }
  return null;
}

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
      const hrefClass = isResolved(href)
        ? 'cm-md-rel-link cm-md-rel-link--resolved'
        : 'cm-md-rel-link cm-md-rel-link--unresolved';
      ranges.push(Decoration.mark({class: hrefClass}).range(ref.from, ref.to));
      const labelSpan = relativeMarkdownLinkLabelSpan(parent, (a, b) =>
        view.state.sliceDoc(a, b),
      );
      if (labelSpan != null) {
        ranges.push(
          Decoration.mark({class: hrefClass}).range(
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

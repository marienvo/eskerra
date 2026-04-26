import {syntaxTree} from '@codemirror/language';
import type {EditorState} from '@codemirror/state';
import type {SyntaxNode} from '@lezer/common';

import {relativeMarkdownLinkLabelSpan} from './relativeMarkdownLinkLabelSpan';

export type ActivatableRelativeMdLinkHit = {
  href: string;
  hrefFrom: number;
  hrefTo: number;
};

/** Label text plus the caret slot immediately before the closing `]` (span.to is that offset). */
function posInActivatableLabelSpan(
  pos: number,
  span: {from: number; to: number} | null,): boolean {
  if (span == null) {
    return false;
  }
  return pos >= span.from && pos <= span.to;
}

function activatableRelativeMdLinkFromLinkNode(
  state: EditorState,
  pos: number,
  linkNode: SyntaxNode,
  hrefIsActivatable: (href: string) => boolean,
): ActivatableRelativeMdLinkHit | null {
  const url = linkNode.getChild('URL');
  if (url == null) {
    return null;
  }
  const href = state.sliceDoc(url.from, url.to);
  if (!hrefIsActivatable(href)) {
    return null;
  }
  const labelSpan = relativeMarkdownLinkLabelSpan(linkNode, (a, b) =>
    state.sliceDoc(a, b),
  );
  const inUrl = pos >= url.from && pos <= url.to;
  const inLabel = posInActivatableLabelSpan(pos, labelSpan);
  if (!inUrl && !inLabel) {
    return null;
  }
  return {href, hrefFrom: url.from, hrefTo: url.to};
}

/**
 * Vault navigation for `[label](href)` only on styled label + URL spans (excludes `LinkMark`
 * bracket and paren characters).
 */
export function markdownActivatableRelativeMdLinkAtPosition(
  state: EditorState,
  pos: number,
  hrefIsActivatable: (href: string) => boolean,
): ActivatableRelativeMdLinkHit | null {
  const tree = syntaxTree(state);
  const node = tree.resolveInner(pos, -1);
  for (let n: typeof node | null = node; n; n = n.parent) {
    if (n.name === 'Image') {
      return null;
    }
    if (n.name === 'Link') {
      return activatableRelativeMdLinkFromLinkNode(state, pos, n, hrefIsActivatable);
    }
  }
  return null;
}

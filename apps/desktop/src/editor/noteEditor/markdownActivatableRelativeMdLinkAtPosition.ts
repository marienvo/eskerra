import {syntaxTree} from '@codemirror/language';
import type {EditorState} from '@codemirror/state';

import {relativeMarkdownLinkLabelSpan} from './relativeMarkdownLinkLabelSpan';

export type ActivatableRelativeMdLinkHit = {
  href: string;
  hrefFrom: number;
  hrefTo: number;
};

function posInHalfOpenSpan(
  pos: number,
  span: {from: number; to: number} | null,
): boolean {
  if (span == null) {
    return false;
  }
  return pos >= span.from && pos < span.to;
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
      const url = n.getChild('URL');
      if (url == null) {
        return null;
      }
      const href = state.sliceDoc(url.from, url.to);
      if (!hrefIsActivatable(href)) {
        return null;
      }
      const labelSpan = relativeMarkdownLinkLabelSpan(n, (a, b) =>
        state.sliceDoc(a, b),
      );
      const inUrl = pos >= url.from && pos < url.to;
      const inLabel = posInHalfOpenSpan(pos, labelSpan);
      if (!inUrl && !inLabel) {
        return null;
      }
      return {href, hrefFrom: url.from, hrefTo: url.to};
    }
  }
  return null;
}

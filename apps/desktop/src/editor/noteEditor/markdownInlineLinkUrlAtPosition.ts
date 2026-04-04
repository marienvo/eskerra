import {syntaxTree} from '@codemirror/language';
import type {EditorState} from '@codemirror/state';

/**
 * If `pos` lies in an inline `[label](url)` link (not `![image](url)`), returns the URL slice and range.
 */
export function markdownInlineLinkUrlAtPosition(
  state: EditorState,
  pos: number,
): {href: string; hrefFrom: number; hrefTo: number} | null {
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
      return {
        href: state.sliceDoc(url.from, url.to),
        hrefFrom: url.from,
        hrefTo: url.to,
      };
    }
  }
  return null;
}

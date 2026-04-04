import type {SyntaxNode} from '@lezer/common';

/**
 * Visible link label span inside a Lezer `Link`.
 * Inline `[text](url)` often has no `LinkLabel` node (only `LinkMark` brackets); reference
 * links may use `LinkLabel` for the ref segment.
 */
export function relativeMarkdownLinkLabelSpan(
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

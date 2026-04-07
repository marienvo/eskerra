/** Pointer → UTF-16 offset for Today Hub static cell DOM (same layout as read-only rich text). */

/** Local UTF-16 offset within `root` (sum of text-node lengths under root). */
function utf16OffsetFromPointer(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
  const doc = root.ownerDocument;
  let offsetNode: Node | null = null;
  let offset = 0;

  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(clientX, clientY);
    if (pos && root.contains(pos.offsetNode)) {
      offsetNode = pos.offsetNode;
      offset = pos.offset;
    }
  }
  if (offsetNode == null && doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(clientX, clientY);
    if (range && root.contains(range.startContainer)) {
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        offsetNode = range.startContainer;
        offset = range.startOffset;
      }
    }
  }
  if (offsetNode == null || offsetNode.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  let total = 0;
  const tw = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = tw.nextNode())) {
    if (n === offsetNode) {
      return total + offset;
    }
    total += (n as Text).length;
  }
  return null;
}

/** UTF-16 document offset for a primary click inside the static hub cell (for opening edit at the same place). */
export function todayHubStaticCellDocOffsetFromPointer(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
  const lineEls = root.querySelectorAll<HTMLElement>('[data-doc-line-from]');
  for (const el of lineEls) {
    const local = utf16OffsetFromPointer(el, clientX, clientY);
    if (local != null) {
      const from = Number(el.dataset.docLineFrom);
      return from + local;
    }
  }
  return null;
}

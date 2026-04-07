import {ensureSyntaxTree} from '@codemirror/language';
import {useMemo, type MutableRefObject, type ReactElement} from 'react';

import {isBrowserOpenableMarkdownHref} from '@eskerra/core';

import {isActivatableRelativeMarkdownHref} from '../editor/noteEditor/markdownActivatableRelativeHref';
import {markdownBareBrowserUrlAtPosition} from '../editor/noteEditor/markdownBareUrl';
import {markdownActivatableRelativeMdLinkAtPosition} from '../editor/noteEditor/markdownActivatableRelativeMdLinkAtPosition';
import {wikiLinkActivatableInnerAtDocPosition} from '../editor/noteEditor/wikiLinkInnerAtDocPosition';
import {
  buildTodayHubCellStaticViewModel,
  clipSegmentsToRange,
} from '../lib/todayHubCellStaticView';
import {
  inboxRelativeMarkdownLinkHrefIsResolved,
  inboxWikiLinkTargetIsResolved,
} from '../lib/inboxWikiLinkNavigation';

const HIT_TREE_MS = 200;

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

function docOffsetFromPointerInStaticRich(
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

export type TodayHubCellStaticRichTextProps = {
  cellText: string;
  rowUri: string;
  vaultRoot: string;
  wikiNavParentRef: MutableRefObject<string | null>;
  noteRefs: readonly {name: string; uri: string}[];
  onWikiLinkActivate: (payload: {inner: string; at: number}) => void;
  onMarkdownRelativeLinkActivate: (payload: {href: string; at: number}) => void;
  onMarkdownExternalLinkOpen: (payload: {href: string; at: number}) => void;
};

/**
 * Read-only markdown for an inactive hub column: same Lezer segments + `cm-md-*` / link classes as
 * CodeMirror; line-level classes match `markdownBlockLineStyle` for block spacing parity with edit mode.
 */
export function TodayHubCellStaticRichText({
  cellText,
  rowUri,
  vaultRoot,
  wikiNavParentRef,
  noteRefs,
  onWikiLinkActivate,
  onMarkdownRelativeLinkActivate,
  onMarkdownExternalLinkOpen,
}: TodayHubCellStaticRichTextProps): ReactElement | null {
  const {hitState, lines, segments} = useMemo(
    () =>
      buildTodayHubCellStaticViewModel(cellText, {
        wikiTargetIsResolved: inner => inboxWikiLinkTargetIsResolved(noteRefs, inner),
        relativeMarkdownLinkHrefIsResolved: href =>
          inboxRelativeMarkdownLinkHrefIsResolved(noteRefs, rowUri, vaultRoot, href),
      }),
    [cellText, noteRefs, rowUri, vaultRoot],
  );

  if (cellText.length === 0) {
    return null;
  }

  return (
    <div className="note-markdown-editor-host today-hub-canvas__markdown-token-scope">
      <div
        className="today-hub-canvas__cell-static-rich"
        onPointerDown={e => {
          if (e.button !== 0 || e.shiftKey) {
            return;
          }
          const root = e.currentTarget;
          const pos = docOffsetFromPointerInStaticRich(root, e.clientX, e.clientY);
          if (pos == null) {
            return;
          }
          wikiNavParentRef.current = rowUri;
          ensureSyntaxTree(hitState, cellText.length, HIT_TREE_MS);
          const inner = wikiLinkActivatableInnerAtDocPosition(hitState.doc, pos);
          if (inner != null) {
            e.preventDefault();
            e.stopPropagation();
            onWikiLinkActivate({inner, at: pos});
            return;
          }
          const relHit = markdownActivatableRelativeMdLinkAtPosition(
            hitState,
            pos,
            isActivatableRelativeMarkdownHref,
          );
          if (relHit != null) {
            e.preventDefault();
            e.stopPropagation();
            onMarkdownRelativeLinkActivate({
              href: relHit.href,
              at: relHit.hrefFrom,
            });
            return;
          }
          const extHit = markdownActivatableRelativeMdLinkAtPosition(
            hitState,
            pos,
            isBrowserOpenableMarkdownHref,
          );
          if (extHit != null) {
            e.preventDefault();
            e.stopPropagation();
            onMarkdownExternalLinkOpen({
              href: extHit.href,
              at: extHit.hrefFrom,
            });
            return;
          }
          const bareHit = markdownBareBrowserUrlAtPosition(hitState, pos);
          if (bareHit != null) {
            e.preventDefault();
            e.stopPropagation();
            onMarkdownExternalLinkOpen({
              href: bareHit.href,
              at: bareHit.hrefFrom,
            });
          }
        }}
      >
        {lines.map(line => {
          const rangeEnd = line.from + line.text.length;
          const lineSegments = clipSegmentsToRange(segments, line.from, rangeEnd);
          return (
            <div
              key={line.from}
              className={line.lineClassName}
              data-doc-line-from={line.from}
            >
              {lineSegments.map((seg, i) => (
                <span
                  key={`${line.from}-${seg.from}-${seg.to}-${i}-${seg.className}`}
                  className={seg.className || undefined}
                >
                  {cellText.slice(seg.from, seg.to)}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

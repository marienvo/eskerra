import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import {useMemo, type ReactElement} from 'react';

import {isBrowserOpenableMarkdownHref} from '@eskerra/core';

import {isActivatableRelativeMarkdownHref} from '../markdownActivatableRelativeHref';
import {markdownBareBrowserUrlAtPosition} from '../markdownBareUrl';
import {markdownActivatableRelativeMdLinkAtPosition} from '../markdownActivatableRelativeMdLinkAtPosition';
import {markdownEskerra} from '../markdownEskerraLanguage';
import {noteMarkdownParserExtensions} from '../markdownEditorStyling';
import {relativeMdLinkHrefIsResolvedFacet} from '../markdownRelativeLinkCodemirror';
import {wikiLinkPointerActivatableInnerAtDocPosition} from '../wikiLinkInnerAtDocPosition';
import {wikiLinkIsResolvedFacet} from '../wikiLinkCodemirror';
import {buildCellStaticSegments} from './eskerraTableCellStaticSegments';
import {eskerraTableShellLinkBridgeFacet} from './eskerraTableShellLinkBridgeFacet';

const HIT_TREE_MS = 200;

export type EskerraTableCellStaticRichTextProps = {
  parentView: EditorView;
  cellText: string;
  staticRichPaintKey: number;
};

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

/**
 * Read-only rich inline markdown for an inactive shell cell: same `cm-*` classes as nested CodeMirror.
 */
export function EskerraTableCellStaticRichText(
  props: EskerraTableCellStaticRichTextProps,
): ReactElement | null {
  const {parentView, cellText, staticRichPaintKey} = props;

  const segments = useMemo(() => {
    const wikiTargetIsResolved = parentView.state.facet(wikiLinkIsResolvedFacet);
    const relativeMarkdownLinkHrefIsResolved = parentView.state.facet(
      relativeMdLinkHrefIsResolvedFacet,
    );
    return buildCellStaticSegments(cellText, {
      wikiTargetIsResolved,
      relativeMarkdownLinkHrefIsResolved,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- staticRichPaintKey bumps when link facets refresh (stable EditorView)
  }, [cellText, parentView, staticRichPaintKey]);

  const hitState = useMemo(
    () =>
      EditorState.create({
        doc: cellText,
        extensions: [
          markdownEskerra({
            base: commonmarkLanguage,
            extensions: noteMarkdownParserExtensions,
          }),
        ],
      }),
    [cellText],
  );

  if (cellText.length === 0) {
    return null;
  }

  return (
    <div
      className="cm-eskerra-table-shell__cell-static-rich"
      onPointerDown={e => {
        if (e.button !== 0 || e.shiftKey) {
          return;
        }
        const bridge = parentView.state.facet(eskerraTableShellLinkBridgeFacet);
        if (!bridge) {
          return;
        }
        const root = e.currentTarget;
        const pos = utf16OffsetFromPointer(root, e.clientX, e.clientY);
        if (pos == null) {
          return;
        }
        ensureSyntaxTree(hitState, cellText.length, HIT_TREE_MS);
        const inner = wikiLinkPointerActivatableInnerAtDocPosition(
          hitState.doc,
          pos,
        );
        if (inner != null) {
          e.preventDefault();
          e.stopPropagation();
          bridge.onWikiLinkActivate({inner, at: pos});
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
          bridge.onMarkdownRelativeLinkActivate({
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
          bridge.onMarkdownExternalLinkOpen({
            href: extHit.href,
            at: extHit.hrefFrom,
          });
          return;
        }
        const bareHit = markdownBareBrowserUrlAtPosition(hitState, pos);
        if (bareHit != null) {
          e.preventDefault();
          e.stopPropagation();
          bridge.onMarkdownExternalLinkOpen({
            href: bareHit.href,
            at: bareHit.hrefFrom,
          });
        }
      }}
    >
      {segments.map((seg, i) => (
        <span
          key={`${staticRichPaintKey}-${seg.from}-${seg.to}-${i}`}
          className={seg.className || undefined}
        >
          {cellText.slice(seg.from, seg.to)}
        </span>
      ))}
    </div>
  );
}

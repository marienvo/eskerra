import {ensureSyntaxTree} from '@codemirror/language';
import {useMemo, type MutableRefObject, type ReactElement} from 'react';

import {isBrowserOpenableMarkdownHref, wikiLinkInnerBrowserOpenableHref} from '@eskerra/core';

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
import {
  todayHubStaticCellDocOffsetFromPointer,
  todayHubStaticRichTextPointerHitsVisibleLinkToken,
} from '../lib/todayHubCellStaticPointer';
import type {
  VaultRelativeMarkdownLinkActivatePayload,
  VaultWikiLinkActivatePayload,
} from '../editor/noteEditor/vaultLinkActivatePayload';

const HIT_TREE_MS = 200;

export type TodayHubCellStaticRichTextProps = {
  cellText: string;
  rowUri: string;
  vaultRoot: string;
  wikiNavParentRef: MutableRefObject<string | null>;
  noteRefs: readonly {name: string; uri: string}[];
  onWikiLinkActivate: (payload: VaultWikiLinkActivatePayload) => void;
  onMarkdownRelativeLinkActivate: (
    payload: VaultRelativeMarkdownLinkActivatePayload,
  ) => void;
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
          const isPrimary = e.button === 0 && !e.shiftKey;
          const isMiddleVault = e.button === 1;
          if (!isPrimary && !isMiddleVault) {
            return;
          }
          const root = e.currentTarget;
          if (
            !todayHubStaticRichTextPointerHitsVisibleLinkToken(
              root,
              e.clientX,
              e.clientY,
            )
          ) {
            return;
          }
          const pos = todayHubStaticCellDocOffsetFromPointer(
            root,
            e.clientX,
            e.clientY,
          );
          if (pos == null) {
            return;
          }
          wikiNavParentRef.current = rowUri;
          ensureSyntaxTree(hitState, cellText.length, HIT_TREE_MS);
          const inner = wikiLinkActivatableInnerAtDocPosition(hitState.doc, pos);
          if (inner != null) {
            if (
              isMiddleVault
              && wikiLinkInnerBrowserOpenableHref(inner) != null
            ) {
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            onWikiLinkActivate({
              inner,
              at: pos,
              ...(isMiddleVault ? {openInBackgroundTab: true} : {}),
            });
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
              ...(isMiddleVault ? {openInBackgroundTab: true} : {}),
            });
            return;
          }
          if (!isPrimary) {
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

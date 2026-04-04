import type {EskerraTableModelV1} from '@notebox/core';
import {
  parseEskerraTableV1FromLines,
  serializeEskerraTableV1ToMarkdown,
} from '@notebox/core';
import {EditorSelection} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';

import {
  buildEskerraTableInsertWithBlankLines,
  findEskerraTableDocBlockByLineFrom,
  neededNewlinesBeforeTable,
} from './eskerraTableV1DocBlocks';
import {closeTableShellEffect, suppressTableWidgetAt} from './eskerraTableShellEffects';

/**
 * Persists draft if it serializes differently; does not close the shell. Used before save / close note.
 */
export function flushTableDraftToDocumentSilent(
  view: EditorView,
  headerLineFrom: number,
  model: EskerraTableModelV1,
): number | null {
  const block = findEskerraTableDocBlockByLineFrom(view.state.doc, headerLineFrom);
  if (!block) {
    return null;
  }
  const markdown = serializeEskerraTableV1ToMarkdown(model);
  const insert = buildEskerraTableInsertWithBlankLines(view.state.doc, block, markdown);
  const current = view.state.doc.sliceString(block.from, block.to);
  if (insert !== current) {
    const headerLineFrom =
      block.from + neededNewlinesBeforeTable(view.state.doc, block.from);
    view.dispatch({
      changes: {from: block.from, to: block.to, insert},
      scrollIntoView: false,
    });
    return headerLineFrom;
  }
  return block.lineFrom;
}

export function restoreTableBaseline(
  view: EditorView,
  headerLineFrom: number,
  baselineText: string,
): void {
  const block = findEskerraTableDocBlockByLineFrom(view.state.doc, headerLineFrom);
  if (!block) {
    view.dispatch({effects: closeTableShellEffect.of(null)});
    return;
  }
  view.dispatch({
    changes: {from: block.from, to: block.to, insert: baselineText},
    effects: closeTableShellEffect.of(null),
    scrollIntoView: true,
  });
}

/**
 * Commit current draft (if valid / changed), close shell, show raw markdown with suppression rail.
 */
export function commitThenEditTableAsMarkdown(
  view: EditorView,
  headerLineFrom: number,
  model: EskerraTableModelV1,
): void {
  const lfAfter = flushTableDraftToDocumentSilent(view, headerLineFrom, model);
  if (lfAfter == null) {
    view.dispatch({effects: closeTableShellEffect.of(null)});
    return;
  }
  view.dispatch({
    effects: [
      closeTableShellEffect.of(null),
      suppressTableWidgetAt.of({lineFrom: lfAfter}),
    ],
    selection: EditorSelection.cursor(lfAfter),
    scrollIntoView: true,
  });
  view.focus();
}

export function parseBlockLines(view: EditorView, headerLineFrom: number) {
  const block = findEskerraTableDocBlockByLineFrom(view.state.doc, headerLineFrom);
  if (!block) {
    return {ok: false as const, reason: 'missing_block'};
  }
  const raw = view.state.doc.sliceString(block.from, block.to).split('\n');
  return parseEskerraTableV1FromLines(raw);
}

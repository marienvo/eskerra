import {
  EditorSelection,
  Transaction,
  type Extension,
  type Text,
} from '@codemirror/state';
import {EditorView} from '@codemirror/view';

import {wikiLinkMatchAtDocPosition} from './wikiLinkInnerAtDocPosition';

const WIKI_EOL_LINE_RE = /\[\[([^[\]]+)\]\]\s*$/;

/** Must not collide with CodeMirror core user event names. */
export const WIKI_EOL_BRACKET_POINTER_FIX_USER_EVENT =
  'eskerra.select.eolWikiBracketFix';

/**
 * After primary pointer selection, move the caret past a trailing `]]` when it landed on hidden
 * closing brackets (non-marker-focus lines use `display:none` on those spans).
 */
export function wikiEOLCaretPointerFixExtension(): Extension {
  return EditorView.updateListener.of(update => {
    if (!update.selectionSet) {
      return;
    }

    for (const tr of update.transactions) {
      if (
        tr.annotation(Transaction.userEvent)
        === WIKI_EOL_BRACKET_POINTER_FIX_USER_EVENT
      ) {
        continue;
      }
      if (tr.annotation(Transaction.userEvent) !== 'select.pointer') {
        continue;
      }
      const sel = update.state.selection.main;
      if (!sel.empty) {
        continue;
      }
      const head = sel.head;
      const line = update.state.doc.lineAt(head);
      const fixTo = planCaretPastEOLWikiBrackets(update.state.doc, line, head);
      if (fixTo != null) {
        update.view.dispatch({
          selection: EditorSelection.cursor(fixTo),
          userEvent: WIKI_EOL_BRACKET_POINTER_FIX_USER_EVENT,
        });
        return;
      }
    }
  });
}

/**
 * If pointer selection landed on hidden `]]` at end of line, return document offset after the line
 * (past `]]`); otherwise `null`.
 */
export function planCaretPastEOLWikiBrackets(
  doc: Text,
  line: {from: number; to: number; text: string},
  head: number,
): number | null {
  const {text, from: lineFrom, to: lineTo} = line;
  if (!text.endsWith(']]')) {
    return null;
  }
  const wikiEol = WIKI_EOL_LINE_RE.exec(text);
  if (!wikiEol) {
    return null;
  }
  const wikiBlockEnd =
    lineFrom + wikiEol.index + wikiEol[0].trimEnd().length;
  if (wikiBlockEnd !== lineTo) {
    return null;
  }
  const probeInner = wikiLinkMatchAtDocPosition(
    doc,
    lineFrom + wikiEol.index + 2,
  );
  if (probeInner == null) {
    return null;
  }
  const {innerTo} = probeInner;
  if (head < innerTo || head >= lineTo) {
    return null;
  }
  return lineTo;
}

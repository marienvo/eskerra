import {syntaxTree} from '@codemirror/language';
import {
  EditorSelection,
  Transaction,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {EditorView} from '@codemirror/view';

import {WIKI_LINK_LINE_RE} from './wikiLinkCodemirror';

/** Must not collide with CodeMirror core user event names. */
export const EOL_MARKER_POINTER_FIX_USER_EVENT = 'eskerra.select.eolMarkerFix';

/**
 * Inline marker node names (from the Lezer markdown tree) that are hidden on non-marker-focus
 * lines. Used to scan trailing "invisible" chars at end of line.
 */
const HIDDEN_INLINE_MARKER_NODES = new Set([
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'PercentMark',
  'EqualHighlightMark',
]);

/**
 * Returns the document offset of the first character of the trailing "invisible marker zone" at
 * end of line: the zone made up of inline marker characters (EmphasisMark, StrikethroughMark, etc.)
 * and wiki-link closing brackets (`]]`) that are hidden on non-marker-focus lines via `display:none`.
 *
 * Scans backwards from `line.to`, stepping over each marker node / wiki `]]` until a non-marker
 * character is found. Returns `line.to` if there are no trailing markers.
 */
function trailingMarkersStart(
  state: EditorState,
  line: {from: number; to: number; text: string},
): number {
  const tree = syntaxTree(state);

  // Precompute all wiki-link `]]` start positions on this line (doc offsets).
  const wikiCloseStarts = new Set<number>();
  WIKI_LINK_LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKI_LINK_LINE_RE.exec(line.text)) !== null) {
    // The `]]` occupies the last 2 chars of the match.
    wikiCloseStarts.add(line.from + m.index + m[0].length - 2);
  }

  let pos = line.to;
  let progressed = true;
  while (progressed && pos > line.from) {
    progressed = false;

    // Syntax-tree inline marker? Bias 1 so the node STARTING at pos-1 is preferred over one
    // ending there — needed for single-char markers like the closing `*` of `*italic*`.
    const node = tree.resolveInner(pos - 1, 1);
    if (HIDDEN_INLINE_MARKER_NODES.has(node.type.name) && node.from >= line.from) {
      pos = node.from;
      progressed = true;
      continue;
    }

    // Wiki link closing brackets `]]`?
    if (pos - 2 >= line.from && wikiCloseStarts.has(pos - 2)) {
      pos -= 2;
      progressed = true;
    }
  }

  return pos;
}

/**
 * If the pointer selection landed inside trailing hidden markers at end of line, returns
 * `line.to`; otherwise `null`.
 */
export function planCaretPastEOLMarkers(
  state: EditorState,
  line: {from: number; to: number; text: string},
  head: number,
): number | null {
  if (head >= line.to) {
    return null;
  }
  const start = trailingMarkersStart(state, line);
  return head >= start ? line.to : null;
}

/**
 * After a primary pointer selection, snaps any caret that landed inside trailing hidden markdown
 * markers (bold/italic `*`/`_`, strikethrough `~~`, inline-code `` ` ``, `%%`, `==`, wiki `]]`)
 * to the end of the line, so the user's visual "click at EOL" intent is honoured.
 */
export function eolMarkerCaretPointerFixExtension(): Extension {
  return EditorView.updateListener.of(update => {
    if (!update.selectionSet) {
      return;
    }

    for (const tr of update.transactions) {
      if (tr.annotation(Transaction.userEvent) === EOL_MARKER_POINTER_FIX_USER_EVENT) {
        continue;
      }
      if (tr.annotation(Transaction.userEvent) !== 'select.pointer') {
        continue;
      }
      const {state} = update;
      let changed = false;
      const nextRanges = state.selection.ranges.map(r => {
        if (!r.empty) return r;
        const line = state.doc.lineAt(r.head);
        const fixTo = planCaretPastEOLMarkers(
          state,
          {from: line.from, to: line.to, text: line.text},
          r.head,
        );
        if (fixTo == null) return r;
        changed = true;
        return EditorSelection.cursor(fixTo);
      });
      if (!changed) {
        continue;
      }
      update.view.dispatch({
        selection: EditorSelection.create(nextRanges),
        userEvent: EOL_MARKER_POINTER_FIX_USER_EVENT,
      });
      return;
    }
  });
}

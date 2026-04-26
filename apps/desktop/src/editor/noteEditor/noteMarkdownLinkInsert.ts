import {EditorSelection} from '@codemirror/state';
import {type EditorView} from '@codemirror/view';

const HTTPS_PLACEHOLDER = 'https://';

/**
 * Insert `[label](url)` at the selection: selected text becomes `label`, caret/select in `url`.
 * Empty selection inserts `[](url)` with caret between `[` and `]`.
 *
 * Always returns true: CodeMirror command convention (truthy = handled).
 */
// eslint-disable-next-line sonarjs/no-invariant-returns -- CM command API: truthy means handled
export function insertMarkdownLinkTemplate(view: EditorView): boolean {
  const state = view.state;
  const range = state.selection.main;
  const {from, to} = range;
  const doc = state.doc;
  if (from !== to) {
    const text = doc.sliceString(from, to);
    const insert = `[${text}]()`;
    const parenOpen = from + insert.length - 2;
    view.dispatch({
      changes: {from, to, insert},
      selection: EditorSelection.cursor(parenOpen),
      scrollIntoView: true,
    });
    return true;
  }
  const insert = `[]()`;
  view.dispatch({
    changes: {from, to: from, insert},
    selection: EditorSelection.cursor(from + 1),
    scrollIntoView: true,
  });
  return true;
}

/**
 * Same as {@link insertMarkdownLinkTemplate} but pre-fills `https://` in the URL slot and selects it.
 */
// eslint-disable-next-line sonarjs/no-invariant-returns -- CM command API: truthy means handled
export function insertMarkdownExternalLinkTemplate(view: EditorView): boolean {
  const state = view.state;
  const range = state.selection.main;
  const {from, to} = range;
  const doc = state.doc;
  if (from !== to) {
    const text = doc.sliceString(from, to);
    const insert = `[${text}](${HTTPS_PLACEHOLDER})`;
    const urlFrom = from + insert.indexOf(HTTPS_PLACEHOLDER);
    view.dispatch({
      changes: {from, to, insert},
      selection: EditorSelection.range(
        urlFrom,
        urlFrom + HTTPS_PLACEHOLDER.length,
      ),
      scrollIntoView: true,
    });
    return true;
  }
  const insert = `[](${HTTPS_PLACEHOLDER})`;
  const urlFrom = from + insert.indexOf(HTTPS_PLACEHOLDER);
  view.dispatch({
    changes: {from, to: from, insert},
    selection: EditorSelection.range(
      urlFrom,
      urlFrom + HTTPS_PLACEHOLDER.length,
    ),
    scrollIntoView: true,
  });
  return true;
}

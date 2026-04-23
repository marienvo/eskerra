import {selectAll} from '@codemirror/commands';
import type {EditorView} from '@codemirror/view';

import {
  runMarkdownBoldSurround,
  runMarkdownClearOneInlineLayerSurround,
  runMarkdownHighlightSurround,
  runMarkdownInlineCodeSurround,
  runMarkdownItalicSurround,
  runMarkdownMutedSurround,
  runMarkdownStrikethroughSurround,
} from './markdownSelectionSurround';
import {
  MARKDOWN_INPUT_CUT_USER_EVENT,
  MARKDOWN_INPUT_PASTE_USER_EVENT,
} from './markdownEditorUserEvents';
import {
  insertMarkdownExternalLinkTemplate,
  insertMarkdownLinkTemplate,
} from './noteMarkdownLinkInsert';

export type MarkdownEditorContextMenuActionOptions = {
  blockEdit: boolean;
  /** Table cells: strip `|`, newlines from pasted text. */
  sanitizePasteText?: (text: string) => string;
};

export type MarkdownEditorContextMenuHandlers = {
  addLink: () => void;
  addExternalLink: () => void;
  bold: () => void;
  italic: () => void;
  strikethrough: () => void;
  highlight: () => void;
  code: () => void;
  comment: () => void;
  clearFormatting: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  selectAll: () => void;
};

export async function readClipboardWithFallback(
  readClipboardText: () => Promise<string | null>,
): Promise<string | null> {
  try {
    const t = await navigator.clipboard.readText();
    if (t.length > 0) {
      return t;
    }
  } catch {
    /* use host fallback */
  }
  return readClipboardText();
}

export function runWithFocus(view: EditorView, fn: (v: EditorView) => boolean): void {
  fn(view);
  view.focus();
}

/**
 * Shared actions for the vault markdown context menu (root editor surface + table cells).
 */
export function bindMarkdownEditorContextMenuHandlers(
  getView: () => EditorView | null,
  readClipboardText: () => Promise<string | null>,
  opts: MarkdownEditorContextMenuActionOptions,
): MarkdownEditorContextMenuHandlers {
  const {blockEdit, sanitizePasteText} = opts;

  return {
    addLink: () => {
      if (blockEdit) {
        return;
      }
      const view = getView();
      if (view) {
        runWithFocus(view, insertMarkdownLinkTemplate);
      }
    },
    addExternalLink: () => {
      if (blockEdit) {
        return;
      }
      const view = getView();
      if (view) {
        runWithFocus(view, insertMarkdownExternalLinkTemplate);
      }
    },
    bold: () => {
      if (blockEdit) {
        return;
      }
      const view = getView();
      if (view) {
        runWithFocus(view, runMarkdownBoldSurround);
      }
    },
    italic: () => {
      if (blockEdit) {
        return;
      }
      const view = getView();
      if (view) {
        runWithFocus(view, runMarkdownItalicSurround);
      }
    },
    strikethrough: () => {
      if (blockEdit) {
        return;
      }
      const view = getView();
      if (view) {
        runWithFocus(view, runMarkdownStrikethroughSurround);
      }
    },
    highlight: () => {
      if (blockEdit) {
        return;
      }
      const view = getView();
      if (view) {
        runWithFocus(view, runMarkdownHighlightSurround);
      }
    },
    code: () => {
      if (blockEdit) {
        return;
      }
      const view = getView();
      if (view) {
        runWithFocus(view, runMarkdownInlineCodeSurround);
      }
    },
    comment: () => {
      if (blockEdit) {
        return;
      }
      const view = getView();
      if (view) {
        runWithFocus(view, runMarkdownMutedSurround);
      }
    },
    clearFormatting: () => {
      if (blockEdit) {
        return;
      }
      const view = getView();
      if (view) {
        runWithFocus(view, runMarkdownClearOneInlineLayerSurround);
      }
    },
    cut: () => {
      if (blockEdit) {
        return;
      }
      const view = getView();
      if (!view) {
        return;
      }
      const {from, to} = view.state.selection.main;
      if (from === to) {
        view.focus();
        return;
      }
      const text = view.state.doc.sliceString(from, to);
      void navigator.clipboard.writeText(text).then(() => {
        view.dispatch({
          changes: {from, to, insert: ''},
          selection: {anchor: from},
          scrollIntoView: true,
          userEvent: MARKDOWN_INPUT_CUT_USER_EVENT,
        });
        view.focus();
      });
    },
    copy: () => {
      const view = getView();
      if (!view) {
        return;
      }
      const {from, to} = view.state.selection.main;
      if (from === to) {
        view.focus();
        return;
      }
      const text = view.state.doc.sliceString(from, to);
      void navigator.clipboard.writeText(text).finally(() => view.focus());
    },
    paste: () => {
      if (blockEdit) {
        return;
      }
      const view = getView();
      if (!view) {
        return;
      }
      void (async () => {
        let text = await readClipboardWithFallback(readClipboardText);
        if (text == null || text.length === 0) {
          view.focus();
          return;
        }
        if (sanitizePasteText) {
          text = sanitizePasteText(text);
          if (text.length === 0) {
            view.focus();
            return;
          }
        }
        const sel = view.state.selection.main;
        const insertFrom = Math.min(sel.anchor, sel.head);
        const insertTo = Math.max(sel.anchor, sel.head);
        view.dispatch({
          changes: {from: insertFrom, to: insertTo, insert: text},
          selection: {anchor: insertFrom + text.length},
          scrollIntoView: true,
          userEvent: MARKDOWN_INPUT_PASTE_USER_EVENT,
        });
        view.focus();
      })();
    },
    selectAll: () => {
      const view = getView();
      if (view) {
        selectAll(view);
        view.focus();
      }
    },
  };
}

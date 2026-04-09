import {selectAll} from '@codemirror/commands';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type {ReactNode} from 'react';

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
  insertMarkdownExternalLinkTemplate,
  insertMarkdownLinkTemplate,
} from './noteMarkdownLinkInsert';

export type NoteMarkdownEditorContextMenuProps = {
  children: ReactNode;
  getView: () => EditorView | null;
  readOnly: boolean;
  busy: boolean;
  readClipboardText: () => Promise<string | null>;
};

function runWithFocus(view: EditorView, fn: (v: EditorView) => boolean): void {
  fn(view);
  view.focus();
}

async function readClipboardWithFallback(
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

export function NoteMarkdownEditorContextMenu(
  props: NoteMarkdownEditorContextMenuProps,
) {
  const {children, getView, readOnly, busy, readClipboardText} = props;
  const blockEdit = readOnly || busy;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="note-list-context-menu note-markdown-editor-context-menu"
          alignOffset={4}
          collisionPadding={8}
        >
          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={blockEdit}
            onSelect={() => {
              const view = getView();
              if (view) {
                runWithFocus(view, insertMarkdownLinkTemplate);
              }
            }}
          >
            Add link
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={blockEdit}
            onSelect={() => {
              const view = getView();
              if (view) {
                runWithFocus(view, insertMarkdownExternalLinkTemplate);
              }
            }}
          >
            Add external link
          </ContextMenu.Item>
          <ContextMenu.Separator className="note-markdown-editor-context-menu__sep" />

          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className="note-list-context-menu__item note-markdown-editor-context-menu__subtrigger">
              Format
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent
                className="note-list-context-menu note-markdown-editor-context-menu note-markdown-editor-context-menu__sub"
                collisionPadding={8}
              >
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={() => {
                    const view = getView();
                    if (view) {
                      runWithFocus(view, runMarkdownBoldSurround);
                    }
                  }}
                >
                  Bold
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={() => {
                    const view = getView();
                    if (view) {
                      runWithFocus(view, runMarkdownItalicSurround);
                    }
                  }}
                >
                  Italic
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={() => {
                    const view = getView();
                    if (view) {
                      runWithFocus(view, runMarkdownStrikethroughSurround);
                    }
                  }}
                >
                  Strikethrough
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={() => {
                    const view = getView();
                    if (view) {
                      runWithFocus(view, runMarkdownHighlightSurround);
                    }
                  }}
                >
                  Highlight
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={() => {
                    const view = getView();
                    if (view) {
                      runWithFocus(view, runMarkdownInlineCodeSurround);
                    }
                  }}
                >
                  Code
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={() => {
                    const view = getView();
                    if (view) {
                      runWithFocus(view, runMarkdownMutedSurround);
                    }
                  }}
                >
                  Comment
                </ContextMenu.Item>
                <ContextMenu.Separator className="note-markdown-editor-context-menu__sep" />
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={() => {
                    const view = getView();
                    if (view) {
                      runWithFocus(view, runMarkdownClearOneInlineLayerSurround);
                    }
                  }}
                >
                  Clear formatting
                </ContextMenu.Item>
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>

          <ContextMenu.Separator className="note-markdown-editor-context-menu__sep" />

          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={blockEdit}
            onSelect={() => {
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
                });
                view.focus();
              });
            }}
          >
            Cut
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            onSelect={() => {
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
            }}
          >
            Copy
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={blockEdit}
            onSelect={() => {
              const view = getView();
              if (!view) {
                return;
              }
              void (async () => {
                const text = await readClipboardWithFallback(readClipboardText);
                if (text == null || text.length === 0) {
                  view.focus();
                  return;
                }
                const sel = view.state.selection.main;
                const insertFrom = Math.min(sel.anchor, sel.head);
                const insertTo = Math.max(sel.anchor, sel.head);
                view.dispatch({
                  changes: {from: insertFrom, to: insertTo, insert: text},
                  selection: {anchor: insertFrom + text.length},
                  scrollIntoView: true,
                });
                view.focus();
              })();
            }}
          >
            Paste
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            onSelect={() => {
              const view = getView();
              if (view) {
                selectAll(view);
                view.focus();
              }
            }}
          >
            Select all
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

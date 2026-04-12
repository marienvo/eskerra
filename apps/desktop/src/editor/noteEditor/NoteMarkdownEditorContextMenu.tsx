import * as ContextMenu from '@radix-ui/react-context-menu';
import type {ReactNode} from 'react';

import type {EditorView} from '@codemirror/view';

import {cleanNoteMenuShortcutLabel} from '../../lib/desktopShortcutLabels';
import {bindMarkdownEditorContextMenuHandlers} from './markdownEditorContextMenuActions';

export type NoteMarkdownEditorContextMenuProps = {
  children: ReactNode;
  getView: () => EditorView | null;
  readOnly: boolean;
  busy: boolean;
  readClipboardText: () => Promise<string | null>;
  onCleanNote?: () => void;
};

export function NoteMarkdownEditorContextMenu(
  props: NoteMarkdownEditorContextMenuProps,
) {
  const {children, getView, readOnly, busy, readClipboardText, onCleanNote} = props;
  const blockEdit = readOnly || busy;
  const h = bindMarkdownEditorContextMenuHandlers(getView, readClipboardText, {
    blockEdit,
  });

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
            onSelect={h.addLink}
          >
            Add link
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={blockEdit}
            onSelect={h.addExternalLink}
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
                  onSelect={h.bold}
                >
                  Bold
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.italic}
                >
                  Italic
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.strikethrough}
                >
                  Strikethrough
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.highlight}
                >
                  Highlight
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.code}
                >
                  Code
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.comment}
                >
                  Comment
                </ContextMenu.Item>
                <ContextMenu.Separator className="note-markdown-editor-context-menu__sep" />
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.clearFormatting}
                >
                  Clear formatting
                </ContextMenu.Item>
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>

          <ContextMenu.Separator className="note-markdown-editor-context-menu__sep" />

          {onCleanNote ? (
            <>
              <ContextMenu.Item
                className="note-list-context-menu__item note-list-context-menu__item--with-kbd"
                disabled={blockEdit}
                onSelect={() => {
                  onCleanNote();
                }}
              >
                <span>Clean this note</span>
                <span className="note-list-context-menu__kbd">
                  {cleanNoteMenuShortcutLabel()}
                </span>
              </ContextMenu.Item>
              <ContextMenu.Separator className="note-markdown-editor-context-menu__sep" />
            </>
          ) : null}

          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={blockEdit}
            onSelect={h.cut}
          >
            Cut
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            onSelect={h.copy}
          >
            Copy
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            disabled={blockEdit}
            onSelect={h.paste}
          >
            Paste
          </ContextMenu.Item>
          <ContextMenu.Item
            className="note-list-context-menu__item"
            onSelect={h.selectAll}
          >
            Select all
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

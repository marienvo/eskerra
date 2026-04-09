import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import type {EditorView} from '@codemirror/view';

import {bindMarkdownEditorContextMenuHandlers} from './markdownEditorContextMenuActions';

export type MarkdownTableCellContextMenuProps = {
  open: boolean;
  anchor: {x: number; y: number} | null;
  getView: () => EditorView | null;
  readOnly: boolean;
  busy: boolean;
  readClipboardText: () => Promise<string | null>;
  sanitizePasteText: (text: string) => string;
  onOpenChange: (open: boolean) => void;
};

/**
 * Same commands as {@link NoteMarkdownEditorContextMenu}, positioned at pointer
 * coordinates for Eskerra table cell CodeMirror surfaces (no React trigger wrapper).
 */
export function MarkdownTableCellContextMenu(
  props: MarkdownTableCellContextMenuProps,
) {
  const {
    open,
    anchor,
    getView,
    readOnly,
    busy,
    readClipboardText,
    sanitizePasteText,
    onOpenChange,
  } = props;
  const blockEdit = readOnly || busy;
  const h = bindMarkdownEditorContextMenuHandlers(getView, readClipboardText, {
    blockEdit,
    sanitizePasteText,
  });

  if (!anchor) {
    return null;
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="note-markdown-editor-cell-menu-anchor"
          style={{
            position: 'fixed',
            left: anchor.x,
            top: anchor.y,
            width: 1,
            height: 1,
            margin: 0,
            padding: 0,
            border: 'none',
            background: 'transparent',
            opacity: 0,
            pointerEvents: 'none',
          }}
          tabIndex={-1}
          aria-hidden
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="note-list-context-menu note-markdown-editor-context-menu"
          collisionPadding={8}
          sideOffset={4}
          align="start"
          onCloseAutoFocus={e => e.preventDefault()}
        >
          <DropdownMenu.Item
            className="note-list-context-menu__item"
            disabled={blockEdit}
            onSelect={h.addLink}
          >
            Add link
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="note-list-context-menu__item"
            disabled={blockEdit}
            onSelect={h.addExternalLink}
          >
            Add external link
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="note-markdown-editor-context-menu__sep" />

          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="note-list-context-menu__item note-markdown-editor-context-menu__subtrigger">
              Format
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className="note-list-context-menu note-markdown-editor-context-menu note-markdown-editor-context-menu__sub"
                collisionPadding={8}
              >
                <DropdownMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.bold}
                >
                  Bold
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.italic}
                >
                  Italic
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.strikethrough}
                >
                  Strikethrough
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.highlight}
                >
                  Highlight
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.code}
                >
                  Code
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.comment}
                >
                  Comment
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="note-markdown-editor-context-menu__sep" />
                <DropdownMenu.Item
                  className="note-list-context-menu__item"
                  disabled={blockEdit}
                  onSelect={h.clearFormatting}
                >
                  Clear formatting
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Separator className="note-markdown-editor-context-menu__sep" />

          <DropdownMenu.Item
            className="note-list-context-menu__item"
            disabled={blockEdit}
            onSelect={h.cut}
          >
            Cut
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="note-list-context-menu__item"
            onSelect={h.copy}
          >
            Copy
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="note-list-context-menu__item"
            disabled={blockEdit}
            onSelect={h.paste}
          >
            Paste
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="note-list-context-menu__item"
            onSelect={h.selectAll}
          >
            Select all
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

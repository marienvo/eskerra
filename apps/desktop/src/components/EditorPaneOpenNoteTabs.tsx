import * as ContextMenu from '@radix-ui/react-context-menu';
import {memo, useCallback, type MouseEvent} from 'react';

import {MaterialIcon} from './MaterialIcon';

type NoteRow = {lastModified: number | null; name: string; uri: string};

function labelForOpenTab(notes: readonly NoteRow[], uri: string): string {
  const row = notes.find(n => n.uri === uri);
  if (row) {
    return row.name;
  }
  const tail = uri.split(/[/\\]/).pop()?.trim();
  return tail || uri;
}

export type EditorPaneOpenNoteTabsProps = {
  notes: readonly NoteRow[];
  tabUris: readonly string[];
  selectedUri: string | null;
  busy: boolean;
  onActivateTab: (uri: string) => void;
  onCloseTab: (uri: string) => void;
  onRenameNote: (uri: string) => void;
  onCloseOtherTabs: (keepUri: string) => void;
};

export const EditorPaneOpenNoteTabs = memo(function EditorPaneOpenNoteTabs({
  notes,
  tabUris,
  selectedUri,
  busy,
  onActivateTab,
  onCloseTab,
  onRenameNote,
  onCloseOtherTabs,
}: EditorPaneOpenNoteTabsProps) {
  const onCloseClick = useCallback(
    (e: MouseEvent, uri: string) => {
      e.preventDefault();
      e.stopPropagation();
      onCloseTab(uri);
    },
    [onCloseTab],
  );

  const onPillAuxClick = useCallback(
    (e: MouseEvent, uri: string) => {
      if (e.button !== 1) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onCloseTab(uri);
    },
    [onCloseTab],
  );

  if (tabUris.length === 0) {
    return (
      <span className="pane-title pane-title--truncate editor-open-tabs-placeholder">
        Editor
      </span>
    );
  }

  const multiTabs = tabUris.length > 1;

  return (
    <div className="editor-open-tabs-scroll" role="tablist" aria-label="Open notes">
      {tabUris.map(uri => {
        const active = uri === selectedUri;
        const label = labelForOpenTab(notes, uri);
        return (
          <ContextMenu.Root key={uri}>
            <ContextMenu.Trigger asChild disabled={busy}>
              <div
                className={
                  active
                    ? 'editor-open-tab-pill editor-open-tab-pill--active'
                    : 'editor-open-tab-pill'
                }
                role="none"
                onAuxClick={e => onPillAuxClick(e, uri)}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="editor-open-tab-pill__main"
                  disabled={busy}
                  title={label}
                  onClick={() => onActivateTab(uri)}
                >
                  <span className="editor-open-tab-pill__icon" aria-hidden>
                    <MaterialIcon name="description" size={12} />
                  </span>
                  <span className="editor-open-tab-pill__label">{label}</span>
                </button>
                <button
                  type="button"
                  className="editor-open-tab-pill__close icon-btn-ghost"
                  aria-label={`Close ${label}`}
                  disabled={busy}
                  onClick={e => onCloseClick(e, uri)}
                >
                  <MaterialIcon name="close" size={12} />
                </button>
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content
                className="note-list-context-menu"
                alignOffset={4}
                collisionPadding={8}
              >
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={busy}
                  onSelect={() => {
                    onRenameNote(uri);
                  }}
                >
                  Rename note
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={busy}
                  onSelect={() => {
                    onCloseTab(uri);
                  }}
                >
                  Close tab
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="note-list-context-menu__item"
                  disabled={busy || !multiTabs}
                  onSelect={() => {
                    onCloseOtherTabs(uri);
                  }}
                >
                  Close other tabs
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        );
      })}
    </div>
  );
});

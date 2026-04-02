import type {RefObject} from 'react';
import {useMemo} from 'react';

import {createNoteInboxAttachmentHost} from '../lib/noteInboxAttachmentHost';

import {
  extractFirstMarkdownH1,
  formatRelativeCalendarLabel,
  getInboxTileBackgroundColor,
  getNoteTitle,
} from '@notebox/core';

import {
  NoteMarkdownEditor,
  type NoteMarkdownEditorHandle,
} from '../editor/noteEditor/NoteMarkdownEditor';

import {INBOX_LEFT_PANEL} from '../lib/layoutStore';

import {DesktopHorizontalSplit} from './DesktopHorizontalSplit';
import {MaterialIcon} from './MaterialIcon';

type NoteRow = {lastModified: number | null; name: string; uri: string};

type InboxTabProps = {
  vaultRoot: string;
  inboxEditorRef: RefObject<NoteMarkdownEditorHandle | null>;
  leftWidthPx: number;
  onLeftWidthPxChanged: (px: number) => void;
  notes: NoteRow[];
  inboxContentByUri: Record<string, string>;
  selectedUri: string | null;
  onSelectNote: (uri: string) => void;
  onAddEntry: () => void;
  composingNewEntry: boolean;
  onCancelNewEntry: () => void;
  onCreateNewEntry: () => void;
  editorBody: string;
  onEditorChange: (body: string) => void;
  inboxEditorResetNonce: number;
  onEditorError: (message: string) => void;
  onSaveNote: () => void;
  busy: boolean;
};

export function InboxTab({
  vaultRoot,
  inboxEditorRef,
  leftWidthPx,
  onLeftWidthPxChanged,
  notes,
  inboxContentByUri,
  selectedUri,
  onSelectNote,
  onAddEntry,
  composingNewEntry,
  onCancelNewEntry,
  onCreateNewEntry,
  editorBody,
  onEditorChange,
  inboxEditorResetNonce,
  onEditorError,
  onSaveNote,
  busy,
}: InboxTabProps) {
  const inboxAttachmentHost = useMemo(() => createNoteInboxAttachmentHost(), []);

  const editorPaneTitle = useMemo(() => {
    if (composingNewEntry) {
      return 'New entry';
    }
    if (!selectedUri) {
      return 'Editor';
    }
    const row = notes.find(n => n.uri === selectedUri);
    if (row) {
      return row.name;
    }
    const tail = selectedUri.split(/[/\\]/).pop()?.trim();
    return tail || 'Editor';
  }, [composingNewEntry, notes, selectedUri]);

  const editorOpen = composingNewEntry || Boolean(selectedUri);

  return (
    <div className="inbox-root" data-app-surface="capture">
      <DesktopHorizontalSplit
        leftWidthPx={leftWidthPx}
        minLeftPx={INBOX_LEFT_PANEL.minPx}
        maxLeftPx={INBOX_LEFT_PANEL.maxPx}
        minRightPx={220}
        onLeftWidthPxChanged={onLeftWidthPxChanged}
        left={
          <div className="panel-surface">
            <div className="pane-header">
              <span className="pane-title">Log</span>
              <button
                type="button"
                className="pane-header-add-btn icon-btn-ghost app-tooltip-trigger"
                onClick={onAddEntry}
                disabled={busy}
                aria-label="Add entry"
                data-tooltip="Add entry"
                data-tooltip-placement="inline-start"
              >
                <span className="pane-header-add-btn__glyph" aria-hidden>
                  <MaterialIcon name="add" size={12} />
                </span>
              </button>
            </div>
            <ul className="note-list">
              {notes.map(n => {
                const markdownSource =
                  !composingNewEntry && n.uri === selectedUri
                    ? editorBody
                    : inboxContentByUri[n.uri];
                const listTitle =
                  markdownSource !== undefined
                    ? extractFirstMarkdownH1(markdownSource) ?? getNoteTitle(n.name)
                    : getNoteTitle(n.name);
                const tileColor = getInboxTileBackgroundColor(n.lastModified);
                return (
                  <li key={n.uri}>
                    <button
                      type="button"
                      className={
                        n.uri === selectedUri ? 'note-list-row active' : 'note-list-row'
                      }
                      onClick={() => onSelectNote(n.uri)}
                    >
                      <span
                        className="note-list-row__accent"
                        style={{backgroundColor: tileColor}}
                        aria-hidden
                      />
                      <span className="note-list-row__body">
                        <span className="note-list-row__title">{listTitle}</span>
                        <span className="note-list-row__filename">{n.name}</span>
                        <span className="note-list-row__meta">
                          {formatRelativeCalendarLabel(n.lastModified)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        }
        right={
          <div className="panel-surface">
            <div className="pane-header">
              <span className="pane-title pane-title--truncate" title={editorPaneTitle}>
                {editorPaneTitle}
              </span>
              {composingNewEntry ? (
                <button
                  type="button"
                  className="pane-header-add-btn icon-btn-ghost app-tooltip-trigger"
                  onClick={onCancelNewEntry}
                  disabled={busy}
                  aria-label="Cancel new entry"
                  data-tooltip="Cancel"
                  data-tooltip-placement="inline-start"
                >
                  <span className="pane-header-add-btn__glyph" aria-hidden>
                    <MaterialIcon name="clear" size={12} />
                  </span>
                </button>
              ) : null}
            </div>
            {editorOpen ? (
              <>
                <div className="editor note-markdown-editor-wrap">
                  <NoteMarkdownEditor
                    ref={inboxEditorRef}
                    attachmentHost={inboxAttachmentHost}
                    vaultRoot={vaultRoot}
                    activeNotePath={composingNewEntry ? null : selectedUri}
                    initialMarkdown={editorBody}
                    sessionKey={inboxEditorResetNonce}
                    onMarkdownChange={onEditorChange}
                    onEditorError={onEditorError}
                    placeholder={
                      composingNewEntry ? 'First line is title (H1)…' : 'Write markdown…'
                    }
                    busy={busy}
                  />
                </div>
                <div className="pane-footer">
                  <button
                    type="button"
                    className="primary"
                    onClick={composingNewEntry ? onCreateNewEntry : () => void onSaveNote()}
                    disabled={busy}
                  >
                    {composingNewEntry ? 'Create note' : 'Save note'}
                  </button>
                </div>
              </>
            ) : (
              <p className="muted empty-hint">Select a note from the log or use Add entry.</p>
            )}
          </div>
        }
      />
    </div>
  );
}

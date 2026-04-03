import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type {RefObject} from 'react';
import {useMemo, useState} from 'react';

import {createNoteInboxAttachmentHost} from '../lib/noteInboxAttachmentHost';
import {inboxWikiLinkTargetIsResolved} from '../lib/inboxWikiLinkNavigation';
import {resolveVaultImagePreviewUrl} from '../lib/resolveVaultImagePreviewUrl';

import {
  buildInboxWikiLinkCompletionCandidates,
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
  backlinkUris: readonly string[];
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
  onWikiLinkActivate: (payload: {inner: string; at: number}) => void;
  onSaveShortcut: () => void;
  busy: boolean;
  onDeleteNote: (uri: string) => void | Promise<void>;
};

export function InboxTab({
  vaultRoot,
  inboxEditorRef,
  leftWidthPx,
  onLeftWidthPxChanged,
  notes,
  inboxContentByUri,
  backlinkUris,
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
  onWikiLinkActivate,
  onSaveShortcut,
  busy,
  onDeleteNote,
}: InboxTabProps) {
  const inboxAttachmentHost = useMemo(() => createNoteInboxAttachmentHost(), []);
  const [confirmDeleteUri, setConfirmDeleteUri] = useState<string | null>(null);

  const wikiLinkTargetIsResolved = useMemo(
    () => (inner: string) =>
      inboxWikiLinkTargetIsResolved(
        notes.map(n => ({name: n.name, uri: n.uri})),
        inner,
      ),
    [notes],
  );

  const wikiLinkCompletionCandidates = useMemo(
    () =>
      buildInboxWikiLinkCompletionCandidates(
        notes.map(n => ({name: n.name, uri: n.uri})),
      ),
    [notes],
  );

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

  const backlinkRows = useMemo(
    () =>
      backlinkUris
        .map(uri => {
          const row = notes.find(n => n.uri === uri);
          if (!row) {
            return null;
          }
          const markdownSource =
            !composingNewEntry && row.uri === selectedUri
              ? editorBody
              : inboxContentByUri[row.uri];
          const title =
            markdownSource !== undefined
              ? extractFirstMarkdownH1(markdownSource) ?? getNoteTitle(row.name)
              : getNoteTitle(row.name);
          return {uri: row.uri, fileName: row.name, title};
        })
        .filter((row): row is {uri: string; fileName: string; title: string} => row != null),
    [backlinkUris, notes, composingNewEntry, selectedUri, editorBody, inboxContentByUri],
  );

  const editorOpen = composingNewEntry || Boolean(selectedUri);

  return (
    <div className="inbox-root" data-app-surface="capture">
      <AlertDialog.Root
        open={confirmDeleteUri !== null}
        onOpenChange={open => {
          if (!open) {
            setConfirmDeleteUri(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="alert-dialog-overlay" />
          <AlertDialog.Content className="alert-dialog-content">
            <AlertDialog.Title className="alert-dialog-title">Delete note</AlertDialog.Title>
            <AlertDialog.Description className="alert-dialog-description">
              Delete this note? This cannot be undone.
            </AlertDialog.Description>
            <div className="alert-dialog-actions">
              <AlertDialog.Cancel asChild>
                <button type="button" className="ghost" disabled={busy}>
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className="primary destructive"
                  disabled={busy}
                  onClick={() => {
                    const uri = confirmDeleteUri;
                    if (uri) {
                      void onDeleteNote(uri);
                    }
                  }}
                >
                  Delete
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

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
                    <ContextMenu.Root>
                      <ContextMenu.Trigger asChild>
                        <button
                          type="button"
                          className={
                            n.uri === selectedUri
                              ? 'note-list-row active'
                              : 'note-list-row'
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
                      </ContextMenu.Trigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Content
                          className="note-list-context-menu"
                          alignOffset={4}
                          collisionPadding={8}
                        >
                          <ContextMenu.Item
                            className="note-list-context-menu__item note-list-context-menu__item--danger"
                            disabled={busy}
                            onSelect={() => {
                              setConfirmDeleteUri(n.uri);
                            }}
                          >
                            Delete
                          </ContextMenu.Item>
                        </ContextMenu.Content>
                      </ContextMenu.Portal>
                    </ContextMenu.Root>
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
                    resolveVaultImagePreviewUrl={resolveVaultImagePreviewUrl}
                    vaultRoot={vaultRoot}
                    activeNotePath={composingNewEntry ? null : selectedUri}
                    initialMarkdown={editorBody}
                    sessionKey={inboxEditorResetNonce}
                    onMarkdownChange={onEditorChange}
                    onEditorError={onEditorError}
                    onWikiLinkActivate={onWikiLinkActivate}
                    wikiLinkTargetIsResolved={wikiLinkTargetIsResolved}
                    wikiLinkCompletionCandidates={wikiLinkCompletionCandidates}
                    onSaveShortcut={onSaveShortcut}
                    placeholder={
                      composingNewEntry ? 'First line is title (H1)…' : 'Write markdown…'
                    }
                    busy={busy}
                  />
                </div>
                {!composingNewEntry && selectedUri ? (
                  <section className="inbox-backlinks" aria-label="Backlinks">
                    <div className="inbox-backlinks__header">Linked from</div>
                    {backlinkRows.length === 0 ? (
                      <p className="muted inbox-backlinks__empty">No incoming links.</p>
                    ) : (
                      <ul className="inbox-backlinks__list">
                        {backlinkRows.map(row => (
                          <li key={row.uri}>
                            <button
                              type="button"
                              className="inbox-backlinks__row"
                              onClick={() => onSelectNote(row.uri)}
                            >
                              <span className="inbox-backlinks__title">{row.title}</span>
                              <span className="inbox-backlinks__filename">{row.fileName}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : null}
                {composingNewEntry ? (
                  <div className="pane-footer">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void onCreateNewEntry()}
                      disabled={busy}
                    >
                      Create note
                    </button>
                  </div>
                ) : null}
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

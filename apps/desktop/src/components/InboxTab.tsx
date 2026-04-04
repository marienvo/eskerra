import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import type {RefObject} from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';

import {createNoteInboxAttachmentHost} from '../lib/noteInboxAttachmentHost';
import {inboxWikiLinkTargetIsResolved} from '../lib/inboxWikiLinkNavigation';
import {resolveVaultImagePreviewUrl} from '../lib/resolveVaultImagePreviewUrl';

import {
  buildInboxWikiLinkCompletionCandidates,
  extractFirstMarkdownH1,
  getNoteTitle,
  stemFromMarkdownFileName,
  type SubtreeMarkdownPresenceCache,
  type VaultFilesystem,
} from '@notebox/core';

import {
  NoteMarkdownEditor,
  type NoteMarkdownEditorHandle,
} from '../editor/noteEditor/NoteMarkdownEditor';

import {INBOX_LEFT_PANEL} from '../lib/layoutStore';

import {DesktopHorizontalSplit} from './DesktopHorizontalSplit';
import {MaterialIcon} from './MaterialIcon';
import {VaultPaneTree} from './VaultPaneTree';

type NoteRow = {lastModified: number | null; name: string; uri: string};

type WikiLinkAmbiguityRenamePrompt = {
  scannedFileCount: number;
  touchedFileCount: number;
  touchedBytes: number;
  updatedLinkCount: number;
  skippedAmbiguousLinkCount: number;
};

type InboxTabProps = {
  vaultRoot: string;
  fs: VaultFilesystem;
  subtreeMarkdownCache: SubtreeMarkdownPresenceCache;
  fsRefreshNonce: number;
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
  onVaultFolderSelect: () => void;
  busy: boolean;
  onDeleteNote: (uri: string) => void | Promise<void>;
  onRenameNote: (uri: string, nextDisplayName: string) => void | Promise<void>;
  onDeleteFolder: (directoryUri: string) => void | Promise<void>;
  onRenameFolder: (directoryUri: string, nextDisplayName: string) => void | Promise<void>;
  wikiLinkAmbiguityRenamePrompt: WikiLinkAmbiguityRenamePrompt | null;
  onConfirmWikiLinkAmbiguityRename: () => void | Promise<void>;
  onCancelWikiLinkAmbiguityRename: () => void;
};

export function InboxTab({
  vaultRoot,
  fs,
  subtreeMarkdownCache,
  fsRefreshNonce,
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
  onVaultFolderSelect,
  busy,
  onDeleteNote,
  onRenameNote,
  onDeleteFolder,
  onRenameFolder,
  wikiLinkAmbiguityRenamePrompt,
  onConfirmWikiLinkAmbiguityRename,
  onCancelWikiLinkAmbiguityRename,
}: InboxTabProps) {
  const inboxAttachmentHost = useMemo(() => createNoteInboxAttachmentHost(), []);
  const [confirmDeleteUri, setConfirmDeleteUri] = useState<string | null>(null);
  const [confirmDeleteFolderUri, setConfirmDeleteFolderUri] = useState<string | null>(
    null,
  );
  const [renameTargetUri, setRenameTargetUri] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameFolderUri, setRenameFolderUri] = useState<string | null>(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameFolderInputRef = useRef<HTMLInputElement | null>(null);

  const openRenameDialog = (uri: string) => {
    const row = notes.find(n => n.uri === uri);
    if (!row) {
      return;
    }
    setRenameTargetUri(uri);
    setRenameDraft(stemFromMarkdownFileName(row.name));
  };

  const submitRename = () => {
    const uri = renameTargetUri;
    if (!uri || busy) {
      return;
    }
    void onRenameNote(uri, renameDraft);
    setRenameTargetUri(null);
  };

  const openRenameFolderDialog = (uri: string) => {
    const tail = uri.split(/[/\\]/).filter(Boolean).pop();
    if (!tail) {
      return;
    }
    setRenameFolderUri(uri);
    setRenameFolderDraft(tail);
  };

  const submitFolderRename = () => {
    const uri = renameFolderUri;
    if (!uri || busy) {
      return;
    }
    void onRenameFolder(uri, renameFolderDraft);
    setRenameFolderUri(null);
  };

  useEffect(() => {
    if (!renameTargetUri) {
      return;
    }
    const id = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [renameTargetUri]);

  useEffect(() => {
    if (!renameFolderUri) {
      return;
    }
    const id = window.setTimeout(() => {
      renameFolderInputRef.current?.focus();
      renameFolderInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [renameFolderUri]);

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
      <AlertDialog.Root
        open={confirmDeleteFolderUri !== null}
        onOpenChange={open => {
          if (!open) {
            setConfirmDeleteFolderUri(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="alert-dialog-overlay" />
          <AlertDialog.Content className="alert-dialog-content">
            <AlertDialog.Title className="alert-dialog-title">Delete folder</AlertDialog.Title>
            <AlertDialog.Description className="alert-dialog-description">
              Delete this folder and everything inside it? This cannot be undone.
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
                    const uri = confirmDeleteFolderUri;
                    if (uri) {
                      void onDeleteFolder(uri);
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
      <AlertDialog.Root
        open={wikiLinkAmbiguityRenamePrompt !== null}
        onOpenChange={open => {
          if (!open) {
            onCancelWikiLinkAmbiguityRename();
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="alert-dialog-overlay" />
          <AlertDialog.Content className="alert-dialog-content">
            <AlertDialog.Title className="alert-dialog-title">
              Ambiguous wiki links found
            </AlertDialog.Title>
            <AlertDialog.Description className="alert-dialog-description">
              {wikiLinkAmbiguityRenamePrompt ? (
                <>
                  This rename can safely update{' '}
                  {wikiLinkAmbiguityRenamePrompt.updatedLinkCount} link(s) across{' '}
                  {wikiLinkAmbiguityRenamePrompt.touchedFileCount} note(s), but{' '}
                  {wikiLinkAmbiguityRenamePrompt.skippedAmbiguousLinkCount} link(s) are
                  ambiguous and will be skipped.
                </>
              ) : null}
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
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    void onConfirmWikiLinkAmbiguityRename();
                  }}
                >
                  Continue
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <Dialog.Root
        open={renameTargetUri !== null}
        onOpenChange={open => {
          if (!open) {
            setRenameTargetUri(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="alert-dialog-overlay" />
          <Dialog.Content className="alert-dialog-content">
            <Dialog.Title className="alert-dialog-title">Rename note</Dialog.Title>
            <Dialog.Description className="alert-dialog-description">
              Choose a new name for this note.
            </Dialog.Description>
            <label className="rename-note-field">
              <span className="rename-note-field__label">File name</span>
              <input
                ref={renameInputRef}
                type="text"
                className="rename-note-field__input"
                value={renameDraft}
                disabled={busy}
                onChange={event => setRenameDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitRename();
                  }
                }}
              />
            </label>
            <div className="alert-dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="ghost" disabled={busy}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => {
                  submitRename();
                }}
              >
                Rename
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={renameFolderUri !== null}
        onOpenChange={open => {
          if (!open) {
            setRenameFolderUri(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="alert-dialog-overlay" />
          <Dialog.Content className="alert-dialog-content">
            <Dialog.Title className="alert-dialog-title">Rename folder</Dialog.Title>
            <Dialog.Description className="alert-dialog-description">
              Choose a new name for this folder.
            </Dialog.Description>
            <label className="rename-note-field">
              <span className="rename-note-field__label">Folder name</span>
              <input
                ref={renameFolderInputRef}
                type="text"
                className="rename-note-field__input"
                value={renameFolderDraft}
                disabled={busy}
                onChange={event => setRenameFolderDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitFolderRename();
                  }
                }}
              />
            </label>
            <div className="alert-dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="ghost" disabled={busy}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => {
                  submitFolderRename();
                }}
              >
                Rename
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DesktopHorizontalSplit
        leftWidthPx={leftWidthPx}
        minLeftPx={INBOX_LEFT_PANEL.minPx}
        maxLeftPx={INBOX_LEFT_PANEL.maxPx}
        minRightPx={220}
        onLeftWidthPxChanged={onLeftWidthPxChanged}
        left={
          <div className="panel-surface">
            <div className="pane-header">
              <span className="pane-title">Vault</span>
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
            <div className="vault-tree-panel">
              <VaultPaneTree
                key={fsRefreshNonce}
                vaultRoot={vaultRoot}
                fs={fs}
                subtreeMarkdownCache={subtreeMarkdownCache}
                selectedMarkdownUri={composingNewEntry ? null : selectedUri}
                busy={busy}
                onOpenMarkdownNote={onSelectNote}
                onFolderFocused={onVaultFolderSelect}
                onRenameMarkdownRequest={openRenameDialog}
                onDeleteMarkdownRequest={u => {
                  setConfirmDeleteUri(u);
                }}
                onRenameFolderRequest={openRenameFolderDialog}
                onDeleteFolderRequest={u => {
                  setConfirmDeleteFolderUri(u);
                }}
              />
            </div>
          </div>
        }
        right={
          <div className="panel-surface">
            <div className="pane-header">
              <span className="pane-title pane-title--truncate" title={editorPaneTitle}>
                {editorPaneTitle}
              </span>
              {!composingNewEntry && selectedUri ? (
                <button
                  type="button"
                  className="pane-header-add-btn icon-btn-ghost app-tooltip-trigger"
                  onClick={() => openRenameDialog(selectedUri)}
                  disabled={busy}
                  aria-label="Rename note"
                  data-tooltip="Rename note"
                  data-tooltip-placement="inline-start"
                >
                  <span className="pane-header-add-btn__glyph" aria-hidden>
                    <MaterialIcon name="drive_file_rename_outline" size={12} />
                  </span>
                </button>
              ) : null}
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
              <p className="muted empty-hint">Select a note from the vault or use Add entry.</p>
            )}
          </div>
        }
      />
    </div>
  );
}

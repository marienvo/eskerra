import {useMemo} from 'react';
import {Group, Panel, Separator} from 'react-resizable-panels';
import type {Layout} from 'react-resizable-panels';

import {MaterialIcon} from './MaterialIcon';

type NoteRow = {lastModified: number | null; name: string; uri: string};

type InboxTabProps = {
  defaultLayout: Layout;
  onLayoutChanged: (layout: Layout) => void;
  notes: NoteRow[];
  selectedUri: string | null;
  onSelectNote: (uri: string) => void;
  onAddEntry: () => void;
  composingNewEntry: boolean;
  onCancelNewEntry: () => void;
  onCreateNewEntry: () => void;
  editorBody: string;
  onEditorChange: (body: string) => void;
  onSaveNote: () => void;
  busy: boolean;
};

export function InboxTab({
  defaultLayout,
  onLayoutChanged,
  notes,
  selectedUri,
  onSelectNote,
  onAddEntry,
  composingNewEntry,
  onCancelNewEntry,
  onCreateNewEntry,
  editorBody,
  onEditorChange,
  onSaveNote,
  busy,
}: InboxTabProps) {
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
      <Group
        className="panel-group fill"
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <Panel id="files" className="panel-surface" minSize={10} defaultSize="30%">
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
            {notes.map(n => (
              <li key={n.uri}>
                <button
                  type="button"
                  className={n.uri === selectedUri ? 'active' : ''}
                  onClick={() => onSelectNote(n.uri)}
                >
                  {n.name}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Separator className="resize-sep" />
        <Panel id="editor" className="panel-surface" minSize={18} defaultSize="70%">
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
              <textarea
                value={editorBody}
                onChange={e => onEditorChange(e.target.value)}
                spellCheck={false}
                placeholder={composingNewEntry ? 'First line is title (H1)…' : 'Markdown'}
              />
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
        </Panel>
      </Group>
    </div>
  );
}

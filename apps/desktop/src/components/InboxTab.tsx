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
  editorBody,
  onEditorChange,
  onSaveNote,
  busy,
}: InboxTabProps) {
  const editorPaneTitle = useMemo(() => {
    if (!selectedUri) {
      return 'Editor';
    }
    const row = notes.find(n => n.uri === selectedUri);
    if (row) {
      return row.name;
    }
    const tail = selectedUri.split(/[/\\]/).pop()?.trim();
    return tail || 'Editor';
  }, [notes, selectedUri]);

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
              className="pane-header-add-btn icon-btn-ghost"
              onClick={onAddEntry}
              disabled={busy}
              aria-label="Add entry"
              title="Add entry"
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
          </div>
          {selectedUri ? (
            <>
              <textarea
                value={editorBody}
                onChange={e => onEditorChange(e.target.value)}
                spellCheck={false}
                placeholder="Markdown"
              />
              <div className="pane-footer">
                <button type="button" className="primary" onClick={() => void onSaveNote()} disabled={busy}>
                  Save note
                </button>
              </div>
            </>
          ) : (
            <p className="muted empty-hint">Select a note or use Add entry.</p>
          )}
        </Panel>
      </Group>
    </div>
  );
}

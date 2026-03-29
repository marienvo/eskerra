import {Group, Panel, Separator} from 'react-resizable-panels';
import type {Layout} from 'react-resizable-panels';

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
            <button type="button" className="primary" onClick={onAddEntry} disabled={busy}>
              Add entry
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

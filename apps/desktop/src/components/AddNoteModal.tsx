import {useState} from 'react';

type AddNoteModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, body: string) => Promise<void>;
  busy: boolean;
};

export function AddNoteModal({open, onClose, onCreate, busy}: AddNoteModalProps) {
  const [title, setTitle] = useState('Draft');
  const [body, setBody] = useState('');

  if (!open) {
    return null;
  }

  const submit = async () => {
    const t = title.trim() || 'Draft';
    await onCreate(t, body);
    setTitle('Draft');
    setBody('');
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-note-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="add-note-title">New note</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <label className="field">
            Title
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </label>
          <label className="field">
            Body
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} spellCheck={false} />
          </label>
          <div className="modal-actions">
            <button type="button" className="primary" onClick={() => void submit()} disabled={busy}>
              Create
            </button>
            <button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

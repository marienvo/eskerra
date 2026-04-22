import type {VaultFilesystem} from '@eskerra/core';
import {splitYamlFrontmatter} from '@eskerra/core';
import {useEffect, useMemo, useState} from 'react';

import {normalizeVaultMarkdownDiskRead} from '../hooks/inboxNoteBodyCache';
import {applyHunkToText, buildDiffSegments} from '../lib/buildMarkdownLineDiff';

export type MergePanelSource =
  | {kind: 'backup'; backupUri: string}
  | {kind: 'disk'; diskMarkdown: string};

type BackupMergePanelProps = {
  vaultRoot: string;
  fs: VaultFilesystem;
  source: MergePanelSource;
  currentBody: string;
  onClose: () => void;
  onApplyOther: () => void | Promise<void>;
  onApplyMergedBody: (body: string) => void | Promise<void>;
  onKeepLocal?: () => void;
  busy: boolean;
};

function pathRelativeToVault(vaultRoot: string, fileUri: string): string {
  const r = vaultRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const f = fileUri.replace(/\\/g, '/');
  if (f.startsWith(`${r}/`)) {
    return f.slice(r.length + 1);
  }
  return f;
}

export function BackupMergePanel({
  vaultRoot,
  fs,
  source,
  currentBody,
  onClose,
  onApplyOther,
  onApplyMergedBody,
  onKeepLocal,
  busy,
}: BackupMergePanelProps) {
  const [loadedText, setLoadedText] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [localBody, setLocalBody] = useState(currentBody);

  // Re-sync localBody when the panel is opened for a new note (currentBody changes identity).
  // We only reset if there are no local hunk edits yet, detected by comparing to current.
  useEffect(() => {
    setLocalBody(currentBody);
  }, [currentBody]);

  useEffect(() => {
    if (source.kind !== 'backup') {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const raw = await fs.readFile(source.backupUri, {encoding: 'utf8'});
        if (cancelled) return;
        const {body} = splitYamlFrontmatter(raw);
        setLoadedText(normalizeVaultMarkdownDiskRead(body));
        setLoadErr(null);
      } catch (e) {
        if (cancelled) return;
        setLoadErr(e instanceof Error ? e.message : String(e));
        setLoadedText(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fs, source]);

  const otherText = useMemo(() => {
    if (source.kind === 'disk') {
      const {body} = splitYamlFrontmatter(source.diskMarkdown);
      return normalizeVaultMarkdownDiskRead(body);
    }
    return loadedText;
  }, [source, loadedText]);

  const {segments, hunks} = useMemo(
    () => (otherText != null ? buildDiffSegments(localBody, otherText) : {segments: [], hunks: []}),
    [localBody, otherText],
  );

  const hunkCount = hunks.length;
  const canApplyToEditor = otherText != null && !loadErr && !busy;
  const canApplyHunk = !busy && otherText != null;

  const title = source.kind === 'disk' ? 'Compare with disk version' : 'Merge with backup';
  const applyAllLabel = source.kind === 'disk' ? 'Use disk version' : 'Use entire backup file';

  const subLabel = useMemo(() => {
    if (source.kind === 'backup') {
      const rel = pathRelativeToVault(vaultRoot, source.backupUri) || source.backupUri;
      return (
        <>
          This note (left) vs. backup on disk:{' '}
          <span className="backup-merge-panel__path">{rel}</span>
        </>
      );
    }
    return 'This note (left) vs. version on disk (right). Apply individual changes or use one side entirely.';
  }, [source, vaultRoot]);

  function handleApplyHunk(hunkIndex: number) {
    const hunk = hunks[hunkIndex];
    if (!hunk) return;
    setLocalBody(prev => applyHunkToText(prev, hunk));
  }

  return (
    <div
      className="backup-merge-panel"
      data-app-surface="capture"
      role="region"
      aria-label="Compare note versions"
    >
      <div className="backup-merge-panel__header">
        <h2 className="backup-merge-panel__title">{title}</h2>
        <p className="backup-merge-panel__sub muted">{subLabel}</p>
        <div className="backup-merge-panel__header-actions">
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => {
              onClose();
            }}
          >
            Close
          </button>
          {onKeepLocal != null ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onKeepLocal();
              }}
            >
              Keep my edits
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canApplyToEditor}
            onClick={() => {
              void onApplyMergedBody(localBody);
            }}
          >
            Apply to editor
            {hunkCount === 0 && otherText != null ? ' (no changes)' : ''}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!canApplyToEditor}
            onClick={() => {
              void onApplyOther();
            }}
          >
            {applyAllLabel}
          </button>
        </div>
      </div>
      {loadErr != null ? (
        <p className="backup-merge-panel__err" role="alert">
          {loadErr}
        </p>
      ) : null}
      <div className="backup-merge-panel__diff-view">
        <div className="backup-merge-panel__diff-col-labels">
          <span>Current note (body)</span>
          <span>{source.kind === 'disk' ? 'Disk version' : 'Backup'} (read-only)</span>
        </div>
        <div className="backup-merge-panel__diff-body">
          {otherText == null && loadErr == null ? (
            <p className="muted backup-merge-panel__loading">Loading…</p>
          ) : null}
          {segments.map((seg, i) => {
            if (seg.kind === 'context') {
              return (
                <div key={i} className="backup-merge-panel__context">
                  {seg.lines.map((line, j) => (
                    <div key={j} className="backup-merge-panel__context-line">
                      {line}
                    </div>
                  ))}
                </div>
              );
            }
            const isDelete = seg.leftLines.length > 0 && seg.rightLines.length === 0;
            const isInsert = seg.leftLines.length === 0 && seg.rightLines.length > 0;
            const isReplace = !isDelete && !isInsert;
            const hunkLabel = isDelete
              ? 'Deletion'
              : isInsert
                ? 'Insertion'
                : isReplace
                  ? 'Change'
                  : 'Change';
            return (
              <div key={i} className="backup-merge-panel__hunk">
                <div className="backup-merge-panel__hunk-header">
                  <span className="backup-merge-panel__hunk-label muted">{hunkLabel}</span>
                  <button
                    type="button"
                    className="backup-merge-panel__hunk-apply"
                    disabled={!canApplyHunk}
                    onClick={() => handleApplyHunk(seg.index)}
                    title="Apply this change to the current note"
                  >
                    Apply →
                  </button>
                </div>
                <div className="backup-merge-panel__hunk-cols">
                  <pre className="backup-merge-panel__hunk-pre backup-merge-panel__hunk-pre--left">
                    {seg.leftLines.length === 0 ? (
                      <div className="backup-merge-panel__hunk-empty">(empty)</div>
                    ) : (
                      seg.leftLines.map((line, j) => (
                        <div key={j} className="backup-merge-panel__line backup-merge-panel__line--del">
                          {line}
                        </div>
                      ))
                    )}
                  </pre>
                  <pre className="backup-merge-panel__hunk-pre backup-merge-panel__hunk-pre--right">
                    {seg.rightLines.length === 0 ? (
                      <div className="backup-merge-panel__hunk-empty">(empty)</div>
                    ) : (
                      seg.rightLines.map((line, j) => (
                        <div key={j} className="backup-merge-panel__line backup-merge-panel__line--ins">
                          {line}
                        </div>
                      ))
                    )}
                  </pre>
                </div>
              </div>
            );
          })}
          {otherText != null && hunkCount === 0 ? (
            <p className="muted backup-merge-panel__no-diff">No differences — both sides are identical.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

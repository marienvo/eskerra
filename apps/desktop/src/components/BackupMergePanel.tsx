import type {VaultFilesystem} from '@eskerra/core';
import {splitYamlFrontmatter} from '@eskerra/core';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

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
  const [focusedHunkIdx, setFocusedHunkIdx] = useState(0);

  const hunkEls = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    setLocalBody(currentBody);
    setFocusedHunkIdx(0);
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

  useEffect(() => {
    setFocusedHunkIdx(prev => (hunkCount === 0 ? 0 : Math.min(prev, hunkCount - 1)));
  }, [hunkCount]);

  const scrollToHunk = useCallback((idx: number) => {
    hunkEls.current[idx]?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  }, []);

  const goPrev = useCallback(() => {
    setFocusedHunkIdx(prev => {
      const next = Math.max(0, prev - 1);
      scrollToHunk(next);
      return next;
    });
  }, [scrollToHunk]);

  const goNext = useCallback(() => {
    setFocusedHunkIdx(prev => {
      const next = Math.min(hunkCount - 1, prev + 1);
      scrollToHunk(next);
      return next;
    });
  }, [hunkCount, scrollToHunk]);

  const canApplyToEditor = otherText != null && !loadErr && !busy;
  const canApplyHunk = !busy && otherText != null;

  const title = source.kind === 'disk' ? 'Compare with disk version' : 'Merge with backup';
  const applyAllLabel = source.kind === 'disk' ? 'Use disk version' : 'Use entire backup file';
  const otherColLabel = source.kind === 'disk' ? 'Disk version' : 'Backup';

  const subLabel = useMemo(() => {
    if (source.kind === 'backup') {
      const rel = pathRelativeToVault(vaultRoot, source.backupUri) || source.backupUri;
      return (
        <>
          Backup (left): <span className="backup-merge-panel__path">{rel}</span>
          {' — '}your note (right).
        </>
      );
    }
    return 'Disk version (left) vs. your note (right). Apply individual changes or use one side entirely.';
  }, [source, vaultRoot]);

  function handleApplyHunk(hunkIndex: number) {
    const hunk = hunks[hunkIndex];
    if (!hunk) return;
    setLocalBody(prev => applyHunkToText(prev, hunk));
  }

  const hunkSegments = segments.filter(s => s.kind === 'hunk');
  let hunkRenderIdx = 0;
  hunkEls.current = [];

  return (
    <div
      className="backup-merge-panel"
      data-app-surface="capture"
      role="region"
      aria-label="Compare note versions"
      onKeyDown={e => {
        if (e.key === 'j' || (e.key === 'ArrowDown' && e.altKey)) {
          e.preventDefault();
          goNext();
        } else if (e.key === 'k' || (e.key === 'ArrowUp' && e.altKey)) {
          e.preventDefault();
          goPrev();
        }
      }}
    >
      <div className="backup-merge-panel__header">
        <div className="backup-merge-panel__header-top">
          <h2 className="backup-merge-panel__title">{title}</h2>
          {hunkCount > 0 ? (
            <div className="backup-merge-panel__hunk-nav">
              <span className="backup-merge-panel__hunk-count muted">
                {hunkCount} {hunkCount === 1 ? 'change' : 'changes'}
              </span>
              <button
                type="button"
                className="ghost backup-merge-panel__hunk-nav-btn"
                disabled={hunkCount === 0 || focusedHunkIdx === 0}
                onClick={goPrev}
                title="Previous change (k)"
                aria-label="Previous change"
              >
                ↑
              </button>
              <button
                type="button"
                className="ghost backup-merge-panel__hunk-nav-btn"
                disabled={hunkCount === 0 || focusedHunkIdx >= hunkCount - 1}
                onClick={goNext}
                title="Next change (j)"
                aria-label="Next change"
              >
                ↓
              </button>
            </div>
          ) : null}
        </div>
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
            Apply to editor{hunkCount === 0 && otherText != null ? ' (identical)' : ''}
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
          <span>{otherColLabel}</span>
          <span>Current</span>
        </div>
        <div className="backup-merge-panel__diff-body">
          {otherText == null && loadErr == null ? (
            <p className="muted backup-merge-panel__loading">Loading…</p>
          ) : null}
          {segments.map((seg, i) => {
            if (seg.kind === 'context') {
              const isEllipsis = seg.lines.length === 1 && seg.lines[0]!.startsWith('…');
              if (isEllipsis) {
                return (
                  <div key={i} className="backup-merge-panel__context-ellipsis">
                    {seg.lines[0]}
                  </div>
                );
              }
              return (
                <div key={i} className="backup-merge-panel__context">
                  <pre className="backup-merge-panel__context-col">
                    {seg.lines.map((line, j) => (
                      <div key={j} className="backup-merge-panel__context-line">{line}</div>
                    ))}
                  </pre>
                  <pre className="backup-merge-panel__context-col">
                    {seg.lines.map((line, j) => (
                      <div key={j} className="backup-merge-panel__context-line">{line}</div>
                    ))}
                  </pre>
                </div>
              );
            }

            // Hunk: left = other (seg.rightLines), right = current (seg.leftLines)
            const otherLines = seg.rightLines;
            const currentLines = seg.leftLines;
            const isAddition = otherLines.length > 0 && currentLines.length === 0;
            const isDeletion = otherLines.length === 0 && currentLines.length > 0;
            const hunkLabel = isAddition ? 'Addition' : isDeletion ? 'Deletion' : 'Change';
            const thisHunkRenderIdx = hunkRenderIdx++;
            const isFocused = thisHunkRenderIdx === focusedHunkIdx;

            return (
              <div
                key={i}
                ref={el => {
                  if (el) hunkEls.current[thisHunkRenderIdx] = el;
                }}
                className={
                  isFocused
                    ? 'backup-merge-panel__hunk backup-merge-panel__hunk--focused'
                    : 'backup-merge-panel__hunk'
                }
              >
                <div className="backup-merge-panel__hunk-header">
                  <span className="backup-merge-panel__hunk-label muted">{hunkLabel}</span>
                  <button
                    type="button"
                    className="backup-merge-panel__hunk-apply"
                    disabled={!canApplyHunk}
                    onClick={() => handleApplyHunk(seg.index)}
                    title="Apply this change to your note"
                  >
                    ← Apply
                  </button>
                </div>
                <div className="backup-merge-panel__hunk-cols">
                  <pre className="backup-merge-panel__hunk-pre backup-merge-panel__hunk-pre--left">
                    {otherLines.length === 0 ? (
                      <div className="backup-merge-panel__hunk-empty">(empty)</div>
                    ) : (
                      otherLines.map((line, j) => (
                        <div key={j} className="backup-merge-panel__line backup-merge-panel__line--ins">
                          {line}
                        </div>
                      ))
                    )}
                  </pre>
                  <pre className="backup-merge-panel__hunk-pre backup-merge-panel__hunk-pre--right">
                    {currentLines.length === 0 ? (
                      <div className="backup-merge-panel__hunk-empty">(empty)</div>
                    ) : (
                      currentLines.map((line, j) => (
                        <div key={j} className="backup-merge-panel__line backup-merge-panel__line--del">
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
            <p className="muted backup-merge-panel__no-diff">
              No differences — both sides are identical.
            </p>
          ) : null}
        </div>
      </div>
      {hunkSegments.length > 0 ? (
        <div className="backup-merge-panel__footer-hint muted">
          j / Alt+↓ next change &nbsp;·&nbsp; k / Alt+↑ previous change
        </div>
      ) : null}
    </div>
  );
}

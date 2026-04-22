import type {VaultFilesystem} from '@eskerra/core';
import {splitYamlFrontmatter} from '@eskerra/core';
import {useEffect, useMemo, useState} from 'react';

import {normalizeVaultMarkdownDiskRead} from '../hooks/inboxNoteBodyCache';
import {splitLines} from '../lib/lineLcs';

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
  onKeepLocal,
  busy,
}: BackupMergePanelProps) {
  const [loadedText, setLoadedText] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

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

  const {leftLines, rightLines} = useMemo(() => {
    const a = splitLines(currentBody);
    const b = otherText != null ? splitLines(otherText) : [];
    const n = Math.max(a.length, b.length, 1);
    const l: string[] = [];
    const r: string[] = [];
    for (let i = 0; i < n; i++) {
      l.push(a[i] ?? '');
      r.push(b[i] ?? '');
    }
    return {leftLines: l, rightLines: r};
  }, [currentBody, otherText]);

  const canApply = otherText != null && !loadErr && !busy;

  const title =
    source.kind === 'disk' ? 'Compare with disk version' : 'Merge with backup';
  const otherColLabel =
    source.kind === 'disk' ? 'Disk version (read-only)' : 'Backup (read-only)';
  const applyLabel =
    source.kind === 'disk' ? 'Use disk version' : 'Use entire backup file';

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
    return 'This note (left) vs. version on disk (right). Choose which to keep.';
  }, [source, vaultRoot]);

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
            className="primary"
            disabled={!canApply}
            onClick={() => {
              void onApplyOther();
            }}
          >
            {applyLabel}
          </button>
        </div>
      </div>
      {loadErr != null ? (
        <p className="backup-merge-panel__err" role="alert">
          {loadErr}
        </p>
      ) : null}
      <div className="backup-merge-panel__grid">
        <div className="backup-merge-panel__col">
          <div className="backup-merge-panel__col-label">Current note (body)</div>
          <pre className="backup-merge-panel__pre">
            {leftLines.map((line, i) => (
              <div
                key={i}
                className={
                  rightLines[i] !== line
                    ? 'backup-merge-panel__line backup-merge-panel__line--diff'
                    : 'backup-merge-panel__line'
                }
              >
                {line}
              </div>
            ))}
          </pre>
        </div>
        <div className="backup-merge-panel__col">
          <div className="backup-merge-panel__col-label">{otherColLabel}</div>
          <pre className="backup-merge-panel__pre">
            {rightLines.map((line, i) => (
              <div
                key={i}
                className={
                  leftLines[i] !== line
                    ? 'backup-merge-panel__line backup-merge-panel__line--diff'
                    : 'backup-merge-panel__line'
                }
              >
                {line}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

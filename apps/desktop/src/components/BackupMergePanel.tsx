import type {VaultFilesystem} from '@eskerra/core';
import {splitYamlFrontmatter} from '@eskerra/core';
import {useEffect, useMemo, useState} from 'react';

import {normalizeVaultMarkdownDiskRead} from '../hooks/inboxNoteBodyCache';
import {splitLines} from '../lib/lineLcs';

type BackupMergePanelProps = {
  vaultRoot: string;
  fs: VaultFilesystem;
  backupUri: string;
  currentBody: string;
  onClose: () => void;
  onApplyFullBackup: () => void | Promise<void>;
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
  backupUri,
  currentBody,
  onClose,
  onApplyFullBackup,
  busy,
}: BackupMergePanelProps) {
  const [backupText, setBackupText] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await fs.readFile(backupUri, {encoding: 'utf8'});
        if (cancelled) {
          return;
        }
        const {body} = splitYamlFrontmatter(raw);
        setBackupText(normalizeVaultMarkdownDiskRead(body));
        setLoadErr(null);
      } catch (e) {
        if (cancelled) {
          return;
        }
        setLoadErr(e instanceof Error ? e.message : String(e));
        setBackupText(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fs, backupUri]);

  const {leftLines, rightLines} = useMemo(() => {
    const a = splitLines(currentBody);
    const b = backupText != null ? splitLines(backupText) : [];
    const n = Math.max(a.length, b.length, 1);
    const l: string[] = [];
    const r: string[] = [];
    for (let i = 0; i < n; i++) {
      l.push(a[i] ?? '');
      r.push(b[i] ?? '');
    }
    return {leftLines: l, rightLines: r};
  }, [currentBody, backupText]);

  const canApply = backupText != null && !loadErr && !busy;
  const backupFileName = useMemo(
    () => pathRelativeToVault(vaultRoot, backupUri) || backupUri,
    [vaultRoot, backupUri],
  );

  return (
    <div
      className="backup-merge-panel"
      data-app-surface="capture"
      role="region"
      aria-label="Compare note with conflict backup"
    >
      <div className="backup-merge-panel__header">
        <h2 className="backup-merge-panel__title">Merge with backup</h2>
        <p className="backup-merge-panel__sub muted">
          This note (left) vs. backup on disk:{' '}
          <span className="backup-merge-panel__path">{backupFileName}</span>
        </p>
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
          <button
            type="button"
            className="primary"
            disabled={!canApply}
            onClick={() => {
              void onApplyFullBackup();
            }}
          >
            Use entire backup file
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
          <div className="backup-merge-panel__col-label">Backup (read-only)</div>
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

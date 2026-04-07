import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type RefObject,
} from 'react';

import {
  buildInboxWikiLinkCompletionCandidates,
  type VaultMarkdownRef,
} from '@eskerra/core';

import {
  NoteMarkdownEditor,
  type NoteMarkdownEditorHandle,
} from '../editor/noteEditor/NoteMarkdownEditor';
import {createNoteInboxAttachmentHost} from '../lib/noteInboxAttachmentHost';
import {
  inboxRelativeMarkdownLinkHrefIsResolved,
  inboxWikiLinkTargetIsResolved,
} from '../lib/inboxWikiLinkNavigation';
import {resolveVaultImagePreviewUrl} from '../lib/resolveVaultImagePreviewUrl';
import {
  enumerateTodayHubMondays,
  mergeTodayRowColumns,
  splitTodayRowIntoColumns,
  todayHubColumnCount,
  todayHubRowUri,
  type TodayHubWorkspaceBridge,
  type TodayHubSettings,
} from '../lib/todayHub';
import {INBOX_AUTOSAVE_DEBOUNCE_MS} from '../lib/inboxAutosaveScheduler';

type TodayHubCanvasProps = {
  vaultRoot: string;
  /** Currently open hub note `…/Today.md` (canonical vault URI). */
  todayNoteUri: string;
  hubSettings: TodayHubSettings;
  inboxContentByUri: Record<string, string>;
  vaultMarkdownRefs: VaultMarkdownRef[];
  /** Bridge methods assigned by this component; workspace reads for flush + wiki parent. */
  bridgeRef: MutableRefObject<TodayHubWorkspaceBridge>;
  wikiNavParentRef: MutableRefObject<string | null>;
  cellEditorRef: RefObject<NoteMarkdownEditorHandle | null>;
  onWikiLinkActivate: (payload: {inner: string; at: number}) => void;
  onMarkdownRelativeLinkActivate: (payload: {href: string; at: number}) => void;
  onMarkdownExternalLinkOpen: (payload: {href: string; at: number}) => void;
  onEditorError: (message: string) => void;
  onSaveShortcut: () => void;
  prehydrateTodayHubRows: (rowUris: readonly string[]) => Promise<void>;
  persistTodayHubRow: (
    rowUri: string,
    mergedMarkdown: string,
    columnCount: number,
  ) => Promise<void>;
};

function normUri(u: string): string {
  return u.replace(/\\/g, '/');
}

export function TodayHubCanvas({
  vaultRoot,
  todayNoteUri,
  hubSettings,
  inboxContentByUri,
  vaultMarkdownRefs,
  bridgeRef,
  wikiNavParentRef,
  cellEditorRef,
  onWikiLinkActivate,
  onMarkdownRelativeLinkActivate,
  onMarkdownExternalLinkOpen,
  onEditorError,
  onSaveShortcut,
  prehydrateTodayHubRows,
  persistTodayHubRow,
}: TodayHubCanvasProps) {
  const hubDirectoryUri = useMemo(
    () => normUri(todayNoteUri).replace(/\/[^/]+$/, ''),
    [todayNoteUri],
  );

  const columnCount = todayHubColumnCount(hubSettings);

  const mondays = useMemo(() => enumerateTodayHubMondays(new Date()), []);

  const rowUris = useMemo(
    () => mondays.map(m => todayHubRowUri(hubDirectoryUri, m)),
    [mondays, hubDirectoryUri],
  );

  const noteRefs = useMemo(
    () => vaultMarkdownRefs.map(r => ({name: r.name, uri: r.uri})),
    [vaultMarkdownRefs],
  );

  const [active, setActive] = useState<{uri: string; col: number} | null>(null);

  const wikiLinkCompletionCandidates = useMemo(
    () => buildInboxWikiLinkCompletionCandidates(noteRefs),
    [noteRefs],
  );

  const relativeMarkdownSourceUriOrDir = active?.uri ?? todayNoteUri;

  const relativeMarkdownLinkHrefIsResolved = useMemo(
    () => (href: string) =>
      inboxRelativeMarkdownLinkHrefIsResolved(
        noteRefs,
        relativeMarkdownSourceUriOrDir,
        vaultRoot,
        href,
      ),
    [noteRefs, relativeMarkdownSourceUriOrDir, vaultRoot],
  );

  const wikiLinkTargetIsResolvedFn = useMemo(
    () => (inner: string) => inboxWikiLinkTargetIsResolved(noteRefs, inner),
    [noteRefs],
  );

  const inboxAttachmentHost = useMemo(() => createNoteInboxAttachmentHost(), []);
  const [localRowSections, setLocalRowSections] = useState<Record<string, string[]>>(
    {},
  );
  const [cellSessionNonce, setCellSessionNonce] = useState(0);

  const debounceTimerRef = useRef<number | null>(null);
  const pendingPersistRef = useRef<{uri: string; columnCount: number} | null>(null);
  const inboxContentByUriRef = useRef(inboxContentByUri);

  useLayoutEffect(() => {
    inboxContentByUriRef.current = inboxContentByUri;
  }, [inboxContentByUri]);

  useEffect(() => {
    void prehydrateTodayHubRows(rowUris);
  }, [prehydrateTodayHubRows, rowUris]);

  const getSections = useCallback(
    (uri: string): string[] => {
      const key = normUri(uri);
      if (localRowSections[key]) {
        return localRowSections[key];
      }
      const raw = inboxContentByUri[key] ?? '';
      return splitTodayRowIntoColumns(raw, columnCount);
    },
    [localRowSections, inboxContentByUri, columnCount],
  );

  const mergeForRow = useCallback(
    (uri: string) => mergeTodayRowColumns(getSections(uri)),
    [getSections],
  );

  const flushScheduledPersist = useCallback(async () => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const pending = pendingPersistRef.current;
    pendingPersistRef.current = null;
    if (pending) {
      const merged = mergeForRow(pending.uri);
      await persistTodayHubRow(pending.uri, merged, pending.columnCount);
    }
  }, [mergeForRow, persistTodayHubRow]);

  const schedulePersist = useCallback(
    (uri: string) => {
      pendingPersistRef.current = {uri, columnCount};
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        void (async () => {
          const p = pendingPersistRef.current;
          pendingPersistRef.current = null;
          if (!p) {
            return;
          }
          const merged = mergeForRow(p.uri);
          await persistTodayHubRow(p.uri, merged, p.columnCount);
        })();
      }, INBOX_AUTOSAVE_DEBOUNCE_MS);
    },
    [columnCount, mergeForRow, persistTodayHubRow],
  );

  const openCell = useCallback(
    (uri: string, col: number) => {
      const key = normUri(uri);
      void flushScheduledPersist().then(() => {
        const raw = inboxContentByUriRef.current[key] ?? '';
        const initial = splitTodayRowIntoColumns(raw, columnCount);
        setLocalRowSections(prev => ({...prev, [key]: initial}));
        setCellSessionNonce(n => n + 1);
        setActive({uri: key, col});
      });
    },
    [columnCount, flushScheduledPersist],
  );

  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void flushScheduledPersist();
        setActive(null);
        wikiNavParentRef.current = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, flushScheduledPersist, wikiNavParentRef]);

  useLayoutEffect(() => {
    wikiNavParentRef.current = active?.uri ?? null;
  }, [active, wikiNavParentRef]);

  useLayoutEffect(() => {
    const bridge = bridgeRef.current;
    const flushFn = flushScheduledPersist;
    bridge.flushPendingEdits = flushFn;
    bridge.getLiveRowUri = () => active?.uri ?? null;
    bridge.getLiveRowMergedMarkdown = () => {
      if (!active) {
        return null;
      }
      return mergeForRow(active.uri);
    };
    return () => {
      if (bridge.flushPendingEdits === flushFn) {
        bridge.flushPendingEdits = async () => {};
        bridge.getLiveRowUri = () => null;
        bridge.getLiveRowMergedMarkdown = () => null;
      }
    };
  }, [bridgeRef, active, flushScheduledPersist, mergeForRow]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const updateActiveColumnText = useCallback(
    (text: string) => {
      if (!active) {
        return;
      }
      setLocalRowSections(prev => {
        const cur = [...(prev[active.uri] ?? getSections(active.uri))];
        cur[active.col] = text;
        return {...prev, [active.uri]: cur};
      });
      schedulePersist(active.uri);
    },
    [active, getSections, schedulePersist],
  );

  const columnHeaders = useMemo(() => {
    const h: string[] = [];
    for (let c = 0; c < columnCount; c++) {
      h.push(c === 0 ? '' : hubSettings.columns[c - 1] ?? `Column ${c + 1}`);
    }
    return h;
  }, [columnCount, hubSettings.columns]);

  const rowLabel = useCallback((d: Date) => {
    try {
      return d.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return String(d.getTime());
    }
  }, []);

  return (
    <div
      className="today-hub-canvas"
      role="region"
      aria-label="Today hub weekly canvas"
      style={
        {
          ['--today-hub-col-count' as string]: String(columnCount),
        } as CSSProperties
      }
    >
      <div className="today-hub-canvas__header">
        <span className="today-hub-canvas__title">Weeks</span>
        {columnHeaders.map((label, ci) => (
          <span key={ci} className="today-hub-canvas__col-head">
            {label || ' '}
          </span>
        ))}
      </div>
      <div className="today-hub-canvas__rows">
        {mondays.map((mon, ri) => {
          const uri = normUri(rowUris[ri]!);
          const sections = getSections(uri);
          const isActiveRow = active?.uri === uri;
          return (
            <div key={uri} className="today-hub-canvas__row">
              <div className="today-hub-canvas__row-label">
                <span className="today-hub-canvas__row-date">{rowLabel(mon)}</span>
              </div>
              {sections.map((chunk, ci) => {
                const editing = isActiveRow && active?.col === ci;
                return (
                  <div
                    key={ci}
                    className={
                      editing
                        ? 'today-hub-canvas__cell today-hub-canvas__cell--editing'
                        : 'today-hub-canvas__cell'
                    }
                  >
                    {editing ? (
                      <div className="today-hub-canvas__cm-host">
                        <NoteMarkdownEditor
                          ref={cellEditorRef}
                          vaultRoot={vaultRoot}
                          attachmentHost={inboxAttachmentHost}
                          resolveVaultImagePreviewUrl={resolveVaultImagePreviewUrl}
                          activeNotePath={uri}
                          initialMarkdown={chunk}
                          sessionKey={cellSessionNonce}
                          onMarkdownChange={updateActiveColumnText}
                          onEditorError={onEditorError}
                          onWikiLinkActivate={onWikiLinkActivate}
                          relativeMarkdownLinkHrefIsResolved={
                            relativeMarkdownLinkHrefIsResolved
                          }
                          onMarkdownRelativeLinkActivate={onMarkdownRelativeLinkActivate}
                          onMarkdownExternalLinkOpen={onMarkdownExternalLinkOpen}
                          wikiLinkTargetIsResolved={wikiLinkTargetIsResolvedFn}
                          wikiLinkCompletionCandidates={wikiLinkCompletionCandidates}
                          onSaveShortcut={onSaveShortcut}
                          placeholder="Write markdown…"
                          busy={false}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="today-hub-canvas__cell-readonly"
                        onClick={() => openCell(uri, ci)}
                      >
                        {chunk.trim() ? (
                          <pre className="today-hub-canvas__pre">{chunk}</pre>
                        ) : (
                          <span className="muted today-hub-canvas__cell-hint">
                            Click to edit
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

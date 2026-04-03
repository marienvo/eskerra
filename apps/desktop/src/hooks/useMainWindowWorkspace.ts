import {listen} from '@tauri-apps/api/event';
import {load} from '@tauri-apps/plugin-store';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import {
  buildInboxMarkdownFromCompose,
  ensureDeviceInstanceId,
  markdownContainsTransientImageUrls,
  parseComposeInput,
  sanitizeInboxNoteStem,
  stemFromMarkdownFileName,
  type NoteboxSettings,
  type VaultFilesystem,
} from '@notebox/core';

import type {NoteMarkdownEditorHandle} from '../editor/noteEditor/NoteMarkdownEditor';
import {openOrCreateInboxWikiLinkTarget} from '../lib/inboxWikiLinkNavigation';
import {
  createInboxAutosaveScheduler,
  INBOX_AUTOSAVE_DEBOUNCE_MS,
} from '../lib/inboxAutosaveScheduler';
import {persistTransientMarkdownImages} from '../lib/persistTransientMarkdownImages';
import {
  bootstrapVaultLayout,
  createInboxMarkdownNote,
  deleteInboxMarkdownNote,
  listInboxNotes,
  prefetchInboxMarkdownBodies,
  readVaultLocalSettings,
  renameInboxMarkdownNote,
  readVaultSettings,
  saveNoteMarkdown,
  syncInboxMarkdownIndex,
  writeVaultLocalSettings,
} from '../lib/vaultBootstrap';
import {
  getVaultSession,
  setVaultSession,
  startVaultWatch,
} from '../lib/tauriVault';
import {listInboxWikiLinkBacklinkReferrersForTarget} from '../lib/inboxWikiLinkBacklinkIndex';
import {
  applyInboxWikiLinkRenameMaintenance,
  planInboxWikiLinkRenameMaintenance,
} from '../lib/inboxWikiLinkRenameMaintenance';

const STORE_PATH = 'notebox-desktop.json';
const STORE_KEY_VAULT = 'vaultRoot';

/** Debounce scan of the active note body for backlinks (full vault scan is too heavy per keystroke). */
const INBOX_BACKLINK_BODY_DEBOUNCE_MS = 200;

type NoteRow = {lastModified: number | null; name: string; uri: string};

type LastPersisted = {uri: string; markdown: string};

export type UseMainWindowWorkspaceResult = {
  vaultRoot: string | null;
  vaultSettings: NoteboxSettings | null;
  settingsName: string;
  notes: NoteRow[];
  selectedUri: string | null;
  editorBody: string;
  inboxEditorResetNonce: number;
  busy: boolean;
  err: string | null;
  composingNewEntry: boolean;
  inboxContentByUri: Record<string, string>;
  selectedNoteBacklinkUris: readonly string[];
  fsRefreshNonce: number;
  deviceInstanceId: string;
  setErr: (value: string | null) => void;
  setEditorBody: (value: string) => void;
  hydrateVault: (root: string) => Promise<void>;
  startNewEntry: () => void;
  cancelNewEntry: () => void;
  selectNote: (uri: string) => void;
  submitNewEntry: () => Promise<void>;
  /** Ctrl/Cmd+S dispatch for Inbox editor (submit while composing, save otherwise). */
  onInboxSaveShortcut: () => void;
  /** Await before closing the window or leaving the vault; cancels pending debounced save and runs persist. */
  flushInboxSave: () => Promise<void>;
  /** Editor intent entrypoint for wiki link open/create. */
  onWikiLinkActivate: (payload: {inner: string; at: number}) => void;
  deleteNote: (uri: string) => Promise<void>;
  renameNote: (uri: string, nextDisplayName: string) => Promise<void>;
  /** True once persisted inbox shell state has been considered for the current vault. */
  inboxShellRestored: boolean;
  /** True after the first vault bootstrap attempt from persisted session (success, empty, or error). */
  initialVaultHydrateAttemptDone: boolean;
};

export function useMainWindowWorkspace(options: {
  fs: VaultFilesystem;
  inboxEditorRef: RefObject<NoteMarkdownEditorHandle | null>;
  restoredInboxState: {
    vaultRoot: string;
    composingNewEntry: boolean;
    selectedUri: string | null;
  } | null;
  inboxRestoreEnabled: boolean;
}): UseMainWindowWorkspaceResult {
  const {fs, inboxEditorRef, restoredInboxState, inboxRestoreEnabled} = options;
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);
  const [vaultSettings, setVaultSettings] = useState<NoteboxSettings | null>(null);
  const [settingsName, setSettingsName] = useState('Notebox');
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [editorBody, setEditorBody] = useState('');
  const [inboxEditorResetNonce, setInboxEditorResetNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [composingNewEntry, setComposingNewEntry] = useState(false);
  const [inboxContentByUri, setInboxContentByUri] = useState<Record<string, string>>({});
  const [fsRefreshNonce, setFsRefreshNonce] = useState(0);
  const [deviceInstanceId, setDeviceInstanceId] = useState('');
  const [initialVaultHydrateAttemptDone, setInitialVaultHydrateAttemptDone] =
    useState(false);
  const [inboxShellRestored, setInboxShellRestored] = useState(true);
  const [backlinksActiveBody, setBacklinksActiveBody] = useState('');

  const inboxBodyPrefetchGenRef = useRef(0);
  const vaultRootRef = useRef<string | null>(null);
  const selectedUriRef = useRef<string | null>(null);
  const composingNewEntryRef = useRef(false);
  const editorBodyRef = useRef('');
  const lastPersistedRef = useRef<LastPersisted | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const autosaveSchedulerRef = useRef(
    createInboxAutosaveScheduler(INBOX_AUTOSAVE_DEBOUNCE_MS),
  );
  const flushInboxSaveRef = useRef<() => Promise<void>>(async () => {});
  const inboxContentByUriRef = useRef<Record<string, string>>({});

  vaultRootRef.current = vaultRoot;
  selectedUriRef.current = selectedUri;
  composingNewEntryRef.current = composingNewEntry;
  editorBodyRef.current = editorBody;
  inboxContentByUriRef.current = inboxContentByUri;

  const selectedNoteBacklinkUris = useMemo(() => {
    if (composingNewEntry || !selectedUri) {
      return [] as const;
    }
    return listInboxWikiLinkBacklinkReferrersForTarget({
      targetUri: selectedUri,
      notes: notes.map(n => ({name: n.name, uri: n.uri})),
      contentByUri: inboxContentByUri,
      activeUri: selectedUri,
      activeBody: backlinksActiveBody,
    });
  }, [composingNewEntry, selectedUri, notes, inboxContentByUri, backlinksActiveBody]);

  const refreshNotes = useCallback(
    async (root: string) => {
      const gen = ++inboxBodyPrefetchGenRef.current;
      const list = await listInboxNotes(root, fs);
      if (gen !== inboxBodyPrefetchGenRef.current) {
        return;
      }
      setNotes(list);
      const bodies = await prefetchInboxMarkdownBodies(list, fs);
      if (gen !== inboxBodyPrefetchGenRef.current) {
        return;
      }
      setInboxContentByUri(bodies);
    },
    [fs],
  );

  const enqueueInboxPersist = useCallback(async (): Promise<void> => {
    const run = async (): Promise<void> => {
      const root = vaultRootRef.current;
      const uri = selectedUriRef.current;
      if (!root || !uri || composingNewEntryRef.current) {
        return;
      }
      const raw =
        inboxEditorRef.current?.getMarkdown() ?? editorBodyRef.current;
      const prev = lastPersistedRef.current;
      if (prev && prev.uri === uri && prev.markdown === raw) {
        return;
      }
      try {
        setErr(null);
        const md = await persistTransientMarkdownImages(raw, root);
        if (markdownContainsTransientImageUrls(md)) {
          setErr(
            'Cannot save: some images are still temporary (blob or data URLs). Paste images again so they are stored under Assets/Attachments, or remove those image references.',
          );
          return;
        }
        if (md !== raw) {
          inboxEditorRef.current?.loadMarkdown(md);
          setEditorBody(md);
        }
        await saveNoteMarkdown(uri, fs, md);
        await refreshNotes(root);
        if (selectedUriRef.current !== uri || composingNewEntryRef.current) {
          return;
        }
        lastPersistedRef.current = {uri, markdown: md};
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    };

    const next = saveChainRef.current.then(run);
    saveChainRef.current = next.catch(() => undefined);
    await next;
  }, [fs, refreshNotes, inboxEditorRef]);

  const flushInboxSave = useCallback(async () => {
    autosaveSchedulerRef.current.cancel();
    await enqueueInboxPersist();
  }, [enqueueInboxPersist]);

  flushInboxSaveRef.current = flushInboxSave;

  const hydrateVault = useCallback(
    async (root: string) => {
      await flushInboxSaveRef.current();
      setBusy(true);
      setErr(null);
      setVaultSettings(null);
      try {
        await setVaultSession(root);
        await bootstrapVaultLayout(root, fs);
        await syncInboxMarkdownIndex(root, fs);
        const shared = await readVaultSettings(root, fs);
        setVaultSettings(shared);
        let local = await readVaultLocalSettings(root, fs);
        const ensuredLocal = ensureDeviceInstanceId(local);
        if (ensuredLocal.changed) {
          local = ensuredLocal.settings;
          await writeVaultLocalSettings(root, fs, local);
        }
        setDeviceInstanceId(local.deviceInstanceId);
        const label = local.displayName.trim();
        setSettingsName(label !== '' ? label : 'Notebox');
        await refreshNotes(root);
        setSelectedUri(null);
        setComposingNewEntry(false);
        setEditorBody('');
        lastPersistedRef.current = null;
        setInboxEditorResetNonce(n => n + 1);
        setVaultRoot(root);
        const store = await load(STORE_PATH);
        await store.set(STORE_KEY_VAULT, root);
        await store.save();
        await startVaultWatch();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [fs, refreshNotes],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await load(STORE_PATH);
        const saved = await store.get<string>(STORE_KEY_VAULT);
        const fromStore = typeof saved === 'string' ? saved.trim() : '';
        const session = (await getVaultSession())?.trim() ?? '';
        const root = fromStore || session;
        if (root && !cancelled) {
          await hydrateVault(root);
        }
      } catch {
        // first launch
      } finally {
        if (!cancelled) {
          setInitialVaultHydrateAttemptDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateVault]);

  useEffect(() => {
    if (!vaultRoot) {
      return;
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen('vault-files-changed', () => {
      void refreshNotes(vaultRoot);
      setFsRefreshNonce(n => n + 1);
      void (async () => {
        try {
          const next = await readVaultSettings(vaultRoot, fs);
          setVaultSettings(next);
        } catch {
          // ignore: transient FS race
        }
      })();
    })
      .then(fn => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [vaultRoot, refreshNotes, fs]);

  useLayoutEffect(() => {
    if (!vaultRoot || !selectedUri) {
      return;
    }
    const cached = inboxContentByUriRef.current[selectedUri];
    if (cached !== undefined) {
      setEditorBody(cached);
      lastPersistedRef.current = {uri: selectedUri, markdown: cached};
    } else {
      setEditorBody('');
    }
    setInboxEditorResetNonce(n => n + 1);
  }, [vaultRoot, selectedUri]);

  useLayoutEffect(() => {
    if (composingNewEntry || !selectedUri) {
      setBacklinksActiveBody('');
      return;
    }
    const snap = inboxContentByUriRef.current[selectedUri];
    setBacklinksActiveBody(snap ?? '');
  }, [selectedUri, composingNewEntry, vaultRoot]);

  useEffect(() => {
    if (composingNewEntry || !selectedUri) {
      return;
    }
    const id = window.setTimeout(() => {
      setBacklinksActiveBody(editorBody);
    }, INBOX_BACKLINK_BODY_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [editorBody, selectedUri, composingNewEntry]);

  useEffect(() => {
    if (!vaultRoot || !selectedUri) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const raw = await fs.readFile(selectedUri, {encoding: 'utf8'});
        if (!cancelled) {
          const normalized = raw.replace(/\n$/, '');
          lastPersistedRef.current = {uri: selectedUri, markdown: normalized};
          setInboxContentByUri(prev => {
            if (prev[selectedUri] === normalized) {
              return prev;
            }
            return {...prev, [selectedUri]: normalized};
          });
          if (normalized !== editorBodyRef.current) {
            setEditorBody(normalized);
            setInboxEditorResetNonce(n => n + 1);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultRoot, selectedUri, fs]);

  useEffect(() => {
    if (!vaultRoot || !selectedUri || composingNewEntry) {
      autosaveSchedulerRef.current.cancel();
      return;
    }
    if (lastPersistedRef.current?.uri !== selectedUri) {
      autosaveSchedulerRef.current.cancel();
      return;
    }
    const prev = lastPersistedRef.current;
    if (prev && prev.uri === selectedUri && prev.markdown === editorBody) {
      return;
    }
    const scheduler = autosaveSchedulerRef.current;
    scheduler.schedule(() => {
      void enqueueInboxPersist();
    });
    return () => {
      scheduler.cancel();
    };
  }, [vaultRoot, selectedUri, composingNewEntry, editorBody, enqueueInboxPersist]);

  const addNote = useCallback(
    async (title: string, body: string) => {
      if (!vaultRoot) {
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        const created = await createInboxMarkdownNote(vaultRoot, fs, title, body);
        await refreshNotes(vaultRoot);
        setSelectedUri(created.uri);
        setComposingNewEntry(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes],
  );

  const startNewEntry = useCallback(() => {
    void (async () => {
      await flushInboxSaveRef.current();
      setErr(null);
      setComposingNewEntry(true);
      setSelectedUri(null);
      setEditorBody('');
      lastPersistedRef.current = null;
      setInboxEditorResetNonce(n => n + 1);
    })();
  }, []);

  const cancelNewEntry = useCallback(() => {
    void (async () => {
      await flushInboxSaveRef.current();
      setComposingNewEntry(false);
      setEditorBody('');
      setInboxEditorResetNonce(n => n + 1);
    })();
  }, []);

  const selectNote = useCallback((uri: string) => {
    void (async () => {
      await flushInboxSaveRef.current();
      setComposingNewEntry(false);
      setSelectedUri(uri);
    })();
  }, []);

  const submitNewEntry = useCallback(async () => {
    if (!vaultRoot) {
      return;
    }
    setErr(null);
    const rawBody = inboxEditorRef.current?.getMarkdown() ?? editorBody;
    let body = rawBody;
    try {
      body = await persistTransientMarkdownImages(body, vaultRoot);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return;
    }
    if (markdownContainsTransientImageUrls(body)) {
      setErr(
        'Cannot create this note: some images are still temporary (blob or data URLs). Paste images again so they are stored under Assets/Attachments, or remove those image references.',
      );
      return;
    }
    if (body !== rawBody) {
      inboxEditorRef.current?.loadMarkdown(body);
      setEditorBody(body);
    }
    const {titleLine, bodyAfterBlank} = parseComposeInput(body);
    if (!titleLine.trim()) {
      setErr('First line is required.');
      return;
    }
    const fullMarkdown = buildInboxMarkdownFromCompose(titleLine, bodyAfterBlank);
    await addNote(titleLine, fullMarkdown);
  }, [addNote, editorBody, inboxEditorRef, vaultRoot]);

  const onInboxSaveShortcut = useCallback(() => {
    if (composingNewEntryRef.current) {
      void submitNewEntry();
    } else {
      void flushInboxSave();
    }
  }, [submitNewEntry, flushInboxSave]);

  const deleteNote = useCallback(
    async (uri: string) => {
      if (!vaultRoot) {
        return;
      }
      autosaveSchedulerRef.current.cancel();
      const wasOpen = selectedUri === uri;
      if (wasOpen) {
        selectedUriRef.current = null;
        composingNewEntryRef.current = false;
        lastPersistedRef.current = null;
        setSelectedUri(null);
        setComposingNewEntry(false);
        setEditorBody('');
        setInboxEditorResetNonce(n => n + 1);
      }
      await saveChainRef.current.catch(() => undefined);

      setBusy(true);
      setErr(null);
      try {
        await deleteInboxMarkdownNote(vaultRoot, uri, fs);
        setInboxContentByUri(prev => {
          const next = {...prev};
          delete next[uri];
          return next;
        });
        await refreshNotes(vaultRoot);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes, selectedUri],
  );

  const renameNote = useCallback(
    async (uri: string, nextDisplayName: string) => {
      if (!vaultRoot) {
        return;
      }
      autosaveSchedulerRef.current.cancel();
      await flushInboxSaveRef.current();

      setBusy(true);
      setErr(null);
      try {
        const preRenameNotes = notes.map(n => ({name: n.name, uri: n.uri}));
        const preRenameContent = inboxContentByUriRef.current;
        const activeUri = selectedUriRef.current;
        const activeBody =
          activeUri != null
            ? (inboxEditorRef.current?.getMarkdown() ?? editorBodyRef.current)
            : '';
        const planStartedAt = performance.now();
        const plannedStem = sanitizeInboxNoteStem(nextDisplayName);
        const preRenamePlan = plannedStem
          ? planInboxWikiLinkRenameMaintenance({
              oldTargetUri: uri,
              renamedStem: plannedStem,
              notes: preRenameNotes,
              contentByUri: preRenameContent,
              activeUri,
              activeBody,
            })
          : {
              updates: [],
              scannedFileCount: preRenameNotes.length,
              touchedFileCount: 0,
              touchedBytes: 0,
              updatedLinkCount: 0,
              skippedAmbiguousLinkCount: 0,
            };
        const planDurationMs = performance.now() - planStartedAt;
        if (
          preRenamePlan.updatedLinkCount > 0
          || preRenamePlan.skippedAmbiguousLinkCount > 0
        ) {
          const confirmed = window.confirm(
            [
              'Rename note and maintain wiki links?',
              '',
              `Scanned files: ${preRenamePlan.scannedFileCount}`,
              `Files to update: ${preRenamePlan.touchedFileCount}`,
              `Links to update: ${preRenamePlan.updatedLinkCount}`,
              `Ambiguous links skipped: ${preRenamePlan.skippedAmbiguousLinkCount}`,
            ].join('\n'),
          );
          if (!confirmed) {
            return;
          }
        }

        const nextUri = await renameInboxMarkdownNote(vaultRoot, uri, nextDisplayName, fs);
        const nextName = nextUri.split('/').pop();
        const renamedStem = nextName ? stemFromMarkdownFileName(nextName) : plannedStem;
        const rewritePlan =
          renamedStem && renamedStem !== plannedStem
            ? planInboxWikiLinkRenameMaintenance({
                oldTargetUri: uri,
                renamedStem,
                notes: preRenameNotes,
                contentByUri: preRenameContent,
                activeUri,
                activeBody,
              })
            : preRenamePlan;
        const applyStartedAt = performance.now();
        const applyResult = await applyInboxWikiLinkRenameMaintenance({
          fs,
          oldUri: uri,
          newUri: nextUri,
          updates: rewritePlan.updates,
        });
        const applyDurationMs = performance.now() - applyStartedAt;
        console.info('[WL-5] rename-maintenance', {
          oldUri: uri,
          newUri: nextUri,
          scannedFiles: rewritePlan.scannedFileCount,
          touchedFiles: rewritePlan.touchedFileCount,
          touchedBytes: rewritePlan.touchedBytes,
          updatedLinks: rewritePlan.updatedLinkCount,
          skippedAmbiguous: rewritePlan.skippedAmbiguousLinkCount,
          failedWrites: applyResult.failed.length,
          planDurationMs: Math.round(planDurationMs),
          applyDurationMs: Math.round(applyDurationMs),
        });
        const succeededWriteUris = new Set(applyResult.succeededUris);
        const plannedContentByWriteUri = new Map<string, string>();
        for (const update of rewritePlan.updates) {
          const writeUri = update.uri === uri ? nextUri : update.uri;
          plannedContentByWriteUri.set(writeUri, update.markdown);
        }
        setInboxContentByUri(prev => {
          const next = {...prev};
          if (nextUri !== uri && prev[uri] !== undefined) {
            next[nextUri] = prev[uri];
            delete next[uri];
          }
          for (const [writeUri, markdown] of plannedContentByWriteUri) {
            if (succeededWriteUris.has(writeUri)) {
              next[writeUri] = markdown;
            }
          }
          return next;
        });
        if (selectedUriRef.current === uri) {
          selectedUriRef.current = nextUri;
          setSelectedUri(nextUri);
          const previousPersisted = lastPersistedRef.current;
          if (previousPersisted && previousPersisted.uri === uri) {
            lastPersistedRef.current = {uri: nextUri, markdown: previousPersisted.markdown};
          }
        }
        if (applyResult.failed.length > 0) {
          const list = applyResult.failed.map(f => f.uri).join(', ');
          setErr(
            `Renamed note, but wiki-link updates failed for ${applyResult.failed.length} file(s): ${list}`,
          );
        }
        await refreshNotes(vaultRoot);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes, notes, inboxEditorRef],
  );

  const activateWikiLink = useCallback(
    async ({inner, at}: {inner: string; at: number}) => {
      if (!vaultRoot) {
        return;
      }
      await flushInboxSaveRef.current();
      try {
        const result = await openOrCreateInboxWikiLinkTarget({
          inner,
          notes: notes.map(n => ({name: n.name, uri: n.uri})),
          vaultRoot,
          fs,
        });
        if (result.kind === 'open' || result.kind === 'created') {
          if (result.kind === 'created') {
            await refreshNotes(vaultRoot);
          } else if (result.canonicalInner) {
            inboxEditorRef.current?.replaceWikiLinkInnerAt({
              at,
              expectedInner: inner,
              replacementInner: result.canonicalInner,
            });
          }
          setComposingNewEntry(false);
          setSelectedUri(result.uri);
          return;
        }
        if (result.kind === 'ambiguous') {
          const names = result.notes.map(n => n.name).join(', ');
          setErr(
            `Ambiguous wiki link target: "${inner}" matches multiple notes (${names}).`,
          );
          return;
        }
        if (result.reason === 'path_not_supported') {
          setErr(
            `Wiki link "${inner}" is outside Inbox scope for now. Only Inbox targets are supported in this MVP.`,
          );
        } else {
          setErr('Wiki link target is empty.');
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [vaultRoot, notes, fs, refreshNotes, inboxEditorRef],
  );

  const onWikiLinkActivate = useCallback(
    (payload: {inner: string; at: number}) => {
      void activateWikiLink(payload);
    },
    [activateWikiLink],
  );

  useEffect(() => {
    if (!vaultRoot) {
      setInboxShellRestored(true);
      return;
    }
    setInboxShellRestored(false);
  }, [vaultRoot]);

  useEffect(() => {
    if (!vaultRoot) {
      return;
    }
    if (!inboxRestoreEnabled || inboxShellRestored) {
      return;
    }
    if (restoredInboxState && restoredInboxState.vaultRoot === vaultRoot) {
      if (restoredInboxState.composingNewEntry) {
        startNewEntry();
      } else if (
        restoredInboxState.selectedUri &&
        notes.some(n => n.uri === restoredInboxState.selectedUri)
      ) {
        selectNote(restoredInboxState.selectedUri);
      }
    }
    setInboxShellRestored(true);
  }, [
    vaultRoot,
    inboxRestoreEnabled,
    inboxShellRestored,
    restoredInboxState,
    notes,
    startNewEntry,
    selectNote,
  ]);

  return {
    vaultRoot,
    vaultSettings,
    settingsName,
    notes,
    selectedUri,
    editorBody,
    inboxEditorResetNonce,
    busy,
    err,
    composingNewEntry,
    inboxContentByUri,
    selectedNoteBacklinkUris,
    fsRefreshNonce,
    deviceInstanceId,
    setErr,
    setEditorBody,
    hydrateVault,
    startNewEntry,
    cancelNewEntry,
    selectNote,
    submitNewEntry,
    onInboxSaveShortcut,
    flushInboxSave,
    onWikiLinkActivate,
    deleteNote,
    renameNote,
    inboxShellRestored,
    initialVaultHydrateAttemptDone,
  };
}

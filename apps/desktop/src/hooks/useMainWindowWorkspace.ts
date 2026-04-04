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
  collectVaultMarkdownRefs,
  ensureDeviceInstanceId,
  markdownContainsTransientImageUrls,
  normalizeVaultBaseUri,
  parseComposeInput,
  sanitizeInboxNoteStem,
  stemFromMarkdownFileName,
  SubtreeMarkdownPresenceCache,
  type NoteboxSettings,
  type VaultFilesystem,
  type VaultMarkdownRef,
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
  deleteVaultMarkdownNote,
  deleteVaultTreeDirectory,
  listInboxNotes,
  readVaultLocalSettings,
  readVaultSettings,
  renameVaultMarkdownNote,
  renameVaultTreeDirectory,
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

type PendingWikiLinkAmbiguityRename = {
  uri: string;
  nextDisplayName: string;
  summary: {
    scannedFileCount: number;
    touchedFileCount: number;
    touchedBytes: number;
    updatedLinkCount: number;
    skippedAmbiguousLinkCount: number;
  };
};

type RenameLinkProgress = {done: number; total: number};

const LARGE_RENAME_MIN_TOUCHED_FILES = 60;
const LARGE_RENAME_MIN_TOUCHED_BYTES = 768 * 1024;
const RENAME_APPLY_YIELD_EVERY_WRITES = 24;
const RENAME_NOTICE_TTL_MS = 5000;

async function loadMarkdownBodiesForWikiMaintenance(
  fs: VaultFilesystem,
  refs: ReadonlyArray<{uri: string}>,
  seed: Readonly<Record<string, string>>,
  activeUri: string | null,
  activeBody: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {...seed};
  for (const {uri} of refs) {
    if (activeUri != null && uri === activeUri) {
      out[uri] = activeBody;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(out, uri)) {
      continue;
    }
    try {
      const raw = await fs.readFile(uri, {encoding: 'utf8'});
      out[uri] = raw.replace(/\n$/, '');
    } catch {
      out[uri] = '';
    }
  }
  return out;
}

function replaceVaultUriPrefix(uri: string, oldPrefix: string, newPrefix: string): string | null {
  const u = uri.replace(/\\/g, '/');
  const o = oldPrefix.replace(/\\/g, '/').replace(/\/+$/, '');
  const n = newPrefix.replace(/\\/g, '/').replace(/\/+$/, '');
  if (u === o) {
    return n;
  }
  if (u.startsWith(`${o}/`)) {
    return `${n}/${u.slice(o.length + 1)}`;
  }
  return null;
}

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
  /** Vault-wide markdown index for wiki resolve, autocomplete, and link styling (async; may lag the tree). */
  vaultMarkdownRefs: VaultMarkdownRef[];
  selectedNoteBacklinkUris: readonly string[];
  fsRefreshNonce: number;
  deviceInstanceId: string;
  inboxRenameNotice: string | null;
  renameLinkProgress: RenameLinkProgress | null;
  pendingWikiLinkAmbiguityRename: PendingWikiLinkAmbiguityRename | null;
  confirmPendingWikiLinkAmbiguityRename: () => Promise<void>;
  cancelPendingWikiLinkAmbiguityRename: () => void;
  setErr: (value: string | null) => void;
  setEditorBody: (value: string) => void;
  hydrateVault: (root: string) => Promise<void>;
  startNewEntry: () => void;
  cancelNewEntry: () => void;
  selectNote: (uri: string) => void;
  submitNewEntry: () => Promise<void>;
  /** Ctrl/Cmd+S dispatch for Inbox editor (submit while composing, save otherwise). */
  onInboxSaveShortcut: () => void;
  /** Close the open note (folder selected in vault tree) after flushing any pending save. */
  clearVaultNoteSelection: () => void;
  /** Await before closing the window or leaving the vault; cancels pending debounced save and runs persist. */
  flushInboxSave: () => Promise<void>;
  /** Editor intent entrypoint for wiki link open/create. */
  onWikiLinkActivate: (payload: {inner: string; at: number}) => void;
  deleteNote: (uri: string) => Promise<void>;
  renameNote: (uri: string, nextDisplayName: string) => Promise<void>;
  subtreeMarkdownCache: SubtreeMarkdownPresenceCache;
  deleteFolder: (directoryUri: string) => Promise<void>;
  renameFolder: (directoryUri: string, nextDisplayName: string) => Promise<void>;
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
  const [vaultMarkdownRefs, setVaultMarkdownRefs] = useState<VaultMarkdownRef[]>([]);
  const [fsRefreshNonce, setFsRefreshNonce] = useState(0);
  const [deviceInstanceId, setDeviceInstanceId] = useState('');
  const [initialVaultHydrateAttemptDone, setInitialVaultHydrateAttemptDone] =
    useState(false);
  const [inboxShellRestored, setInboxShellRestored] = useState(true);
  const [backlinksActiveBody, setBacklinksActiveBody] = useState('');
  const [inboxRenameNotice, setInboxRenameNotice] = useState<string | null>(null);
  const [renameLinkProgress, setRenameLinkProgress] = useState<RenameLinkProgress | null>(
    null,
  );
  const [pendingWikiLinkAmbiguityRename, setPendingWikiLinkAmbiguityRename] =
    useState<PendingWikiLinkAmbiguityRename | null>(null);

  const subtreeMarkdownCacheRef = useRef(new SubtreeMarkdownPresenceCache());
  const inboxBodyPrefetchGenRef = useRef(0);
  const vaultRefsBuildGenRef = useRef(0);
  const vaultMarkdownRefsRef = useRef<VaultMarkdownRef[]>([]);
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
  const renameNoticeTimeoutRef = useRef<number | null>(null);

  vaultRootRef.current = vaultRoot;
  selectedUriRef.current = selectedUri;
  composingNewEntryRef.current = composingNewEntry;
  editorBodyRef.current = editorBody;
  inboxContentByUriRef.current = inboxContentByUri;

  const clearRenameNotice = useCallback(() => {
    if (renameNoticeTimeoutRef.current != null) {
      window.clearTimeout(renameNoticeTimeoutRef.current);
      renameNoticeTimeoutRef.current = null;
    }
    setInboxRenameNotice(null);
  }, []);

  const setTransientRenameNotice = useCallback(
    (message: string) => {
      clearRenameNotice();
      setInboxRenameNotice(message);
      renameNoticeTimeoutRef.current = window.setTimeout(() => {
        setInboxRenameNotice(null);
        renameNoticeTimeoutRef.current = null;
      }, RENAME_NOTICE_TTL_MS);
    },
    [clearRenameNotice],
  );

  useEffect(() => {
    return () => {
      if (renameNoticeTimeoutRef.current != null) {
        window.clearTimeout(renameNoticeTimeoutRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    vaultMarkdownRefsRef.current = vaultMarkdownRefs;
  }, [vaultMarkdownRefs]);

  const refreshNotes = useCallback(
    async (root: string) => {
      const gen = ++inboxBodyPrefetchGenRef.current;
      const list = await listInboxNotes(root, fs);
      if (gen !== inboxBodyPrefetchGenRef.current) {
        return;
      }
      setNotes(list);
      setInboxContentByUri(prev => {
        const keep = new Set(list.map(n => n.uri));
        const next = {...prev};
        for (const k of Object.keys(next)) {
          if (!keep.has(k)) {
            delete next[k];
          }
        }
        return next;
      });
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
      clearRenameNotice();
      setRenameLinkProgress(null);
      setPendingWikiLinkAmbiguityRename(null);
      subtreeMarkdownCacheRef.current.invalidateAll();
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
    [fs, refreshNotes, clearRenameNotice],
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
      subtreeMarkdownCacheRef.current.invalidateAll();
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

  useEffect(() => {
    if (!vaultRoot) {
      setVaultMarkdownRefs([]);
      return;
    }
    const gen = ++vaultRefsBuildGenRef.current;
    const ac = new AbortController();
    void (async () => {
      try {
        const refs = await collectVaultMarkdownRefs(vaultRoot, fs, {signal: ac.signal});
        if (gen !== vaultRefsBuildGenRef.current) {
          return;
        }
        setVaultMarkdownRefs(refs);
      } catch (e) {
        if (ac.signal.aborted) {
          return;
        }
        console.warn('[vaultMarkdownRefs]', e);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [vaultRoot, fs, fsRefreshNonce]);

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
        subtreeMarkdownCacheRef.current.invalidateForMutation(
          vaultRoot,
          created.uri,
          'file',
        );
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
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

  const clearVaultNoteSelection = useCallback(() => {
    void (async () => {
      await flushInboxSaveRef.current();
      setComposingNewEntry(false);
      setSelectedUri(null);
      setEditorBody('');
      lastPersistedRef.current = null;
      composingNewEntryRef.current = false;
      selectedUriRef.current = null;
      setInboxEditorResetNonce(n => n + 1);
    })();
  }, []);

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
        await deleteVaultMarkdownNote(vaultRoot, uri, fs);
        subtreeMarkdownCacheRef.current.invalidateForMutation(vaultRoot, uri, 'file');
        setInboxContentByUri(prev => {
          const next = {...prev};
          delete next[uri];
          return next;
        });
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes, selectedUri],
  );

  const runRenameWithWikiLinkMaintenance = useCallback(
    async (options: {
      uri: string;
      nextDisplayName: string;
      forceApplyDespiteAmbiguity: boolean;
    }) => {
      if (!vaultRoot) {
        return;
      }
      const {uri, nextDisplayName, forceApplyDespiteAmbiguity} = options;
      autosaveSchedulerRef.current.cancel();
      await flushInboxSaveRef.current();

      setBusy(true);
      setErr(null);
      clearRenameNotice();
      setRenameLinkProgress(null);
      try {
        const wikiRefs = vaultMarkdownRefsRef.current.map(r => ({
          name: r.name,
          uri: r.uri,
        }));
        const activeUri = selectedUriRef.current;
        const activeBody =
          activeUri != null
            ? (inboxEditorRef.current?.getMarkdown() ?? editorBodyRef.current)
            : '';
        const expandedContent = await loadMarkdownBodiesForWikiMaintenance(
          fs,
          wikiRefs,
          inboxContentByUriRef.current,
          activeUri,
          activeBody,
        );
        const planStartedAt = performance.now();
        const plannedStem = sanitizeInboxNoteStem(nextDisplayName);
        const preRenamePlan = plannedStem
          ? planInboxWikiLinkRenameMaintenance({
              oldTargetUri: uri,
              renamedStem: plannedStem,
              notes: wikiRefs,
              contentByUri: expandedContent,
              activeUri,
              activeBody,
            })
          : {
              updates: [],
              scannedFileCount: wikiRefs.length,
              touchedFileCount: 0,
              touchedBytes: 0,
              updatedLinkCount: 0,
              skippedAmbiguousLinkCount: 0,
            };
        const planDurationMs = performance.now() - planStartedAt;
        if (
          preRenamePlan.skippedAmbiguousLinkCount > 0
          && !forceApplyDespiteAmbiguity
        ) {
          setPendingWikiLinkAmbiguityRename({
            uri,
            nextDisplayName,
            summary: {
              scannedFileCount: preRenamePlan.scannedFileCount,
              touchedFileCount: preRenamePlan.touchedFileCount,
              touchedBytes: preRenamePlan.touchedBytes,
              updatedLinkCount: preRenamePlan.updatedLinkCount,
              skippedAmbiguousLinkCount: preRenamePlan.skippedAmbiguousLinkCount,
            },
          });
          return;
        }
        setPendingWikiLinkAmbiguityRename(null);

        const nextUri = await renameVaultMarkdownNote(vaultRoot, uri, nextDisplayName, fs);
        const nextName = nextUri.split('/').pop();
        const renamedStem = nextName ? stemFromMarkdownFileName(nextName) : plannedStem;
        const rewritePlan =
          renamedStem && renamedStem !== plannedStem
            ? planInboxWikiLinkRenameMaintenance({
                oldTargetUri: uri,
                renamedStem,
                notes: wikiRefs,
                contentByUri: expandedContent,
                activeUri,
                activeBody,
              })
            : preRenamePlan;
        const showLargeImpactProgress =
          rewritePlan.skippedAmbiguousLinkCount === 0 &&
          (rewritePlan.touchedFileCount >= LARGE_RENAME_MIN_TOUCHED_FILES ||
            rewritePlan.touchedBytes >= LARGE_RENAME_MIN_TOUCHED_BYTES);
        if (showLargeImpactProgress && rewritePlan.touchedFileCount > 0) {
          setRenameLinkProgress({done: 0, total: rewritePlan.touchedFileCount});
        }
        const applyStartedAt = performance.now();
        const applyResult = await applyInboxWikiLinkRenameMaintenance({
          fs,
          oldUri: uri,
          newUri: nextUri,
          updates: rewritePlan.updates,
          onProgress:
            showLargeImpactProgress && rewritePlan.touchedFileCount > 0
              ? (done, total) => {
                  setRenameLinkProgress({done, total});
                }
              : undefined,
          yieldEveryWrites: showLargeImpactProgress
            ? RENAME_APPLY_YIELD_EVERY_WRITES
            : 0,
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
        } else if (rewritePlan.updatedLinkCount > 0) {
          const noteLabel = rewritePlan.touchedFileCount === 1 ? 'note' : 'notes';
          setTransientRenameNotice(
            `Updated links in ${rewritePlan.touchedFileCount} ${noteLabel}.`,
          );
        }
        subtreeMarkdownCacheRef.current.invalidateForMutation(vaultRoot, uri, 'file');
        if (nextUri !== uri) {
          subtreeMarkdownCacheRef.current.invalidateForMutation(vaultRoot, nextUri, 'file');
        }
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setRenameLinkProgress(null);
        setBusy(false);
      }
    },
    [
      vaultRoot,
      fs,
      refreshNotes,
      inboxEditorRef,
      clearRenameNotice,
      setTransientRenameNotice,
    ],
  );

  const renameNote = useCallback(
    async (uri: string, nextDisplayName: string) => {
      await runRenameWithWikiLinkMaintenance({
        uri,
        nextDisplayName,
        forceApplyDespiteAmbiguity: false,
      });
    },
    [runRenameWithWikiLinkMaintenance],
  );

  const confirmPendingWikiLinkAmbiguityRename = useCallback(async () => {
    const pending = pendingWikiLinkAmbiguityRename;
    if (!pending) {
      return;
    }
    await runRenameWithWikiLinkMaintenance({
      uri: pending.uri,
      nextDisplayName: pending.nextDisplayName,
      forceApplyDespiteAmbiguity: true,
    });
  }, [pendingWikiLinkAmbiguityRename, runRenameWithWikiLinkMaintenance]);

  const cancelPendingWikiLinkAmbiguityRename = useCallback(() => {
    setPendingWikiLinkAmbiguityRename(null);
  }, []);

  const activateWikiLink = useCallback(
    async ({inner, at}: {inner: string; at: number}) => {
      if (!vaultRoot) {
        return;
      }
      await flushInboxSaveRef.current();
      try {
        const result = await openOrCreateInboxWikiLinkTarget({
          inner,
          notes: vaultMarkdownRefsRef.current.map(r => ({name: r.name, uri: r.uri})),
          vaultRoot,
          fs,
          activeMarkdownUri: composingNewEntryRef.current
            ? null
            : selectedUriRef.current,
        });
        if (result.kind === 'open' || result.kind === 'created') {
          if (result.kind === 'created') {
            subtreeMarkdownCacheRef.current.invalidateForMutation(
              vaultRoot,
              result.uri,
              'file',
            );
            await refreshNotes(vaultRoot);
            setFsRefreshNonce(n => n + 1);
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
            `Wiki link targets must be a single note name, not a path (link: "${inner}").`,
          );
        } else {
          setErr('Wiki link target is empty.');
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [vaultRoot, fs, refreshNotes, inboxEditorRef],
  );

  const onWikiLinkActivate = useCallback(
    (payload: {inner: string; at: number}) => {
      void activateWikiLink(payload);
    },
    [activateWikiLink],
  );

  const deleteFolder = useCallback(
    async (directoryUri: string) => {
      if (!vaultRoot) {
        return;
      }
      autosaveSchedulerRef.current.cancel();
      const normDir = directoryUri.replace(/\\/g, '/').replace(/\/+$/, '');
      const selected = selectedUriRef.current?.replace(/\\/g, '/');
      if (
        selected
        && (selected === normDir || selected.startsWith(`${normDir}/`))
      ) {
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
        await deleteVaultTreeDirectory(vaultRoot, directoryUri, fs);
        subtreeMarkdownCacheRef.current.invalidateForMutation(
          vaultRoot,
          directoryUri,
          'directory',
        );
        setInboxContentByUri(prev => {
          const norm = normDir;
          const next = {...prev};
          for (const k of Object.keys(next)) {
            const kn = k.replace(/\\/g, '/');
            if (kn === norm || kn.startsWith(`${norm}/`)) {
              delete next[k];
            }
          }
          return next;
        });
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes],
  );

  const renameFolder = useCallback(
    async (directoryUri: string, nextDisplayName: string) => {
      if (!vaultRoot) {
        return;
      }
      autosaveSchedulerRef.current.cancel();
      await flushInboxSaveRef.current();
      setBusy(true);
      setErr(null);
      clearRenameNotice();
      try {
        const oldUri = directoryUri.replace(/\\/g, '/').replace(/\/+$/, '');
        const nextUri = await renameVaultTreeDirectory(
          vaultRoot,
          directoryUri,
          nextDisplayName,
          fs,
        );
        const normalizedNext = nextUri.replace(/\\/g, '/');
        subtreeMarkdownCacheRef.current.invalidateForMutation(
          vaultRoot,
          oldUri,
          'directory',
        );
        subtreeMarkdownCacheRef.current.invalidateForMutation(
          vaultRoot,
          normalizedNext,
          'directory',
        );
        setInboxContentByUri(prev => {
          const next = {...prev};
          for (const k of Object.keys(prev)) {
            const mapped = replaceVaultUriPrefix(k, oldUri, normalizedNext);
            if (mapped && mapped !== k && prev[k] !== undefined) {
              next[mapped] = prev[k]!;
              delete next[k];
            }
          }
          return next;
        });
        {
          let nextSel: string | null = selectedUriRef.current;
          if (nextSel) {
            const mappedSel = replaceVaultUriPrefix(
              nextSel.replace(/\\/g, '/'),
              oldUri,
              normalizedNext,
            );
            nextSel = mappedSel ?? nextSel;
          }
          selectedUriRef.current = nextSel;
          setSelectedUri(nextSel);
        }
        const lp = lastPersistedRef.current;
        if (lp) {
          const mappedLp = replaceVaultUriPrefix(lp.uri, oldUri, normalizedNext);
          if (mappedLp) {
            lastPersistedRef.current = {...lp, uri: mappedLp};
          }
        }
        await refreshNotes(vaultRoot);
        setFsRefreshNonce(n => n + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [vaultRoot, fs, refreshNotes, clearRenameNotice],
  );

  useEffect(() => {
    if (!vaultRoot) {
      setInboxShellRestored(true);
      return;
    }
    setInboxShellRestored(false);
  }, [vaultRoot]);

  useEffect(() => {
    setPendingWikiLinkAmbiguityRename(null);
    setRenameLinkProgress(null);
    clearRenameNotice();
  }, [vaultRoot, clearRenameNotice]);

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
      } else if (restoredInboxState.selectedUri) {
        const uri = restoredInboxState.selectedUri.replace(/\\/g, '/');
        const root = normalizeVaultBaseUri(vaultRoot).replace(/\/+$/, '');
        const inVault = uri === root || uri.startsWith(`${root}/`);
        if (
          inVault
          && (notes.some(n => n.uri === uri) || uri.toLowerCase().endsWith('.md'))
        ) {
          selectNote(restoredInboxState.selectedUri);
        }
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
    vaultMarkdownRefs,
    selectedNoteBacklinkUris,
    fsRefreshNonce,
    deviceInstanceId,
    inboxRenameNotice,
    renameLinkProgress,
    pendingWikiLinkAmbiguityRename,
    confirmPendingWikiLinkAmbiguityRename,
    cancelPendingWikiLinkAmbiguityRename,
    setErr,
    setEditorBody,
    hydrateVault,
    startNewEntry,
    cancelNewEntry,
    selectNote,
    submitNewEntry,
    onInboxSaveShortcut,
    clearVaultNoteSelection,
    flushInboxSave,
    onWikiLinkActivate,
    deleteNote,
    renameNote,
    subtreeMarkdownCache: subtreeMarkdownCacheRef.current,
    deleteFolder,
    renameFolder,
    inboxShellRestored,
    initialVaultHydrateAttemptDone,
  };
}

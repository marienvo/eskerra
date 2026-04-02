import {listen} from '@tauri-apps/api/event';
import {load} from '@tauri-apps/plugin-store';
import {useCallback, useEffect, useRef, useState, type RefObject} from 'react';

import {
  buildInboxMarkdownFromCompose,
  ensureDeviceInstanceId,
  markdownContainsTransientImageUrls,
  parseComposeInput,
  type NoteboxSettings,
  type VaultFilesystem,
} from '@notebox/core';

import type {NoteMarkdownEditorHandle} from '../editor/noteEditor/NoteMarkdownEditor';
import {openOrCreateInboxWikiLinkTarget} from '../lib/inboxWikiLinkNavigation';
import {persistTransientMarkdownImages} from '../lib/persistTransientMarkdownImages';
import {
  bootstrapVaultLayout,
  createInboxMarkdownNote,
  listInboxNotes,
  prefetchInboxMarkdownBodies,
  readVaultLocalSettings,
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

const STORE_PATH = 'notebox-desktop.json';
const STORE_KEY_VAULT = 'vaultRoot';

type NoteRow = {lastModified: number | null; name: string; uri: string};

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
  fsRefreshNonce: number;
  deviceInstanceId: string;
  setErr: (value: string | null) => void;
  setEditorBody: (value: string) => void;
  hydrateVault: (root: string) => Promise<void>;
  refreshNotes: (root: string) => Promise<void>;
  startNewEntry: () => void;
  cancelNewEntry: () => void;
  selectNote: (uri: string) => void;
  submitNewEntry: () => Promise<void>;
  saveNote: () => Promise<void>;
  onWikiLinkActivate: (payload: {inner: string}) => Promise<void>;
};

export function useMainWindowWorkspace(options: {
  fs: VaultFilesystem;
  inboxEditorRef: RefObject<NoteMarkdownEditorHandle | null>;
}): UseMainWindowWorkspaceResult {
  const {fs, inboxEditorRef} = options;
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

  const inboxBodyPrefetchGenRef = useRef(0);

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

  const hydrateVault = useCallback(
    async (root: string) => {
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

  useEffect(() => {
    if (!vaultRoot || !selectedUri) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await fs.readFile(selectedUri, {encoding: 'utf8'});
        if (!cancelled) {
          const normalized = raw.replace(/\n$/, '');
          setEditorBody(normalized);
          setInboxContentByUri(prev => ({...prev, [selectedUri]: normalized}));
          setInboxEditorResetNonce(n => n + 1);
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
    setErr(null);
    setComposingNewEntry(true);
    setSelectedUri(null);
    setEditorBody('');
    setInboxEditorResetNonce(n => n + 1);
  }, []);

  const cancelNewEntry = useCallback(() => {
    setComposingNewEntry(false);
    setEditorBody('');
    setInboxEditorResetNonce(n => n + 1);
  }, []);

  const selectNote = useCallback((uri: string) => {
    setComposingNewEntry(false);
    setSelectedUri(uri);
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

  const saveNote = useCallback(async () => {
    if (!selectedUri || !vaultRoot) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const raw = inboxEditorRef.current?.getMarkdown() ?? editorBody;
      const md = await persistTransientMarkdownImages(raw, vaultRoot);
      if (markdownContainsTransientImageUrls(md)) {
        throw new Error(
          'Cannot save: some images are still temporary (blob or data URLs). Paste images again so they are stored under Assets/Attachments, or remove those image references.',
        );
      }
      if (md !== raw) {
        inboxEditorRef.current?.loadMarkdown(md);
        setEditorBody(md);
      }
      await saveNoteMarkdown(selectedUri, fs, md);
      await refreshNotes(vaultRoot);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [selectedUri, vaultRoot, inboxEditorRef, editorBody, fs, refreshNotes]);

  const onWikiLinkActivate = useCallback(
    async ({inner}: {inner: string}) => {
      if (!vaultRoot) {
        return;
      }
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
    [vaultRoot, notes, fs, refreshNotes],
  );

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
    fsRefreshNonce,
    deviceInstanceId,
    setErr,
    setEditorBody,
    hydrateVault,
    refreshNotes,
    startNewEntry,
    cancelNewEntry,
    selectNote,
    submitNewEntry,
    saveNote,
    onWikiLinkActivate,
  };
}

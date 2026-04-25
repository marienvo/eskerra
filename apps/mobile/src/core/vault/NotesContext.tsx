import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {InteractionManager} from 'react-native';

import {resolveTodayHubPrefetchUrisForSession} from '../storage/sessionTodayHubPrefetch';
import {tryPrepareEskerraSessionNative} from '../storage/androidVaultListing';
import {touchMarkdownNoteUris, touchVaultSearchNoteUris} from '../../native/eskerraVaultSearch';
import {
  createNote,
  deleteInboxNotes,
  listNotes,
  readNote,
  writeNoteContent,
} from '../storage/eskerraStorage';
import {normalizeNoteUri} from '../storage/noteUriNormalize';
import {NoteDetail, NoteSummary} from '../../types';
import {useVaultContext} from './VaultContext';

type RefreshOptions = {
  silent?: boolean;
};

type NotesContextValue = {
  create: (title: string, content: string) => Promise<NoteSummary>;
  deleteNotes: (noteUris: string[]) => Promise<void>;
  error: string | null;
  isLoading: boolean;
  notes: NoteSummary[];
  read: (noteUri: string) => Promise<NoteDetail>;
  refresh: (options?: RefreshOptions) => Promise<void>;
  write: (noteUri: string, content: string) => Promise<void>;
};

const NotesContext = createContext<NotesContextValue | null>(null);

function sortByLastModifiedDesc(left: NoteSummary, right: NoteSummary): number {
  const leftLastModified = left.lastModified ?? 0;
  const rightLastModified = right.lastModified ?? 0;
  const delta = rightLastModified - leftLastModified;
  if (delta !== 0) {
    return delta;
  }
  return left.name.localeCompare(right.name);
}

function getUriFileName(uri: string): string {
  return uri.split('/').pop() ?? uri;
}

function resolveCanonicalDeleteNote(
  inputUri: string,
  availableNotes: readonly NoteSummary[],
): NoteSummary | null {
  const exactMatch = availableNotes.find(note => note.uri === inputUri);
  if (exactMatch) {
    return exactMatch;
  }

  const inputFileName = getUriFileName(inputUri);
  const sameNameMatches = availableNotes.filter(note => note.name === inputFileName);
  if (sameNameMatches.length === 1) {
    return sameNameMatches[0];
  }

  return null;
}

export function mergeInboxNoteOptimistic(
  previousNotes: NoteSummary[],
  createdNote: NoteSummary,
): NoteSummary[] {
  const nextNotes = previousNotes.filter(note => note.uri !== createdNote.uri);
  nextNotes.push(createdNote);
  nextNotes.sort(sortByLastModifiedDesc);
  return nextNotes;
}

type NotesProviderProps = {
  children: ReactNode;
};

export function NotesProvider({children}: NotesProviderProps) {
  const {
    baseUri,
    clearInboxContentCache,
    consumeInboxPrefetch,
    getInboxNoteContentFromCache,
    getTodayHubNoteContentFromCache,
    notifyPlaylistSyncAfterVaultRefresh,
    pruneInboxNoteContentFromCache,
    pruneTodayHubNoteContentFromCache,
    replaceInboxContentFromSession,
    replaceTodayHubContentFromSession,
    scheduleDebouncedVaultMarkdownRefsRefresh,
    setInboxNoteContentInCache,
    setTodayHubNoteContentInCache,
  } = useVaultContext();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<NoteSummary[]>([]);

  const refresh = useCallback(
    async (options?: RefreshOptions) => {
      if (!baseUri) {
        setNotes([]);
        return;
      }

      const isSilent = options?.silent === true;
      setError(null);
      if (!isSilent) {
        setIsLoading(true);
      }
      try {
        const prefetched = consumeInboxPrefetch(baseUri);
        if (prefetched !== null) {
          setNotes(prefetched);
          return;
        }

        let prefetchHub: string[] | undefined;
        try {
          prefetchHub = await resolveTodayHubPrefetchUrisForSession(baseUri);
        } catch {
          prefetchHub = undefined;
        }
        const prepared = await tryPrepareEskerraSessionNative(baseUri, {
          prefetchNoteUris: prefetchHub,
        });
        if (prepared !== null && prepared.inboxPrefetch !== null) {
          setNotes(prepared.inboxPrefetch);
          replaceInboxContentFromSession(prepared.inboxContentByUri);
          replaceTodayHubContentFromSession(prepared.todayHubContentByUri);
          return;
        }

        clearInboxContentCache();
        const nextNotes = await listNotes(baseUri);
        setNotes(nextNotes);
      } catch (loadError) {
        const fallbackMessage = 'Could not load entries from Vault.';
        setError(loadError instanceof Error ? loadError.message : fallbackMessage);
      } finally {
        if (!isSilent) {
          setIsLoading(false);
        }
        if (baseUri) {
          notifyPlaylistSyncAfterVaultRefresh();
        }
      }
    },
    [
      baseUri,
      clearInboxContentCache,
      consumeInboxPrefetch,
      notifyPlaylistSyncAfterVaultRefresh,
      replaceInboxContentFromSession,
      replaceTodayHubContentFromSession,
    ],
  );

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const create = useCallback(
    async (title: string, content: string) => {
      if (!baseUri) {
        throw new Error('No vault directory selected.');
      }

      const occupiedInboxMarkdownNames = new Set(notes.map(note => note.name));
      const createdNote = await createNote(
        baseUri,
        title,
        content,
        occupiedInboxMarkdownNames,
      );
      touchVaultSearchNoteUris(baseUri, [createdNote.uri]).catch(() => undefined);
      touchMarkdownNoteUris(baseUri, [createdNote.uri]).catch(() => undefined);
      scheduleDebouncedVaultMarkdownRefsRefresh();
      setNotes(previousNotes => mergeInboxNoteOptimistic(previousNotes, createdNote));
      InteractionManager.runAfterInteractions(() => {
        refresh({silent: true}).catch(() => undefined);
      });
      return createdNote;
    },
    [baseUri, notes, refresh, scheduleDebouncedVaultMarkdownRefsRefresh],
  );

  const read = useCallback(
    async (noteUri: string): Promise<NoteDetail> => {
      const cached = getInboxNoteContentFromCache(noteUri);
      if (cached !== undefined) {
        const normalizedNoteUri = normalizeNoteUri(noteUri);
        const nameFromUri = normalizedNoteUri.split('/').pop() ?? 'Untitled.md';
        return {
          content: cached,
          summary: {
            lastModified: null,
            name: nameFromUri,
            uri: normalizedNoteUri,
          },
        };
      }
      const todayCached = getTodayHubNoteContentFromCache(noteUri);
      if (todayCached !== undefined) {
        const normalizedNoteUri = normalizeNoteUri(noteUri);
        const nameFromUri = normalizedNoteUri.split('/').pop() ?? 'Untitled.md';
        return {
          content: todayCached,
          summary: {
            lastModified: null,
            name: nameFromUri,
            uri: normalizedNoteUri,
          },
        };
      }
      return readNote(noteUri);
    },
    [getInboxNoteContentFromCache, getTodayHubNoteContentFromCache],
  );

  const deleteNotes = useCallback(
    async (noteUris: string[]) => {
      if (!baseUri) {
        throw new Error('No vault directory selected.');
      }

      if (noteUris.length === 0) {
        return;
      }

      const canonicalNotes = noteUris
        .map(noteUri => resolveCanonicalDeleteNote(noteUri, notes))
        .filter((note): note is NoteSummary => note !== null);

      if (canonicalNotes.length !== noteUris.length) {
        throw new Error(
          'Could not delete selected entries because one or more entries are no longer available. Refresh Vault and try again.',
        );
      }

      let normalizedBaseUri = baseUri.trim();
      while (normalizedBaseUri.endsWith('/')) {
        normalizedBaseUri = normalizedBaseUri.slice(0, -1);
      }
      const canonicalDeleteUris = canonicalNotes.map(
        note => `${normalizedBaseUri}/Inbox/${note.name}`,
      );

      await deleteInboxNotes(baseUri, canonicalDeleteUris);
      touchVaultSearchNoteUris(baseUri, canonicalDeleteUris).catch(() => undefined);
      touchMarkdownNoteUris(baseUri, canonicalDeleteUris).catch(() => undefined);
      scheduleDebouncedVaultMarkdownRefsRefresh();
      pruneInboxNoteContentFromCache(canonicalDeleteUris);
      pruneTodayHubNoteContentFromCache(canonicalDeleteUris);
      const removedUris = new Set(canonicalNotes.map(note => note.uri));
      setNotes(previousNotes =>
        previousNotes.filter(note => !removedUris.has(note.uri)),
      );
      InteractionManager.runAfterInteractions(() => {
        refresh({silent: true}).catch(() => undefined);
      });
    },
    [
      baseUri,
      notes,
      pruneInboxNoteContentFromCache,
      pruneTodayHubNoteContentFromCache,
      refresh,
      scheduleDebouncedVaultMarkdownRefsRefresh,
    ],
  );

  const write = useCallback(
    async (noteUri: string, content: string) => {
      await writeNoteContent(noteUri, content);
      touchVaultSearchNoteUris(baseUri, [noteUri]).catch(() => undefined);
      touchMarkdownNoteUris(baseUri, [noteUri]).catch(() => undefined);
      scheduleDebouncedVaultMarkdownRefsRefresh();
      setInboxNoteContentInCache(noteUri, content);
      setTodayHubNoteContentInCache(noteUri, content);
      await refresh();
    },
    [
      baseUri,
      refresh,
      scheduleDebouncedVaultMarkdownRefsRefresh,
      setInboxNoteContentInCache,
      setTodayHubNoteContentInCache,
    ],
  );

  const value = useMemo(
    () => ({
      create,
      deleteNotes,
      error,
      isLoading,
      notes,
      read,
      refresh,
      write,
    }),
    [create, deleteNotes, error, isLoading, notes, read, refresh, write],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotesContext(): NotesContextValue {
  const context = useContext(NotesContext);
  if (context === null) {
    throw new Error('useNotes must be used inside NotesProvider.');
  }
  return context;
}

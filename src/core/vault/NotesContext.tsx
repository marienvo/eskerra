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

import {tryPrepareNoteboxSessionNative} from '../storage/androidVaultListing';
import {
  createNote,
  deleteInboxNotes,
  listInboxNotesAndSyncIndex,
  readNote,
  writeNoteContent,
} from '../storage/noteboxStorage';
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
  return rightLastModified - leftLastModified;
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
    pruneInboxNoteContentFromCache,
    replaceInboxContentFromSession,
    setInboxNoteContentInCache,
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

        const prepared = await tryPrepareNoteboxSessionNative(baseUri);
        if (prepared !== null && prepared.inboxPrefetch !== null) {
          setNotes(prepared.inboxPrefetch);
          replaceInboxContentFromSession(prepared.inboxContentByUri);
          return;
        }

        clearInboxContentCache();
        const nextNotes = await listInboxNotesAndSyncIndex(baseUri);
        setNotes(nextNotes);
      } catch (loadError) {
        const fallbackMessage = 'Could not load notes from Vault.';
        setError(loadError instanceof Error ? loadError.message : fallbackMessage);
      } finally {
        if (!isSilent) {
          setIsLoading(false);
        }
      }
    },
    [baseUri, clearInboxContentCache, consumeInboxPrefetch, replaceInboxContentFromSession],
  );

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const create = useCallback(
    async (title: string, content: string) => {
      if (!baseUri) {
        throw new Error('No notes directory selected.');
      }

      const occupiedInboxMarkdownNames = new Set(notes.map(note => note.name));
      const createdNote = await createNote(
        baseUri,
        title,
        content,
        occupiedInboxMarkdownNames,
      );
      setNotes(previousNotes => mergeInboxNoteOptimistic(previousNotes, createdNote));
      InteractionManager.runAfterInteractions(() => {
        refresh({silent: true}).catch(() => undefined);
      });
      return createdNote;
    },
    [baseUri, notes, refresh],
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
      return readNote(noteUri);
    },
    [getInboxNoteContentFromCache],
  );

  const deleteNotes = useCallback(
    async (noteUris: string[]) => {
      if (!baseUri) {
        throw new Error('No notes directory selected.');
      }

      if (noteUris.length === 0) {
        return;
      }

      const canonicalNotes = noteUris
        .map(noteUri => resolveCanonicalDeleteNote(noteUri, notes))
        .filter((note): note is NoteSummary => note !== null);

      if (canonicalNotes.length !== noteUris.length) {
        throw new Error(
          'Could not delete selected notes because one or more notes are no longer available. Refresh Vault and try again.',
        );
      }

      const normalizedBaseUri = baseUri.trim().replace(/\/+$/, '');
      const canonicalDeleteUris = canonicalNotes.map(
        note => `${normalizedBaseUri}/Inbox/${note.name}`,
      );

      await deleteInboxNotes(baseUri, canonicalDeleteUris);
      pruneInboxNoteContentFromCache(canonicalDeleteUris);
      const removedUris = new Set(canonicalNotes.map(note => note.uri));
      setNotes(previousNotes =>
        previousNotes.filter(note => !removedUris.has(note.uri)),
      );
      InteractionManager.runAfterInteractions(() => {
        refresh({silent: true}).catch(() => undefined);
      });
    },
    [baseUri, notes, pruneInboxNoteContentFromCache, refresh],
  );

  const write = useCallback(
    async (noteUri: string, content: string) => {
      await writeNoteContent(noteUri, content);
      setInboxNoteContentInCache(noteUri, content);
      await refresh();
    },
    [refresh, setInboxNoteContentInCache],
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

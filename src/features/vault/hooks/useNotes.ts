import {useCallback, useEffect, useState} from 'react';

import {
  createNote,
  listNotes,
  readNote,
  refreshInboxMarkdownIndex,
  writeNoteContent,
} from '../../../core/storage/noteboxStorage';
import {NoteDetail, NoteSummary} from '../../../types';
import {useVaultContext} from '../../../core/vault/VaultContext';

export function useNotes() {
  const {baseUri} = useVaultContext();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<NoteSummary[]>([]);

  const refresh = useCallback(async () => {
    if (!baseUri) {
      setNotes([]);
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const nextNotes = await listNotes(baseUri);
      await refreshInboxMarkdownIndex(baseUri);
      setNotes(nextNotes);
    } catch (loadError) {
      const fallbackMessage = 'Could not load notes from Vault.';
      setError(loadError instanceof Error ? loadError.message : fallbackMessage);
    } finally {
      setIsLoading(false);
    }
  }, [baseUri]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const create = useCallback(
    async (title: string, content: string) => {
      if (!baseUri) {
        throw new Error('No notes directory selected.');
      }

      const createdNote = await createNote(baseUri, title, content);
      await refresh();
      return createdNote;
    },
    [baseUri, refresh],
  );

  const read = useCallback(async (noteUri: string): Promise<NoteDetail> => {
    return readNote(noteUri);
  }, []);

  const write = useCallback(async (noteUri: string, content: string) => {
    await writeNoteContent(noteUri, content);
    await refresh();
  }, [refresh]);

  return {
    create,
    error,
    isLoading,
    notes,
    read,
    refresh,
    write,
  };
}

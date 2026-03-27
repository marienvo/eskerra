import {useCallback, useState} from 'react';

import type {NoteSummary} from '../../../types';
import {useNotes} from '../../vault/hooks/useNotes';

type SaveOptions = {
  noteUri?: string;
  onSaved?: (created?: NoteSummary) => void;
};

export function useSaveInboxMarkdownNote() {
  const {create, write} = useNotes();
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const save = useCallback(
    async (title: string, content: string, options?: SaveOptions) => {
      const trimmedTitle = title.trim();
      const trimmedContent = content.trim();

      if (!trimmedTitle) {
        setStatusText('Title is required.');
        return false;
      }

      if (!trimmedContent) {
        setStatusText('Note content is required.');
        return false;
      }

      setStatusText(null);
      setIsSaving(true);
      try {
        if (options?.noteUri) {
          await write(options.noteUri, trimmedContent);
          options?.onSaved?.();
        } else {
          const created = await create(trimmedTitle, trimmedContent);
          options?.onSaved?.(created);
        }
        return true;
      } catch (error) {
        const fallbackMessage = 'Could not save this note.';
        setStatusText(error instanceof Error ? error.message : fallbackMessage);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [create, write],
  );

  return {
    isSaving,
    save,
    setStatusText,
    statusText,
  };
}

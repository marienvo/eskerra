import {useCallback, useState} from 'react';

import {useNotes} from '../../vault/hooks/useNotes';

type SaveOptions = {
  onSaved?: () => void;
};

export function useSaveInboxMarkdownNote() {
  const {create} = useNotes();
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
        await create(trimmedTitle, trimmedContent);
        options?.onSaved?.();
        return true;
      } catch (error) {
        const fallbackMessage = 'Could not save this note.';
        setStatusText(error instanceof Error ? error.message : fallbackMessage);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [create],
  );

  return {
    isSaving,
    save,
    setStatusText,
    statusText,
  };
}

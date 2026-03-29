import {useCallback, useState} from 'react';

import {clearUri} from '../../../core/storage/appStorage';
import {writeSettings} from '../../../core/storage/noteboxStorage';
import {NoteboxSettings} from '../../../types';
import {useVaultContext} from '../../../core/vault/VaultContext';

export function useSettings() {
  const {baseUri, setSessionUri, setSettings, settings} = useVaultContext();
  const [isSaving, setIsSaving] = useState(false);

  const saveSettings = useCallback(
    async (nextSettings: NoteboxSettings) => {
      if (!baseUri) {
        throw new Error('No vault directory selected.');
      }

      setIsSaving(true);
      try {
        await writeSettings(baseUri, nextSettings);
        setSettings(nextSettings);
      } finally {
        setIsSaving(false);
      }
    },
    [baseUri, setSettings],
  );

  const clearDirectory = useCallback(async () => {
    setIsSaving(true);
    try {
      await clearUri();
      await setSessionUri(null);
    } finally {
      setIsSaving(false);
    }
  }, [setSessionUri]);

  return {
    baseUri,
    clearDirectory,
    isSaving,
    saveSettings,
    settings,
  };
}

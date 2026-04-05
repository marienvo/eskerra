import {useCallback, useState} from 'react';

import {clearUri} from '../../../core/storage/appStorage';
import {writeLocalSettings, writeSettings} from '../../../core/storage/eskerraStorage';
import {EskerraLocalSettings, EskerraSettings} from '../../../types';
import {useVaultContext} from '../../../core/vault/VaultContext';

/** Persist full shared settings (including optional `r2`) so disk JSON is not stripped. */
export function useSettings() {
  const {
    baseUri,
    localSettings,
    setLocalSettings,
    setSessionUri,
    setSettings,
    settings,
  } = useVaultContext();
  const [isSaving, setIsSaving] = useState(false);

  const saveSettings = useCallback(
    async (nextSettings: EskerraSettings) => {
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

  const saveLocalSettings = useCallback(
    async (next: EskerraLocalSettings) => {
      if (!baseUri) {
        throw new Error('No vault directory selected.');
      }

      setIsSaving(true);
      try {
        await writeLocalSettings(baseUri, next);
        setLocalSettings(next);
      } finally {
        setIsSaving(false);
      }
    },
    [baseUri, setLocalSettings],
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
    localSettings,
    saveSettings,
    saveLocalSettings,
    settings,
  };
}

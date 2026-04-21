import {
  DEFAULT_THEME_PREFERENCE,
  isVaultR2PlaylistConfigured,
  type EskerraSettings,
  type ThemePreference,
  getR2ThemePreferenceObject,
  putR2ThemePreferenceObject,
  type VaultFilesystem,
} from '@eskerra/core';
import type {Dispatch, SetStateAction} from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';

import {desktopR2SignedTransport} from '../lib/desktopR2Transport';
import {writeVaultSettings} from '../lib/vaultBootstrap';

const R2_HTTP = {transport: desktopR2SignedTransport} as const;

type UseThemePreferenceParams = {
  vaultRoot: string | null;
  vaultSettings: EskerraSettings | null;
  setVaultSettings: Dispatch<SetStateAction<EskerraSettings | null>>;
  fs: VaultFilesystem;
};

export function useThemePreference({
  vaultRoot,
  vaultSettings,
  setVaultSettings,
  fs,
}: UseThemePreferenceParams): {
  preference: ThemePreference;
  preferenceLoaded: boolean;
  setPreferenceLocal: (next: ThemePreference) => void;
  persistPreference: (next: ThemePreference) => Promise<void>;
} {
  const [preference, setPreference] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const migratedSharedToR2Ref = useRef(false);

  // No vault — defaults are final, nothing async to wait for.
  useEffect(() => {
    if (!vaultRoot) {
      setPreferenceLoaded(true);
    }
  }, [vaultRoot]);

  // Sync from shared file when not using R2 (vault watcher updates vaultSettings).
  useEffect(() => {
    if (!vaultRoot || !vaultSettings) {
      return;
    }
    if (isVaultR2PlaylistConfigured(vaultSettings)) {
      return;
    }
    const fromFile = vaultSettings.themePreference ?? DEFAULT_THEME_PREFERENCE;
    setPreference(prev => {
      if (prev.themeId === fromFile.themeId && prev.mode === fromFile.mode) {
        return prev;
      }
      return fromFile;
    });
    setPreferenceLoaded(true);
  }, [vaultRoot, vaultSettings]);

  // Initial R2 fetch + migrate shared → R2 once.
  useEffect(() => {
    if (!vaultRoot || !vaultSettings) {
      return;
    }
    if (!isVaultR2PlaylistConfigured(vaultSettings)) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const fromR2 = await getR2ThemePreferenceObject(vaultSettings.r2, R2_HTTP);
        if (cancelled) {
          return;
        }
        const sharedPref = vaultSettings.themePreference;
        if (sharedPref && !migratedSharedToR2Ref.current) {
          migratedSharedToR2Ref.current = true;
          if (!fromR2) {
            await putR2ThemePreferenceObject(vaultSettings.r2, sharedPref, R2_HTTP);
          }
          const cleared: EskerraSettings = {...vaultSettings};
          delete cleared.themePreference;
          await writeVaultSettings(vaultRoot, fs, cleared);
          if (!cancelled) {
            setVaultSettings(cleared);
            setPreference(fromR2 ?? sharedPref);
          }
          return;
        }
        if (!cancelled) {
          setPreference(fromR2 ?? DEFAULT_THEME_PREFERENCE);
        }
      } catch {
        if (!cancelled) {
          setPreference(DEFAULT_THEME_PREFERENCE);
        }
      }
      if (!cancelled) {
        setPreferenceLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultRoot, vaultSettings, fs, setVaultSettings]);

  const persistPreference = useCallback(
    async (next: ThemePreference) => {
      setPreference(next);
      if (!vaultRoot || !vaultSettings) {
        return;
      }
      if (isVaultR2PlaylistConfigured(vaultSettings)) {
        await putR2ThemePreferenceObject(vaultSettings.r2, next, R2_HTTP);
        return;
      }
      const merged: EskerraSettings = {...vaultSettings, themePreference: next};
      await writeVaultSettings(vaultRoot, fs, merged);
      setVaultSettings(merged);
    },
    [vaultRoot, vaultSettings, fs, setVaultSettings],
  );

  const setPreferenceLocal = useCallback((next: ThemePreference) => {
    setPreference(next);
  }, []);

  return {preference, preferenceLoaded, setPreferenceLocal, persistPreference};
}

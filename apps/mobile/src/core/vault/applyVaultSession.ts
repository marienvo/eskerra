import {ensureDeviceInstanceId} from '@notebox/core';

import {appBreadcrumb} from '../observability';
import {tryPrepareNoteboxSessionNative} from '../storage/androidVaultListing';
import {
  initNotebox,
  migrateLegacySharedDisplayNameIfNeeded,
  parseNoteboxSettings,
  readLocalSettings,
  readSettings,
  writeLocalSettings,
} from '../storage/noteboxStorage';
import {NoteboxLocalSettings, NoteboxSettings, NoteSummary} from '../../types';

export type PreparedVaultSession = {
  inboxContentByUri: Record<string, string> | null;
  inboxPrefetch: NoteSummary[] | null;
  localSettings: NoteboxLocalSettings;
  sessionPrep: 'native' | 'legacy';
  settings: NoteboxSettings;
};

/**
 * Prepares the vault session for a given base URI.
 * - Android: prefers the native prepare path when available.
 * - Falls back to legacy `initNotebox` + `readSettings` when native fails/missing.
 */
export async function prepareVaultSession(baseUri: string): Promise<PreparedVaultSession> {
  appBreadcrumb({
    category: 'vault',
    message: 'session.apply.start',
    data: {},
  });

  let nextSettings: NoteboxSettings;
  let sessionPrep: 'native' | 'legacy' = 'legacy';
  let inboxPrefetch: NoteSummary[] | null = null;
  let inboxContentByUri: Record<string, string> | null = null;

  try {
    const prepared = await tryPrepareNoteboxSessionNative(baseUri);
    if (prepared !== null) {
      nextSettings = parseNoteboxSettings(prepared.settingsJson);
      await migrateLegacySharedDisplayNameIfNeeded(
        baseUri,
        prepared.settingsJson,
        nextSettings,
      );
      sessionPrep = 'native';
      inboxPrefetch = prepared.inboxPrefetch;
      inboxContentByUri = prepared.inboxContentByUri;
    } else {
      await initNotebox(baseUri);
      nextSettings = await readSettings(baseUri);
    }
  } catch {
    await initNotebox(baseUri);
    nextSettings = await readSettings(baseUri);
    sessionPrep = 'legacy';
    inboxPrefetch = null;
    inboxContentByUri = null;
  }

  let localSettings = await readLocalSettings(baseUri);
  const ensuredLocal = ensureDeviceInstanceId(localSettings);
  if (ensuredLocal.changed) {
    localSettings = ensuredLocal.settings;
    await writeLocalSettings(baseUri, localSettings);
  }

  appBreadcrumb({
    category: 'vault',
    message: 'session.apply.complete',
    data: {
      has_inbox_content_prefetch: inboxContentByUri !== null,
      has_inbox_prefetch: inboxPrefetch !== null,
      session_prep: sessionPrep,
    },
  });

  return {inboxContentByUri, inboxPrefetch, localSettings, sessionPrep, settings: nextSettings};
}


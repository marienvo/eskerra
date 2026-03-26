import {appBreadcrumb} from '../observability';
import {tryPrepareNoteboxSessionNative} from '../storage/androidVaultListing';
import {initNotebox, parseNoteboxSettings, readSettings} from '../storage/noteboxStorage';
import {NoteboxSettings, NoteSummary} from '../../types';

export type PreparedVaultSession = {
  inboxPrefetch: NoteSummary[] | null;
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

  try {
    const prepared = await tryPrepareNoteboxSessionNative(baseUri);
    if (prepared !== null) {
      nextSettings = parseNoteboxSettings(prepared.settingsJson);
      sessionPrep = 'native';
      inboxPrefetch = prepared.inboxPrefetch;
    } else {
      await initNotebox(baseUri);
      nextSettings = await readSettings(baseUri);
    }
  } catch {
    await initNotebox(baseUri);
    nextSettings = await readSettings(baseUri);
    sessionPrep = 'legacy';
  }

  appBreadcrumb({
    category: 'vault',
    message: 'session.apply.complete',
    data: {
      has_inbox_prefetch: inboxPrefetch !== null,
      session_prep: sessionPrep,
    },
  });

  return {inboxPrefetch, sessionPrep, settings: nextSettings};
}


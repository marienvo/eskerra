import {ensureDeviceInstanceId} from '@eskerra/core';

import {appBreadcrumb} from '../observability';
import {resolveTodayHubPrefetchUrisForSession} from '../storage/sessionTodayHubPrefetch';
import {tryPrepareEskerraSessionNative} from '../storage/androidVaultListing';
import {
  initEskerra,
  migrateLegacySharedDisplayNameIfNeeded,
  parseEskerraSettings,
  readLocalSettings,
  readSettings,
  writeLocalSettings,
} from '../storage/eskerraStorage';
import {EskerraLocalSettings, EskerraSettings, NoteSummary} from '../../types';

export type PreparedVaultSession = {
  inboxContentByUri: Record<string, string> | null;
  inboxPrefetch: NoteSummary[] | null;
  todayHubContentByUri: Record<string, string> | null;
  localSettings: EskerraLocalSettings;
  sessionPrep: 'native' | 'legacy';
  settings: EskerraSettings;
};

/**
 * Prepares the vault session for a given base URI.
 * - Android: prefers the native prepare path when available.
 * - Falls back to legacy `initEskerra` + `readSettings` when native fails/missing.
 */
export async function prepareVaultSession(baseUri: string): Promise<PreparedVaultSession> {
  appBreadcrumb({
    category: 'vault',
    message: 'session.apply.start',
    data: {},
  });

  let nextSettings: EskerraSettings;
  let sessionPrep: 'native' | 'legacy' = 'legacy';
  let inboxPrefetch: NoteSummary[] | null = null;
  let inboxContentByUri: Record<string, string> | null = null;
  let todayHubContentByUri: Record<string, string> | null = null;

  try {
    let prefetchHub: string[] | undefined;
    try {
      prefetchHub = await resolveTodayHubPrefetchUrisForSession(baseUri);
    } catch {
      prefetchHub = undefined;
    }
    const prepared = await tryPrepareEskerraSessionNative(baseUri, {
      prefetchNoteUris: prefetchHub,
    });
    if (prepared !== null) {
      nextSettings = parseEskerraSettings(prepared.settingsJson);
      await migrateLegacySharedDisplayNameIfNeeded(
        baseUri,
        prepared.settingsJson,
        nextSettings,
      );
      sessionPrep = 'native';
      inboxPrefetch = prepared.inboxPrefetch;
      inboxContentByUri = prepared.inboxContentByUri;
      todayHubContentByUri = prepared.todayHubContentByUri;
    } else {
      await initEskerra(baseUri);
      nextSettings = await readSettings(baseUri);
    }
  } catch {
    await initEskerra(baseUri);
    nextSettings = await readSettings(baseUri);
    sessionPrep = 'legacy';
    inboxPrefetch = null;
    inboxContentByUri = null;
    todayHubContentByUri = null;
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

  return {
    inboxContentByUri,
    inboxPrefetch,
    todayHubContentByUri,
    localSettings,
    sessionPrep,
    settings: nextSettings,
  };
}


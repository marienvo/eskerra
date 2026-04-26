import {NativeModules, Platform} from 'react-native';

import {DEV_MOCK_VAULT_URI} from '../../dev/mockVaultData';
import {NoteSummary} from '../../types';
import {normalizeNoteUri} from './noteUriNormalize';

type NativeVaultMarkdownRefRow = {fileName: string; uri: string};

type NativeVaultListingModule = {
  listMarkdownFiles: (
    directoryUri: string,
  ) => Promise<Array<{lastModified?: number | null; name: string; uri: string}>>;
  /** Full-vault walk (Android); same eligibility rules as `collectVaultMarkdownRefs`. */
  listVaultMarkdownRefs?: (baseUri: string) => Promise<NativeVaultMarkdownRefRow[]>;
  prepareEskerraSession?: (
    baseUri: string,
    prefetchNoteUris: string[] | null | undefined,
  ) => Promise<
    | string
    | {
        inboxNotes?: Array<{
          content?: string;
          lastModified?: number | null;
          name: string;
          uri: string;
        }>;
        settings: string;
      }
  >;
};

export type MarkdownFileRow = {
  lastModified: number | null;
  name: string;
  uri: string;
};

export type PreparedEskerraSessionNative = {
  inboxContentByUri: Record<string, string> | null;
  inboxPrefetch: NoteSummary[] | null;
  settingsJson: string;
  /** Prefetched Today hub intro + week row bodies from native prepare (when requested). */
  todayHubContentByUri: Record<string, string> | null;
};

function mapNativeInboxRow(row: {
  lastModified?: number | null;
  name: string;
  uri: string;
}): NoteSummary {
  return {
    lastModified: typeof row.lastModified === 'number' ? row.lastModified : null,
    name: row.name,
    uri: row.uri,
  };
}

function buildNoteContentByUri(
  rows: Array<{uri?: string; content?: string}>,
): Record<string, string> | null {
  const byUri: Record<string, string> = {};
  for (const row of rows) {
    if (typeof row.uri === 'string' && typeof row.content === 'string') {
      byUri[normalizeNoteUri(row.uri)] = row.content;
    }
  }
  return Object.keys(byUri).length > 0 ? byUri : null;
}

type ParsedStructuredSession = {
  inboxContentByUri: Record<string, string> | null;
  inboxPrefetch: NoteSummary[] | null;
  settingsJson: string;
  todayHubContentByUri: Record<string, string> | null;
};

function parseStructuredNativeSession(raw: Record<string, unknown>): ParsedStructuredSession | null {
  if (typeof (raw as {settings?: unknown}).settings !== 'string') {
    return null;
  }
  const structured = raw as {
    inboxNotes?: Array<{content?: string; lastModified?: number | null; name: string; uri: string}>;
    settings: string;
    todayHubPrefetch?: Array<{uri?: string; content?: string}>;
  };
  const inboxNotes = structured.inboxNotes;
  return {
    inboxContentByUri: Array.isArray(inboxNotes) ? buildNoteContentByUri(inboxNotes) : null,
    inboxPrefetch: Array.isArray(inboxNotes) ? inboxNotes.map(mapNativeInboxRow) : null,
    settingsJson: structured.settings,
    todayHubContentByUri: Array.isArray(structured.todayHubPrefetch)
      ? buildNoteContentByUri(structured.todayHubPrefetch)
      : null,
  };
}

/**
 * Lists markdown files under a SAF directory on a background native thread when the Android
 * module is available. Returns null to signal the caller should use the JS/react-native-saf-x path.
 */
export async function tryListMarkdownFilesNative(
  directoryUri: string,
): Promise<MarkdownFileRow[] | null> {
  if (Platform.OS !== 'android') {
    return null;
  }

  const mod = NativeModules.EskerraVaultListing as NativeVaultListingModule | undefined;
  if (mod?.listMarkdownFiles == null) {
    return null;
  }

  try {
    const rows = await mod.listMarkdownFiles(directoryUri);
    return rows.map(row => ({
      uri: row.uri,
      name: row.name,
      lastModified: typeof row.lastModified === 'number' ? row.lastModified : null,
    }));
  } catch {
    return null;
  }
}

/**
 * Full-vault markdown ref index for wiki links. Uses native DocumentFile walk (reliable tree URIs);
 * returns null when the method is missing or fails so callers can fall back to JS SAF walk.
 */
export async function tryListVaultMarkdownRefsNative(
  baseUri: string,
): Promise<NativeVaultMarkdownRefRow[] | null> {
  if (Platform.OS !== 'android') {
    return null;
  }
  if (baseUri.trim() === DEV_MOCK_VAULT_URI) {
    return null;
  }

  const mod = NativeModules.EskerraVaultListing as NativeVaultListingModule | undefined;
  if (mod?.listVaultMarkdownRefs == null) {
    return null;
  }

  try {
    return await mod.listVaultMarkdownRefs(baseUri.trim());
  } catch {
    return null;
  }
}

/**
 * Ensures `.eskerra/settings-shared.json` (or legacy `settings.json`) and (on current Android native)
 * Inbox listing in one call. Returns `inboxPrefetch` when the native map includes `inboxNotes` so
 * the first Vault load can skip duplicate listing SAF work. Legacy native that returns only a string
 * yields `inboxPrefetch: null`. Returns null when the module is missing, the platform is not Android,
 * or native prepare fails (caller should fall back to initEskerra + readSettings).
 */
export type TryPrepareEskerraSessionOptions = {
  prefetchNoteUris?: string[] | null;
};

export async function tryPrepareEskerraSessionNative(
  baseUri: string,
  options?: TryPrepareEskerraSessionOptions | null,
): Promise<PreparedEskerraSessionNative | null> {
  if (Platform.OS !== 'android') {
    return null;
  }

  // Dev mock vault lives in AsyncStorage, not SAF. Native prepare can return an empty inbox
  // prefetch; `useNotes` treats `[]` as a hit and skips `listNotes`, hiding notes.
  if (baseUri.trim() === DEV_MOCK_VAULT_URI) {
    return null;
  }

  const mod = NativeModules.EskerraVaultListing as NativeVaultListingModule | undefined;
  if (mod?.prepareEskerraSession == null) {
    return null;
  }

  try {
    const prefetch = options?.prefetchNoteUris;
    const raw = await mod.prepareEskerraSession(
      baseUri,
      prefetch != null && prefetch.length > 0 ? prefetch : null,
    );
    if (typeof raw === 'string') {
      return {inboxContentByUri: null, settingsJson: raw, inboxPrefetch: null, todayHubContentByUri: null};
    }
    if (raw == null || typeof raw !== 'object') {
      return null;
    }
    return parseStructuredNativeSession(raw as Record<string, unknown>);
  } catch {
    return null;
  }
}

import {NativeModules, Platform} from 'react-native';

import {DEV_MOCK_VAULT_URI} from '../../dev/mockVaultData';
import {NoteSummary} from '../../types';
import {normalizeNoteUri} from './noteUriNormalize';

type NativeVaultListingModule = {
  listMarkdownFiles: (
    directoryUri: string,
  ) => Promise<Array<{lastModified?: number | null; name: string; uri: string}>>;
  prepareNoteboxSession?: (
    baseUri: string,
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

export type PreparedNoteboxSessionNative = {
  inboxContentByUri: Record<string, string> | null;
  inboxPrefetch: NoteSummary[] | null;
  settingsJson: string;
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

  const mod = NativeModules.NoteboxVaultListing as NativeVaultListingModule | undefined;
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
 * Ensures `.notebox/settings-shared.json` (or legacy `settings.json`) and (on current Android native)
 * Inbox listing + General/Inbox.md
 * in one call. Returns `inboxPrefetch` when the native map includes `inboxNotes` so the first Vault
 * load can skip duplicate listing/index SAF work. Legacy native that returns only a string yields
 * `inboxPrefetch: null`. Returns null when the module is missing, the platform is not Android, or
 * native prepare fails (caller should fall back to initNotebox + readSettings).
 */
export async function tryPrepareNoteboxSessionNative(
  baseUri: string,
): Promise<PreparedNoteboxSessionNative | null> {
  if (Platform.OS !== 'android') {
    return null;
  }

  // Dev mock vault lives in AsyncStorage, not SAF. Native prepare can return an empty inbox
  // prefetch; `useNotes` treats `[]` as a hit and skips `listInboxNotesAndSyncIndex`, hiding notes.
  if (baseUri.trim() === DEV_MOCK_VAULT_URI) {
    return null;
  }

  const mod = NativeModules.NoteboxVaultListing as NativeVaultListingModule | undefined;
  if (mod?.prepareNoteboxSession == null) {
    return null;
  }

  try {
    const raw = await mod.prepareNoteboxSession(baseUri);
    if (typeof raw === 'string') {
      return {inboxContentByUri: null, settingsJson: raw, inboxPrefetch: null};
    }
    if (
      raw == null ||
      typeof raw !== 'object' ||
      typeof (raw as {settings?: unknown}).settings !== 'string'
    ) {
      return null;
    }
    const structured = raw as {
      inboxNotes?: Array<{
        content?: string;
        lastModified?: number | null;
        name: string;
        uri: string;
      }>;
      settings: string;
    };
    const inboxNotes = structured.inboxNotes;
    const inboxPrefetch = Array.isArray(inboxNotes)
      ? inboxNotes.map(mapNativeInboxRow)
      : null;
    let inboxContentByUri: Record<string, string> | null = null;
    if (Array.isArray(inboxNotes)) {
      const byUri: Record<string, string> = {};
      for (const row of inboxNotes) {
        if (typeof row.content === 'string') {
          byUri[normalizeNoteUri(row.uri)] = row.content;
        }
      }
      inboxContentByUri = Object.keys(byUri).length > 0 ? byUri : null;
    }
    return {
      inboxContentByUri,
      settingsJson: structured.settings,
      inboxPrefetch,
    };
  } catch {
    return null;
  }
}

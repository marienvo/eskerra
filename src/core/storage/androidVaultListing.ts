import {NativeModules, Platform} from 'react-native';

type NativeVaultListingModule = {
  listMarkdownFiles: (
    directoryUri: string,
  ) => Promise<Array<{lastModified?: number | null; name: string; uri: string}>>;
};

export type MarkdownFileRow = {
  lastModified: number | null;
  name: string;
  uri: string;
};

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

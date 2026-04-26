import {openDocumentTree} from 'react-native-saf-x';

export type AndroidDocumentTreePick = {uri?: string} | null;

/**
 * Android SAF directory picker. Native access is isolated here so feature code
 * does not import `react-native-saf-x` directly.
 */
export async function openAndroidVaultDirectoryPicker(): Promise<AndroidDocumentTreePick> {
  return openDocumentTree(true);
}

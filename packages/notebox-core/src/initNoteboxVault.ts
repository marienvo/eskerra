import {defaultNoteboxSettings, serializeNoteboxSettings} from './noteboxSettings';
import type {VaultFilesystem} from './vaultFilesystem';
import {getNoteboxDirectoryUri, getSettingsUri, normalizeVaultBaseUri} from './vaultLayout';

/**
 * Ensures `.notebox` exists with default `settings.json` when missing (same contract as mobile).
 */

export async function initNoteboxVault(
  baseUri: string,
  fs: VaultFilesystem,
): Promise<void> {
  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const noteboxDirectoryUri = getNoteboxDirectoryUri(normalizedBaseUri);
  const settingsUri = getSettingsUri(normalizedBaseUri);

  if (!(await fs.exists(noteboxDirectoryUri))) {
    await fs.mkdir(noteboxDirectoryUri);
  }

  if (!(await fs.exists(settingsUri))) {
    await fs.writeFile(settingsUri, serializeNoteboxSettings(defaultNoteboxSettings), {
      encoding: 'utf8',
      mimeType: 'application/json',
    });
  }
}

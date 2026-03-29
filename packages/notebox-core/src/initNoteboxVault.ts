import {
  defaultNoteboxLocalSettings,
  newDeviceInstanceId,
  serializeNoteboxLocalSettings,
} from './noteboxLocalSettings';
import {defaultNoteboxSettings, serializeNoteboxSettings} from './noteboxSettings';
import type {VaultFilesystem} from './vaultFilesystem';
import {
  getLegacySettingsUri,
  getLocalSettingsUri,
  getNoteboxDirectoryUri,
  getSharedSettingsUri,
  normalizeVaultBaseUri,
} from './vaultLayout';

/**
 * Ensures `.notebox` exists with default `settings-shared.json` when no shared or legacy
 * settings file exists (same contract as mobile). Ensures `settings-local.json` when missing.
 */

export async function initNoteboxVault(
  baseUri: string,
  fs: VaultFilesystem,
): Promise<void> {
  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  const noteboxDirectoryUri = getNoteboxDirectoryUri(normalizedBaseUri);
  const sharedUri = getSharedSettingsUri(normalizedBaseUri);
  const legacyUri = getLegacySettingsUri(normalizedBaseUri);
  const localUri = getLocalSettingsUri(normalizedBaseUri);

  if (!(await fs.exists(noteboxDirectoryUri))) {
    await fs.mkdir(noteboxDirectoryUri);
  }

  const hasShared = await fs.exists(sharedUri);
  const hasLegacy = await fs.exists(legacyUri);

  if (!hasShared && !hasLegacy) {
    await fs.writeFile(sharedUri, serializeNoteboxSettings(defaultNoteboxSettings), {
      encoding: 'utf8',
      mimeType: 'application/json',
    });
  }

  if (!(await fs.exists(localUri))) {
    const initialLocal = {
      ...defaultNoteboxLocalSettings,
      deviceInstanceId: newDeviceInstanceId(),
    };
    await fs.writeFile(localUri, serializeNoteboxLocalSettings(initialLocal), {
      encoding: 'utf8',
      mimeType: 'application/json',
    });
  }
}

import {
  defaultEskerraLocalSettings,
  newDeviceInstanceId,
  serializeEskerraLocalSettings,
} from './eskerraLocalSettings';
import {defaultEskerraSettings, serializeEskerraSettings} from './eskerraSettings';
import {migrateLegacyVaultHiddenDirectoryIfNeeded} from './migrateLegacyVaultHiddenDirectory';
import type {VaultFilesystem} from './vaultFilesystem';
import {
  getEskerraDirectoryUri,
  getLegacySettingsUri,
  getLocalSettingsUri,
  getSharedSettingsUri,
  normalizeVaultBaseUri,
} from './vaultLayout';

/**
 * Ensures `/.eskerra` exists with default `settings-shared.json` when no shared or legacy
 * settings file exists (same contract as mobile). Ensures `settings-local.json` when missing.
 * Migrates legacy `/.notebox` to `/.eskerra` when present and `/.eskerra` is absent.
 */

export async function initEskerraVault(
  baseUri: string,
  fs: VaultFilesystem,
): Promise<void> {
  const normalizedBaseUri = normalizeVaultBaseUri(baseUri);
  await migrateLegacyVaultHiddenDirectoryIfNeeded(normalizedBaseUri, fs);
  const eskerraDirectoryUri = getEskerraDirectoryUri(normalizedBaseUri);
  const sharedUri = getSharedSettingsUri(normalizedBaseUri);
  const legacyUri = getLegacySettingsUri(normalizedBaseUri);
  const localUri = getLocalSettingsUri(normalizedBaseUri);

  if (!(await fs.exists(eskerraDirectoryUri))) {
    await fs.mkdir(eskerraDirectoryUri);
  }

  const hasShared = await fs.exists(sharedUri);
  const hasLegacy = await fs.exists(legacyUri);

  if (!hasShared && !hasLegacy) {
    await fs.writeFile(sharedUri, serializeEskerraSettings(defaultEskerraSettings), {
      encoding: 'utf8',
      mimeType: 'application/json',
    });
  }

  if (!(await fs.exists(localUri))) {
    const initialLocal = {
      ...defaultEskerraLocalSettings,
      deviceInstanceId: newDeviceInstanceId(),
    };
    await fs.writeFile(localUri, serializeEskerraLocalSettings(initialLocal), {
      encoding: 'utf8',
      mimeType: 'application/json',
    });
  }
}

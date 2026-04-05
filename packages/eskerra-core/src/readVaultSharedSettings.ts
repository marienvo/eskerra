import {migrateLegacyVaultHiddenDirectoryIfNeeded} from './migrateLegacyVaultHiddenDirectory';
import {parseEskerraSettings, serializeEskerraSettings} from './eskerraSettings';
import type {VaultFilesystem} from './vaultFilesystem';
import {
  getLegacySettingsUri,
  getSharedSettingsUri,
  normalizeVaultBaseUri,
} from './vaultLayout';

/**
 * Reads shared vault settings from `settings-shared.json`, or migrates from legacy
 * `settings.json` by writing the normalized shared file and returning the original raw payload
 * for parsing parity.
 */
export async function readVaultSharedSettingsRaw(
  baseUri: string,
  fs: VaultFilesystem,
): Promise<string> {
  const base = normalizeVaultBaseUri(baseUri);
  await migrateLegacyVaultHiddenDirectoryIfNeeded(base, fs);
  const sharedUri = getSharedSettingsUri(base);
  const legacyUri = getLegacySettingsUri(base);

  if (await fs.exists(sharedUri)) {
    return fs.readFile(sharedUri, {encoding: 'utf8'});
  }

  if (await fs.exists(legacyUri)) {
    const raw = await fs.readFile(legacyUri, {encoding: 'utf8'});
    const migrated = serializeEskerraSettings(parseEskerraSettings(raw));
    await fs.writeFile(sharedUri, migrated, {
      encoding: 'utf8',
      mimeType: 'application/json',
    });
    return raw;
  }

  throw new Error(
    'settings-shared.json was not found and no legacy settings.json exists.',
  );
}

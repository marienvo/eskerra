import type {VaultFilesystem} from './vaultFilesystem';
import {
  ESKERRA_DIRECTORY_NAME,
  LEGACY_NOTEBOX_DIRECTORY_NAME,
  normalizeVaultBaseUri,
} from './vaultLayout';

/**
 * Renames legacy `/.notebox` to `/.eskerra` when the new directory is absent.
 * Idempotent and safe if both exist (keeps `/.eskerra` as canonical; does not merge).
 */
export async function migrateLegacyVaultHiddenDirectoryIfNeeded(
  baseUri: string,
  fs: VaultFilesystem,
): Promise<void> {
  const base = normalizeVaultBaseUri(baseUri);
  const eskerraUri = `${base}/${ESKERRA_DIRECTORY_NAME}`;
  const legacyUri = `${base}/${LEGACY_NOTEBOX_DIRECTORY_NAME}`;
  if (await fs.exists(eskerraUri)) {
    return;
  }
  if (await fs.exists(legacyUri)) {
    await fs.renameFile(legacyUri, eskerraUri);
  }
}

import type {VaultFilesystem} from '../vaultFilesystem';
import {getThemesDirectoryUri, normalizeVaultBaseUri} from '../vaultLayout';
import {parseThemeJson, ThemeLoadError, type ThemeDefinition} from './schema';

export type VaultThemeListItem =
  | {kind: 'ok'; theme: ThemeDefinition}
  | {kind: 'error'; fileName: string; error: ThemeLoadError};

/**
 * Lists `*.json` in `.eskerra/themes/` and parses each file.
 */
export async function listVaultThemes(
  baseUri: string,
  fs: VaultFilesystem,
): Promise<VaultThemeListItem[]> {
  const base = normalizeVaultBaseUri(baseUri);
  const dir = getThemesDirectoryUri(base);
  if (!(await fs.exists(dir))) {
    return [];
  }
  const entries = await fs.listFiles(dir);
  const jsonFiles = entries
    .filter(
      e =>
        (e.type === 'file' || e.type === undefined) &&
        e.name.toLowerCase().endsWith('.json') &&
        !e.name.toLowerCase().includes('sync-conflict'),
    )
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b));

  const out: VaultThemeListItem[] = [];
  for (const fileName of jsonFiles) {
    try {
      const uri = `${dir}/${fileName}`;
      const raw = await fs.readFile(uri, {encoding: 'utf8'});
      const theme = parseThemeJson(raw, {source: 'vault', fileName});
      out.push({kind: 'ok', theme});
    } catch (e) {
      const err = e instanceof ThemeLoadError ? e : new ThemeLoadError(e instanceof Error ? e.message : String(e));
      out.push({kind: 'error', fileName, error: err});
    }
  }
  return out;
}

export async function readVaultTheme(
  baseUri: string,
  fs: VaultFilesystem,
  fileName: string,
): Promise<ThemeDefinition> {
  const base = normalizeVaultBaseUri(baseUri);
  const uri = `${getThemesDirectoryUri(base)}/${fileName}`;
  const raw = await fs.readFile(uri, {encoding: 'utf8'});
  return parseThemeJson(raw, {source: 'vault', fileName});
}

export async function writeVaultTheme(
  baseUri: string,
  fs: VaultFilesystem,
  theme: ThemeDefinition,
  json: string,
): Promise<void> {
  if (theme.source !== 'vault' || !theme.fileName) {
    throw new ThemeLoadError('writeVaultTheme expects a vault theme with fileName.');
  }
  const base = normalizeVaultBaseUri(baseUri);
  const dir = getThemesDirectoryUri(base);
  if (!(await fs.exists(dir))) {
    await fs.mkdir(dir);
  }
  const uri = `${dir}/${theme.fileName}`;
  await fs.writeFile(uri, json, {encoding: 'utf8', mimeType: 'application/json'});
}

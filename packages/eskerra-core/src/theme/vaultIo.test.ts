import {describe, expect, it} from 'vitest';

import {normalizeVaultBaseUri} from '../vaultLayout';
import type {VaultDirEntry, VaultFilesystem} from '../vaultFilesystem';
import {listVaultThemes, writeVaultTheme} from './vaultIo';
import type {ThemeDefinition} from './schema';
import {serializeVaultThemeJson} from './schema';

function createMemoryFs(initial: Map<string, string>): VaultFilesystem {
  const dirs = new Set<string>();
  const files = new Map(initial);

  const ensureDir = (uri: string): void => {
    const parts = uri.split('/').filter(Boolean);
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      acc = `${acc}/${parts[i]}`;
      dirs.add(acc);
    }
  };

  for (const k of files.keys()) {
    const d = k.replace(/\/[^/]+$/, '');
    if (d) {
      ensureDir(d);
    }
  }

  return {
    exists: async uri => files.has(uri) || dirs.has(uri.replace(/\/$/, '') || uri),
    mkdir: async uri => {
      ensureDir(uri);
      dirs.add(uri.replace(/\/$/, '') || uri);
    },
    readFile: async (uri, _o) => {
      const v = files.get(uri);
      if (v === undefined) {
        throw new Error(`ENOENT ${uri}`);
      }
      return v;
    },
    writeFile: async (uri, content) => {
      ensureDir(uri.replace(/\/[^/]+$/, ''));
      files.set(uri, content);
    },
    unlink: async uri => {
      files.delete(uri);
    },
    removeTree: async () => {
      throw new Error('not impl');
    },
    renameFile: async () => {
      throw new Error('not impl');
    },
    listFiles: async (directoryUri): Promise<VaultDirEntry[]> => {
      const prefix = directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
      const out: VaultDirEntry[] = [];
      for (const path of files.keys()) {
        if (path.startsWith(prefix) && path !== prefix) {
          const rest = path.slice(prefix.length);
          if (!rest.includes('/')) {
            out.push({name: rest, uri: path, lastModified: 0, type: 'file'});
          }
        }
      }
      return out;
    },
  };
}

describe('listVaultThemes', () => {
  it('returns empty when themes dir missing', async () => {
    const base = '/vault';
    const fs = createMemoryFs(new Map([['/vault/.eskerra/settings-shared.json', '{}']]));
    const r = await listVaultThemes(base, fs);
    expect(r).toEqual([]);
  });

  it('lists and parses valid themes', async () => {
    const base = normalizeVaultBaseUri('/vault');
    const themeDir = `${base}/.eskerra/themes`;
    const good = JSON.stringify({
      name: 'Good',
      light: {palette: ['#ffffff']},
      dark: {palette: ['#000000']},
    });
    const fs = createMemoryFs(
      new Map([
        [`${themeDir}/good.json`, good],
        [`${themeDir}/bad.json`, '{'],
      ]),
    );
    const r = await listVaultThemes(base, fs);
    expect(r).toHaveLength(2);
    const ok = r.find(x => x.kind === 'ok');
    const err = r.find(x => x.kind === 'error');
    expect(ok?.kind === 'ok' && ok.theme.id).toBe('good');
    expect(err?.kind === 'error' && err.fileName).toBe('bad.json');
  });
});

describe('writeVaultTheme', () => {
  it('creates themes directory and file', async () => {
    const base = normalizeVaultBaseUri('/v');
    const fs = createMemoryFs(new Map());
    const theme: ThemeDefinition = {
      id: 'x',
      name: 'X',
      source: 'vault',
      fileName: 'x.json',
      light: {palette: ['#eeeeee']},
      dark: {palette: ['#111111']},
    };
    await writeVaultTheme(base, fs, theme, serializeVaultThemeJson(theme));
    const raw = await fs.readFile(`${base}/.eskerra/themes/x.json`, {encoding: 'utf8'});
    expect(raw).toContain('"name": "X"');
  });
});

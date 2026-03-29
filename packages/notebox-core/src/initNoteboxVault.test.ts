import {describe, expect, it} from 'vitest';

import {initNoteboxVault} from './initNoteboxVault';
import type {VaultDirEntry, VaultFilesystem} from './vaultFilesystem';

function createMemoryFs(initial: Map<string, string | 'dir'>): VaultFilesystem {
  const store = new Map(initial);

  return {
    exists: async uri => store.has(uri),
    mkdir: async uri => {
      store.set(uri, 'dir');
    },
    readFile: async uri => {
      const v = store.get(uri);
      if (v === 'dir' || v === undefined) {
        throw new Error('not found');
      }
      return v;
    },
    writeFile: async (uri, content, _opts) => {
      store.set(uri, content);
    },
    unlink: async uri => {
      store.delete(uri);
    },
    listFiles: async (): Promise<VaultDirEntry[]> => [],
  };
}

describe('initNoteboxVault', () => {
  it('creates default shared and local settings when missing', async () => {
    const fs = createMemoryFs(new Map([['/vault', 'dir']]));
    await initNoteboxVault('/vault', fs);
    const sharedRaw = await fs.readFile('/vault/.notebox/settings-shared.json', {
      encoding: 'utf8',
    });
    expect(JSON.parse(sharedRaw).r2).toBeDefined();
    expect(JSON.parse(sharedRaw).displayName).toBeUndefined();
    const localRaw = await fs.readFile('/vault/.notebox/settings-local.json', {
      encoding: 'utf8',
    });
    expect(JSON.parse(localRaw).deviceName).toBe('');
    expect(JSON.parse(localRaw).displayName).toBe('');
  });

  it('does not overwrite legacy-only vault with default shared on init', async () => {
    const legacy =
      '{\n  "displayName": "Legacy Box"\n}\n';
    const fs = createMemoryFs(
      new Map([
        ['/vault', 'dir'],
        ['/vault/.notebox', 'dir'],
        ['/vault/.notebox/settings.json', legacy],
      ]),
    );
    await initNoteboxVault('/vault', fs);
    expect(await fs.exists('/vault/.notebox/settings-shared.json')).toBe(false);
    const stillLegacy = await fs.readFile('/vault/.notebox/settings.json', {encoding: 'utf8'});
    expect(JSON.parse(stillLegacy).displayName).toBe('Legacy Box');
    const localRaw = await fs.readFile('/vault/.notebox/settings-local.json', {encoding: 'utf8'});
    expect(JSON.parse(localRaw).deviceName).toBe('');
    expect(JSON.parse(localRaw).displayName).toBe('');
  });
});

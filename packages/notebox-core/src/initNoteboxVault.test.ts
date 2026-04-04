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
    renameFile: async (fromUri, toUri) => {
      const value = store.get(fromUri);
      if (value === undefined) {
        throw new Error('not found');
      }
      store.delete(fromUri);
      store.set(toUri, value);
    },
    listFiles: async (): Promise<VaultDirEntry[]> => [],
    removeTree: async () => {},
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
    const localCreated = JSON.parse(localRaw);
    expect(localCreated.deviceName).toBe('');
    expect(localCreated.displayName).toBe('');
    expect(typeof localCreated.deviceInstanceId).toBe('string');
    expect(localCreated.deviceInstanceId.length).toBeGreaterThan(0);
    expect(localCreated.playlistKnownControlRevision).toBeNull();
    expect(localCreated.playlistKnownUpdatedAtMs).toBeNull();
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
    const local = JSON.parse(localRaw);
    expect(local.deviceName).toBe('');
    expect(local.displayName).toBe('');
    expect(typeof local.deviceInstanceId).toBe('string');
    expect(local.deviceInstanceId.length).toBeGreaterThan(0);
    expect(local.playlistKnownControlRevision).toBeNull();
    expect(local.playlistKnownUpdatedAtMs).toBeNull();
  });
});

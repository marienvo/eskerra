/**
 * @format
 */

import {
  exists,
  listFiles,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from 'react-native-saf-x';

import {buildInboxMarkdownIndexContent} from '@notebox/core';
import {tryListMarkdownFilesNative} from '../src/core/storage/androidVaultListing';
import {
  clearPlaylist,
  createNote,
  deleteInboxNotes,
  pickNextInboxMarkdownFileName,
  isNoteUriInInbox,
  listGeneralMarkdownFiles,
  listInboxNotesAndSyncIndex,
  listNotes,
  parseNoteboxSettings,
  readNote,
  readPlaylist,
  readPodcastFileContent,
  readPlaylistCoalesced,
  initNotebox,
  readSettings,
  refreshInboxMarkdownIndex,
  resetPlaylistReadCoalescerForTesting,
  writePlaylist,
  writeNoteContent,
  writeSettings,
} from '../src/core/storage/noteboxStorage';

jest.mock('react-native-saf-x', () => ({
  exists: jest.fn(),
  listFiles: jest.fn(),
  mkdir: jest.fn(),
  readFile: jest.fn(),
  unlink: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('../src/core/storage/androidVaultListing', () => ({
  tryListMarkdownFilesNative: jest.fn(),
}));

describe('noteboxStorage', () => {
  const existsMock = exists as jest.MockedFunction<typeof exists>;
  const listFilesMock = listFiles as jest.MockedFunction<typeof listFiles>;
  const mkdirMock = mkdir as jest.MockedFunction<typeof mkdir>;
  const readFileMock = readFile as jest.MockedFunction<typeof readFile>;
  const unlinkMock = unlink as jest.MockedFunction<typeof unlink>;
  const writeFileMock = writeFile as jest.MockedFunction<typeof writeFile>;
  const tryListMarkdownFilesNativeMock =
    tryListMarkdownFilesNative as jest.MockedFunction<typeof tryListMarkdownFilesNative>;
  const baseUri = 'content://notes';

  beforeEach(() => {
    jest.clearAllMocks();
    resetPlaylistReadCoalescerForTesting();
    existsMock.mockReset();
    listFilesMock.mockReset();
    mkdirMock.mockReset();
    readFileMock.mockReset();
    unlinkMock.mockReset();
    writeFileMock.mockReset();
    tryListMarkdownFilesNativeMock.mockReset();
    tryListMarkdownFilesNativeMock.mockResolvedValue(null);
  });

  test('initNotebox creates .notebox, default shared, and default local when missing', async () => {
    existsMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await initNotebox(baseUri);

    expect(existsMock).toHaveBeenNthCalledWith(1, `${baseUri}/.notebox`);
    expect(mkdirMock).toHaveBeenCalledWith(`${baseUri}/.notebox`);
    expect(existsMock).toHaveBeenNthCalledWith(2, `${baseUri}/.notebox/settings-shared.json`);
    expect(existsMock).toHaveBeenNthCalledWith(3, `${baseUri}/.notebox/settings.json`);
    expect(writeFileMock).toHaveBeenNthCalledWith(
      1,
      `${baseUri}/.notebox/settings-shared.json`,
      '{\n' +
        '  "r2": {\n' +
        '    "endpoint": "https://00000000000000000000000000000000.r2.cloudflarestorage.com",\n' +
        '    "bucket": "mock-bucket",\n' +
        '    "accessKeyId": "mock_access_key_id",\n' +
        '    "secretAccessKey": "mock_secret_access_key"\n' +
        '  }\n' +
        '}\n',
      {encoding: 'utf8', mimeType: 'application/json'},
    );
    const localWrite = writeFileMock.mock.calls[1];
    expect(localWrite[0]).toBe(`${baseUri}/.notebox/settings-local.json`);
    const localParsed = JSON.parse(localWrite[1] as string) as Record<string, unknown>;
    expect(localParsed.deviceName).toBe('');
    expect(localParsed.displayName).toBe('');
    expect(localParsed.playlistKnownUpdatedAtMs).toBeNull();
    expect(localParsed.playlistKnownControlRevision).toBeNull();
    expect(typeof localParsed.deviceInstanceId).toBe('string');
    expect((localParsed.deviceInstanceId as string).length).toBeGreaterThan(0);
    expect(localWrite[2]).toEqual({encoding: 'utf8', mimeType: 'application/json'});
  });

  test('initNotebox skips writes when shared and local already exist', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await initNotebox(baseUri);

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  test('parseNoteboxSettings accepts empty shared object', () => {
    expect(parseNoteboxSettings('{}')).toEqual({});
  });

  test('readSettings reads settings-shared.json, strips legacy displayName, copies to local', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    readFileMock.mockResolvedValueOnce('{"displayName":"Notebook A"}');
    writeFileMock.mockResolvedValue(undefined);

    await expect(readSettings(baseUri)).resolves.toEqual({});

    expect(readFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/settings-shared.json`,
      {encoding: 'utf8'},
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/settings-local.json`,
      '{\n  "deviceInstanceId": "",\n  "deviceName": "",\n  "displayName": "Notebook A",\n  "playlistKnownControlRevision": null,\n  "playlistKnownUpdatedAtMs": null\n}\n',
      {encoding: 'utf8', mimeType: 'application/json'},
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/settings-shared.json`,
      '{}\n',
      {encoding: 'utf8', mimeType: 'application/json'},
    );
  });

  test('readSettings migrates legacy settings.json to shared and displayName to local', async () => {
    existsMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    readFileMock.mockResolvedValueOnce('{"displayName":"From Legacy"}');
    writeFileMock.mockResolvedValue(undefined);

    await expect(readSettings(baseUri)).resolves.toEqual({});

    expect(writeFileMock).toHaveBeenNthCalledWith(
      1,
      `${baseUri}/.notebox/settings-shared.json`,
      '{}\n',
      {encoding: 'utf8', mimeType: 'application/json'},
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/settings-local.json`,
      '{\n  "deviceInstanceId": "",\n  "deviceName": "",\n  "displayName": "From Legacy",\n  "playlistKnownControlRevision": null,\n  "playlistKnownUpdatedAtMs": null\n}\n',
      {encoding: 'utf8', mimeType: 'application/json'},
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/settings-shared.json`,
      '{}\n',
      {encoding: 'utf8', mimeType: 'application/json'},
    );
  });

  test('writeSettings writes JSON to settings-shared.json', async () => {
    await writeSettings(baseUri, {});

    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/settings-shared.json`,
      '{}\n',
      {encoding: 'utf8', mimeType: 'application/json'},
    );
  });

  test('listNotes uses native listing when tryListMarkdownFilesNative returns rows', async () => {
    tryListMarkdownFilesNativeMock.mockResolvedValueOnce([
      {lastModified: 22, name: 'newer.md', uri: `${baseUri}/Inbox/newer.md`},
      {lastModified: 11, name: 'older.md', uri: `${baseUri}/Inbox/older.md`},
    ]);
    existsMock.mockResolvedValue(true);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 22,
        name: 'newer.md',
        type: 'file',
        uri: `${baseUri}/Inbox/newer.md`,
      },
      {
        lastModified: 11,
        name: 'older.md',
        type: 'file',
        uri: `${baseUri}/Inbox/older.md`,
      },
    ] as never);

    await expect(listNotes(baseUri)).resolves.toEqual([
      {lastModified: 22, name: 'newer.md', uri: `${baseUri}/Inbox/newer.md`},
      {lastModified: 11, name: 'older.md', uri: `${baseUri}/Inbox/older.md`},
    ]);
  });

  test('listNotes returns markdown files sorted by lastModified', async () => {
    existsMock.mockResolvedValueOnce(true);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 11,
        name: 'older.md',
        type: 'file',
        uri: `${baseUri}/Inbox/older.md`,
      },
      {
        lastModified: 22,
        name: 'newer.md',
        type: 'file',
        uri: `${baseUri}/Inbox/newer.md`,
      },
      {
        lastModified: 33,
        name: 'latest.sync-conflict.md',
        type: 'file',
        uri: `${baseUri}/Inbox/latest.sync-conflict.md`,
      },
      {name: 'settings.json', type: 'file', uri: `${baseUri}/Inbox/settings.json`},
      {name: '.notebox', type: 'directory', uri: `${baseUri}/Inbox/.notebox`},
    ] as never);

    await expect(listNotes(baseUri)).resolves.toEqual([
      {lastModified: 22, name: 'newer.md', uri: `${baseUri}/Inbox/newer.md`},
      {lastModified: 11, name: 'older.md', uri: `${baseUri}/Inbox/older.md`},
    ]);
    expect(existsMock).toHaveBeenCalledWith(`${baseUri}/Inbox`);
    expect(listFilesMock).toHaveBeenCalledWith(`${baseUri}/Inbox`);
  });

  test('listNotes returns empty list when Inbox directory does not exist', async () => {
    existsMock.mockResolvedValueOnce(false);

    await expect(listNotes(baseUri)).resolves.toEqual([]);
    expect(listFilesMock).not.toHaveBeenCalled();
  });

  test('listNotes trusts native when it returns an empty list (directory scan succeeded)', async () => {
    tryListMarkdownFilesNativeMock.mockResolvedValueOnce([]);
    existsMock.mockImplementation(
      () => new Promise<boolean>(resolve => setImmediate(() => resolve(true))),
    );
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 11,
        name: 'note.md',
        type: 'file',
        uri: `${baseUri}/Inbox/note.md`,
      },
    ] as never);

    await expect(listNotes(baseUri)).resolves.toEqual([]);
    expect(listFilesMock).not.toHaveBeenCalled();
  });

  test('listNotes falls back to SAF when native returns null', async () => {
    tryListMarkdownFilesNativeMock.mockResolvedValueOnce(null as unknown as never);
    existsMock.mockResolvedValue(true);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 11,
        name: 'note.md',
        type: 'file',
        uri: `${baseUri}/Inbox/note.md`,
      },
    ] as never);

    await expect(listNotes(baseUri)).resolves.toEqual([
      {lastModified: 11, name: 'note.md', uri: `${baseUri}/Inbox/note.md`},
    ]);
    expect(existsMock).toHaveBeenCalledWith(`${baseUri}/Inbox`);
    expect(listFilesMock).toHaveBeenCalledWith(`${baseUri}/Inbox`);
  });

  test('listNotes returns empty when native returns empty and directory does not exist', async () => {
    tryListMarkdownFilesNativeMock.mockResolvedValueOnce([]);
    existsMock.mockResolvedValueOnce(false);

    await expect(listNotes(baseUri)).resolves.toEqual([]);
    expect(listFilesMock).not.toHaveBeenCalled();
  });

  test('listInboxNotesAndSyncIndex lists Inbox once and writes General/Inbox.md', async () => {
    tryListMarkdownFilesNativeMock.mockResolvedValueOnce([
      {lastModified: 2, name: 'b.md', uri: `${baseUri}/Inbox/b.md`},
      {lastModified: 1, name: 'a.md', uri: `${baseUri}/Inbox/a.md`},
    ]);
    existsMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 2,
        name: 'b.md',
        type: 'file',
        uri: `${baseUri}/Inbox/b.md`,
      },
      {
        lastModified: 1,
        name: 'a.md',
        type: 'file',
        uri: `${baseUri}/Inbox/a.md`,
      },
    ] as never);

    await expect(listInboxNotesAndSyncIndex(baseUri)).resolves.toEqual([
      {lastModified: 2, name: 'b.md', uri: `${baseUri}/Inbox/b.md`},
      {lastModified: 1, name: 'a.md', uri: `${baseUri}/Inbox/a.md`},
    ]);

    expect(tryListMarkdownFilesNativeMock).toHaveBeenCalledTimes(1);
    expect(tryListMarkdownFilesNativeMock).toHaveBeenCalledWith(`${baseUri}/Inbox`);
    expect(mkdirMock).toHaveBeenCalledWith(`${baseUri}/General`);
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/General/Inbox.md`,
      '# Inbox\n\n- [[Inbox/a|a]]\n- [[Inbox/b|b]]\n',
      {encoding: 'utf8', mimeType: 'text/markdown'},
    );
  });

  test('listInboxNotesAndSyncIndex skips Inbox.md write when content unchanged', async () => {
    tryListMarkdownFilesNativeMock.mockResolvedValueOnce([
      {lastModified: 2, name: 'b.md', uri: `${baseUri}/Inbox/b.md`},
      {lastModified: 1, name: 'a.md', uri: `${baseUri}/Inbox/a.md`},
    ]);
    const expectedIndex = '# Inbox\n\n- [[Inbox/a|a]]\n- [[Inbox/b|b]]\n';
    existsMock.mockResolvedValue(true);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 2,
        name: 'b.md',
        type: 'file',
        uri: `${baseUri}/Inbox/b.md`,
      },
      {
        lastModified: 1,
        name: 'a.md',
        type: 'file',
        uri: `${baseUri}/Inbox/a.md`,
      },
    ] as never);
    readFileMock.mockResolvedValueOnce(expectedIndex);

    await expect(listInboxNotesAndSyncIndex(baseUri)).resolves.toHaveLength(2);

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(readFileMock).toHaveBeenCalledWith(`${baseUri}/General/Inbox.md`, {
      encoding: 'utf8',
    });
  });

  test('readNote reads markdown content by URI', async () => {
    readFileMock.mockResolvedValueOnce('# Hello');

    await expect(readNote(`${baseUri}/hello.md`)).resolves.toEqual({
      content: '# Hello',
      summary: {
        lastModified: null,
        name: 'hello.md',
        uri: `${baseUri}/hello.md`,
      },
    });
  });

  test('listGeneralMarkdownFiles uses native listing when tryListMarkdownFilesNative returns rows', async () => {
    tryListMarkdownFilesNativeMock.mockResolvedValueOnce([
      {
        lastModified: 11,
        name: '2026 Demo - podcasts.md',
        uri: `${baseUri}/General/2026 Demo - podcasts.md`,
      },
    ]);
    existsMock.mockResolvedValue(true);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 11,
        name: '2026 Demo - podcasts.md',
        type: 'file',
        uri: `${baseUri}/General/2026 Demo - podcasts.md`,
      },
    ] as never);

    await expect(listGeneralMarkdownFiles(baseUri)).resolves.toEqual([
      {
        lastModified: 11,
        name: '2026 Demo - podcasts.md',
        uri: `${baseUri}/General/2026 Demo - podcasts.md`,
      },
    ]);
  });

  test('listGeneralMarkdownFiles returns markdown files from General folder', async () => {
    existsMock.mockResolvedValueOnce(true);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 11,
        name: '2026 Demo - podcasts.md',
        type: 'file',
        uri: `${baseUri}/General/2026 Demo - podcasts.md`,
      },
      {
        lastModified: 22,
        name: 'notes.txt',
        type: 'file',
        uri: `${baseUri}/General/notes.txt`,
      },
      {
        lastModified: 33,
        name: '2026 Demo - sync-conflict.md',
        type: 'file',
        uri: `${baseUri}/General/2026 Demo - sync-conflict.md`,
      },
    ] as never);

    await expect(listGeneralMarkdownFiles(baseUri)).resolves.toEqual([
      {
        lastModified: 11,
        name: '2026 Demo - podcasts.md',
        uri: `${baseUri}/General/2026 Demo - podcasts.md`,
      },
    ]);
    expect(existsMock).toHaveBeenCalledWith(`${baseUri}/General`);
    expect(listFilesMock).toHaveBeenCalledWith(`${baseUri}/General`);
  });

  test('listGeneralMarkdownFiles returns empty list when General folder does not exist', async () => {
    existsMock.mockResolvedValueOnce(false);

    await expect(listGeneralMarkdownFiles(baseUri)).resolves.toEqual([]);
    expect(listFilesMock).not.toHaveBeenCalled();
  });

  test('readPodcastFileContent reads markdown by URI', async () => {
    readFileMock.mockResolvedValueOnce('# Podcasts');

    await expect(readPodcastFileContent(`${baseUri}/2026 Demo - podcasts.md`)).resolves.toBe(
      '# Podcasts',
    );
    expect(readFileMock).toHaveBeenCalledWith(`${baseUri}/2026 Demo - podcasts.md`, {
      encoding: 'utf8',
    });
  });

  test('createNote sanitizes title and writes markdown content', async () => {
    existsMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 1,
        name: 'team-ideas.md',
        type: 'file',
        uri: `${baseUri}/Inbox/team-ideas.md`,
      },
    ] as never);

    await expect(createNote(baseUri, ' Team Ideas! ', 'first line')).resolves.toMatchObject({
      name: 'team-ideas.md',
      uri: `${baseUri}/Inbox/team-ideas.md`,
    });
    expect(mkdirMock).toHaveBeenCalledWith(`${baseUri}/Inbox`);
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/Inbox/team-ideas.md`,
      'first line\n',
      {
        encoding: 'utf8',
        mimeType: 'text/markdown',
      },
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/General/Inbox.md`,
      '# Inbox\n\n- [[Inbox/team-ideas|team-ideas]]\n',
      {encoding: 'utf8', mimeType: 'text/markdown'},
    );
  });

  test('pickNextInboxMarkdownFileName picks base then increments from -2 onward', () => {
    expect(pickNextInboxMarkdownFileName('team-ideas', new Set())).toBe('team-ideas.md');
    expect(
      pickNextInboxMarkdownFileName(
        'team-ideas',
        new Set(['team-ideas.md', 'team-ideas-2.md']),
      ),
    ).toBe('team-ideas-3.md');
  });

  test('createNote uses occupied names to avoid known collisions', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 1,
        name: 'team-ideas.md',
        type: 'file',
        uri: `${baseUri}/Inbox/team-ideas.md`,
      },
      {
        lastModified: 2,
        name: 'team-ideas-2.md',
        type: 'file',
        uri: `${baseUri}/Inbox/team-ideas-2.md`,
      },
      {
        lastModified: 3,
        name: 'team-ideas-3.md',
        type: 'file',
        uri: `${baseUri}/Inbox/team-ideas-3.md`,
      },
    ] as never);

    await expect(
      createNote(
        baseUri,
        ' Team Ideas! ',
        'first line',
        new Set(['team-ideas.md', 'team-ideas-2.md']),
      ),
    ).resolves.toMatchObject({
      name: 'team-ideas-3.md',
      uri: `${baseUri}/Inbox/team-ideas-3.md`,
    });

    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/Inbox/team-ideas-3.md`,
      'first line\n',
      {
        encoding: 'utf8',
        mimeType: 'text/markdown',
      },
    );
  });

  test('createNote refreshes occupied names from disk when projection is stale', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(true);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 2,
        name: 'team-ideas.md',
        type: 'file',
        uri: `${baseUri}/Inbox/team-ideas.md`,
      },
      {
        lastModified: 1,
        name: 'team-ideas-2.md',
        type: 'file',
        uri: `${baseUri}/Inbox/team-ideas-2.md`,
      },
    ] as never);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 3,
        name: 'team-ideas-3.md',
        type: 'file',
        uri: `${baseUri}/Inbox/team-ideas-3.md`,
      },
      {
        lastModified: 2,
        name: 'team-ideas.md',
        type: 'file',
        uri: `${baseUri}/Inbox/team-ideas.md`,
      },
      {
        lastModified: 1,
        name: 'team-ideas-2.md',
        type: 'file',
        uri: `${baseUri}/Inbox/team-ideas-2.md`,
      },
    ] as never);

    await expect(
      createNote(baseUri, ' Team Ideas! ', 'first line', new Set()),
    ).resolves.toMatchObject({
      name: 'team-ideas-3.md',
      uri: `${baseUri}/Inbox/team-ideas-3.md`,
    });

    expect(existsMock).toHaveBeenCalledWith(`${baseUri}/Inbox/team-ideas.md`);
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/Inbox/team-ideas-3.md`,
      'first line\n',
      {
        encoding: 'utf8',
        mimeType: 'text/markdown',
      },
    );
  });

  test('writeNoteContent writes markdown content by URI', async () => {
    await writeNoteContent(`${baseUri}/test.md`, 'updated');

    expect(writeFileMock).toHaveBeenCalledWith(`${baseUri}/test.md`, 'updated\n', {
      encoding: 'utf8',
      mimeType: 'text/markdown',
    });
  });

  test('deleteInboxNotes unlinks inbox files and refreshes General/Inbox.md', async () => {
    unlinkMock.mockResolvedValue(true);
    tryListMarkdownFilesNativeMock.mockResolvedValueOnce([
      {lastModified: 1, name: 'left.md', uri: `${baseUri}/Inbox/left.md`},
    ]);
    existsMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await deleteInboxNotes(baseUri, [
      `${baseUri}/Inbox/to-delete.md`,
      `${baseUri}/Inbox/another-delete.md`,
    ]);

    expect(unlinkMock).toHaveBeenNthCalledWith(1, `${baseUri}/Inbox/to-delete.md`);
    expect(unlinkMock).toHaveBeenNthCalledWith(2, `${baseUri}/Inbox/another-delete.md`);
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/General/Inbox.md`,
      '# Inbox\n\n- [[Inbox/left|left]]\n',
      {encoding: 'utf8', mimeType: 'text/markdown'},
    );
  });

  test('deleteInboxNotes rejects URIs outside Inbox', async () => {
    await expect(
      deleteInboxNotes(baseUri, [`${baseUri}/General/not-allowed.md`]),
    ).rejects.toThrow('Could not verify that the selected entry belongs to Log.');
    expect(unlinkMock).not.toHaveBeenCalled();
  });

  test('buildInboxMarkdownIndexContent sorts stems alphabetically', () => {
    expect(buildInboxMarkdownIndexContent(['z.md', 'a.md', 'm.md'])).toBe(
      '# Inbox\n\n- [[Inbox/a|a]]\n- [[Inbox/m|m]]\n- [[Inbox/z|z]]\n',
    );
  });

  test('isNoteUriInInbox returns true when note URI is under Inbox', () => {
    expect(isNoteUriInInbox(`${baseUri}/Inbox/foo.md`, baseUri)).toBe(true);
    expect(isNoteUriInInbox(`${baseUri}/General/foo.md`, baseUri)).toBe(false);
  });

  test('isNoteUriInInbox accepts encoded document URIs for Inbox notes', () => {
    const noteUri =
      'content://com.android.externalstorage.documents/tree/primary%3ANotebox/document/primary%3ANotebox%2FInbox%2Ffoo.md';
    expect(isNoteUriInInbox(noteUri, baseUri)).toBe(true);
  });

  test('refreshInboxMarkdownIndex writes empty index when Inbox is missing', async () => {
    existsMock.mockResolvedValueOnce(false).mockResolvedValue(true);

    await refreshInboxMarkdownIndex(baseUri);

    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/General/Inbox.md`,
      '# Inbox\n\n',
      {encoding: 'utf8', mimeType: 'text/markdown'},
    );
  });

  test('refreshInboxMarkdownIndex creates General when missing', async () => {
    tryListMarkdownFilesNativeMock.mockResolvedValueOnce([
      {lastModified: 1, name: 'a.md', uri: `${baseUri}/Inbox/a.md`},
    ]);
    existsMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 1,
        name: 'a.md',
        type: 'file',
        uri: `${baseUri}/Inbox/a.md`,
      },
    ] as never);

    await refreshInboxMarkdownIndex(baseUri);

    expect(mkdirMock).toHaveBeenCalledWith(`${baseUri}/General`);
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/General/Inbox.md`,
      '# Inbox\n\n- [[Inbox/a|a]]\n',
      {encoding: 'utf8', mimeType: 'text/markdown'},
    );
  });

  test('refreshInboxMarkdownIndex uses JS listing when native returns null', async () => {
    existsMock.mockResolvedValue(true);
    listFilesMock.mockResolvedValueOnce([
      {
        lastModified: 2,
        name: 'b.md',
        type: 'file',
        uri: `${baseUri}/Inbox/b.md`,
      },
      {
        lastModified: 1,
        name: 'a.md',
        type: 'file',
        uri: `${baseUri}/Inbox/a.md`,
      },
    ] as never);

    await refreshInboxMarkdownIndex(baseUri);

    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/General/Inbox.md`,
      '# Inbox\n\n- [[Inbox/a|a]]\n- [[Inbox/b|b]]\n',
      {encoding: 'utf8', mimeType: 'text/markdown'},
    );
  });

  describe('playlist (no R2)', () => {
    function mockNoR2VaultLayoutForPlaylistLocalReadOrder(): void {
      existsMock.mockImplementation(async (uri: string) => {
        if (uri.includes('settings-local.json')) {
          return false;
        }
        if (uri.includes('settings-shared.json')) {
          return true;
        }
        if (uri.includes('playlist.json')) {
          return true;
        }
        return false;
      });
    }

    test('writePlaylist writes playlist.json', async () => {
      mockNoR2VaultLayoutForPlaylistLocalReadOrder();
      readFileMock.mockResolvedValueOnce('{}');

      await writePlaylist(baseUri, {
        controlRevision: 0,
        durationMs: 1000,
        episodeId: 'episode-a',
        mp3Url: 'https://example.com/episode-a.mp3',
        playbackOwnerId: '',
        positionMs: 250,
        updatedAt: 0,
      });

      const playlistWrite = writeFileMock.mock.calls.find(
        call => call[0] === `${baseUri}/.notebox/playlist.json`,
      );
      expect(playlistWrite).toBeDefined();
      const body = playlistWrite![1] as string;
      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(parsed.durationMs).toBe(1000);
      expect(parsed.episodeId).toBe('episode-a');
      expect(parsed.mp3Url).toBe('https://example.com/episode-a.mp3');
      expect(parsed.positionMs).toBe(250);
      expect(typeof parsed.updatedAt).toBe('number');
    });

    test('readPlaylist returns parsed playlist entry', async () => {
      mockNoR2VaultLayoutForPlaylistLocalReadOrder();
      readFileMock
        .mockResolvedValueOnce('{}')
        .mockResolvedValueOnce(
          '{"durationMs":1000,"episodeId":"episode-a","mp3Url":"https://example.com/episode-a.mp3","positionMs":250}',
        );

      await expect(readPlaylist(baseUri)).resolves.toEqual({
        controlRevision: 0,
        durationMs: 1000,
        episodeId: 'episode-a',
        mp3Url: 'https://example.com/episode-a.mp3',
        playbackOwnerId: '',
        positionMs: 250,
        updatedAt: 0,
      });
    });

    test('readPlaylistCoalesces concurrent reads', async () => {
      mockNoR2VaultLayoutForPlaylistLocalReadOrder();
      readFileMock
        .mockResolvedValueOnce('{}')
        .mockResolvedValueOnce(
          '{"durationMs":1000,"episodeId":"episode-a","mp3Url":"https://example.com/episode-a.mp3","positionMs":250}',
        );

      const [a, b] = await Promise.all([
        readPlaylistCoalesced(baseUri),
        readPlaylistCoalesced(baseUri),
      ]);

      expect(readFileMock).toHaveBeenCalledTimes(2);
      expect(a).toEqual({
        controlRevision: 0,
        durationMs: 1000,
        episodeId: 'episode-a',
        mp3Url: 'https://example.com/episode-a.mp3',
        playbackOwnerId: '',
        positionMs: 250,
        updatedAt: 0,
      });
      expect(b).toEqual(a);
    });

    test('clearPlaylist empties existing playlist file', async () => {
      mockNoR2VaultLayoutForPlaylistLocalReadOrder();
      readFileMock.mockResolvedValueOnce('{}');

      await clearPlaylist(baseUri);

      expect(writeFileMock).toHaveBeenCalledWith(
        `${baseUri}/.notebox/playlist.json`,
        '',
        {encoding: 'utf8', mimeType: 'application/json'},
      );
    });
  });

});

/**
 * @format
 */

import {
  exists,
  listFiles,
  mkdir,
  readFile,
  writeFile,
} from 'react-native-saf-x';

import {tryListMarkdownFilesNative} from '../src/core/storage/androidVaultListing';
import {
  buildInboxMarkdownIndexContent,
  buildSafDocumentUri,
  clearPlaylist,
  createNote,
  isNoteUriInInbox,
  listGeneralMarkdownFiles,
  listNotes,
  readNote,
  readPlaylist,
  readPodcastFileContent,
  initNotebox,
  readSettings,
  refreshInboxMarkdownIndex,
  writePlaylist,
  writeNoteContent,
  writePodcastImageFile,
  writeSettings,
} from '../src/core/storage/noteboxStorage';

jest.mock('react-native-saf-x', () => ({
  exists: jest.fn(),
  listFiles: jest.fn(),
  mkdir: jest.fn(),
  readFile: jest.fn(),
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
  const writeFileMock = writeFile as jest.MockedFunction<typeof writeFile>;
  const tryListMarkdownFilesNativeMock =
    tryListMarkdownFilesNative as jest.MockedFunction<typeof tryListMarkdownFilesNative>;
  const baseUri = 'content://notes';

  beforeEach(() => {
    jest.clearAllMocks();
    tryListMarkdownFilesNativeMock.mockResolvedValue(null);
  });

  test('initNotebox creates .notebox and default settings when missing', async () => {
    existsMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    await initNotebox(baseUri);

    expect(existsMock).toHaveBeenNthCalledWith(1, `${baseUri}/.notebox`);
    expect(mkdirMock).toHaveBeenCalledWith(`${baseUri}/.notebox`);
    expect(existsMock).toHaveBeenNthCalledWith(
      2,
      `${baseUri}/.notebox/settings.json`,
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/settings.json`,
      '{\n  "displayName": "My Notebox"\n}\n',
      {encoding: 'utf8', mimeType: 'application/json'},
    );
  });

  test('initNotebox skips writes when folder and file already exist', async () => {
    existsMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await initNotebox(baseUri);

    expect(mkdirMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  test('readSettings parses settings.json content', async () => {
    readFileMock.mockResolvedValueOnce('{"displayName":"Notebook A"}');

    await expect(readSettings(baseUri)).resolves.toEqual({
      displayName: 'Notebook A',
    });
    expect(readFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/settings.json`,
      {encoding: 'utf8'},
    );
  });

  test('writeSettings writes JSON to settings.json', async () => {
    await writeSettings(baseUri, {displayName: 'Notebook B'});

    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/settings.json`,
      '{\n  "displayName": "Notebook B"\n}\n',
      {encoding: 'utf8', mimeType: 'application/json'},
    );
  });

  test('listNotes uses native listing when tryListMarkdownFilesNative returns rows', async () => {
    tryListMarkdownFilesNativeMock.mockResolvedValueOnce([
      {lastModified: 22, name: 'newer.md', uri: `${baseUri}/Inbox/newer.md`},
      {lastModified: 11, name: 'older.md', uri: `${baseUri}/Inbox/older.md`},
    ]);

    await expect(listNotes(baseUri)).resolves.toEqual([
      {lastModified: 22, name: 'newer.md', uri: `${baseUri}/Inbox/newer.md`},
      {lastModified: 11, name: 'older.md', uri: `${baseUri}/Inbox/older.md`},
    ]);
    expect(existsMock).not.toHaveBeenCalled();
    expect(listFilesMock).not.toHaveBeenCalled();
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

  test('listNotes falls back to JS listing when native returns empty but directory exists', async () => {
    tryListMarkdownFilesNativeMock.mockResolvedValueOnce([]);
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

    await expect(listGeneralMarkdownFiles(baseUri)).resolves.toEqual([
      {
        lastModified: 11,
        name: '2026 Demo - podcasts.md',
        uri: `${baseUri}/General/2026 Demo - podcasts.md`,
      },
    ]);
    expect(existsMock).not.toHaveBeenCalled();
    expect(listFilesMock).not.toHaveBeenCalled();
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
    existsMock.mockResolvedValueOnce(false).mockResolvedValue(true);
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

  test('writeNoteContent writes markdown content by URI', async () => {
    await writeNoteContent(`${baseUri}/test.md`, 'updated');

    expect(writeFileMock).toHaveBeenCalledWith(`${baseUri}/test.md`, 'updated\n', {
      encoding: 'utf8',
      mimeType: 'text/markdown',
    });
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
    existsMock.mockResolvedValueOnce(false);

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

  test('writePlaylist writes playlist.json', async () => {
    existsMock.mockResolvedValueOnce(true);

    await writePlaylist(baseUri, {
      durationMs: 1000,
      episodeId: 'episode-a',
      mp3Url: 'https://example.com/episode-a.mp3',
      positionMs: 250,
    });

    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/playlist.json`,
      '{\n  "durationMs": 1000,\n  "episodeId": "episode-a",\n  "mp3Url": "https://example.com/episode-a.mp3",\n  "positionMs": 250\n}\n',
      {encoding: 'utf8', mimeType: 'application/json'},
    );
  });

  test('readPlaylist returns parsed playlist entry', async () => {
    existsMock.mockResolvedValueOnce(true);
    readFileMock.mockResolvedValueOnce(
      '{"durationMs":1000,"episodeId":"episode-a","mp3Url":"https://example.com/episode-a.mp3","positionMs":250}',
    );

    await expect(readPlaylist(baseUri)).resolves.toEqual({
      durationMs: 1000,
      episodeId: 'episode-a',
      mp3Url: 'https://example.com/episode-a.mp3',
      positionMs: 250,
    });
  });

  test('clearPlaylist empties existing playlist file', async () => {
    existsMock.mockResolvedValueOnce(true);

    await clearPlaylist(baseUri);

    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/playlist.json`,
      '',
      {encoding: 'utf8', mimeType: 'application/json'},
    );
  });

  test('writePodcastImageFile stores base64 image in podcast-images directory', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      writePodcastImageFile(baseUri, 'rss-abc', 'QUJDRA==', 'png', 'image/png'),
    ).resolves.toBe(`${baseUri}/.notebox/podcast-images/rss-abc.png`);

    expect(mkdirMock).toHaveBeenCalledWith(`${baseUri}/.notebox/podcast-images`);
    expect(writeFileMock).toHaveBeenCalledWith(
      `${baseUri}/.notebox/podcast-images/rss-abc.png`,
      'QUJDRA==',
      {encoding: 'base64', mimeType: 'image/png'},
    );
  });
});

describe('buildSafDocumentUri', () => {
  const authority = 'content://com.android.externalstorage.documents/tree/';

  test('converts a primary:Folder path-style URI to a proper document URI', () => {
    const treeRoot = `${authority}primary:Notes`;
    const pathStyle = `${authority}primary:Notes/.notebox/podcast-images/rss-abc.jpg`;
    const expected =
      `${authority}primary%3ANotes/document/primary%3ANotes%2F.notebox%2Fpodcast-images%2Frss-abc.jpg`;
    expect(buildSafDocumentUri(treeRoot, pathStyle)).toBe(expected);
  });

  test('encodes colons and slashes in both treeId and docId', () => {
    const treeRoot = `${authority}primary:Documents/Vault`;
    const pathStyle = `${authority}primary:Documents/Vault/.notebox/podcast-images/img.png`;
    const result = buildSafDocumentUri(treeRoot, pathStyle);
    expect(result).toContain('/document/');
    expect(result).toContain('primary%3ADocuments%2FVault');
    expect(result).toContain('%2F.notebox%2Fpodcast-images%2Fimg.png');
  });

  test('returns null when baseUri is not an ExternalStorageProvider URI', () => {
    expect(buildSafDocumentUri('content://notes', 'content://notes/.notebox/img.jpg')).toBeNull();
  });

  test('returns null when pathStyleUri does not start with treeRootUri', () => {
    const treeRoot = `${authority}primary:Notes`;
    expect(buildSafDocumentUri(treeRoot, `${authority}primary:Other/img.jpg`)).toBeNull();
  });
});

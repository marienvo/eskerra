import {describe, expect, it} from 'vitest';

import {
  extractInlineMarkdownLinksFromMarkdown,
  isBrowserOpenableMarkdownHref,
  isExternalMarkdownHref,
  listInboxRelativeMarkdownLinkBacklinkReferrersForTarget,
  planInboxRelativeMarkdownLinkRenameInMarkdown,
  posixRelativeVaultPath,
  posixResolveRelativeToDirectory,
  resolveVaultRelativeMarkdownHref,
  stripMarkdownLinkHrefToPathPart,
} from './vaultRelativeMarkdownLink';
import type {InboxWikiLinkNoteRef} from './wikiLinkInbox';

const vaultRoot = '/vault';
const notes: InboxWikiLinkNoteRef[] = [
  {name: 'alpha.md', uri: '/vault/Inbox/alpha.md'},
  {name: 'Beta.md', uri: '/vault/Inbox/Beta.md'},
  {name: 'gamma.md', uri: '/vault/Inbox/sub/gamma.md'},
];

describe('stripMarkdownLinkHrefToPathPart / isExternalMarkdownHref', () => {
  it('strips query and fragment', () => {
    expect(stripMarkdownLinkHrefToPathPart('./n.md?q=1#h')).toBe('./n.md');
  });

  it('detects external schemes', () => {
    expect(isExternalMarkdownHref('https://a/b.md')).toBe(true);
    expect(isExternalMarkdownHref('mailto:x')).toBe(true);
    expect(isExternalMarkdownHref('//cdn/x.md')).toBe(true);
    expect(isExternalMarkdownHref('./x.md')).toBe(false);
    expect(isExternalMarkdownHref('../x.md')).toBe(false);
  });
});

describe('isBrowserOpenableMarkdownHref', () => {
  it('allows http(s) and mailto only', () => {
    expect(isBrowserOpenableMarkdownHref('https://example.com/x')).toBe(true);
    expect(isBrowserOpenableMarkdownHref('HTTP://example.com/')).toBe(true);
    expect(isBrowserOpenableMarkdownHref('http://a')).toBe(true);
    expect(isBrowserOpenableMarkdownHref('mailto:a@b')).toBe(true);
    expect(isBrowserOpenableMarkdownHref('javascript:alert(1)')).toBe(false);
    expect(isBrowserOpenableMarkdownHref('file:///etc/passwd')).toBe(false);
    expect(isBrowserOpenableMarkdownHref('//cdn/x')).toBe(false);
    expect(isBrowserOpenableMarkdownHref('./note.md')).toBe(false);
    expect(isBrowserOpenableMarkdownHref('')).toBe(false);
  });
});

describe('posixResolveRelativeToDirectory', () => {
  it('resolves dot and dotdot', () => {
    expect(
      posixResolveRelativeToDirectory('/vault/Inbox/sub', '../Beta.md'),
    ).toBe('/vault/Inbox/Beta.md');
    expect(
      posixResolveRelativeToDirectory('/vault/Inbox/sub', './gamma.md'),
    ).toBe('/vault/Inbox/sub/gamma.md');
  });

  it('decodes percent-encoding in path segments', () => {
    expect(
      posixResolveRelativeToDirectory('/vault/Inbox', 'my%20note.md'),
    ).toBe('/vault/Inbox/my note.md');
  });

  it('preserves content:// scheme for Android SAF URIs', () => {
    expect(
      posixResolveRelativeToDirectory('content://tree/vault/Inbox', './Beta.md'),
    ).toBe('content://tree/vault/Inbox/Beta.md');
    expect(
      posixResolveRelativeToDirectory('content://tree/vault/Inbox/sub', '../Beta.md'),
    ).toBe('content://tree/vault/Inbox/Beta.md');
  });
});

describe('posixRelativeVaultPath', () => {
  it('uses ./ for same directory', () => {
    expect(
      posixRelativeVaultPath('/vault/Inbox', '/vault/Inbox/x.md'),
    ).toBe('./x.md');
  });

  it('walks up with ..', () => {
    expect(
      posixRelativeVaultPath('/vault/Inbox/sub', '/vault/Inbox/b.md'),
    ).toBe('../b.md');
  });
});

describe('resolveVaultRelativeMarkdownHref', () => {
  it('resolves when source is the Inbox directory (no .md suffix)', () => {
    const r = resolveVaultRelativeMarkdownHref(
      vaultRoot,
      '/vault/Inbox',
      './Beta.md',
      notes,
    );
    expect(r?.uri).toBe('/vault/Inbox/Beta.md');
  });

  it('resolves same-dir and parent paths', () => {
    const a = resolveVaultRelativeMarkdownHref(
      vaultRoot,
      '/vault/Inbox/alpha.md',
      './Beta.md',
      notes,
    );
    expect(a?.uri).toBe('/vault/Inbox/Beta.md');

    const b = resolveVaultRelativeMarkdownHref(
      vaultRoot,
      '/vault/Inbox/sub/gamma.md',
      '../Beta.md',
      notes,
    );
    expect(b?.uri).toBe('/vault/Inbox/Beta.md');
  });

  it('returns null for non-md and http links', () => {
    expect(
      resolveVaultRelativeMarkdownHref(
        vaultRoot,
        '/vault/Inbox/a.md',
        './x.png',
        notes,
      ),
    ).toBeNull();
    expect(
      resolveVaultRelativeMarkdownHref(
        vaultRoot,
        '/vault/Inbox/a.md',
        'https://h/x.md',
        notes,
      ),
    ).toBeNull();
  });

  it('rejects paths outside vault', () => {
    expect(
      resolveVaultRelativeMarkdownHref(
        vaultRoot,
        '/vault/Inbox/a.md',
        '../../../../etc/passwd.md',
        notes,
      ),
    ).toBeNull();
  });

  it('resolves through underscore-prefixed backup-style directories', () => {
    const extended: InboxWikiLinkNoteRef[] = [
      ...notes,
      {name: 'b.md', uri: '/vault/General/_autosync-backup-nuc/General/b.md'},
    ];
    const r = resolveVaultRelativeMarkdownHref(
      vaultRoot,
      '/vault/General/Missing.md',
      '_autosync-backup-nuc/General/b.md',
      extended,
    );
    expect(r?.uri).toBe('/vault/General/_autosync-backup-nuc/General/b.md');
  });

  it('rejects hard-excluded directories in relative link targets', () => {
    expect(
      resolveVaultRelativeMarkdownHref(
        vaultRoot,
        '/vault/Inbox/a.md',
        '../Assets/hidden.md',
        notes,
      ),
    ).toBeNull();
  });

  it('resolves relative links against Android SAF content:// note URIs', () => {
    const safRoot = 'content://com.android.externalstorage.documents/tree/primary%3Avault';
    const safNotes: InboxWikiLinkNoteRef[] = [
      {name: 'alpha', uri: `${safRoot}/Inbox/alpha.md`},
      {name: 'Beta',  uri: `${safRoot}/Inbox/Beta.md`},
      {name: 'gamma', uri: `${safRoot}/Inbox/sub/gamma.md`},
    ];

    const same = resolveVaultRelativeMarkdownHref(
      safRoot,
      `${safRoot}/Inbox/alpha.md`,
      './Beta.md',
      safNotes,
    );
    expect(same?.uri).toBe(`${safRoot}/Inbox/Beta.md`);

    const parent = resolveVaultRelativeMarkdownHref(
      safRoot,
      `${safRoot}/Inbox/sub/gamma.md`,
      '../Beta.md',
      safNotes,
    );
    expect(parent?.uri).toBe(`${safRoot}/Inbox/Beta.md`);

    const outside = resolveVaultRelativeMarkdownHref(
      safRoot,
      `${safRoot}/Inbox/alpha.md`,
      '../../escape.md',
      safNotes,
    );
    expect(outside).toBeNull();
  });

  it('handles Android SAF URI normalization mismatch (denormalized base, encoded note refs)', () => {
    // openDocumentTree returns a denormalized vault URI (`primary:vault`), while
    // native Kotlin DocumentFile.uri.toString() returns the standard SAF document URI
    // (`primary%3Avault/document/primary%3Avault%2FInbox%2Fnote.md`). Both formats
    // must resolve relative links to the same canonical note ref.
    const baseDenormalized = 'content://com.android.externalstorage.documents/tree/primary:vault';
    const noteEncoded = 'content://com.android.externalstorage.documents/tree/primary%3Avault/document/primary%3Avault%2FInbox%2Falpha.md';
    const targetEncoded = 'content://com.android.externalstorage.documents/tree/primary%3Avault/document/primary%3Avault%2FInbox%2FBeta.md';
    const refs: InboxWikiLinkNoteRef[] = [
      {name: 'alpha', uri: noteEncoded},
      {name: 'Beta', uri: targetEncoded},
    ];

    const r = resolveVaultRelativeMarkdownHref(
      baseDenormalized,
      noteEncoded,
      './Beta.md',
      refs,
    );
    expect(r?.uri).toBe(targetEncoded);
  });

  it('preserves encoded Android SAF document URIs without indexed note refs', () => {
    const safRoot = 'content://com.android.externalstorage.documents/tree/primary%3Avault';
    const noteEncoded = `${safRoot}/document/primary%3Avault%2FInbox%2Falpha.md`;
    const targetEncoded = `${safRoot}/document/primary%3Avault%2FInbox%2FBeta.md`;

    const r = resolveVaultRelativeMarkdownHref(
      safRoot,
      noteEncoded,
      './Beta.md',
      [],
    );
    expect(r?.uri).toBe(targetEncoded);
  });

  it('rejects encoded Android SAF document URI links outside the vault root', () => {
    const safRoot = 'content://com.android.externalstorage.documents/tree/primary%3Avault';
    const noteEncoded = `${safRoot}/document/primary%3Avault%2FInbox%2Falpha.md`;

    const r = resolveVaultRelativeMarkdownHref(
      safRoot,
      noteEncoded,
      '../../escape.md',
      [],
    );
    expect(r).toBeNull();
  });

  it('handles encoded base with denormalized note URI (reverse mismatch)', () => {
    const baseEncoded = 'content://com.android.externalstorage.documents/tree/primary%3Avault';
    const noteDenormalized = 'content://com.android.externalstorage.documents/tree/primary:vault/Inbox/alpha.md';
    const targetDenormalized = 'content://com.android.externalstorage.documents/tree/primary:vault/Inbox/Beta.md';
    const refs: InboxWikiLinkNoteRef[] = [
      {name: 'alpha', uri: noteDenormalized},
      {name: 'Beta', uri: targetDenormalized},
    ];

    const r = resolveVaultRelativeMarkdownHref(
      baseEncoded,
      noteDenormalized,
      './Beta.md',
      refs,
    );
    expect(r?.uri).toBe(targetDenormalized);
  });
});

describe('extractInlineMarkdownLinksFromMarkdown', () => {
  it('parses inline link and skips wiki links', () => {
    const md =
      '[[wiki]] and [lbl](./Beta.md) tail ![x](i.png)';
    const m = extractInlineMarkdownLinksFromMarkdown(md);
    expect(m.length).toBe(2);
    expect(m[0]?.isImage).toBe(false);
    expect(md.slice(m[0]!.hrefStart, m[0]!.hrefEnd)).toBe('./Beta.md');
    expect(m[1]?.isImage).toBe(true);
  });

  it('handles escaped parens in destination', () => {
    const md = '[a](u\\)x.md)';
    const m = extractInlineMarkdownLinksFromMarkdown(md);
    expect(m.length).toBe(1);
    expect(md.slice(m[0]!.hrefStart, m[0]!.hrefEnd)).toBe('u\\)x.md');
  });
});

describe('planInboxRelativeMarkdownLinkRenameInMarkdown', () => {
  it('rewrites href when target file is renamed', () => {
    const plan = planInboxRelativeMarkdownLinkRenameInMarkdown({
      markdown: 'See [t](./Old.md ) and [[wiki]].',
      sourceUri: '/vault/Inbox/a.md',
      oldTargetUri: '/vault/Inbox/Old.md',
      newTargetUri: '/vault/Inbox/New.md',
      vaultRoot,
      noteRefs: [
        ...notes,
        {name: 'Old.md', uri: '/vault/Inbox/Old.md'},
        {name: 'New.md', uri: '/vault/Inbox/New.md'},
      ],
    });
    expect(plan.changed).toBe(true);
    expect(plan.updatedLinkCount).toBe(1);
    expect(plan.markdown).toContain('./New.md');
    expect(plan.markdown).toContain('[[wiki]]');
  });

  it('does not change broken links', () => {
    const plan = planInboxRelativeMarkdownLinkRenameInMarkdown({
      markdown: '[t](./missing.md)',
      sourceUri: '/vault/Inbox/a.md',
      oldTargetUri: '/vault/Inbox/Old.md',
      newTargetUri: '/vault/Inbox/New.md',
      vaultRoot,
      noteRefs: notes,
    });
    expect(plan.changed).toBe(false);
  });
});

describe('listInboxRelativeMarkdownLinkBacklinkReferrersForTarget', () => {
  it('lists referrers by resolved href', () => {
    const contentByUri: Record<string, string> = {
      '/vault/Inbox/alpha.md': '[x](./Beta.md)',
    };
    const uris = listInboxRelativeMarkdownLinkBacklinkReferrersForTarget({
      targetUri: '/vault/Inbox/Beta.md',
      notes,
      contentByUri,
      activeUri: null,
      activeBody: '',
      vaultRoot,
    });
    expect(uris).toEqual(['/vault/Inbox/alpha.md']);
  });

  it('ignores image links', () => {
    const contentByUri: Record<string, string> = {
      '/vault/Inbox/alpha.md': '![x](./Beta.md)',
    };
    const uris = listInboxRelativeMarkdownLinkBacklinkReferrersForTarget({
      targetUri: '/vault/Inbox/Beta.md',
      notes,
      contentByUri,
      activeUri: null,
      activeBody: '',
      vaultRoot,
    });
    expect(uris).toEqual([]);
  });
});

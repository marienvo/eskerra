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

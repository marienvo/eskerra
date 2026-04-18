import {
  preprocessVaultReadonlyMarkdownBody,
  transformMarkdownOutsideTripleBacktickFences,
  wikiLinksToSyntheticMarkdownLinks,
} from '../src/features/vault/markdown/vaultWikiLinkPreprocess';

describe('wikiLinksToSyntheticMarkdownLinks', () => {
  it('rewrites a simple wiki link to a synthetic markdown link', () => {
    expect(wikiLinksToSyntheticMarkdownLinks('See [[Alpha]] here.')).toBe(
      'See [Alpha](eskerra-wiki:Alpha) here.',
    );
  });

  it('supports display text after pipe', () => {
    expect(wikiLinksToSyntheticMarkdownLinks('[[Alpha|Beta]]')).toBe(
      '[Beta](eskerra-wiki:Alpha%7CBeta)',
    );
  });

  it('escapes backslashes in display label', () => {
    expect(wikiLinksToSyntheticMarkdownLinks('[[t|a\\b]]')).toBe(
      '[a\\\\b](eskerra-wiki:t%7Ca%5Cb)',
    );
  });
});

describe('transformMarkdownOutsideTripleBacktickFences', () => {
  it('does not rewrite wiki links inside fenced code blocks', () => {
    const input = 'before [[In]]\n```md\n[[Skip]]\n```\nafter [[Out]]';
    const got = transformMarkdownOutsideTripleBacktickFences(input, wikiLinksToSyntheticMarkdownLinks);
    expect(got).toContain('[[Skip]]');
    expect(got).toContain('[In](eskerra-wiki:In)');
    expect(got).toContain('[Out](eskerra-wiki:Out)');
  });
});

describe('preprocessVaultReadonlyMarkdownBody', () => {
  it('combines fence skipping and wiki rewrite', () => {
    const md = '# Hi\n\n[[x]]\n\n```\n[[y]]\n```\n';
    const got = preprocessVaultReadonlyMarkdownBody(md);
    expect(got).toMatch(/\[x\]\(eskerra-wiki:x\)/);
    expect(got).toContain('[[y]]');
  });
});

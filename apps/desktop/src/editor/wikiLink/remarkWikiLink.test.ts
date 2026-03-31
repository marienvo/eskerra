import type {Root} from 'mdast';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import {unified} from 'unified';
import {visit} from 'unist-util-visit';
import {describe, expect, it} from 'vitest';

import {remarkWikiLink, type WikiLinkMdast} from './remarkWikiLink';

function collectWikiLinks(tree: Root): WikiLinkMdast[] {
  const out: WikiLinkMdast[] = [];
  visit(tree, 'wikiLink', node => {
    out.push(node as WikiLinkMdast);
  });
  return out;
}

function parseWithWiki(md: string): Root {
  const proc = unified().use(remarkParse).use(remarkWikiLink);
  const tree = proc.parse(md);
  return proc.runSync(tree);
}

describe('remarkWikiLink', () => {
  it('splits text into wikiLink mdast nodes', () => {
    const tree = parseWithWiki('Hello [[My Note]] world');
    const links = collectWikiLinks(tree);
    expect(links.map(l => l.value)).toEqual(['My Note']);

    const texts: string[] = [];
    visit(tree, 'text', n => {
      texts.push(n.value);
    });
    expect(texts).toEqual(['Hello ', ' world']);
  });

  it('stringifies wikiLink back to bracket syntax', () => {
    const out = unified()
      .use(remarkParse)
      .use(remarkWikiLink)
      .use(remarkStringify)
      .processSync('Prefix [[Target Name]] suffix');
    expect(String(out).trim()).toBe('Prefix [[Target Name]] suffix');
  });

  it('parses multiple wiki links in one paragraph', () => {
    const tree = parseWithWiki('[[One]] and [[Two]]');
    const links = collectWikiLinks(tree);
    expect(links.map(l => l.value)).toEqual(['One', 'Two']);
  });
});

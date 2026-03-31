import type {Root} from 'mdast';
import type {Handlers} from 'mdast-util-to-markdown';
import type {Plugin, Processor} from 'unified';
import {visit} from 'unist-util-visit';

const WIKI_LINK_PATTERN = /\[\[([^[\]]+)]]/g;

/** mdast node type for wiki-style links (parsed from `[[note-name]]`). */
export type WikiLinkMdast = {
  type: 'wikiLink';
  value: string;
};

function splitWikiFromText(
  value: string,
): Array<{type: 'text'; value: string} | WikiLinkMdast> | null {
  const parts: Array<{type: 'text'; value: string} | WikiLinkMdast> = [];
  let lastIndex = 0;
  WIKI_LINK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_PATTERN.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        value: value.slice(lastIndex, match.index),
      });
    }
    parts.push({type: 'wikiLink', value: match[1]});
    lastIndex = match.index + match[0].length;
  }
  if (parts.length === 0) {
    return null;
  }
  if (lastIndex < value.length) {
    parts.push({type: 'text', value: value.slice(lastIndex)});
  }
  return parts;
}

/**
 * Remark / unified plugin: splits paragraph (etc.) text into `wikiLink` mdast nodes
 * and registers a `toMarkdown` handler so `[[...]]` round-trips.
 */
export const remarkWikiLink: Plugin<[], Root> = function remarkWikiLink(
  this: Processor,
) {
  const data = this.data();
  const toMarkdownExtensions =
    data.toMarkdownExtensions ?? (data.toMarkdownExtensions = []);
  const wikiLinkHandlers = {
    wikiLink(node: WikiLinkMdast) {
      return '[[' + node.value + ']]';
    },
  } as unknown as Handlers;
  toMarkdownExtensions.push({handlers: wikiLinkHandlers});

  return function transformer(tree: Root) {
    visit(tree, 'text', (node, index, parent) => {
      if (
        parent === undefined ||
        typeof index !== 'number' ||
        index < 0
      ) {
        return;
      }
      const next = splitWikiFromText(node.value);
      if (!next || (next.length === 1 && next[0].type === 'text')) {
        return;
      }
      const parentChildren = parent.children as unknown[];
      parentChildren.splice(index, 1, ...next);
    });
  };
};


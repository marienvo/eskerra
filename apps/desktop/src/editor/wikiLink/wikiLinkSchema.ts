import {$nodeSchema, $remark} from '@milkdown/kit/utils';

import {remarkWikiLink} from './remarkWikiLink';

export const WIKI_LINK_NODE_ID = 'wiki_link';

/** Milkdown `$remark` tuple: registers the unified wiki-link plugin on the processor. */
export const wikiLinkRemark = $remark('wikiLinkRemark', () => remarkWikiLink);

export const wikiLinkSchema = $nodeSchema(WIKI_LINK_NODE_ID, () => ({
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  attrs: {
    value: {default: ''},
  },
  parseDOM: [
    {
      tag: `a[data-type="${WIKI_LINK_NODE_ID}"]`,
      getAttrs: dom => {
        const el = dom as HTMLElement;
        const v = el.dataset?.wikiName ?? '';
        return {value: v};
      },
    },
  ],
  toDOM: node => {
    const name = node.attrs.value as string;
    return [
      'a',
      {
        class: 'wiki-link',
        href: `#wiki/${encodeURIComponent(name)}`,
        'data-type': WIKI_LINK_NODE_ID,
        'data-wiki-name': name,
      },
      name,
    ];
  },
  parseMarkdown: {
    match: node => node.type === 'wikiLink',
    runner: (state, node, type) => {
      state.addNode(type, {value: node.value as string});
    },
  },
  toMarkdown: {
    match: node => node.type.name === WIKI_LINK_NODE_ID,
    runner: (state, node) => {
      state.addNode('wikiLink', undefined, node.attrs.value as string);
    },
  },
}));

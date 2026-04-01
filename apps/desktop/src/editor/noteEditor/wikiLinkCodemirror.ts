import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

const wikiLinkMatcher = new MatchDecorator({
  regexp: /\[\[([^[\]]+)\]\]/g,
  decoration: () =>
    Decoration.mark({
      class: 'cm-wiki-link',
    }),
});

/** Highlights `[[wiki-style]]` spans in the markdown source. */
export const wikiLinkHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = wikiLinkMatcher.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = wikiLinkMatcher.updateDeco(update, this.decorations);
    }
  },
  {decorations: instance => instance.decorations},
);

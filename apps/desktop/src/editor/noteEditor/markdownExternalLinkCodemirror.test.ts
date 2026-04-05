import {markdown, commonmarkLanguage} from '@codemirror/lang-markdown';
import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {afterEach, describe, expect, it} from 'vitest';

import {noteMarkdownParserExtensions} from './markdownEditorStyling';
import {buildExternalMdLinkDecorations} from './markdownExternalLinkCodemirror';

function collectMarkIntervals(
  view: EditorView,
): Array<{from: number; to: number; class: string | undefined}> {
  const set = buildExternalMdLinkDecorations(view);
  const out: Array<{from: number; to: number; class: string | undefined}> =
    [];
  set.between(0, view.state.doc.length, (from, to, deco) => {
    out.push({
      from,
      to,
      class: typeof deco.spec === 'object' && deco.spec && 'class' in deco.spec
        ? (deco.spec as {class?: string}).class
        : undefined,
    });
  });
  return out;
}

describe('markdownExternalLinkCodemirror', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.replaceChildren();
  });

  it('decorates label and URL for https inline links', () => {
    const doc = 'See [Example](https://example.com/x) here.';
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc,
      extensions: [
        markdown({
          base: commonmarkLanguage,
          extensions: noteMarkdownParserExtensions,
        }),
      ],
    });
    view = new EditorView({state, parent});

    const intervals = collectMarkIntervals(view);
    const labelFrom = doc.indexOf('Example');
    const labelTo = labelFrom + 'Example'.length;
    const urlFrom = doc.indexOf('https:');
    const urlTo = urlFrom + 'https://example.com/x'.length;

    expect(
      intervals.some(
        i =>
          i.from === labelFrom
          && i.to === labelTo
          && i.class === 'cm-md-external-link',
      ),
    ).toBe(true);
    expect(
      intervals.some(
        i =>
          i.from === urlFrom
          && i.to === urlTo
          && i.class === 'cm-md-external-link cm-md-external-href',
      ),
    ).toBe(true);
  });

  it('does not decorate relative markdown paths', () => {
    const doc = '[N](other.md)';
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc,
      extensions: [
        markdown({
          base: commonmarkLanguage,
          extensions: noteMarkdownParserExtensions,
        }),
      ],
    });
    view = new EditorView({state, parent});
    expect(collectMarkIntervals(view)).toEqual([]);
  });
});

import {markdown, commonmarkLanguage} from '@codemirror/lang-markdown';
import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {afterEach, describe, expect, it} from 'vitest';

import {noteMarkdownParserExtensions} from './markdownEditorStyling';
import {
  buildRelativeMdLinkDecorations,
  relativeMdLinkHrefIsResolvedFacet,
} from './markdownRelativeLinkCodemirror';

function collectMarkIntervals(
  view: EditorView,
): Array<{from: number; to: number; class: string | undefined}> {
  const set = buildRelativeMdLinkDecorations(view);
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

describe('markdownRelativeLinkCodemirror', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.replaceChildren();
  });

  it('decorates both LinkLabel and URL for inline links', () => {
    const doc = 'See [Note](foo.md) here.';
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc,
      extensions: [
        markdown({
          base: commonmarkLanguage,
          extensions: noteMarkdownParserExtensions,
        }),
        relativeMdLinkHrefIsResolvedFacet.of(() => true),
      ],
    });
    view = new EditorView({state, parent});

    const intervals = collectMarkIntervals(view);
    const noteFrom = doc.indexOf('Note');
    const noteTo = noteFrom + 'Note'.length;
    const urlFrom = doc.indexOf('foo.md');
    const urlTo = urlFrom + 'foo.md'.length;

    expect(
      intervals.some(
        i =>
          i.from === noteFrom
          && i.to === noteTo
          && i.class === 'cm-md-rel-link cm-md-rel-link--resolved',
      ),
    ).toBe(true);
    expect(
      intervals.some(
        i =>
          i.from === urlFrom
          && i.to === urlTo
          && i.class === 'cm-md-rel-link cm-md-rel-link--resolved',
      ),
    ).toBe(true);
  });

  it('uses unresolved class when href is unresolved', () => {
    const doc = '[Missing](nope.md)';
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc,
      extensions: [
        markdown({
          base: commonmarkLanguage,
          extensions: noteMarkdownParserExtensions,
        }),
        relativeMdLinkHrefIsResolvedFacet.of(() => false),
      ],
    });
    view = new EditorView({state, parent});
    const intervals = collectMarkIntervals(view);
    expect(intervals.length).toBeGreaterThanOrEqual(2);
    expect(intervals.every(i => i.class === 'cm-md-rel-link cm-md-rel-link--unresolved')).toBe(true);
  });
});

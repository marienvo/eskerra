import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree, foldState, foldedRanges, unfoldEffect} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {afterEach, describe, expect, it} from 'vitest';

import {markdownNotebox} from './markdownNoteboxLanguage';
import {
  collectFoldableRanges,
  nestedCollapseAllFolds,
  sortRangesInnermostFirst,
} from './nestedFoldAll';
import {noteMarkdownListItemFoldService, noteMarkdownParserExtensions} from './markdownEditorStyling';

const foldExtensions = [
  markdownNotebox({
    base: commonmarkLanguage,
    extensions: noteMarkdownParserExtensions,
  }),
  noteMarkdownListItemFoldService,
];

function createFoldView(doc: string): EditorView {
  const parent = document.createElement('div');
  const state = EditorState.create({
    doc,
    extensions: [...foldExtensions, /* codeFolding appended on first fold via maybeEnable */],
  });
  return new EditorView({state, parent});
}

afterEach(() => {
  // Views destroyed per test; no global cleanup needed.
});

describe('collectFoldableRanges + sortRangesInnermostFirst', () => {
  it('dedupes the same range from multiple lines', () => {
    const doc = '## A\n\nPara\n';
    const state = EditorState.create({doc, extensions: foldExtensions});
    ensureSyntaxTree(state, state.doc.length, 5000);
    const ranges = collectFoldableRanges(state);
    const headings = ranges.filter(r => {
      const span = r.to - r.from;
      return span > 5;
    });
    expect(headings.length).toBeLessThanOrEqual(1);
    expect(ranges.length).toBeGreaterThan(0);
  });
});

describe('nestedCollapseAllFolds', () => {
  it('creates more than one fold for section with nested multi-line list', () => {
    const doc = '## Section title\n\n- item one\n  continues\n\nTrailing.\n';
    const view = createFoldView(doc);
    ensureSyntaxTree(view.state, view.state.doc.length, 5000);

    nestedCollapseAllFolds(view);

    expect(view.state.field(foldState, false)).not.toBeNull();
    expect(foldedRanges(view.state).size).toBeGreaterThanOrEqual(2);

    view.destroy();
  });

  it('after unfolding only the widest range, at least one smaller fold remains', () => {
    const doc = '## Section title\n\n- item one\n  continues\n\nTrailing.\n';
    const view = createFoldView(doc);
    ensureSyntaxTree(view.state, view.state.doc.length, 5000);

    nestedCollapseAllFolds(view);

    const field = view.state.field(foldState, false);
    expect(field).not.toBeNull();

    const spans: Array<{from: number; to: number; span: number}> = [];
    field!.between(0, view.state.doc.length, (from, to) => {
      spans.push({from, to, span: to - from});
    });
    expect(spans.length).toBeGreaterThanOrEqual(2);

    const outer = spans.reduce((a, b) => (a.span >= b.span ? a : b));
    view.dispatch({effects: [unfoldEffect.of({from: outer.from, to: outer.to})]});

    expect(foldedRanges(view.state).size).toBeGreaterThanOrEqual(1);

    view.destroy();
  });
});

describe('sortRangesInnermostFirst', () => {
  it('orders shorter spans before longer spans', () => {
    const sorted = sortRangesInnermostFirst([
      {from: 0, to: 100},
      {from: 10, to: 20},
      {from: 5, to: 15},
    ]);
    expect(sorted[0]).toEqual({from: 10, to: 20});
    expect(sorted[1]).toEqual({from: 5, to: 15});
    expect(sorted[2]).toEqual({from: 0, to: 100});
  });
});

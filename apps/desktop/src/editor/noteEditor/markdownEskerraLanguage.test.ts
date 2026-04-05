import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {codeFolding, ensureSyntaxTree, foldable} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {noteMarkdownListItemFoldService, noteMarkdownParserExtensions} from './markdownEditorStyling';
import {markdownEskerra} from './markdownEskerraLanguage';

const foldExtensions = [
  markdownEskerra({
    base: commonmarkLanguage,
    extensions: noteMarkdownParserExtensions,
  }),
  codeFolding(),
  noteMarkdownListItemFoldService,
];

describe('markdownEskerra heading section folds', () => {
  it('does not fold ATX H1 sections', () => {
    const doc = '# Title\n\nBody\n';
    const state = EditorState.create({doc, extensions: foldExtensions});
    ensureSyntaxTree(state, state.doc.length, 5000);
    const line1 = state.doc.line(1);
    expect(foldable(state, line1.from, line1.to)).toBeNull();
  });

  it('does not fold Setext H1 sections', () => {
    const doc = 'Title\n=====\n\nBody\n';
    const state = EditorState.create({doc, extensions: foldExtensions});
    ensureSyntaxTree(state, state.doc.length, 5000);
    const line1 = state.doc.line(1);
    expect(foldable(state, line1.from, line1.to)).toBeNull();
  });

  it('still folds ATX H2 sections', () => {
    const doc = '## Section\n\nBody\n';
    const state = EditorState.create({doc, extensions: foldExtensions});
    ensureSyntaxTree(state, state.doc.length, 5000);
    const line1 = state.doc.line(1);
    const bodyLine = state.doc.line(3);
    expect(foldable(state, line1.from, line1.to)).toEqual({
      from: line1.to,
      to: bodyLine.to,
    });
  });
});

import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {codeFolding, ensureSyntaxTree, foldable} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {highlightTree} from '@lezer/highlight';
import {describe, expect, it} from 'vitest';

import {
  markdownEditorBlockLineClasses,
  noteMarkdownHighlightStyle,
  noteMarkdownListItemFoldService,
  noteMarkdownParserExtensions,
} from './markdownEditorStyling';
import {markdownEskerra} from './markdownEskerraLanguage';

function lineClassSets(md: string): Record<number, string[]> {
  const state = EditorState.create({
    doc: md,
    extensions: markdownEskerra({
      base: commonmarkLanguage,
      extensions: noteMarkdownParserExtensions,
    }),
  });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  expect(tree).not.toBeNull();
  const map = markdownEditorBlockLineClasses(state.doc, tree!);
  const out: Record<number, string[]> = {};
  for (const [lineFrom, set] of map.entries()) {
    const line = state.doc.lineAt(lineFrom);
    out[line.number] = [...set].sort();
  }
  return out;
}

function innermostHighlightClassAt(docText: string, pos: number): string | undefined {
  const state = EditorState.create({
    doc: docText,
    extensions: markdownEskerra({
      base: commonmarkLanguage,
      extensions: noteMarkdownParserExtensions,
    }),
  });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  expect(tree).not.toBeNull();
  let bestLen = Infinity;
  let bestCls: string | undefined;
  highlightTree(tree!, noteMarkdownHighlightStyle, (from, to, classes) => {
    if (pos >= from && pos < to) {
      const len = to - from;
      if (len < bestLen) {
        bestLen = len;
        bestCls = classes;
      }
    }
  });
  return bestCls;
}

function highlightClassesOverlapping(docText: string, from: number, to: number): string[] {
  const state = EditorState.create({
    doc: docText,
    extensions: markdownEskerra({
      base: commonmarkLanguage,
      extensions: noteMarkdownParserExtensions,
    }),
  });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  expect(tree).not.toBeNull();
  const out: string[] = [];
  highlightTree(tree!, noteMarkdownHighlightStyle, (f, t, classes) => {
    if (t > from && f < to) {
      out.push(classes);
    }
  });
  return out;
}

describe('noteMarkdown list highlighting', () => {
  it('does not apply cm-md-list to list item body text (Lezer tags.list scope)', () => {
    const doc = '- hello there';
    const from = doc.indexOf('h');
    const to = from + 1;
    const overlapping = highlightClassesOverlapping(doc, from, to);
    expect(overlapping.some(c => c.includes('cm-md-list'))).toBe(false);
  });

  it('applies cm-md-list-mark to the list marker token', () => {
    const doc = '- item';
    const cls = innermostHighlightClassAt(doc, 0);
    expect(cls).toContain('cm-md-list-mark');
  });
});

describe('noteMarkdownListItemFoldService', () => {
  const foldExtensions = [
    markdownEskerra({
      base: commonmarkLanguage,
      extensions: noteMarkdownParserExtensions,
    }),
    codeFolding(),
    noteMarkdownListItemFoldService,
  ];

  it('returns a fold range for a multi-line list item', () => {
    const state = EditorState.create({
      doc: '- first\n  second',
      extensions: foldExtensions,
    });
    ensureSyntaxTree(state, state.doc.length, 5000);
    const line1 = state.doc.line(1);
    expect(foldable(state, line1.from, line1.to)).toEqual({
      from: line1.to,
      to: state.doc.length,
    });
  });

  it('does not fold a single-line list item', () => {
    const state = EditorState.create({
      doc: '- only',
      extensions: foldExtensions,
    });
    ensureSyntaxTree(state, state.doc.length, 5000);
    const line1 = state.doc.line(1);
    expect(foldable(state, line1.from, line1.to)).toBeNull();
  });
});

// List line alignment and soft-wrap are CSS-only (`App.css`); validate visually in WebKitGTK when editing those rules.
describe('markdownEditorBlockLineClasses', () => {
  it('tags bullet list marker vs continuation lines', () => {
    const byLine = lineClassSets('- first line\n  continued here');
    expect(byLine[1]).toEqual(
      [
        'cm-md-list-line',
        'cm-md-list-line--bullet',
        'cm-md-list-line--mark',
      ].sort(),
    );
    expect(byLine[2]).toEqual(
      [
        'cm-md-list-line',
        'cm-md-list-line--bullet',
        'cm-md-list-line--continue',
      ].sort(),
    );
  });

  it('tags ordered list marker vs continuation lines', () => {
    const byLine = lineClassSets('1. first line\n   continued here');
    expect(byLine[1]?.includes('cm-md-list-line--ordered')).toBe(true);
    expect(byLine[1]?.includes('cm-md-list-line--mark')).toBe(true);
    expect(byLine[2]?.includes('cm-md-list-line--ordered')).toBe(true);
    expect(byLine[2]?.includes('cm-md-list-line--continue')).toBe(true);
  });

  it('treats nested bullet item first line as mark, not continue', () => {
    const byLine = lineClassSets('- outer\n  - inner');
    expect(byLine[1]?.includes('cm-md-list-line--mark')).toBe(true);
    expect(byLine[2]?.includes('cm-md-list-line--mark')).toBe(true);
    expect(byLine[2]?.includes('cm-md-list-line--continue')).toBe(false);
    expect(byLine[1]?.includes('cm-md-list-line')).toBe(true);
    expect(byLine[2]?.includes('cm-md-list-line--bullet')).toBe(true);
    expect(byLine[1]?.includes('cm-md-list-line--nest-1')).toBe(false);
    expect(byLine[2]?.includes('cm-md-list-line--nest-1')).toBe(true);
  });

  it('tags horizontal rule lines', () => {
    const byLine = lineClassSets('before\n\n---\nafter');
    expect(byLine[3]?.includes('cm-md-hr-line')).toBe(true);
  });
});

describe('noteMarkdown horizontal rule highlighting', () => {
  it('applies cm-md-hr to the rule token', () => {
    const doc = 'x\n\n---\ny';
    const pos = doc.indexOf('-');
    expect(innermostHighlightClassAt(doc, pos)).toContain('cm-md-hr');
  });
});

describe('noteMarkdown percent-muted highlighting', () => {
  it('applies cm-md-percent-mark to %% delimiters and cm-md-percent-muted to inner span', () => {
    const doc = '%%muted%%';
    expect(innermostHighlightClassAt(doc, 0)).toContain('cm-md-percent-mark');
    expect(innermostHighlightClassAt(doc, 2)).toContain('cm-md-percent-muted');
    expect(innermostHighlightClassAt(doc, doc.length - 2)).toContain('cm-md-percent-mark');
  });
});

describe('noteMarkdown equal-highlight highlighting', () => {
  it('applies cm-md-equal-highlight-mark to == delimiters and cm-md-equal-highlight to inner span', () => {
    const doc = '==x==';
    expect(innermostHighlightClassAt(doc, 0)).toContain('cm-md-equal-highlight-mark');
    expect(innermostHighlightClassAt(doc, 2)).toContain('cm-md-equal-highlight');
    expect(innermostHighlightClassAt(doc, doc.length - 2)).toContain('cm-md-equal-highlight-mark');
  });
});

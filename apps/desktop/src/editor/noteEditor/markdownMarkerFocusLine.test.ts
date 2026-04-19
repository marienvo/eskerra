import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree} from '@codemirror/language';
import {EditorSelection, EditorState, Text} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {noteMarkdownParserExtensions} from './markdownEditorStyling';
import {markdownEskerra} from './markdownEskerraLanguage';
import {
  computeMarkerFocusDecorationStarts,
  computeMarkerFocusLineStarts,
  expandFocusLinesForFencedCode,
} from './markdownMarkerFocusLine';

function makeStateAt(docText: string, cursorPos: number): EditorState {
  const state = EditorState.create({
    doc: docText,
    selection: {anchor: cursorPos},
    extensions: markdownEskerra({
      base: commonmarkLanguage,
      extensions: noteMarkdownParserExtensions,
    }),
  });
  ensureSyntaxTree(state, state.doc.length, 5_000);
  return state;
}

function lineStartsOf(doc: string): number[] {
  const lines = doc.split('\n');
  const out: number[] = [];
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    out.push(pos);
    pos += lines[i]!.length + (i < lines.length - 1 ? 1 : 0);
  }
  return out;
}

describe('computeMarkerFocusLineStarts', () => {
  it('returns the caret line for an empty selection', () => {
    const doc = Text.of(['first', 'second', 'third']);
    const sel = EditorSelection.single(doc.line(2).from);
    expect(computeMarkerFocusLineStarts(doc, sel)).toEqual([doc.line(2).from]);
  });

  it('includes every line touched by a multi-line range', () => {
    const doc = Text.of(['aa', 'bb', 'cc', 'dd']);
    const [l1, l2, l3] = [doc.line(1).from, doc.line(2).from, doc.line(3).from];
    const from = l1;
    const to = doc.line(3).to + 1;
    const sel = EditorSelection.single(from, to);
    expect(computeMarkerFocusLineStarts(doc, sel)).toEqual([l1, l2, l3]);
  });

  it('merges lines from multiple selection ranges', () => {
    const doc = Text.of(['a', 'b', 'c', 'd']);
    const sel = EditorSelection.create([
      EditorSelection.range(doc.line(1).from, doc.line(1).to),
      EditorSelection.range(doc.line(4).from, doc.line(4).to),
    ]);
    expect(computeMarkerFocusLineStarts(doc, sel)).toEqual([
      doc.line(1).from,
      doc.line(4).from,
    ]);
  });

  it('dedupes when two ranges share a line', () => {
    const doc = Text.of(['xy']);
    const lineFrom = doc.line(1).from;
    const sel = EditorSelection.create([
      EditorSelection.range(lineFrom, lineFrom),
      EditorSelection.range(lineFrom + 1, lineFrom + 1),
    ]);
    expect(computeMarkerFocusLineStarts(doc, sel)).toEqual([lineFrom]);
  });

  it('handles to at document length for a non-empty range', () => {
    const raw = 'one\ntwo';
    const doc = Text.of(raw.split('\n'));
    const starts = lineStartsOf(raw);
    const sel = EditorSelection.single(0, doc.length);
    expect(computeMarkerFocusLineStarts(doc, sel)).toEqual(starts);
  });
});

describe('expandFocusLinesForFencedCode', () => {
  const DOC = '# Title\n\n```ts\nconst x = 1;\n```\n\nParagraph.';
  // line numbers: 1=# Title, 2=(blank), 3=```ts, 4=const x=1;, 5=```, 6=(blank), 7=Paragraph.

  it('expands all lines of the fenced block when cursor is on the content line', () => {
    const state = makeStateAt(DOC, DOC.indexOf('const'));
    const lineStarts = new Set<number>([state.doc.lineAt(DOC.indexOf('const')).from]);
    expandFocusLinesForFencedCode(state, lineStarts);
    expect(lineStarts.has(state.doc.line(3).from)).toBe(true); // ```ts
    expect(lineStarts.has(state.doc.line(4).from)).toBe(true); // const x = 1;
    expect(lineStarts.has(state.doc.line(5).from)).toBe(true); // ```
  });

  it('expands when cursor is on the opening fence line', () => {
    const state = makeStateAt(DOC, DOC.indexOf('```ts'));
    const lineStarts = new Set<number>([state.doc.line(3).from]);
    expandFocusLinesForFencedCode(state, lineStarts);
    expect(lineStarts.has(state.doc.line(3).from)).toBe(true);
    expect(lineStarts.has(state.doc.line(5).from)).toBe(true);
  });

  it('expands when cursor is on the closing fence line', () => {
    const closingPos = DOC.lastIndexOf('```');
    const state = makeStateAt(DOC, closingPos);
    const lineStarts = new Set<number>([state.doc.lineAt(closingPos).from]);
    expandFocusLinesForFencedCode(state, lineStarts);
    expect(lineStarts.has(state.doc.line(3).from)).toBe(true);
    expect(lineStarts.has(state.doc.line(5).from)).toBe(true);
  });

  it('does not expand when cursor is outside any fenced block', () => {
    const pos = DOC.indexOf('Paragraph');
    const state = makeStateAt(DOC, pos);
    const paragraphFrom = state.doc.lineAt(pos).from;
    const lineStarts = new Set<number>([paragraphFrom]);
    expandFocusLinesForFencedCode(state, lineStarts);
    expect([...lineStarts]).toEqual([paragraphFrom]);
  });

  it('does not add lines from a different fenced block', () => {
    const twoBlocks =
      '```ts\nfoo();\n```\n\ntext\n\n```py\nbar()\n```';
    const posInFirst = twoBlocks.indexOf('foo');
    const state = makeStateAt(twoBlocks, posInFirst);
    const lineStarts = new Set<number>([state.doc.lineAt(posInFirst).from]);
    expandFocusLinesForFencedCode(state, lineStarts);
    // First block: lines 1–3; second block: lines 7–9.
    expect(lineStarts.has(state.doc.line(1).from)).toBe(true);
    expect(lineStarts.has(state.doc.line(3).from)).toBe(true);
    expect(lineStarts.has(state.doc.line(7).from)).toBe(false);
    expect(lineStarts.has(state.doc.line(9).from)).toBe(false);
  });
});

describe('computeMarkerFocusDecorationStarts', () => {
  it('returns no lines when the editor is not focused', () => {
    const doc = Text.of(['only']);
    const sel = EditorSelection.single(0);
    expect(computeMarkerFocusDecorationStarts(doc, sel, false)).toEqual([]);
  });

  it('uses selection when focused', () => {
    const doc = Text.of(['only']);
    const sel = EditorSelection.single(0);
    expect(computeMarkerFocusDecorationStarts(doc, sel, true)).toEqual([0]);
  });

  it('returns no lines when unfocused even if selection would mark a line', () => {
    const doc = Text.of(['a', 'b']);
    const sel = EditorSelection.single(doc.line(2).from);
    expect(computeMarkerFocusDecorationStarts(doc, sel, false)).toEqual([]);
  });
});

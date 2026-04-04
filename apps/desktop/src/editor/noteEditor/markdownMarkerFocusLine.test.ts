import {EditorSelection, Text} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {
  computeMarkerFocusDecorationStarts,
  computeMarkerFocusLineStarts,
} from './markdownMarkerFocusLine';

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

describe('computeMarkerFocusDecorationStarts', () => {
  it('returns no lines when clearWhenUnfocused and the editor is not focused', () => {
    const doc = Text.of(['only']);
    const sel = EditorSelection.single(0);
    expect(
      computeMarkerFocusDecorationStarts(doc, sel, {
        clearWhenUnfocused: true,
        hasFocus: false,
      }),
    ).toEqual([]);
  });

  it('uses selection when clearWhenUnfocused but the editor is focused', () => {
    const doc = Text.of(['only']);
    const sel = EditorSelection.single(0);
    expect(
      computeMarkerFocusDecorationStarts(doc, sel, {
        clearWhenUnfocused: true,
        hasFocus: true,
      }),
    ).toEqual([0]);
  });

  it('uses selection when not clearWhenUnfocused even without focus (root editor)', () => {
    const doc = Text.of(['a', 'b']);
    const sel = EditorSelection.single(doc.line(2).from);
    expect(
      computeMarkerFocusDecorationStarts(doc, sel, {
        clearWhenUnfocused: false,
        hasFocus: false,
      }),
    ).toEqual([doc.line(2).from]);
  });
});

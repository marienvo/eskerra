import {Text} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {
  buildEskerraTableInsertWithBlankLines,
  countNewlinesBefore,
  countNewlinesFrom,
  neededNewlinesAfterTable,
  neededNewlinesBeforeTable,
} from './eskerraTableV1DocBlocks';

describe('eskerraTableV1DocBlocks newline helpers', () => {
  it('counts newlines before position', () => {
    const doc = Text.of(['a', '', '|']);
    const pipeLine = doc.line(3);
    expect(countNewlinesBefore(doc, pipeLine.from)).toBe(2);
    expect(countNewlinesBefore(doc, 1)).toBe(0);
  });

  it('counts newlines from position', () => {
    const doc = Text.of(['| x |', '', 'z']);
    const afterFirstRow = doc.line(1).to;
    expect(doc.sliceString(afterFirstRow, afterFirstRow + 1)).toBe('\n');
    expect(countNewlinesFrom(doc, afterFirstRow)).toBe(2);
  });

  it('neededNewlinesBeforeTable adds spacing when missing', () => {
    const zeroNl = Text.of(['foo| h |', '| - |']);
    const headerFrom0 = zeroNl.line(1).from + 'foo'.length;
    expect(zeroNl.sliceString(headerFrom0, headerFrom0 + 1)).toBe('|');
    expect(neededNewlinesBeforeTable(zeroNl, headerFrom0)).toBe(2);

    const oneNl = Text.of(['foo', '| h |', '| - |']);
    expect(neededNewlinesBeforeTable(oneNl, oneNl.line(2).from)).toBe(1);

    const ok = Text.of(['foo', '', '| h |', '| - |']);
    expect(neededNewlinesBeforeTable(ok, ok.line(3).from)).toBe(0);
  });

  it('neededNewlinesAfterTable adds spacing when missing', () => {
    const eof = Text.of(['| h |', '| - |']);
    expect(neededNewlinesAfterTable(eof, eof.line(2).to)).toBe(2);

    const one = Text.of(['| h |', '| - |', 'next']);
    expect(neededNewlinesAfterTable(one, one.line(2).to)).toBe(1);

    const two = Text.of(['| h |', '| - |', '', 'next']);
    expect(neededNewlinesAfterTable(two, two.line(2).to)).toBe(0);
  });

  it('buildEskerraTableInsertWithBlankLines wraps markdown', () => {
    const doc = Text.of(['foo', '| h |', '| - |']);
    const block = {from: doc.line(2).from, to: doc.length};
    const inner = '| h |\n| - |';
    expect(buildEskerraTableInsertWithBlankLines(doc, block, inner)).toBe(`\n${inner}\n\n`);
  });
});

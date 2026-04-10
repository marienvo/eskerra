import {Text} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {planCaretPastEOLWikiBrackets} from './wikiEOLCaretPointerFix';

function lineAt(doc: Text, n: number) {
  const ln = doc.line(n);
  return {from: ln.from, to: ln.to, text: ln.text};
}

describe('planCaretPastEOLWikiBrackets', () => {
  it('returns line.to when head is on first closing bracket', () => {
    const doc = Text.of(['prefix [[Husqvarna]]']);
    const line = lineAt(doc, 1);
    const firstClose = line.from + line.text.indexOf(']]');
    expect(firstClose).toBeLessThan(line.to);
    expect(planCaretPastEOLWikiBrackets(doc, line, firstClose)).toBe(line.to);
  });

  it('returns line.to when head is on second closing bracket', () => {
    const doc = Text.of(['x [[y]]']);
    const line = lineAt(doc, 1);
    const secondClose = line.from + line.text.lastIndexOf(']');
    expect(planCaretPastEOLWikiBrackets(doc, line, secondClose)).toBe(line.to);
  });

  it('returns null when head is on last inner character', () => {
    const doc = Text.of(['x [[abc]]']);
    const line = lineAt(doc, 1);
    const lastInner = line.from + line.text.indexOf('c');
    expect(planCaretPastEOLWikiBrackets(doc, line, lastInner)).toBeNull();
  });

  it('returns null when trailing space exists after brackets', () => {
    const doc = Text.of(['x [[y]] ']);
    const line = lineAt(doc, 1);
    const firstClose = line.from + line.text.indexOf(']]');
    expect(planCaretPastEOLWikiBrackets(doc, line, firstClose)).toBeNull();
  });

  it('returns null when more text follows wiki on the line', () => {
    const doc = Text.of(['a [[b]] · rest']);
    const line = lineAt(doc, 1);
    const firstClose = line.from + line.text.indexOf(']]');
    expect(planCaretPastEOLWikiBrackets(doc, line, firstClose)).toBeNull();
  });
});

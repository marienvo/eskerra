import {EditorSelection, EditorState, Text} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {describe, expect, it} from 'vitest';

import {markdownSelectionAllowMultipleRanges} from './markdownSelectionSurround';
import {
  planCaretPastEOLWikiBrackets,
  wikiEOLCaretPointerFixExtension,
} from './wikiEOLCaretPointerFix';

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

describe('wikiEOLCaretPointerFixExtension', () => {
  const extensions = [
    markdownSelectionAllowMultipleRanges(),
    wikiEOLCaretPointerFixExtension(),
  ];

  function withView(doc: string, run: (view: EditorView) => void): void {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({doc, extensions}),
    });
    try {
      run(view);
    } finally {
      view.destroy();
      parent.remove();
    }
  }

  it('moves a single caret past EOL wiki brackets after select.pointer', () => {
    const doc = 'x [[y]]';
    const line = Text.of([doc]).line(1);
    const headOnClose = line.from + doc.indexOf(']]');
    withView(doc, view => {
      view.dispatch({
        selection: EditorSelection.cursor(headOnClose),
        userEvent: 'select.pointer',
      });
      expect(view.state.selection.ranges).toHaveLength(1);
      expect(view.state.selection.main.head).toBe(line.to);
    });
  });

  it('preserves other carets when fixing one EOL wiki bracket caret', () => {
    const doc = 'x [[y]]\nhello';
    withView(doc, view => {
      const line1 = view.state.doc.line(1);
      const headOnClose = line1.from + 'x [[y]]'.indexOf(']]');
      const secondLine = view.state.doc.line(2);
      const headHello = secondLine.from + 1;

      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.cursor(headOnClose),
          EditorSelection.cursor(headHello),
        ]),
        userEvent: 'select.pointer',
      });

      expect(view.state.selection.ranges).toHaveLength(2);
      expect(view.state.selection.ranges[0].head).toBe(line1.to);
      expect(view.state.selection.ranges[1].head).toBe(headHello);
    });
  });

  it('does not collapse multi-caret when no EOL wiki fix applies', () => {
    const doc = 'ab\ncd';
    withView(doc, view => {
      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.cursor(0),
          EditorSelection.cursor(3),
        ]),
        userEvent: 'select.pointer',
      });
      expect(view.state.selection.ranges).toHaveLength(2);
      expect(view.state.selection.ranges[0].head).toBe(0);
      expect(view.state.selection.ranges[1].head).toBe(3);
    });
  });
});

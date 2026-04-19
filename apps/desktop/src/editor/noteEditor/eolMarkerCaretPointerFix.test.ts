import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree} from '@codemirror/language';
import {EditorSelection, EditorState, Text} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {describe, expect, it} from 'vitest';

import {noteMarkdownParserExtensions} from './markdownEditorStyling';
import {markdownEskerra} from './markdownEskerraLanguage';
import {markdownSelectionAllowMultipleRanges} from './markdownSelectionSurround';
import {
  eolMarkerCaretPointerFixExtension,
  planCaretPastEOLMarkers,
} from './eolMarkerCaretPointerFix';

function makeState(docText: string): EditorState {
  const state = EditorState.create({
    doc: docText,
    extensions: markdownEskerra({
      base: commonmarkLanguage,
      extensions: noteMarkdownParserExtensions,
    }),
  });
  ensureSyntaxTree(state, state.doc.length, 5_000);
  return state;
}

function lineOf(state: EditorState, n = 1) {
  const ln = state.doc.line(n);
  return {from: ln.from, to: ln.to, text: ln.text};
}

describe('planCaretPastEOLMarkers — wiki links', () => {
  it('returns line.to when head is on first closing bracket', () => {
    const state = makeState('prefix [[Husqvarna]]');
    const line = lineOf(state);
    const firstClose = line.from + line.text.indexOf(']]');
    expect(planCaretPastEOLMarkers(state, line, firstClose)).toBe(line.to);
  });

  it('returns line.to when head is on second closing bracket', () => {
    const state = makeState('x [[y]]');
    const line = lineOf(state);
    const secondClose = line.from + line.text.lastIndexOf(']');
    expect(planCaretPastEOLMarkers(state, line, secondClose)).toBe(line.to);
  });

  it('returns null when head is on last inner character', () => {
    const state = makeState('x [[abc]]');
    const line = lineOf(state);
    const lastInner = line.from + line.text.indexOf('c');
    expect(planCaretPastEOLMarkers(state, line, lastInner)).toBeNull();
  });

  it('returns null when trailing space exists after brackets', () => {
    const state = makeState('x [[y]] ');
    const line = lineOf(state);
    const firstClose = line.from + line.text.indexOf(']]');
    expect(planCaretPastEOLMarkers(state, line, firstClose)).toBeNull();
  });

  it('returns null when more text follows wiki on the line', () => {
    const state = makeState('a [[b]] · rest');
    const line = lineOf(state);
    const firstClose = line.from + line.text.indexOf(']]');
    expect(planCaretPastEOLMarkers(state, line, firstClose)).toBeNull();
  });
});

describe('planCaretPastEOLMarkers — bold / italic markers', () => {
  it('returns line.to when head is inside closing ** of bold', () => {
    const state = makeState('**bold**');
    const line = lineOf(state);
    const insideClose = line.from + '**bold*'.length; // first char of closing **
    expect(planCaretPastEOLMarkers(state, line, insideClose)).toBe(line.to);
  });

  it('returns null when head is on the last content char of bold', () => {
    const state = makeState('**bold**');
    const line = lineOf(state);
    const lastContent = line.from + '**bol'.length; // 'd'
    expect(planCaretPastEOLMarkers(state, line, lastContent)).toBeNull();
  });

  it('returns line.to when head is inside closing * of italic', () => {
    const state = makeState('*italic*');
    const line = lineOf(state);
    const insideClose = line.from + '*italic'.length; // closing *
    expect(planCaretPastEOLMarkers(state, line, insideClose)).toBe(line.to);
  });

  it('returns line.to when caret is in closing ** after nested _', () => {
    const state = makeState('**_bold_**');
    const line = lineOf(state);
    const insideClose = line.from + '**_bold_*'.length; // first * of closing **
    expect(planCaretPastEOLMarkers(state, line, insideClose)).toBe(line.to);
  });

  it('returns null when bold is not at EOL', () => {
    const state = makeState('**bold** rest');
    const line = lineOf(state);
    const insideClose = line.from + '**bold*'.length;
    expect(planCaretPastEOLMarkers(state, line, insideClose)).toBeNull();
  });
});

describe('eolMarkerCaretPointerFixExtension — integration', () => {
  const extensions = [
    markdownEskerra({base: commonmarkLanguage, extensions: noteMarkdownParserExtensions}),
    markdownSelectionAllowMultipleRanges(),
    eolMarkerCaretPointerFixExtension(),
  ];

  function withView(doc: string, run: (view: EditorView) => void): void {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({parent, state: EditorState.create({doc, extensions})});
    try {
      run(view);
    } finally {
      view.destroy();
      parent.remove();
    }
  }

  it('snaps caret past EOL wiki brackets after select.pointer', () => {
    const doc = 'x [[y]]';
    const line = Text.of([doc]).line(1);
    const headOnClose = line.from + doc.indexOf(']]');
    withView(doc, view => {
      view.dispatch({
        selection: EditorSelection.cursor(headOnClose),
        userEvent: 'select.pointer',
      });
      expect(view.state.selection.main.head).toBe(line.to);
    });
  });

  it('snaps caret past EOL bold closing ** after select.pointer', () => {
    const doc = '**bold**';
    const line = Text.of([doc]).line(1);
    const headOnClose = line.from + '**bold*'.length;
    withView(doc, view => {
      view.dispatch({
        selection: EditorSelection.cursor(headOnClose),
        userEvent: 'select.pointer',
      });
      expect(view.state.selection.main.head).toBe(line.to);
    });
  });

  it('preserves other carets when fixing one', () => {
    const doc = '**bold**\nhello';
    withView(doc, view => {
      const line1 = view.state.doc.line(1);
      const line2 = view.state.doc.line(2);
      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.cursor(line1.from + '**bold*'.length),
          EditorSelection.cursor(line2.from + 1),
        ]),
        userEvent: 'select.pointer',
      });
      expect(view.state.selection.ranges[0]!.head).toBe(line1.to);
      expect(view.state.selection.ranges[1]!.head).toBe(line2.from + 1);
    });
  });
});

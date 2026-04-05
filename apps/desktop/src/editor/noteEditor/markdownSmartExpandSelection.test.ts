import {defaultKeymap} from '@codemirror/commands';
import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {EditorSelection, EditorState, Transaction} from '@codemirror/state';
import {EditorView, keymap} from '@codemirror/view';
import {afterEach, describe, expect, it} from 'vitest';

import {markdownNotebox} from './markdownNoteboxLanguage';
import {noteMarkdownParserExtensions} from './markdownEditorStyling';
import {markdownSelectionAllowMultipleRanges} from './markdownSelectionSurround';
import {
  markdownSmartExpandExtension,
  smartExpandHistoryField,
  SMART_EXPAND_USER_EVENT,
  SMART_SHRINK_USER_EVENT,
} from './markdownSmartExpandSelection';

function editorExtensions() {
  return [
    markdownNotebox({
      base: commonmarkLanguage,
      extensions: noteMarkdownParserExtensions,
    }),
    markdownSelectionAllowMultipleRanges(),
    ...markdownSmartExpandExtension(),
    keymap.of(defaultKeymap),
  ];
}

function dispatchKey(view: EditorView, init: KeyboardEventInit): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', {bubbles: true, cancelable: true, ...init}),
  );
}

function expand(view: EditorView): void {
  dispatchKey(view, {key: 'w', ctrlKey: true});
}

function shrink(view: EditorView): void {
  dispatchKey(view, {key: 'w', ctrlKey: true, shiftKey: true});
}

function mainSpan(view: EditorView): {from: number; to: number} {
  const m = view.state.selection.main;
  return {
    from: Math.min(m.anchor, m.head),
    to: Math.max(m.anchor, m.head),
  };
}

describe('markdownSmartExpandSelection', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.replaceChildren();
  });

  it('expands from cursor to word', () => {
    const doc = 'hello world';
    view = new EditorView({
      state: EditorState.create({doc, selection: EditorSelection.cursor(2), extensions: editorExtensions()}),
      parent: document.body,
    });
    expand(view);
    expect(mainSpan(view)).toEqual({from: 0, to: 5});
  });

  it('expands parenthesis inner then outer', () => {
    const doc = '(inside)';
    view = new EditorView({
      state: EditorState.create({doc, selection: EditorSelection.cursor(4 /* "i" */), extensions: editorExtensions()}),
      parent: document.body,
    });
    expand(view);
    expect(mainSpan(view)).toEqual({from: 1, to: 7});
    expand(view);
    expect(mainSpan(view)).toEqual({from: 0, to: 8});
  });

  it('expands wiki inner then full span', () => {
    const doc = '[[target]]';
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(4 /* "r" */),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    expand(view);
    expect(mainSpan(view)).toEqual({from: 2, to: 8});
    expand(view);
    expect(mainSpan(view)).toEqual({from: 0, to: 10});
  });

  it('shrink restores prior ranges from stack', () => {
    const doc = 'hello world';
    view = new EditorView({
      state: EditorState.create({doc, selection: EditorSelection.cursor(2), extensions: editorExtensions()}),
      parent: document.body,
    });
    expand(view);
    const afterWord = mainSpan(view);
    expect(view.state.field(smartExpandHistoryField).length).toBe(1);
    expand(view);
    expect(afterWord).toEqual({from: 0, to: 5});
    expect(mainSpan(view)).toEqual({from: 0, to: 11});
    expect(view.state.field(smartExpandHistoryField).length).toBe(2);
    shrink(view);
    expect(view.state.field(smartExpandHistoryField).length).toBe(1);
    expect(mainSpan(view)).toEqual(afterWord);
    shrink(view);
    expect(view.state.field(smartExpandHistoryField).length).toBe(0);
    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.selection.main.head).toBe(2);
  });

  it('clears history on doc change', () => {
    const doc = 'hello';
    view = new EditorView({
      state: EditorState.create({doc, selection: EditorSelection.cursor(2), extensions: editorExtensions()}),
      parent: document.body,
    });
    expand(view);
    expect(view.state.field(smartExpandHistoryField).length).toBe(1);
    view.dispatch({changes: {from: 5, to: 5, insert: '!'}, userEvent: 'input.type'});
    expect(view.state.field(smartExpandHistoryField)).toEqual([]);
  });

  it('clears history on non-smart selection change', () => {
    const doc = 'hello world';
    view = new EditorView({
      state: EditorState.create({doc, selection: EditorSelection.cursor(1), extensions: editorExtensions()}),
      parent: document.body,
    });
    expand(view);
    expect(view.state.field(smartExpandHistoryField).length).toBe(1);
    view.dispatch({
      selection: EditorSelection.create([EditorSelection.range(6, 11)]),
      userEvent: 'select.pointer',
    });
    expect(view.state.field(smartExpandHistoryField)).toEqual([]);
  });

  it('does not treat wiki inside fenced code as wiki link', () => {
    const doc = '```\n[[notawiki]]\n```';
    const wikiOffset = doc.indexOf('n');
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(wikiOffset),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    expand(view);
    const after = mainSpan(view);
    expect(after).not.toEqual({from: doc.indexOf('[') + 2, to: doc.indexOf(']') - 2});
  });

  it('collapses to single selection when expanding from multiple ranges', () => {
    const doc = 'ab cd';
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(3)]),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    expand(view);
    expect(view.state.selection.ranges.length).toBe(1);
  });

  it('Dutch: cursor in parenthesized Share expands word, paren inner, outer, then sentence without ? then with ?', () => {
    const doc = 'De tool Share (ook bij Share), en iconen laten verschijnen?';
    const open = doc.indexOf('(');
    const close = doc.indexOf(')', open);
    const innerShare = doc.indexOf('Share', open);
    const cursor = innerShare + 1; // "h" in inner "Share"
    const q = doc.indexOf('?');
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(cursor),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    expand(view);
    expect(mainSpan(view)).toEqual({from: innerShare, to: innerShare + 5});
    expand(view);
    expect(mainSpan(view)).toEqual({from: open + 1, to: close});
    expand(view);
    expect(mainSpan(view)).toEqual({from: open, to: close + 1});
    expand(view);
    expect(mainSpan(view)).toEqual({from: 0, to: q});
    expand(view);
    expect(mainSpan(view)).toEqual({from: 0, to: doc.length});
  });

  it('does not duplicate sentence-body step when the segment has no terminal punct', () => {
    const doc = 'Alleen tekst zonder leesteken aan het eind';
    const w = doc.indexOf('zonder');
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(w + 1),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    expand(view);
    expect(mainSpan(view)).toEqual({from: w, to: w + 6});
    const spans: {from: number; to: number}[] = [];
    for (let steps = 0; steps < 10; steps++) {
      const before = mainSpan(view);
      expand(view);
      const after = mainSpan(view);
      if (before.from === after.from && before.to === after.to) {
        break;
      }
      spans.push(after);
    }
    const sawBodyWithoutPunct = spans.some(
      s => s.to < doc.length && doc.slice(s.from, s.to).trimEnd().match(/[.!?]$/) == null && s.to > w + 6,
    );
    expect(sawBodyWithoutPunct).toBe(false);
    expect(spans[spans.length - 1]).toEqual({from: 0, to: doc.length});
  });

  it('expands nested parentheses outward from inner word', () => {
    const doc = '((a))';
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(2),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    expand(view);
    expect(mainSpan(view)).toEqual({from: 2, to: 3});
    expand(view);
    expect(mainSpan(view)).toEqual({from: 1, to: 4});
    expand(view);
    expect(mainSpan(view)).toEqual({from: 0, to: 5});
  });

  it('comma-bounded clause then sentence body excludes period then full sentence', () => {
    const doc = 'a, bee, c.';
    const bee = doc.indexOf('bee');
    const cursor = bee + 1;
    const dot = doc.indexOf('.');
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(cursor),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    expand(view);
    expect(mainSpan(view)).toEqual({from: bee, to: bee + 3});
    expand(view);
    expect(mainSpan(view)).toEqual({from: 0, to: dot});
    expand(view);
    expect(mainSpan(view)).toEqual({from: 0, to: doc.length});
  });

  it('applies expand then shrink transactions with smart-expand user events', () => {
    const doc = 'hi';
    const events: string[] = [];
    const ext = EditorState.transactionExtender.of(tr => {
      const u = tr.annotation(Transaction.userEvent);
      if (u === SMART_EXPAND_USER_EVENT) {
        events.push('expand');
      }
      if (u === SMART_SHRINK_USER_EVENT) {
        events.push('shrink');
      }
      return null;
    });
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(0),
        extensions: [...editorExtensions(), ext],
      }),
      parent: document.body,
    });
    expand(view);
    expand(view);
    shrink(view);
    shrink(view);
    expect(events.filter(e => e === 'expand').length).toBeGreaterThanOrEqual(1);
    expect(events).toContain('shrink');
  });

  it('expands brace inner then outer', () => {
    const doc = '{inside}';
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(4 /* "i" */),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    expand(view);
    expect(mainSpan(view)).toEqual({from: 1, to: 7});
    expand(view);
    expect(mainSpan(view)).toEqual({from: 0, to: 8});
  });

  it('nested ({a}) prefers innermost brace before paren outer', () => {
    const doc = '({a})';
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(2 /* "a" */),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    expand(view);
    expect(mainSpan(view)).toEqual({from: 2, to: 3});
    expand(view);
    expect(mainSpan(view)).toEqual({from: 1, to: 4});
    expand(view);
    expect(mainSpan(view)).toEqual({from: 0, to: 5});
  });

  it('expands ASCII double-quoted inner then outer', () => {
    const doc = 'say "hi"!';
    const openQuote = doc.indexOf('"');
    const hInHi = doc.indexOf('hi');
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(hInHi + 1 /* "i" in hi */),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    expand(view);
    expect(mainSpan(view)).toEqual({from: openQuote + 1, to: openQuote + 3});
    expand(view);
    expect(mainSpan(view)).toEqual({from: openQuote, to: openQuote + 4});
  });

  it('ordered list: sentence step span does not include the numeral marker', () => {
    const doc = '1. First sentence. More on the same line.\n';
    const first = doc.indexOf('First');
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(first + 1),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    let saw = false;
    for (let s = 0; s < 24; s++) {
      const before = mainSpan(view);
      expand(view);
      const after = mainSpan(view);
      if (before.from === after.from && before.to === after.to) {
        break;
      }
      const t = doc.slice(after.from, after.to);
      if (t.includes('First') && t.includes('sentence') && !t.includes('1.')) {
        saw = true;
        break;
      }
    }
    expect(saw).toBe(true);
  });

  it('multi-line list under heading: list item before full doc; section steps include body then heading line', () => {
    const doc = ['## Kop', '', '- item one', '  more line', '', 'Tail para.'].join('\n');
    const cursor = doc.indexOf('more') + 1;
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: EditorSelection.cursor(cursor),
        extensions: editorExtensions(),
      }),
      parent: document.body,
    });
    const spans: string[] = [];
    let prev = mainSpan(view);
    for (let i = 0; i < 40; i++) {
      expand(view);
      const span = mainSpan(view);
      if (span.from === prev.from && span.to === prev.to) {
        break;
      }
      spans.push(doc.slice(span.from, span.to));
      prev = span;
    }
    const docIdx = spans.indexOf(doc);
    expect(docIdx).toBeGreaterThanOrEqual(0);
    const multiLineItemIdx = spans.findIndex(
      t => t.includes('item one') && t.includes('more line') && t.includes('\n'),
    );
    expect(multiLineItemIdx).toBeGreaterThanOrEqual(0);
    expect(docIdx).toBeGreaterThan(multiLineItemIdx);
    expect(spans.some(t => t.includes('item one') && !t.includes('##'))).toBe(true);
    expect(spans.some(t => t.includes('## Kop'))).toBe(true);
  });
});

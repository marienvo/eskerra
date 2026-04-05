import {defaultKeymap} from '@codemirror/commands';
import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {EditorSelection, EditorState} from '@codemirror/state';
import {EditorView, keymap, runScopeHandlers} from '@codemirror/view';
import {afterEach, describe, expect, it} from 'vitest';

import {markdownNotebox} from './markdownNoteboxLanguage';
import {noteMarkdownParserExtensions} from './markdownEditorStyling';
import {
  markdownSelectionAllowMultipleRanges,
  markdownSelectionSurroundKeymap,
  selectionIsMarkdownPlain,
  stripBalancedDoubleAsterisks,
  stripBalancedSingleAsterisks,
} from './markdownSelectionSurround';

function keydown(view: EditorView, key: string, shiftKey = false): void {
  runScopeHandlers(
    view,
    new KeyboardEvent('keydown', {key, shiftKey, bubbles: true}),
    'editor',
  );
}

function starKeydown(view: EditorView): void {
  keydown(view, '*', true);
}

function minimalMarkdownExtensions() {
  return [
    markdownNotebox({
      base: commonmarkLanguage,
      extensions: noteMarkdownParserExtensions,
    }),
    markdownSelectionAllowMultipleRanges(),
    markdownSelectionSurroundKeymap(),
    keymap.of(defaultKeymap),
  ];
}

describe('markdownSelectionSurround', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.replaceChildren();
  });

  it('strips nested strong inside selection before outer wrap', () => {
    expect(stripBalancedDoubleAsterisks('a **b** c')).toBe('a b c');
    expect(stripBalancedSingleAsterisks('a *b* c')).toBe('a b c');
  });

  it('wraps plain selection with emphasis then upgrades to strong', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'hello world',
      selection: EditorSelection.create([EditorSelection.range(6, 11)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    starKeydown(view!);
    expect(view!.state.doc.toString()).toBe('hello *world*');
    starKeydown(view!);
    expect(view!.state.doc.toString()).toBe('hello **world**');
  });

  it('unwraps strong when inner is selected', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: '**x**',
      selection: EditorSelection.create([EditorSelection.range(2, 3)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    starKeydown(view!);
    expect(view!.state.doc.toString()).toBe('x');
  });

  it('strips emphasis when whole *span* including delimiters is selected', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: '*z*',
      selection: EditorSelection.create([EditorSelection.range(0, 3)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    starKeydown(view!);
    expect(view!.state.doc.toString()).toBe('z');
  });

  it('wiki wrap two [ steps and unwrap one [ on inner', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'note',
      selection: EditorSelection.create([EditorSelection.range(0, 4)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    keydown(view!, '[');
    expect(view!.state.doc.toString()).toBe('[note');

    keydown(view!, '[');
    expect(view!.state.doc.toString()).toBe('[[note]]');

    keydown(view!, '[');
    expect(view!.state.doc.toString()).toBe('note');
  });

  it('does not wrap inside inline link label', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: '[x](https://e)',
      selection: EditorSelection.create([EditorSelection.range(1, 2)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    starKeydown(view!);
    expect(view!.state.doc.toString()).toBe('[x](https://e)');
  });

  it('does not wrap multiline selection', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'a\nb',
      selection: EditorSelection.create([EditorSelection.range(0, 3)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    starKeydown(view!);
    expect(view!.state.doc.toString()).toBe('a\nb');
  });

  it('applies to multiple non-overlapping ranges when all qualify', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'aa bb',
      selection: EditorSelection.create([
        EditorSelection.range(0, 2),
        EditorSelection.range(3, 5),
      ]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});
    expect(view!.state.selection.ranges.length).toBe(2);

    starKeydown(view!);
    expect(view!.state.doc.toString()).toBe('*aa* *bb*');
  });

  it('selectionIsMarkdownPlain is false on link label', () => {
    const state = EditorState.create({
      doc: '[x](u)',
      extensions: minimalMarkdownExtensions(),
    });
    expect(selectionIsMarkdownPlain(state, 1, 2)).toBe(false);
  });
});

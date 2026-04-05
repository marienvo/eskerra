import {defaultKeymap} from '@codemirror/commands';
import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {EditorSelection, EditorState} from '@codemirror/state';
import {EditorView, keymap, runScopeHandlers} from '@codemirror/view';
import {afterEach, describe, expect, it} from 'vitest';

import {markdownEskerra} from './markdownEskerraLanguage';
import {noteMarkdownParserExtensions} from './markdownEditorStyling';
import {
  buildInlineCodeReplacement,
  computeDelimiterPairSurroundChange,
  computeInlineCodeSurroundChange,
  computeSymmetricSurroundChange,
  markdownSelectionAllowMultipleRanges,
  markdownSelectionSurroundKeymap,
  selectionIsMarkdownPlain,
  selectionIsMarkdownPlainForInlineCodeSurround,
  stripBalancedBraces,
  stripBalancedDoubleAsterisks,
  stripBalancedDoubleToken,
  stripBalancedParens,
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

function underscoreKeydown(view: EditorView): void {
  keydown(view, '_', true);
}

function tildeKeydown(view: EditorView): void {
  keydown(view, '~', true);
}

function percentKeydown(view: EditorView): void {
  keydown(view, '%', true);
}

function equalKeydown(view: EditorView): void {
  keydown(view, '=', false);
}

function backtickKeydown(view: EditorView): void {
  keydown(view, '`', false);
}

function parenKeydown(view: EditorView): void {
  keydown(view, '(', true);
}

function braceKeydown(view: EditorView): void {
  keydown(view, '{', true);
}

function doubleQuoteKeydown(view: EditorView): void {
  keydown(view, '"', true);
}

function singleQuoteKeydown(view: EditorView): void {
  keydown(view, "'", false);
}

function minimalMarkdownExtensions() {
  return [
    markdownEskerra({
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
    expect(stripBalancedDoubleToken('a ==b== c', '==')).toBe('a b c');
    expect(stripBalancedDoubleToken('x %%y%% z', '%%')).toBe('x y z');
  });

  it('stripBalancedParens and stripBalancedBraces remove paired delimiters', () => {
    expect(stripBalancedParens('a (b) c')).toBe('a b c');
    expect(stripBalancedBraces('a {b} c')).toBe('a b c');
  });

  it('buildInlineCodeReplacement extends fences when inner contains backticks', () => {
    expect(buildInlineCodeReplacement('a')).toBe('`a`');
    expect(buildInlineCodeReplacement('a`b')).toBe('``a`b``');
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

  it('wraps with strikethrough ~~ in one keystroke and unwraps whole span', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'strike me',
      selection: EditorSelection.create([EditorSelection.range(0, 9)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    tildeKeydown(view!);
    expect(view!.state.doc.toString()).toBe('~~strike me~~');

    view!.dispatch({
      selection: EditorSelection.create([EditorSelection.range(0, view!.state.doc.length)]),
    });
    tildeKeydown(view!);
    expect(view!.state.doc.toString()).toBe('strike me');
  });

  it('applies == and %% surround and strips when whole span selected', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'hi',
      selection: EditorSelection.create([EditorSelection.range(0, 2)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    equalKeydown(view!);
    expect(view!.state.doc.toString()).toBe('==hi==');

    view!.dispatch({
      selection: EditorSelection.create([EditorSelection.range(0, view!.state.doc.length)]),
    });
    equalKeydown(view!);
    expect(view!.state.doc.toString()).toBe('hi');

    view!.dispatch({
      changes: {from: 0, to: 2, insert: 'ab'},
      selection: EditorSelection.create([EditorSelection.range(0, 2)]),
    });
    percentKeydown(view!);
    expect(view!.state.doc.toString()).toBe('%%ab%%');

    view!.dispatch({
      selection: EditorSelection.create([EditorSelection.range(0, view!.state.doc.length)]),
    });
    percentKeydown(view!);
    expect(view!.state.doc.toString()).toBe('ab');
  });

  it('underscore emphasis matches star wrap and upgrade to strong', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'hello world',
      selection: EditorSelection.create([EditorSelection.range(6, 11)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    underscoreKeydown(view!);
    expect(view!.state.doc.toString()).toBe('hello _world_');
    underscoreKeydown(view!);
    expect(view!.state.doc.toString()).toBe('hello __world__');
  });

  it('does not compute highlight or muted surround for an empty range (handlers no-op)', () => {
    const state = EditorState.create({
      doc: 'plain',
      selection: EditorSelection.cursor(2),
      extensions: minimalMarkdownExtensions(),
    });
    expect(
      computeSymmetricSurroundChange(state, EditorSelection.cursor(2), {
        mode: 'pairedOnly',
        double: '==',
      }),
    ).toBeNull();
    expect(
      computeSymmetricSurroundChange(state, EditorSelection.cursor(2), {
        mode: 'pairedOnly',
        double: '%%',
      }),
    ).toBeNull();
  });

  it('multi-cursor highlight == on two ranges', () => {
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

    equalKeydown(view!);
    expect(view!.state.doc.toString()).toBe('==aa== ==bb==');
  });

  it('does not wrap strikethrough on multiline selection', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'a\nb',
      selection: EditorSelection.create([EditorSelection.range(0, 3)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    tildeKeydown(view!);
    expect(view!.state.doc.toString()).toBe('a\nb');
  });

  it('does not wrap highlight inside link label', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: '[x](https://e)',
      selection: EditorSelection.create([EditorSelection.range(1, 2)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    equalKeydown(view!);
    expect(view!.state.doc.toString()).toBe('[x](https://e)');
  });

  it('wraps and unwraps inline code with backtick key', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'code here',
      selection: EditorSelection.create([EditorSelection.range(0, 4)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    backtickKeydown(view!);
    expect(view!.state.doc.toString()).toBe('`code` here');

    view!.dispatch({
      selection: EditorSelection.create([EditorSelection.range(0, 6)]),
    });
    backtickKeydown(view!);
    expect(view!.state.doc.toString()).toBe('code here');
  });

  it('unwraps inline code when only inner is selected', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: '`inner`',
      selection: EditorSelection.create([EditorSelection.range(1, 6)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    backtickKeydown(view!);
    expect(view!.state.doc.toString()).toBe('inner');
  });

  it('allows unwrap inside InlineCode in the syntax tree', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: '`z`',
      selection: EditorSelection.create([EditorSelection.range(1, 2)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});
    expect(selectionIsMarkdownPlain(view.state, 1, 2)).toBe(false);
    expect(selectionIsMarkdownPlainForInlineCodeSurround(view.state, 1, 2)).toBe(true);
    const c = computeInlineCodeSurroundChange(view.state, EditorSelection.range(1, 2));
    expect(c).not.toBeNull();
    expect(c!.insert).toBe('z');
  });

  it('does not wrap inline code for multiline selection', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'a\nb',
      selection: EditorSelection.create([EditorSelection.range(0, 3)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    backtickKeydown(view!);
    expect(view!.state.doc.toString()).toBe('a\nb');
  });

  it('wraps and unwraps plain () selection', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'x y',
      selection: EditorSelection.create([EditorSelection.range(2, 3)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    parenKeydown(view!);
    expect(view!.state.doc.toString()).toBe('x (y)');

    unwrapParenAroundSelection(view!);
    expect(view!.state.doc.toString()).toBe('x y');
  });

  it('unwraps parentheses when whole span including delimiters is selected', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: '(z)',
      selection: EditorSelection.create([EditorSelection.range(0, 3)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    parenKeydown(view!);
    expect(view!.state.doc.toString()).toBe('z');
  });

  it('unwraps one brace layer when inner is nested {{a}}', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: '{{a}}',
      selection: EditorSelection.create([EditorSelection.range(2, 3)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    braceKeydown(view!);
    expect(view!.state.doc.toString()).toBe('{a}');
  });

  it('wraps and unwraps double-quoted selection', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'say hi',
      selection: EditorSelection.create([EditorSelection.range(4, 6)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    doubleQuoteKeydown(view!);
    expect(view!.state.doc.toString()).toBe('say "hi"');

    view!.dispatch({
      selection: EditorSelection.create([EditorSelection.range(4, 8)]),
    });
    doubleQuoteKeydown(view!);
    expect(view!.state.doc.toString()).toBe('say hi');
  });

  it('wraps selection with single quotes without breaking apostrophes in inner', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: "don't stop",
      selection: EditorSelection.create([EditorSelection.range(0, 10)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    singleQuoteKeydown(view!);
    expect(view!.state.doc.toString()).toBe("'don't stop'");
  });

  it('does not delimiter-pair wrap multiline selection', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'a\nb',
      selection: EditorSelection.create([EditorSelection.range(0, 3)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    parenKeydown(view!);
    expect(view!.state.doc.toString()).toBe('a\nb');
  });

  it('multi-cursor delimiter surround on two ranges', () => {
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

    braceKeydown(view!);
    expect(view!.state.doc.toString()).toBe('{aa} {bb}');
  });

  it('does not wrap plain delimiters inside inline link label', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: '[x](https://e)',
      selection: EditorSelection.create([EditorSelection.range(1, 2)]),
      extensions: minimalMarkdownExtensions(),
    });
    view = new EditorView({state, parent});

    parenKeydown(view!);
    expect(view!.state.doc.toString()).toBe('[x](https://e)');
  });

  it('computeDelimiterPairSurroundChange is null for empty range', () => {
    const state = EditorState.create({
      doc: 'plain',
      selection: EditorSelection.cursor(2),
      extensions: minimalMarkdownExtensions(),
    });
    expect(
      computeDelimiterPairSurroundChange(state, EditorSelection.cursor(2), '(', ')', {
        normalizeInner: stripBalancedParens,
      }),
    ).toBeNull();
  });
});

/** Re-select the inner of the first `(...)` in the doc and unwrap one layer. */
function unwrapParenAroundSelection(view: EditorView): void {
  const d = view.state.doc.toString();
  const open = d.indexOf('(');
  view.dispatch({
    selection: EditorSelection.create([EditorSelection.range(open + 1, open + 2)]),
  });
  parenKeydown(view);
}

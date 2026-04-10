import {defaultKeymap} from '@codemirror/commands';
import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {EditorSelection, EditorState} from '@codemirror/state';
import {EditorView, keymap} from '@codemirror/view';
import {afterEach, describe, expect, it} from 'vitest';

import {markdownEskerra} from './markdownEskerraLanguage';
import {noteMarkdownParserExtensions} from './markdownEditorStyling';
import {
  insertMarkdownExternalLinkTemplate,
  insertMarkdownLinkTemplate,
} from './noteMarkdownLinkInsert';

function minimalMarkdown(state: EditorState): EditorView {
  const parent = document.createElement('div');
  document.body.append(parent);
  return new EditorView({
    state,
    parent,
  });
}

function mdState(doc: string, sel: EditorSelection) {
  return EditorState.create({
    doc,
    selection: sel,
    extensions: [
      markdownEskerra({
        base: commonmarkLanguage,
        extensions: noteMarkdownParserExtensions,
      }),
      keymap.of(defaultKeymap),
    ],
  });
}

describe('noteMarkdownLinkInsert', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.replaceChildren();
  });

  it('insertMarkdownLinkTemplate wraps selection and places caret in empty URL', () => {
    view = minimalMarkdown(
      mdState(
        'hello world',
        EditorSelection.create([EditorSelection.range(0, 5)]),
      ),
    );
    insertMarkdownLinkTemplate(view);
    expect(view.state.doc.toString()).toBe('[hello]() world');
    const {anchor, head} = view.state.selection.main;
    expect(Math.min(anchor, head)).toBe(7);
    expect(Math.max(anchor, head)).toBe(7);
  });

  it('insertMarkdownLinkTemplate with empty selection inserts [](url) caret inside brackets', () => {
    view = minimalMarkdown(
      mdState('ab', EditorSelection.create([EditorSelection.cursor(1)])),
    );
    insertMarkdownLinkTemplate(view);
    expect(view.state.doc.toString()).toBe('a[]()b');
    expect(view.state.selection.main.head).toBe(2);
  });

  it('insertMarkdownExternalLinkTemplate selects https placeholder', () => {
    view = minimalMarkdown(
      mdState('x', EditorSelection.create([EditorSelection.range(0, 1)])),
    );
    insertMarkdownExternalLinkTemplate(view);
    const d = view.state.doc.toString();
    expect(d).toBe('[x](https://)');
    const {from, to} = view.state.selection.main;
    expect(view.state.doc.sliceString(from, to)).toBe('https://');
  });
});

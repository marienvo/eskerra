import {markdown, commonmarkLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {MARKDOWN_EXTENSION} from '@notebox/core';

import {markdownActivatableRelativeMdLinkAtPosition} from './markdownActivatableRelativeMdLinkAtPosition';
import {noteMarkdownParserExtensions} from './markdownEditorStyling';

function hrefActivatable(href: string): boolean {
  return href.toLowerCase().endsWith(MARKDOWN_EXTENSION.toLowerCase());
}

function stateForMd(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      markdown({
        base: commonmarkLanguage,
        extensions: noteMarkdownParserExtensions,
      }),
    ],
  });
}

describe('markdownActivatableRelativeMdLinkAtPosition', () => {
  it('returns href when pos is on label or URL, not on LinkMark delimiters', () => {
    const doc = 'See [Note](foo.md) here.';
    const state = stateForMd(doc);
    ensureSyntaxTree(state, state.doc.length, 200);
    const noteIdx = doc.indexOf('N');
    const urlIdx = doc.indexOf('foo');
    const openBracket = doc.indexOf('[');
    const closeParen = doc.indexOf(')');

    expect(
      markdownActivatableRelativeMdLinkAtPosition(state, openBracket, hrefActivatable),
    ).toBeNull();
    expect(
      markdownActivatableRelativeMdLinkAtPosition(
        state,
        doc.indexOf(']'),
        hrefActivatable,
      ),
    ).toBeNull();
    expect(
      markdownActivatableRelativeMdLinkAtPosition(
        state,
        doc.indexOf('('),
        hrefActivatable,
      ),
    ).toBeNull();
    expect(
      markdownActivatableRelativeMdLinkAtPosition(state, closeParen, hrefActivatable),
    ).toBeNull();

    const labelHit = markdownActivatableRelativeMdLinkAtPosition(
      state,
      noteIdx,
      hrefActivatable,
    );
    expect(labelHit).toEqual({
      href: 'foo.md',
      hrefFrom: doc.indexOf('foo.md'),
      hrefTo: doc.indexOf('foo.md') + 'foo.md'.length,
    });

    const urlHit = markdownActivatableRelativeMdLinkAtPosition(
      state,
      urlIdx,
      hrefActivatable,
    );
    expect(urlHit).toEqual(labelHit);
  });

  it('returns null for non-md href regardless of pos', () => {
    const doc = '[Link](https://x.example/)';
    const state = stateForMd(doc);
    ensureSyntaxTree(state, state.doc.length, 200);
    const midLabel = doc.indexOf('ink');
    expect(
      markdownActivatableRelativeMdLinkAtPosition(state, midLabel, hrefActivatable),
    ).toBeNull();
  });
});

import {markdown, commonmarkLanguage} from '@codemirror/lang-markdown';
import {ensureSyntaxTree} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {isBrowserOpenableMarkdownHref, MARKDOWN_EXTENSION} from '@eskerra/core';

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
    /** Gap after `)`; `indexOf(')')` is the gap before `)`, same as URL end and should activate. */
    const afterCloseParen = doc.indexOf(')') + 1;

    expect(
      markdownActivatableRelativeMdLinkAtPosition(state, openBracket, hrefActivatable),
    ).toBeNull();
    const expectedHit = {
      href: 'foo.md',
      hrefFrom: doc.indexOf('foo.md'),
      hrefTo: doc.indexOf('foo.md') + 'foo.md'.length,
    };
    expect(
      markdownActivatableRelativeMdLinkAtPosition(
        state,
        doc.indexOf(']'),
        hrefActivatable,
      ),
    ).toEqual(expectedHit);
    expect(
      markdownActivatableRelativeMdLinkAtPosition(
        state,
        doc.indexOf('('),
        hrefActivatable,
      ),
    ).toBeNull();
    expect(
      markdownActivatableRelativeMdLinkAtPosition(state, afterCloseParen, hrefActivatable),
    ).toBeNull();

    const labelHit = markdownActivatableRelativeMdLinkAtPosition(
      state,
      noteIdx,
      hrefActivatable,
    );
    expect(labelHit).toEqual(expectedHit);

    const urlHit = markdownActivatableRelativeMdLinkAtPosition(
      state,
      urlIdx,
      hrefActivatable,
    );
    expect(urlHit).toEqual(expectedHit);

    const urlEndCaret = doc.indexOf('foo.md') + 'foo.md'.length;
    expect(
      markdownActivatableRelativeMdLinkAtPosition(
        state,
        urlEndCaret,
        hrefActivatable,
      ),
    ).toEqual(expectedHit);
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

  it('activates https label and URL when predicate allows browser schemes', () => {
    const doc = 'See [Site](https://example.com/path) here.';
    const state = stateForMd(doc);
    ensureSyntaxTree(state, state.doc.length, 200);
    const expectedHref = 'https://example.com/path';
    const hrefFrom = doc.indexOf(expectedHref);
    const hrefTo = hrefFrom + expectedHref.length;
    const labelHit = markdownActivatableRelativeMdLinkAtPosition(
      state,
      doc.indexOf('Site'),
      isBrowserOpenableMarkdownHref,
    );
    expect(labelHit).toEqual({
      href: expectedHref,
      hrefFrom,
      hrefTo,
    });
  });
});

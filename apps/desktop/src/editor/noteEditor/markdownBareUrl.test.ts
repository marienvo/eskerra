import {markdown, commonmarkLanguage} from '@codemirror/lang-markdown';
import {EditorState} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {collectBareBrowserUrlIntervals, markdownBareBrowserUrlAtPosition} from './markdownBareUrl';
import {noteMarkdownParserExtensions} from './markdownEditorStyling';

function stateFor(doc: string): EditorState {
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

describe('markdownBareUrl', () => {
  it('collects bare https URL in a paragraph', () => {
    const doc = '# Hi\n\nhttps://youtube.com/watch?v=abc\n';
    const s = stateFor(doc);
    const ivs = collectBareBrowserUrlIntervals(s);
    expect(ivs.length).toBe(1);
    expect(ivs[0]!.href).toBe('https://youtube.com/watch?v=abc');
  });

  it('does not duplicate URL inside inline markdown link', () => {
    const doc = '[a](https://ex.com)';
    const s = stateFor(doc);
    const ivs = collectBareBrowserUrlIntervals(s);
    expect(ivs.length).toBe(0);
  });

  it('resolves hit inside bare autolink span', () => {
    const doc = 'x https://z.com y';
    const s = stateFor(doc);
    const z = doc.indexOf('z.com');
    expect(markdownBareBrowserUrlAtPosition(s, z)).toEqual({
      href: 'https://z.com',
      hrefFrom: doc.indexOf('https:'),
    });
  });
});

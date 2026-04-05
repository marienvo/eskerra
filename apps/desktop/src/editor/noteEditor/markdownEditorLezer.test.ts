import {markdown, commonmarkLanguage} from '@codemirror/lang-markdown';
import {syntaxTree} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {noteMarkdownParserExtensions} from './markdownEditorStyling';

function editorStateForMarkdown(doc: string) {
  return EditorState.create({
    doc,
    extensions: markdown({
      base: commonmarkLanguage,
      extensions: noteMarkdownParserExtensions,
    }),
  });
}

function collectNodeNames(state: EditorState): Set<string> {
  const names = new Set<string>();
  syntaxTree(state).iterate({
    enter: n => {
      names.add(n.type.name);
    },
  });
  return names;
}

describe('noteMarkdownParserExtensions', () => {
  it('parses HorizontalRule', () => {
    const state = editorStateForMarkdown('\n\n---\n');
    expect(collectNodeNames(state)).toContain('HorizontalRule');
  });

  it('parses StrongEmphasis', () => {
    const state = editorStateForMarkdown('**b**');
    expect(collectNodeNames(state)).toContain('StrongEmphasis');
  });

  it('parses Emphasis', () => {
    const state = editorStateForMarkdown('*i*');
    expect(collectNodeNames(state)).toContain('Emphasis');
  });

  it('parses Strikethrough', () => {
    const state = editorStateForMarkdown('~~strike~~');
    expect(collectNodeNames(state)).toContain('Strikethrough');
  });

  it('parses PercentMuted', () => {
    const state = editorStateForMarkdown('%%muted%%');
    expect(collectNodeNames(state)).toContain('PercentMuted');
  });

  it('parses EqualHighlight', () => {
    const state = editorStateForMarkdown('==highlight==');
    expect(collectNodeNames(state)).toContain('EqualHighlight');
    expect(collectNodeNames(state)).toContain('EqualHighlightMark');
  });
});

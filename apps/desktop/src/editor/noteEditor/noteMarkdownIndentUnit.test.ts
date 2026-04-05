import {indentUnit} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {noteMarkdownIndentUnit} from './markdownEditorStyling';

describe('noteMarkdownIndentUnit', () => {
  it('sets CodeMirror indent unit to a tab for list indent and Tab key', () => {
    const state = EditorState.create({extensions: [noteMarkdownIndentUnit]});
    expect(state.facet(indentUnit)).toBe('\t');
  });
});

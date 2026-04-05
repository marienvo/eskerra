import {EditorState, EditorSelection} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {runWikiLinkActivateFromCaret} from './noteMarkdownCoreKeymap';

describe('runWikiLinkActivateFromCaret', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
  });

  it('activates when caret is immediately before ]]', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const doc = '[[alpha note]]';
    const beforeClose = doc.indexOf(']]');
    const state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(beforeClose),
    });
    view = new EditorView({state, parent});
    const onWiki = vi.fn();
    expect(runWikiLinkActivateFromCaret(view, onWiki)).toBe(true);
    expect(onWiki).toHaveBeenCalledWith({
      inner: 'alpha note',
      at: beforeClose,
    });
  });
});

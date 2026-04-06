import {historyKeymap} from '@codemirror/commands';
import {EditorState, EditorSelection} from '@codemirror/state';
import {EditorView, keymap, runScopeHandlers} from '@codemirror/view';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  buildNoteMarkdownDeleteLineModYBindings,
  buildNoteMarkdownVaultKeymapBindings,
  runWikiLinkActivateFromCaret,
} from './noteMarkdownCoreKeymap';

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

describe('buildNoteMarkdownDeleteLineModYBindings', () => {
  it('deletes the active line on Ctrl+Y (before historyKeymap)', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const doc = 'alpha\nbeta\ngamma';
    const state = EditorState.create({
      doc,
      extensions: [
        keymap.of([
          ...buildNoteMarkdownDeleteLineModYBindings(),
          ...historyKeymap,
        ]),
      ],
    });
    const view = new EditorView({state, parent});
    const betaLineStart = doc.indexOf('beta');
    view.dispatch({selection: EditorSelection.cursor(betaLineStart)});
    runScopeHandlers(
      view,
      new KeyboardEvent('keydown', {
        key: 'y',
        code: 'KeyY',
        ctrlKey: true,
        bubbles: true,
      }),
      'editor',
    );
    expect(view.state.doc.toString()).toBe('alpha\ngamma');
    view.destroy();
  });
});

describe('buildNoteMarkdownVaultKeymapBindings', () => {
  it('invokes onDeleteNoteShortcut for Ctrl+Shift+D', () => {
    const onDeleteNoteShortcut = vi.fn();
    const noopVaultHandlers = {
      onWikiLinkActivate: () => {},
      onMarkdownRelativeLinkActivate: () => {},
      onMarkdownExternalLinkOpen: () => {},
    };
    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'x',
      extensions: [
        keymap.of([
          ...buildNoteMarkdownVaultKeymapBindings({
            ...noopVaultHandlers,
            onDeleteNoteShortcut,
          }),
        ]),
      ],
    });
    const view = new EditorView({state, parent});
    runScopeHandlers(
      view,
      new KeyboardEvent('keydown', {
        key: 'd',
        code: 'KeyD',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
      'editor',
    );
    expect(onDeleteNoteShortcut).toHaveBeenCalledTimes(1);
    view.destroy();
  });
});

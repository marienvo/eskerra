import {EditorSelection} from '@codemirror/state';
import {type EditorView, type KeyBinding} from '@codemirror/view';
import {isBrowserOpenableMarkdownHref} from '@eskerra/core';

import {isActivatableRelativeMarkdownHref} from './markdownActivatableRelativeHref';
import {markdownBareBrowserUrlAtPosition} from './markdownBareUrl';
import {markdownActivatableRelativeMdLinkAtPosition} from './markdownActivatableRelativeMdLinkAtPosition';
import {wikiLinkActivatableInnerAtDocPosition} from './wikiLinkInnerAtDocPosition';

export type NoteMarkdownVaultKeymapHandlers = {
  onSaveShortcut?: () => void;
  /** Shell-owned: Mod-Shift-D — request delete for the current note (confirmation outside the editor). */
  onDeleteNoteShortcut?: () => void;
  onWikiLinkActivate: (payload: {inner: string; at: number}) => void;
  onMarkdownRelativeLinkActivate: (payload: {href: string; at: number}) => void;
  onMarkdownExternalLinkOpen: (payload: {href: string; at: number}) => void;
};

/**
 * Wiki `[[|]]` assist: second `[` after `[` with empty selection → `[]]` and caret between inner brackets.
 */
export function runWikiLinkOpenAssist(view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) {
    return false;
  }
  const pos = sel.head;
  if (pos < 1) {
    return false;
  }
  const prev = view.state.doc.sliceString(pos - 1, pos);
  if (prev !== '[') {
    return false;
  }
  view.dispatch({
    changes: {from: pos, to: pos, insert: '[]]'},
    selection: EditorSelection.cursor(pos + 1),
  });
  return true;
}

export function runWikiLinkActivateFromCaret(
  view: EditorView,
  onWikiLinkActivate: NoteMarkdownVaultKeymapHandlers['onWikiLinkActivate'],
): boolean {
  const sel = view.state.selection.main;
  const wikiInner = wikiLinkActivatableInnerAtDocPosition(
    view.state.doc,
    sel.head,
  );
  if (wikiInner == null) {
    return false;
  }
  onWikiLinkActivate({inner: wikiInner, at: sel.head});
  return true;
}

export function runMarkdownRelativeLinkActivateFromCaret(
  view: EditorView,
  onMarkdownRelativeLinkActivate: NoteMarkdownVaultKeymapHandlers['onMarkdownRelativeLinkActivate'],
): boolean {
  const sel = view.state.selection.main;
  const relHit = markdownActivatableRelativeMdLinkAtPosition(
    view.state,
    sel.head,
    isActivatableRelativeMarkdownHref,
  );
  if (relHit == null) {
    return false;
  }
  onMarkdownRelativeLinkActivate({href: relHit.href, at: relHit.hrefFrom});
  return true;
}

export function runMarkdownExternalLinkActivateFromCaret(
  view: EditorView,
  onMarkdownExternalLinkOpen: NoteMarkdownVaultKeymapHandlers['onMarkdownExternalLinkOpen'],
): boolean {
  const sel = view.state.selection.main;
  const hit = markdownActivatableRelativeMdLinkAtPosition(
    view.state,
    sel.head,
    isBrowserOpenableMarkdownHref,
  );
  if (hit != null) {
    onMarkdownExternalLinkOpen({href: hit.href, at: hit.hrefFrom});
    return true;
  }
  const bare = markdownBareBrowserUrlAtPosition(view.state, sel.head);
  if (bare == null) {
    return false;
  }
  onMarkdownExternalLinkOpen({href: bare.href, at: bare.hrefFrom});
  return true;
}

/** Keybindings shared by the root note editor and Eskerra table cell editors (vault navigation + save). */
export function buildNoteMarkdownVaultKeymapBindings(
  handlers: NoteMarkdownVaultKeymapHandlers,
): readonly KeyBinding[] {
  const {
    onSaveShortcut,
    onDeleteNoteShortcut,
    onWikiLinkActivate,
    onMarkdownRelativeLinkActivate,
    onMarkdownExternalLinkOpen,
  } = handlers;
  return [
    {
      key: 'Mod-s',
      run: () => {
        onSaveShortcut?.();
        return true;
      },
    },
    {
      key: 'Mod-Shift-d',
      run: () => {
        onDeleteNoteShortcut?.();
        return true;
      },
    },
    {key: '[', run: runWikiLinkOpenAssist},
    {
      key: 'Mod-Enter',
      run: view =>
        runWikiLinkActivateFromCaret(view, onWikiLinkActivate)
        || runMarkdownRelativeLinkActivateFromCaret(
          view,
          onMarkdownRelativeLinkActivate,
        )
        || runMarkdownExternalLinkActivateFromCaret(view, onMarkdownExternalLinkOpen),
    },
  ];
}

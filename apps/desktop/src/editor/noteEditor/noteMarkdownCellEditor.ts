import {
  acceptCompletion,
  closeCompletion,
  completionStatus,
} from '@codemirror/autocomplete';
import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  type Extension,
} from '@codemirror/state';
import {drawSelection, EditorView, keymap} from '@codemirror/view';
import type {MutableRefObject} from 'react';

import type {InboxWikiLinkCompletionCandidate} from '@notebox/core';

import {clipboardDataProbablyHasVaultImage} from '../../lib/clipboardImageFiles';
import {formatVaultImageMarkdownForInsert} from '../../lib/formatVaultImageMarkdown';
import type {NoteInboxAttachmentHost} from '../../lib/noteInboxAttachmentHost';
import {isActivatableRelativeMarkdownHref} from './markdownActivatableRelativeHref';
import {
  noteMarkdownEditorAppearance,
  noteMarkdownParserExtensions,
} from './markdownEditorStyling';
import {markdownNotebox} from './markdownNoteboxLanguage';
import {markdownActivatableRelativeMdLinkAtPosition} from './markdownActivatableRelativeMdLinkAtPosition';
import {markdownRelativeLinkHighlightExtensions} from './markdownRelativeLinkCodemirror';
import {wikiLinkAutocompleteExtension} from './wikiLinkAutocomplete';
import {wikiLinkResolvedHighlightExtensions} from './wikiLinkCodemirror';
import type {VaultImagePreviewUrlResolver} from './vaultImagePreviewTypes';
import {vaultImagePreviewExtension} from './vaultImagePreviewCodemirror';
import {wikiLinkActivatableInnerAtDocPosition} from './wikiLinkInnerAtDocPosition';
import {markdownMarkerFocusLineClearWhenUnfocusedFacet} from './markdownMarkerFocusLine';
import {
  markdownSelectionAllowMultipleRanges,
  markdownSelectionSurroundKeymap,
} from './markdownSelectionSurround';

function eskerraCellCharFilter(): Extension {
  return EditorState.transactionFilter.of(tr => {
    if (!tr.docChanged) {
      return tr;
    }
    const next = tr.changes.apply(tr.startState.doc).toString();
    if (next.includes('|') || next.includes('\n') || next.includes('\r')) {
      return [];
    }
    return tr;
  });
}

function sanitizeCellInsert(s: string): string {
  return s.replace(/[\r\n|]+/g, ' ').trim();
}

export type EskerraTableCellKeyboardCallbacks = {
  onTabFromCell: (shift: boolean) => boolean;
  onEnterFromCell: () => boolean;
  onEscapeFromCell: () => boolean;
};

export type NoteMarkdownCellEditorCallbacks =
  MutableRefObject<EskerraTableCellKeyboardCallbacks>;

export type BuildNoteMarkdownCellExtensionsArgs = {
  wikiLinkTargetIsResolved: (inner: string) => boolean;
  relativeMarkdownLinkHrefIsResolved: (href: string) => boolean;
  wikiLinkCompletionCandidates: () => readonly InboxWikiLinkCompletionCandidate[];
  vaultRootRef: MutableRefObject<string>;
  activeNotePathRef: MutableRefObject<string | null>;
  resolveVaultImagePreviewUrl: VaultImagePreviewUrlResolver;
  attachmentHostRef: MutableRefObject<NoteInboxAttachmentHost>;
  busyRef: MutableRefObject<boolean>;
  onWikiLinkActivate: (payload: {inner: string; at: number}) => void;
  onMarkdownRelativeLinkActivate: (payload: {href: string; at: number}) => void;
  onSaveShortcut?: () => void;
  onReportError: (message: string) => void;
  onDocChanged: () => void;
  tableCallbacks: NoteMarkdownCellEditorCallbacks;
  wikiLinkCompartment: Compartment;
  relativeMdLinkCompartment: Compartment;
  /** Bumped when the cell editor is recreated so async paste ignores stale callbacks. */
  pasteSessionRef: MutableRefObject<number>;
  pasteSessionId: number;
};

export type EskerraTableCellBundlePartial = Pick<
  BuildNoteMarkdownCellExtensionsArgs,
  | 'tableCallbacks'
  | 'wikiLinkCompartment'
  | 'relativeMdLinkCompartment'
  | 'onDocChanged'
  | 'onReportError'
  | 'pasteSessionRef'
  | 'pasteSessionId'
>;

export type EskerraCellBundleFactory = (
  partial: EskerraTableCellBundlePartial,
) => readonly Extension[];

function runWikiLinkOpenAssist(view: EditorView): boolean {
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

/**
 * Markdown editing extensions aligned with the main note editor, for one-line table cells.
 */
export function buildNoteMarkdownCellExtensions(
  args: BuildNoteMarkdownCellExtensionsArgs,
): readonly Extension[] {
  const {
    wikiLinkCompartment,
    relativeMdLinkCompartment,
    wikiLinkTargetIsResolved,
    relativeMarkdownLinkHrefIsResolved,
    wikiLinkCompletionCandidates,
    vaultRootRef,
    activeNotePathRef,
    resolveVaultImagePreviewUrl,
    attachmentHostRef,
    busyRef,
    onWikiLinkActivate,
    onMarkdownRelativeLinkActivate,
    onSaveShortcut,
    onReportError,
    onDocChanged,
    tableCallbacks: tc,
  } = args;

  const onEditorClick = (e: MouseEvent, view: EditorView): boolean => {
    if (e.button !== 0 || e.shiftKey) {
      return false;
    }
    const pos = view.posAtCoords({x: e.clientX, y: e.clientY});
    if (pos == null) {
      return false;
    }
    const inner = wikiLinkActivatableInnerAtDocPosition(view.state.doc, pos);
    if (inner) {
      e.preventDefault();
      e.stopPropagation();
      onWikiLinkActivate({inner, at: pos});
      return true;
    }
    const relHit = markdownActivatableRelativeMdLinkAtPosition(
      view.state,
      pos,
      isActivatableRelativeMarkdownHref,
    );
    if (relHit) {
      e.preventDefault();
      e.stopPropagation();
      onMarkdownRelativeLinkActivate({href: relHit.href, at: relHit.hrefFrom});
      return true;
    }
    return false;
  };

  const runWikiLinkActivateFromCaret = (view: EditorView): boolean => {
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
  };

  const runMarkdownRelativeLinkActivateFromCaret = (
    view: EditorView,
  ): boolean => {
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
  };

  const pasteOk = () => args.pasteSessionRef.current === args.pasteSessionId;

  const runVaultImagePasteFromDataTransfer = (
    dt: DataTransfer,
    viewForPaste: EditorView,
  ): boolean => {
    if (!clipboardDataProbablyHasVaultImage(dt)) {
      return false;
    }
    const sel = viewForPaste.state.selection.main;
    const insertFrom = Math.min(sel.anchor, sel.head);
    const insertTo = Math.max(sel.anchor, sel.head);
    void (async () => {
      const vr = vaultRootRef.current;
      const host = attachmentHostRef.current;
      try {
        const relPaths = await host.importPastedImages(dt, vr);
        if (relPaths.length === 0) {
          onReportError('Could not import the pasted content as a vault image.');
          return;
        }
        let insert = formatVaultImageMarkdownForInsert(relPaths);
        insert = insert.replace(/\s+/g, ' ').trim();
        if (!pasteOk()) {
          return;
        }
        viewForPaste.dispatch({
          changes: {from: insertFrom, to: insertTo, insert},
          selection: EditorSelection.cursor(insertFrom + insert.length),
          scrollIntoView: true,
        });
      } catch (err) {
        onReportError(err instanceof Error ? err.message : String(err));
      }
    })();
    return true;
  };

  const runNativeClipboardPasteWhenWebDataEmpty = (
    viewForPaste: EditorView,
  ): boolean => {
    const sel = viewForPaste.state.selection.main;
    const insertFrom = Math.min(sel.anchor, sel.head);
    const insertTo = Math.max(sel.anchor, sel.head);
    void (async () => {
      const vr = vaultRootRef.current;
      const host = attachmentHostRef.current;
      const result = await host.readNativeClipboardPaste(vr);
      if (result.kind === 'text') {
        const text = sanitizeCellInsert(result.text);
        if (pasteOk() && text.length > 0) {
          viewForPaste.dispatch({
            changes: {from: insertFrom, to: insertTo, insert: text},
            selection: EditorSelection.cursor(insertFrom + text.length),
            scrollIntoView: true,
          });
        }
        return;
      }
      if (result.kind === 'fail') {
        onReportError(result.message);
        return;
      }
      try {
        let insert = formatVaultImageMarkdownForInsert(result.paths);
        insert = insert.replace(/\s+/g, ' ').trim();
        if (!pasteOk()) {
          return;
        }
        viewForPaste.dispatch({
          changes: {from: insertFrom, to: insertTo, insert},
          selection: EditorSelection.cursor(insertFrom + insert.length),
          scrollIntoView: true,
        });
      } catch (pipeErr) {
        onReportError(
          pipeErr instanceof Error ? pipeErr.message : String(pipeErr),
        );
      }
    })();
    return true;
  };

  const pasteHandlers = EditorView.domEventHandlers({
    paste(event, view) {
      if (busyRef.current) {
        if (
          event.clipboardData
          && clipboardDataProbablyHasVaultImage(event.clipboardData)
        ) {
          event.preventDefault();
          onReportError(
            'Please wait until the current operation finishes before pasting an image.',
          );
          return true;
        }
        return false;
      }
      const host = attachmentHostRef.current;
      if (!host.isVaultImageImportAvailable) {
        if (
          event.clipboardData
          && clipboardDataProbablyHasVaultImage(event.clipboardData)
        ) {
          event.preventDefault();
          onReportError(
            'Pasting images into the vault requires the Notebox desktop app.',
          );
          return true;
        }
      }
      const dt = event.clipboardData;
      if (dt) {
        const probablyImage = clipboardDataProbablyHasVaultImage(dt);
        if (probablyImage) {
          event.preventDefault();
          event.stopPropagation();
          return runVaultImagePasteFromDataTransfer(dt, view);
        }
        const plainTrimmed = (dt.getData('text/plain') ?? '').trim();
        if (plainTrimmed === '' && !probablyImage) {
          event.preventDefault();
          event.stopPropagation();
          return runNativeClipboardPasteWhenWebDataEmpty(view);
        }
      }
      const plain = event.clipboardData?.getData('text/plain') ?? '';
      if (
        plain.includes('|')
        || plain.includes('\n')
        || plain.includes('\r')
      ) {
        event.preventDefault();
        const cleaned = sanitizeCellInsert(plain);
        if (cleaned.length > 0) {
          const sel = view.state.selection.main;
          const f = Math.min(sel.anchor, sel.head);
          const t = Math.max(sel.anchor, sel.head);
          view.dispatch({
            changes: {from: f, to: t, insert: cleaned},
            selection: {anchor: f + cleaned.length},
          });
        }
        return true;
      }
      return false;
    },
    click: onEditorClick,
  });

  const tableNavKeymap = keymap.of([
    {key: 'Tab', run: () => tc.current.onTabFromCell(false)},
    {key: 'Shift-Tab', run: () => tc.current.onTabFromCell(true)},
    {
      key: 'Enter',
      run: view => {
        const status = completionStatus(view.state);
        if (status === 'pending') {
          return true;
        }
        if (status === 'active') {
          return acceptCompletion(view) || true;
        }
        return tc.current.onEnterFromCell();
      },
    },
    {
      key: 'Escape',
      run: view => {
        const status = completionStatus(view.state);
        if (status) {
          return closeCompletion(view) || true;
        }
        return tc.current.onEscapeFromCell();
      },
    },
    {key: '|', run: () => true},
  ]);

  return [
    markdownMarkerFocusLineClearWhenUnfocusedFacet.of(true),
    markdownNotebox({
      base: commonmarkLanguage,
      extensions: noteMarkdownParserExtensions,
    }),
    ...noteMarkdownEditorAppearance,
    history(),
    drawSelection(),
    markdownSelectionAllowMultipleRanges(),
    markdownSelectionSurroundKeymap(),
    eskerraCellCharFilter(),
    Prec.highest(tableNavKeymap),
    keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSaveShortcut?.();
          return true;
        },
      },
      {key: '[', run: runWikiLinkOpenAssist},
      {
        key: 'Mod-Enter',
        run: view =>
          runWikiLinkActivateFromCaret(view)
          || runMarkdownRelativeLinkActivateFromCaret(view),
      },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    EditorView.lineWrapping,
    wikiLinkCompartment.of(
      wikiLinkResolvedHighlightExtensions(wikiLinkTargetIsResolved),
    ),
    relativeMdLinkCompartment.of(
      markdownRelativeLinkHighlightExtensions(relativeMarkdownLinkHrefIsResolved),
    ),
    wikiLinkAutocompleteExtension(wikiLinkCompletionCandidates),
    ...vaultImagePreviewExtension({
      vaultRoot: vaultRootRef,
      activeNotePath: activeNotePathRef,
      resolvePreviewUrl: (vr, ap, src) =>
        resolveVaultImagePreviewUrl(vr, ap, src),
    }),
    pasteHandlers,
    EditorView.theme({
      '&': {
        height: '100%',
        minHeight: '1.4em',
      },
      '&.cm-focused': {
        outline: 'none',
      },
      '.cm-scroller': {
        fontFamily: 'inherit',
        overflow: 'auto',
      },
      '.cm-content': {
        caretColor: 'inherit',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'inherit',
      },
    }),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        onDocChanged();
      }
    }),
  ];
}

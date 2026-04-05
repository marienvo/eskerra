import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {
  foldedRanges,
  foldGutter,
  foldKeymap,
  unfoldAll,
} from '@codemirror/language';
import {commonmarkLanguage} from '@codemirror/lang-markdown';
import {
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
} from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  keymap,
  placeholder,
} from '@codemirror/view';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  isBrowserOpenableMarkdownHref,
  isExternalMarkdownHref,
  MARKDOWN_EXTENSION,
  stripMarkdownLinkHrefToPathPart,
  type InboxWikiLinkCompletionCandidate,
} from '@eskerra/core';

import {clipboardDataProbablyHasVaultImage} from '../../lib/clipboardImageFiles';
import {formatVaultImageMarkdownForInsert} from '../../lib/formatVaultImageMarkdown';
import {
  isNoteAttachmentImageFilePath,
  type NoteInboxAttachmentHost,
} from '../../lib/noteInboxAttachmentHost';
import {
  noteMarkdownEditorAppearance,
  noteMarkdownIndentUnit,
  noteMarkdownListItemFoldService,
  noteMarkdownParserExtensions,
} from './markdownEditorStyling';
import {markdownEskerra} from './markdownEskerraLanguage';
import {foldableRangesPresent, nestedCollapseAllFolds} from './nestedFoldAll';
import type {VaultImagePreviewUrlResolver} from './vaultImagePreviewTypes';
import {vaultImagePreviewExtension} from './vaultImagePreviewCodemirror';
import {markdownBareBrowserUrlAtPosition} from './markdownBareUrl';
import {markdownActivatableRelativeMdLinkAtPosition} from './markdownActivatableRelativeMdLinkAtPosition';
import {markdownInlineLinkUrlAtPosition} from './markdownInlineLinkUrlAtPosition';
import {markdownExternalLinkHighlightExtension} from './markdownExternalLinkCodemirror';
import {markdownRelativeLinkHighlightExtensions} from './markdownRelativeLinkCodemirror';
import {
  markdownInlineCodeSurroundInputHandler,
  markdownSelectionAllowMultipleRanges,
  markdownSelectionSurroundKeymap,
} from './markdownSelectionSurround';
import {wikiLinkAutocompleteExtension} from './wikiLinkAutocomplete';
import {wikiLinkResolvedHighlightExtensions} from './wikiLinkCodemirror';
import {eskerraTableCellBundleFacet} from './eskerraTableV1/eskerraTableCellBundleFacet';
import {eskerraTableShellLinkBridgeFacet} from './eskerraTableV1/eskerraTableShellLinkBridgeFacet';
import {eskerraTableParentLinkCompartmentsFacet} from './eskerraTableV1/eskerraTableParentLinkCompartments';
import {buildNoteMarkdownCellExtensions} from './noteMarkdownCellEditor';
import {
  buildNoteMarkdownDeleteLineModYBindings,
  buildNoteMarkdownVaultKeymapBindings,
} from './noteMarkdownCoreKeymap';
import {markdownSmartExpandExtension} from './markdownSmartExpandSelection';
import {dispatchEskerraTableNestedCellEditors} from './eskerraTableV1/eskerraTableNestedCellEditors';
import {eskerraTableV1Extension} from './eskerraTableV1/eskerraTableV1Codemirror';
import {flushAllEskerraTableDrafts} from './eskerraTableV1/eskerraTableDraftFlush';
import {
  wikiLinkActivatableInnerAtDocPosition,
  wikiLinkMatchAtDocPosition,
} from './wikiLinkInnerAtDocPosition';

const defaultWikiLinkCompletionCandidates: readonly InboxWikiLinkCompletionCandidate[] =
  [];

function foldedRangesPresent(state: EditorState): boolean {
  return foldedRanges(state).size > 0;
}

function createFoldGutterMarker(open: boolean): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = open ? '⌄' : '›';
  span.className = 'cm-foldGutter-marker app-tooltip-trigger';
  span.setAttribute('data-tooltip', open ? 'Fold line' : 'Unfold line');
  span.setAttribute('data-tooltip-placement', 'inline-end');
  span.setAttribute('aria-label', open ? 'Fold line' : 'Unfold line');
  return span;
}

function isActivatableRelativeMarkdownHref(href: string): boolean {
  const part = stripMarkdownLinkHrefToPathPart(href);
  if (part === '' || isExternalMarkdownHref(part)) {
    return false;
  }
  return part.toLowerCase().endsWith(MARKDOWN_EXTENSION.toLowerCase());
}

export type NoteMarkdownEditorProps = {
  vaultRoot: string;
  /** Absolute path to the open vault `.md` file, or `null` while composing a new note. */
  activeNotePath: string | null;
  initialMarkdown: string;
  /** Bumped when the document should reload from `initialMarkdown` (note switch or new entry). */
  sessionKey: number;
  onMarkdownChange: (markdown: string) => void;
  /** Shown when image paste or drop fails; also used when vault image import is unavailable. */
  onEditorError?: (message: string) => void;
  /** Shell-owned wiki-link action handler. */
  onWikiLinkActivate: (payload: {inner: string; at: number}) => void;
  /** Shell-owned: relative `.md` href resolves to an existing indexed note (for styling). */
  relativeMarkdownLinkHrefIsResolved: (href: string) => boolean;
  /** Shell-owned relative markdown link open/create (same click rules as wiki links). */
  onMarkdownRelativeLinkActivate: (payload: {href: string; at: number}) => void;
  /** Shell-owned: open `http` / `https` / `mailto` inline links in the system browser. */
  onMarkdownExternalLinkOpen: (payload: {href: string; at: number}) => void;
  /** Shell-owned: `[[inner]]` resolves to exactly one vault note (for styling). */
  wikiLinkTargetIsResolved: (inner: string) => boolean;
  /** Shell-provided vault markdown targets for `[[` autocomplete (WL-3). */
  wikiLinkCompletionCandidates?: ReadonlyArray<InboxWikiLinkCompletionCandidate>;
  /** Desktop: Ctrl/Cmd+S — auto-save flush or submit new entry (handled by shell). */
  onSaveShortcut?: () => void;
  /** Desktop: Ctrl/Cmd+Shift+D — request delete current note (shell shows confirmation). */
  onDeleteNoteShortcut?: () => void;
  placeholder: string;
  busy: boolean;
  /** Shell-owned Tauri clipboard, OS drop, and vault persistence. */
  attachmentHost: NoteInboxAttachmentHost;
  /** Shell-owned: Markdown image src → preview URL (for example `lib/resolveVaultImagePreviewUrl`). */
  resolveVaultImagePreviewUrl: VaultImagePreviewUrlResolver;
  /** Called when the editor gains or loses at least one folded range (fold gutter, lists, etc.). */
  onFoldedRangesPresentChange?: (present: boolean) => void;
  /** Called when the document gains or loses at least one foldable range (same rules as collapse-all). */
  onFoldableRangesPresentChange?: (present: boolean) => void;
};

export type NoteMarkdownEditorHandle = {
  getMarkdown: () => string;
  loadMarkdown: (
    markdown: string,
    options?: {selection?: 'start' | 'end'},
  ) => void;
  /** Unfolds every folded range in the editor (fold gutter, lists, etc.). */
  unfoldAllFolds: () => boolean;
  /**
   * Folds every foldable range (lists, sections, etc.). H1 title sections are never foldable
   * (see `markdownEskerra`).
   */
  collapseAllFolds: () => boolean;
  replaceWikiLinkInnerAt: (options: {
    at: number;
    expectedInner: string;
    replacementInner: string;
  }) => boolean;
  replaceMarkdownLinkHrefAt: (options: {
    at: number;
    expectedHref: string;
    replacementHref: string;
  }) => boolean;
};

const NoteMarkdownEditorImpl = forwardRef<
  NoteMarkdownEditorHandle,
  NoteMarkdownEditorProps
>(function NoteMarkdownEditorImpl(props, ref) {
  const {
    vaultRoot,
    attachmentHost,
    resolveVaultImagePreviewUrl,
    initialMarkdown,
    onMarkdownChange,
    onEditorError,
    onWikiLinkActivate,
    relativeMarkdownLinkHrefIsResolved,
    onMarkdownRelativeLinkActivate,
    onMarkdownExternalLinkOpen,
    wikiLinkTargetIsResolved,
    wikiLinkCompletionCandidates = defaultWikiLinkCompletionCandidates,
    onSaveShortcut,
    onDeleteNoteShortcut,
    placeholder: placeholderText,
    busy,
    onFoldedRangesPresentChange,
    onFoldableRangesPresentChange,
  } = props;

  const parentRef = useRef<HTMLDivElement>(null);
  /** `.note-markdown-editor-host`: used to mount the sticky raw-table escape banner outside CodeMirror. */
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  /** Boot extension bundle for `EditorState.create` when replacing the document without React remounting. */
  const codemirrorBootExtensionsRef = useRef<readonly Extension[] | null>(null);
  const wikiLinkTargetIsResolvedRef = useRef(wikiLinkTargetIsResolved);
  wikiLinkTargetIsResolvedRef.current = wikiLinkTargetIsResolved;
  const relativeMarkdownLinkHrefIsResolvedRef = useRef(
    relativeMarkdownLinkHrefIsResolved,
  );
  relativeMarkdownLinkHrefIsResolvedRef.current = relativeMarkdownLinkHrefIsResolved;
  const initialMarkdownRef = useRef(initialMarkdown);
  initialMarkdownRef.current = initialMarkdown;

  const onMarkdownChangeRef = useRef(onMarkdownChange);
  useEffect(() => {
    onMarkdownChangeRef.current = onMarkdownChange;
  }, [onMarkdownChange]);

  const onEditorErrorRef = useRef(onEditorError);
  useEffect(() => {
    onEditorErrorRef.current = onEditorError;
  }, [onEditorError]);

  const onWikiLinkActivateRef = useRef(onWikiLinkActivate);
  useEffect(() => {
    onWikiLinkActivateRef.current = onWikiLinkActivate;
  }, [onWikiLinkActivate]);

  const onMarkdownRelativeLinkActivateRef = useRef(onMarkdownRelativeLinkActivate);
  useEffect(() => {
    onMarkdownRelativeLinkActivateRef.current = onMarkdownRelativeLinkActivate;
  }, [onMarkdownRelativeLinkActivate]);

  const onMarkdownExternalLinkOpenRef = useRef(onMarkdownExternalLinkOpen);
  useEffect(() => {
    onMarkdownExternalLinkOpenRef.current = onMarkdownExternalLinkOpen;
  }, [onMarkdownExternalLinkOpen]);

  const onSaveShortcutRef = useRef(onSaveShortcut);
  onSaveShortcutRef.current = onSaveShortcut;

  const onDeleteNoteShortcutRef = useRef(onDeleteNoteShortcut);
  onDeleteNoteShortcutRef.current = onDeleteNoteShortcut;

  const onFoldedRangesPresentChangeRef = useRef(
    onFoldedRangesPresentChange,
  );
  useEffect(() => {
    onFoldedRangesPresentChangeRef.current = onFoldedRangesPresentChange;
  }, [onFoldedRangesPresentChange]);

  const onFoldableRangesPresentChangeRef = useRef(
    onFoldableRangesPresentChange,
  );
  useEffect(() => {
    onFoldableRangesPresentChangeRef.current = onFoldableRangesPresentChange;
  }, [onFoldableRangesPresentChange]);

  const reportEditorError = useCallback((message: string) => {
    console.error(message);
    onEditorErrorRef.current?.(message);
  }, []);

  const vaultRootRef = useRef(vaultRoot);
  vaultRootRef.current = vaultRoot;
  const activeNotePathRef = useRef(props.activeNotePath);
  activeNotePathRef.current = props.activeNotePath;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const attachmentHostRef = useRef(attachmentHost);
  attachmentHostRef.current = attachmentHost;

  const resolveVaultImagePreviewUrlRef = useRef(resolveVaultImagePreviewUrl);
  resolveVaultImagePreviewUrlRef.current = resolveVaultImagePreviewUrl;

  const wikiLinkCompletionCandidatesRef = useRef(wikiLinkCompletionCandidates);
  wikiLinkCompletionCandidatesRef.current = wikiLinkCompletionCandidates;

  const wikiLinkCompartmentRef = useRef<Compartment | null>(null);
  if (wikiLinkCompartmentRef.current === null) {
    wikiLinkCompartmentRef.current = new Compartment();
  }
  const relativeMdLinkCompartmentRef = useRef<Compartment | null>(null);
  if (relativeMdLinkCompartmentRef.current === null) {
    relativeMdLinkCompartmentRef.current = new Compartment();
  }

  useLayoutEffect(() => {
    const parent = parentRef.current;
    if (!parent) {
      return;
    }

    const runVaultImagePasteFromDataTransfer = (
      dt: DataTransfer,
      viewForPaste: EditorView,
    ): boolean => {
      if (!clipboardDataProbablyHasVaultImage(dt)) {
        return false;
      }

      const sel = viewForPaste.state.selection.main;
      const anchor = sel.anchor;
      const head = sel.head;
      const insertFrom = Math.min(anchor, head);
      const insertTo = Math.max(anchor, head);

      void (async () => {
        const vr = vaultRootRef.current;
        const host = attachmentHostRef.current;

        try {
          const relPaths = await host.importPastedImages(dt, vr);

          if (relPaths.length === 0) {
            reportEditorError(
              'Could not import the pasted content as a vault image.',
            );
            return;
          }

          const insert = formatVaultImageMarkdownForInsert(relPaths);
          if (viewRef.current !== viewForPaste) {
            return;
          }
          viewForPaste.dispatch({
            changes: {from: insertFrom, to: insertTo, insert},
            selection: EditorSelection.cursor(insertFrom + insert.length),
            scrollIntoView: true,
          });
        } catch (err) {
          reportEditorError(
            err instanceof Error ? err.message : String(err),
          );
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
          if (viewRef.current === viewForPaste) {
            viewForPaste.dispatch({
              changes: {
                from: insertFrom,
                to: insertTo,
                insert: result.text,
              },
              selection: EditorSelection.cursor(
                insertFrom + result.text.length,
              ),
              scrollIntoView: true,
            });
          }
          return;
        }

        if (result.kind === 'fail') {
          reportEditorError(result.message);
          return;
        }

        try {
          const insert = formatVaultImageMarkdownForInsert(result.paths);
          if (viewRef.current !== viewForPaste) {
            return;
          }
          viewForPaste.dispatch({
            changes: {from: insertFrom, to: insertTo, insert},
            selection: EditorSelection.cursor(insertFrom + insert.length),
            scrollIntoView: true,
          });
        } catch (pipeErr) {
          reportEditorError(
            pipeErr instanceof Error ? pipeErr.message : String(pipeErr),
          );
        }
      })();

      return true;
    };

    const onEditorPaste = (e: ClipboardEvent, view: EditorView): boolean => {
      if (busyRef.current) {
        if (
          e.clipboardData &&
          clipboardDataProbablyHasVaultImage(e.clipboardData)
        ) {
          e.preventDefault();
          reportEditorError(
            'Please wait until the current operation finishes before pasting an image.',
          );
          return true;
        }
        return false;
      }

      const host = attachmentHostRef.current;
      if (!host.isVaultImageImportAvailable) {
        if (
          e.clipboardData &&
          clipboardDataProbablyHasVaultImage(e.clipboardData)
        ) {
          e.preventDefault();
          reportEditorError(
            'Pasting images into the vault requires the Eskerra desktop app. Use `tauri dev` or the packaged app instead of a plain browser tab.',
          );
          return true;
        }
        return false;
      }

      const dt = e.clipboardData;
      if (dt) {
        const plainTrimmed = (dt.getData('text/plain') ?? '').trim();
        const probablyImage = clipboardDataProbablyHasVaultImage(dt);
        if (probablyImage) {
          e.preventDefault();
          e.stopPropagation();
          return runVaultImagePasteFromDataTransfer(dt, view);
        }
        if (plainTrimmed === '' && !probablyImage) {
          e.preventDefault();
          e.stopPropagation();
          return runNativeClipboardPasteWhenWebDataEmpty(view);
        }
        return false;
      }

      e.preventDefault();
      e.stopPropagation();
      return runNativeClipboardPasteWhenWebDataEmpty(view);
    };

    // Plain or Ctrl/Cmd+primary follows the link; Shift+primary is left to CodeMirror for selection extension.
    const onEditorClick = (e: MouseEvent, view: EditorView): boolean => {
      if (e.button !== 0) {
        return false;
      }
      if (e.shiftKey) {
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
        onWikiLinkActivateRef.current({inner, at: pos});
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
        onMarkdownRelativeLinkActivateRef.current({
          href: relHit.href,
          at: relHit.hrefFrom,
        });
        return true;
      }
      const extHit = markdownActivatableRelativeMdLinkAtPosition(
        view.state,
        pos,
        isBrowserOpenableMarkdownHref,
      );
      const bareHit = markdownBareBrowserUrlAtPosition(view.state, pos);
      if (extHit) {
        e.preventDefault();
        e.stopPropagation();
        onMarkdownExternalLinkOpenRef.current({
          href: extHit.href,
          at: extHit.hrefFrom,
        });
        return true;
      }
      if (bareHit) {
        e.preventDefault();
        e.stopPropagation();
        onMarkdownExternalLinkOpenRef.current({
          href: bareHit.href,
          at: bareHit.hrefFrom,
        });
        return true;
      }
      return false;
    };

    const wikiLinkCompartment = wikiLinkCompartmentRef.current;
    if (!wikiLinkCompartment) {
      throw new Error('wikiLinkCompartment must be initialized');
    }
    const relativeMdLinkCompartment = relativeMdLinkCompartmentRef.current;
    if (!relativeMdLinkCompartment) {
      throw new Error('relativeMdLinkCompartment must be initialized');
    }

    const extensions = [
      noteMarkdownIndentUnit,
      markdownEskerra({
        base: commonmarkLanguage,
        extensions: noteMarkdownParserExtensions,
      }),
      noteMarkdownListItemFoldService,
      ...noteMarkdownEditorAppearance,
      foldGutter({
        openText: '⌄',
        closedText: '›',
        markerDOM: open => createFoldGutterMarker(open),
      }),
      history(),
      drawSelection(),
      markdownSelectionAllowMultipleRanges(),
      ...markdownSmartExpandExtension(),
      markdownSelectionSurroundKeymap(),
      markdownInlineCodeSurroundInputHandler(),
      keymap.of([
        ...buildNoteMarkdownVaultKeymapBindings({
          onSaveShortcut: () => onSaveShortcutRef.current?.(),
          onDeleteNoteShortcut: () => onDeleteNoteShortcutRef.current?.(),
          onWikiLinkActivate: p => onWikiLinkActivateRef.current(p),
          onMarkdownRelativeLinkActivate: p =>
            onMarkdownRelativeLinkActivateRef.current(p),
          onMarkdownExternalLinkOpen: p =>
            onMarkdownExternalLinkOpenRef.current(p),
        }),
        indentWithTab,
        ...foldKeymap,
        ...defaultKeymap,
        ...buildNoteMarkdownDeleteLineModYBindings(),
        ...historyKeymap,
      ]),
      EditorView.lineWrapping,
      placeholder(placeholderText),
      wikiLinkCompartment.of(
        wikiLinkResolvedHighlightExtensions(wikiLinkTargetIsResolved),
      ),
      relativeMdLinkCompartment.of(
        markdownRelativeLinkHighlightExtensions(
          relativeMarkdownLinkHrefIsResolved,
        ),
      ),
      markdownExternalLinkHighlightExtension(),
      eskerraTableParentLinkCompartmentsFacet.of({
        wikiLink: wikiLinkCompartment,
        relativeMarkdownLink: relativeMdLinkCompartment,
      }),
      wikiLinkAutocompleteExtension(
        () => wikiLinkCompletionCandidatesRef.current,
      ),
      eskerraTableCellBundleFacet.of(partial =>
        buildNoteMarkdownCellExtensions({
          wikiLinkTargetIsResolved: wikiLinkTargetIsResolvedRef.current,
          relativeMarkdownLinkHrefIsResolved:
            relativeMarkdownLinkHrefIsResolvedRef.current,
          wikiLinkCompletionCandidates: () =>
            wikiLinkCompletionCandidatesRef.current,
          vaultRootRef,
          activeNotePathRef,
          resolveVaultImagePreviewUrl: (vr, ap, src) =>
            resolveVaultImagePreviewUrlRef.current(vr, ap, src),
          attachmentHostRef,
          busyRef,
          onWikiLinkActivate: p => onWikiLinkActivateRef.current(p),
          onMarkdownRelativeLinkActivate: p =>
            onMarkdownRelativeLinkActivateRef.current(p),
          onMarkdownExternalLinkOpen: p =>
            onMarkdownExternalLinkOpenRef.current(p),
          onSaveShortcut: () => onSaveShortcutRef.current?.(),
          onDeleteNoteShortcut: () => onDeleteNoteShortcutRef.current?.(),
          ...partial,
        }),
      ),
      eskerraTableShellLinkBridgeFacet.of({
        onWikiLinkActivate: p => onWikiLinkActivateRef.current(p),
        onMarkdownRelativeLinkActivate: p =>
          onMarkdownRelativeLinkActivateRef.current(p),
        onMarkdownExternalLinkOpen: p =>
          onMarkdownExternalLinkOpenRef.current(p),
      }),
      ...eskerraTableV1Extension(),
      ...vaultImagePreviewExtension({
        vaultRoot: vaultRootRef,
        activeNotePath: activeNotePathRef,
        resolvePreviewUrl: (vr, ap, src) =>
          resolveVaultImagePreviewUrlRef.current(vr, ap, src),
      }),
      EditorView.domEventHandlers({
        mousedown(event) {
          if (event.button !== 1) {
            return false;
          }
          event.preventDefault();
          return true;
        },
        paste(event, view) {
          return onEditorPaste(event, view);
        },
        click(event, view) {
          return onEditorClick(event, view);
        },
      }),
      EditorView.theme({
        '&': {
          height: 'auto',
          minHeight: '6rem',
        },
        '&.cm-focused': {
          outline: 'none',
        },
        '.cm-gutters': {
          /* Transparent: fold rail / panel gray shows through on desktop capture inbox. */
          backgroundColor: 'transparent',
          border: 'none',
        },
        '.cm-foldGutter': {
          /* Width comes from `.cm-gutters` in App.css (must match `.note-markdown-editor-fold-rail`). */
          flexShrink: 0,
        },
        '.cm-scroller': {
          fontFamily: 'inherit',
          overflow: 'visible',
        },
        '.cm-content': {
          caretColor: 'inherit',
        },
        '.cm-tooltip.cm-tooltip-autocomplete': {
          fontFamily: 'inherit',
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: 'inherit',
        },
      }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onMarkdownChangeRef.current(update.state.doc.toString());
          const onFoldable = onFoldableRangesPresentChangeRef.current;
          if (onFoldable) {
            const prevFoldable = foldableRangesPresent(update.startState);
            const nextFoldable = foldableRangesPresent(update.state);
            if (prevFoldable !== nextFoldable) {
              onFoldable(nextFoldable);
            }
          }
        }
        const onFold = onFoldedRangesPresentChangeRef.current;
        if (onFold) {
          const prev = foldedRangesPresent(update.startState);
          const next = foldedRangesPresent(update.state);
          if (prev !== next) {
            onFold(next);
          }
        }
      }),
    ];

    codemirrorBootExtensionsRef.current = extensions;

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialMarkdown,
        extensions,
      }),
    });
    viewRef.current = view;
    onFoldedRangesPresentChangeRef.current?.(foldedRangesPresent(view.state));
    onFoldableRangesPresentChangeRef.current?.(
      foldableRangesPresent(view.state),
    );

    return () => {
      onFoldedRangesPresentChangeRef.current?.(false);
      onFoldableRangesPresentChangeRef.current?.(false);
      view.destroy();
      viewRef.current = null;
      codemirrorBootExtensionsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount via `sessionKey` wraps this component
  }, []);

  useEffect(() => {
    const compartment = wikiLinkCompartmentRef.current;
    const view = viewRef.current;
    if (!compartment || !view) {
      return;
    }
    const wikiEffect = compartment.reconfigure(
      wikiLinkResolvedHighlightExtensions(wikiLinkTargetIsResolved),
    );
    view.dispatch({effects: wikiEffect});
    dispatchEskerraTableNestedCellEditors(view, {effects: wikiEffect});
  }, [wikiLinkTargetIsResolved]);

  useEffect(() => {
    const compartment = relativeMdLinkCompartmentRef.current;
    const view = viewRef.current;
    if (!compartment || !view) {
      return;
    }
    const relEffect = compartment.reconfigure(
      markdownRelativeLinkHighlightExtensions(relativeMarkdownLinkHrefIsResolved),
    );
    view.dispatch({effects: relEffect});
    dispatchEskerraTableNestedCellEditors(view, {effects: relEffect});
  }, [relativeMarkdownLinkHrefIsResolved]);

  /**
   * Apply `loadMarkdown` synchronously so the first browser paint after layout already has the real
   * document. A deferred rAF apply runs after paint, which left the placeholder visible until the next frame
   * or user interaction (WebKit/GTK).
   */
  const applyMarkdownLoadNow = useCallback(
    (markdown: string, options?: {selection?: 'start' | 'end'}) => {
      const v = viewRef.current;
      const be = codemirrorBootExtensionsRef.current;
      const wc = wikiLinkCompartmentRef.current;
      const rc = relativeMdLinkCompartmentRef.current;
      if (!v || !be || !wc || !rc) {
        return;
      }
      const at = options?.selection === 'start' ? 0 : markdown.length;
      const nextState = EditorState.create({
        doc: markdown,
        selection: EditorSelection.cursor(at),
        extensions: be,
      });
      v.setState(nextState);
      const wikiEff = wc.reconfigure(
        wikiLinkResolvedHighlightExtensions(wikiLinkTargetIsResolvedRef.current),
      );
      const relEff = rc.reconfigure(
        markdownRelativeLinkHighlightExtensions(
          relativeMarkdownLinkHrefIsResolvedRef.current,
        ),
      );
      v.dispatch({effects: [wikiEff, relEff]});
      dispatchEskerraTableNestedCellEditors(v, {effects: [wikiEff, relEff]});
      onFoldedRangesPresentChangeRef.current?.(foldedRangesPresent(v.state));
      onFoldableRangesPresentChangeRef.current?.(
        foldableRangesPresent(v.state),
      );
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => {
        const view = viewRef.current;
        if (view) {
          flushAllEskerraTableDrafts(view);
        }
        return view?.state.doc.toString() ?? initialMarkdownRef.current;
      },
      loadMarkdown: (markdown: string, options?: {selection?: 'start' | 'end'}) => {
        const view = viewRef.current;
        const bootExtensions = codemirrorBootExtensionsRef.current;
        const wikiCompartment = wikiLinkCompartmentRef.current;
        const relCompartment = relativeMdLinkCompartmentRef.current;
        if (!view || !bootExtensions || !wikiCompartment || !relCompartment) {
          return;
        }
        applyMarkdownLoadNow(markdown, options);
      },
      unfoldAllFolds: () => {
        const view = viewRef.current;
        if (!view) {
          return false;
        }
        return unfoldAll(view);
      },
      collapseAllFolds: () => {
        const view = viewRef.current;
        if (!view) {
          return false;
        }
        return nestedCollapseAllFolds(view);
      },
      replaceWikiLinkInnerAt: ({at, expectedInner, replacementInner}) => {
        if (replacementInner === expectedInner) {
          return true;
        }
        const view = viewRef.current;
        if (!view) {
          return false;
        }
        const match = wikiLinkMatchAtDocPosition(view.state.doc, at);
        if (!match || match.inner !== expectedInner) {
          return false;
        }
        view.dispatch({
          changes: {
            from: match.innerFrom,
            to: match.innerTo,
            insert: replacementInner,
          },
        });
        return true;
      },
      replaceMarkdownLinkHrefAt: ({at, expectedHref, replacementHref}) => {
        if (replacementHref === expectedHref) {
          return true;
        }
        const view = viewRef.current;
        if (!view) {
          return false;
        }
        const linkUrl = markdownInlineLinkUrlAtPosition(view.state, at);
        if (!linkUrl || linkUrl.href !== expectedHref) {
          return false;
        }
        view.dispatch({
          changes: {
            from: linkUrl.hrefFrom,
            to: linkUrl.hrefTo,
            insert: replacementHref,
          },
        });
        return true;
      },
    }),
    [applyMarkdownLoadNow],
  );

  const insertRelativePaths = useCallback((paths: readonly string[]) => {
    const view = viewRef.current;
    if (!view || paths.length === 0) {
      return;
    }
    const insert = formatVaultImageMarkdownForInsert(paths);
    view.dispatch(view.state.update(view.state.replaceSelection(insert)));
  }, []);

  const [dropActive, setDropActive] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !attachmentHost.isVaultImageImportAvailable) {
      return;
    }

    const onDragOver = (e: DragEvent) => {
      if (busy) {
        return;
      }
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
      }
    };

    const onDrop = (e: DragEvent) => {
      if (busy) {
        return;
      }
      const dt = e.dataTransfer;
      if (!dt?.files?.length) {
        return;
      }
      let maybeImage = false;
      for (let i = 0; i < dt.files.length; i++) {
        const f = dt.files.item(i);
        if (
          f &&
          (f.type.startsWith('image/') ||
            isNoteAttachmentImageFilePath(f.name))
        ) {
          maybeImage = true;
          break;
        }
      }
      if (!maybeImage) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      void (async () => {
        try {
          const markdownPaths = await attachmentHost.importDroppedFiles(
            dt.files,
            vaultRoot,
          );
          if (markdownPaths.length === 0) {
            return;
          }
          insertRelativePaths(markdownPaths);
        } catch (err) {
          reportEditorError(
            err instanceof Error ? err.message : String(err),
          );
        }
      })();
    };

    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
    };
  }, [attachmentHost, busy, insertRelativePaths, vaultRoot, reportEditorError]);

  useEffect(() => {
    if (!attachmentHost.isVaultImageImportAvailable) {
      return;
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void attachmentHost
      .subscribeWindowFileDragDrop({
        onDragHover: () => {
          if (!busy) {
            setDropActive(true);
          }
        },
        onDragLeave: () => {
          setDropActive(false);
        },
        onDropPaths: paths => {
          if (busy) {
            return;
          }
          void (async () => {
            try {
              const relPaths =
                await attachmentHost.importDroppedAbsolutePaths(paths);
              insertRelativePaths(relPaths);
            } catch (err) {
              reportEditorError(
                err instanceof Error ? err.message : String(err),
              );
            }
          })();
        },
      })
      .then(fn => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [attachmentHost, busy, insertRelativePaths, reportEditorError]);

  const hostClassName = dropActive
    ? 'note-markdown-editor-host note-markdown-editor-host--drop-target'
    : 'note-markdown-editor-host';

  return (
    <div
      ref={hostRef}
      className={hostClassName}
      data-note-markdown-editor
    >
      <div ref={parentRef} className="note-markdown-editor-cm-root" />
    </div>
  );
});

export const NoteMarkdownEditor = forwardRef<
  NoteMarkdownEditorHandle,
  NoteMarkdownEditorProps
>(function NoteMarkdownEditor(props, ref) {
  return (
    <NoteMarkdownEditorImpl
      key={String(props.sessionKey)}
      ref={ref}
      {...props}
    />
  );
});

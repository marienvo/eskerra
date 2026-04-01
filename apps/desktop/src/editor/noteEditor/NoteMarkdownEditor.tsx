import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {markdown} from '@codemirror/lang-markdown';
import {EditorSelection, EditorState} from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  keymap,
  placeholder,
} from '@codemirror/view';
import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {readImage, readText} from '@tauri-apps/plugin-clipboard-manager';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import {
  absoluteImagePathsFromClipboardUriList,
  clipboardDataProbablyHasVaultImage,
  collectClipboardImageFilesFromFileList,
  dotExtensionForClipboardBytes,
  extractClipboardImageUrlsFromHtml,
  filterClipboardImageCandidateFiles,
  snapshotClipboardImagePayload,
} from '../../lib/clipboardImageFiles';
import {rgbaImageToPngBytes} from '../../lib/clipboardImagePng';
import {
  extensionFromFileNameOrMime,
  saveVaultImageBytes,
  vaultImportFilesIntoAttachments,
} from '../../lib/desktopVaultAttachments';
import {formatVaultImageMarkdownForInsert} from '../../lib/formatVaultImageMarkdown';
import {vaultImagePreviewExtension} from './vaultImagePreviewCodemirror';
import {wikiLinkHighlight} from './wikiLinkCodemirror';

export type NoteMarkdownEditorProps = {
  vaultRoot: string;
  /** Absolute path to the open inbox `.md` file, or `null` while composing a new note. */
  activeNotePath: string | null;
  initialMarkdown: string;
  /** Bumped when the document should reload from `initialMarkdown` (note switch or new entry). */
  sessionKey: number;
  onMarkdownChange: (markdown: string) => void;
  /** Shown when image paste or drop fails; also used when not running inside Tauri. */
  onEditorError?: (message: string) => void;
  placeholder: string;
  busy: boolean;
};

export type NoteMarkdownEditorHandle = {
  getMarkdown: () => string;
  loadMarkdown: (markdown: string) => void;
};

function isImageFilePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.svg')
  );
}

/** `blob:` or `data:image/...` URLs from the clipboard HTML path. */
async function saveFetchedImageUrlToVault(
  vaultRoot: string,
  url: string,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not read pasted image (${res.status})`);
  }
  const blob = await res.blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  const ext = dotExtensionForClipboardBytes(buf, blob.type, 'paste');
  return saveVaultImageBytes({
    vaultRoot,
    bytes: buf,
    suggestedBaseName: 'paste',
    extensionWithDot: ext,
  });
}

const NoteMarkdownEditorImpl = forwardRef<
  NoteMarkdownEditorHandle,
  NoteMarkdownEditorProps
>(function NoteMarkdownEditorImpl(props, ref) {
  const {
    vaultRoot,
    initialMarkdown,
    onMarkdownChange,
    onEditorError,
    placeholder: placeholderText,
    busy,
  } = props;

  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
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

  useEffect(() => {
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

      const snapshot = snapshotClipboardImagePayload(dt);
      const {html, candidateFiles} = snapshot;
      const sel = viewForPaste.state.selection.main;
      const anchor = sel.anchor;
      const head = sel.head;
      const insertFrom = Math.min(anchor, head);
      const insertTo = Math.max(anchor, head);

      void (async () => {
        const relPaths: string[] = [];
        const vr = vaultRootRef.current;

        try {
          const files = await filterClipboardImageCandidateFiles(candidateFiles);
          for (const f of files) {
            const buf = new Uint8Array(await f.arrayBuffer());
            const ext =
              extensionFromFileNameOrMime(f.name, f.type) ??
              dotExtensionForClipboardBytes(buf, f.type, f.name || 'paste');
            relPaths.push(
              await saveVaultImageBytes({
                vaultRoot: vr,
                bytes: buf,
                suggestedBaseName: f.name || 'paste',
                extensionWithDot: ext,
              }),
            );
          }

          if (relPaths.length === 0) {
            const {blobUrls, dataImageUrls} =
              extractClipboardImageUrlsFromHtml(html);
            for (const url of blobUrls) {
              relPaths.push(await saveFetchedImageUrlToVault(vr, url));
            }
            for (const url of dataImageUrls) {
              relPaths.push(await saveFetchedImageUrlToVault(vr, url));
            }
          }

          if (relPaths.length === 0 && isTauri()) {
            try {
              const image = await readImage();
              const png = await rgbaImageToPngBytes(image);
              relPaths.push(
                await saveVaultImageBytes({
                  vaultRoot: vr,
                  bytes: png,
                  suggestedBaseName: 'paste',
                  extensionWithDot: '.png',
                }),
              );
            } catch {
              /* no raster image on native clipboard */
            }
          }

          if (relPaths.length === 0 && isTauri()) {
            const fromUris = absoluteImagePathsFromClipboardUriList(dt);
            if (fromUris.length > 0) {
              relPaths.push(
                ...(await vaultImportFilesIntoAttachments(fromUris)),
              );
            }
          }

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

    const runTauriNativePasteWhenWebClipboardEmpty = (
      viewForPaste: EditorView,
    ): boolean => {
      const sel = viewForPaste.state.selection.main;
      const insertFrom = Math.min(sel.anchor, sel.head);
      const insertTo = Math.max(sel.anchor, sel.head);

      void (async () => {
        const vr = vaultRootRef.current;
        let nativeImage: Awaited<ReturnType<typeof readImage>> | undefined;
        try {
          nativeImage = await readImage();
        } catch (readImgErr) {
          try {
            const text = await readText();
            if (
              text.length > 0 &&
              viewRef.current === viewForPaste
            ) {
              viewForPaste.dispatch({
                changes: {from: insertFrom, to: insertTo, insert: text},
                selection: EditorSelection.cursor(insertFrom + text.length),
                scrollIntoView: true,
              });
            } else {
              reportEditorError(
                readImgErr instanceof Error
                  ? readImgErr.message
                  : String(readImgErr),
              );
            }
          } catch {
            reportEditorError('Could not read clipboard content.');
          }
          return;
        }

        try {
          const png = await rgbaImageToPngBytes(nativeImage);
          const relPath = await saveVaultImageBytes({
            vaultRoot: vr,
            bytes: png,
            suggestedBaseName: 'paste',
            extensionWithDot: '.png',
          });
          const insert = formatVaultImageMarkdownForInsert([relPath]);
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

      if (!isTauri()) {
        if (
          e.clipboardData &&
          clipboardDataProbablyHasVaultImage(e.clipboardData)
        ) {
          e.preventDefault();
          reportEditorError(
            'Pasting images into the vault requires the Notebox desktop app. Use `tauri dev` or the packaged app instead of a plain browser tab.',
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
          return runTauriNativePasteWhenWebClipboardEmpty(view);
        }
        return false;
      }

      e.preventDefault();
      e.stopPropagation();
      return runTauriNativePasteWhenWebClipboardEmpty(view);
    };

    const extensions = [
      markdown(),
      history(),
      drawSelection(),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      placeholder(placeholderText),
      wikiLinkHighlight,
      ...vaultImagePreviewExtension({
        vaultRoot: vaultRootRef,
        activeNotePath: activeNotePathRef,
      }),
      EditorView.domEventHandlers({
        paste(event, view) {
          return onEditorPaste(event, view);
        },
      }),
      EditorView.theme({
        '&': {
          height: '100%',
        },
        '.cm-scroller': {
          fontFamily: 'inherit',
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
          onMarkdownChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialMarkdown,
        extensions,
      }),
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount via `sessionKey` wraps this component
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () =>
        viewRef.current?.state.doc.toString() ?? initialMarkdownRef.current,
      loadMarkdown: (markdown: string) => {
        const view = viewRef.current;
        if (!view) {
          return;
        }
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: markdown,
          },
          selection: EditorSelection.cursor(markdown.length),
        });
      },
    }),
    [],
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

  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !isTauri()) {
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
          (f.type.startsWith('image/') || isImageFilePath(f.name))
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
          const files = await collectClipboardImageFilesFromFileList(dt.files);
          if (files.length === 0) {
            return;
          }
          const markdownPaths: string[] = [];
          for (const f of files) {
            const buf = new Uint8Array(await f.arrayBuffer());
            const ext =
              extensionFromFileNameOrMime(f.name, f.type) ??
              dotExtensionForClipboardBytes(buf, f.type, f.name || 'drop');
            markdownPaths.push(
              await saveVaultImageBytes({
                vaultRoot,
                bytes: buf,
                suggestedBaseName: f.name || 'drop',
                extensionWithDot: ext,
              }),
            );
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
  }, [busy, insertRelativePaths, vaultRoot, reportEditorError]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWindow()
      .onDragDropEvent(event => {
        if (busy) {
          return;
        }
        const payload = event.payload;
        if (payload.type === 'enter' || payload.type === 'over') {
          setDropActive(true);
        } else if (payload.type === 'leave') {
          setDropActive(false);
        } else if (payload.type === 'drop') {
          setDropActive(false);
          const paths = payload.paths.filter(isImageFilePath);
          if (paths.length === 0) {
            return;
          }
          void (async () => {
            try {
              const relPaths = await vaultImportFilesIntoAttachments(paths);
              insertRelativePaths(relPaths);
            } catch (err) {
              reportEditorError(
                err instanceof Error ? err.message : String(err),
              );
            }
          })();
        }
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
  }, [busy, insertRelativePaths, reportEditorError]);

  const rootClass = dropActive
    ? 'note-markdown-editor-host note-markdown-editor-host--drop-target'
    : 'note-markdown-editor-host';

  return (
    <div ref={hostRef} className={rootClass} data-note-markdown-editor>
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

import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord.css';

import {Crepe, CrepeFeature, useCrepeFeatures} from '@milkdown/crepe';
import {imageBlockConfig} from '@milkdown/kit/component/image-block';
import {uploadConfig} from '@milkdown/kit/plugin/upload';
import {insertImageCommand} from '@milkdown/kit/preset/commonmark';
import {callCommand, getMarkdown, replaceAll} from '@milkdown/kit/utils';
import {Milkdown, MilkdownProvider, useEditor} from '@milkdown/react';
import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {readImage} from '@tauri-apps/plugin-clipboard-manager';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import {
  clipboardDataProbablyHasVaultImage,
  collectClipboardImageFilesFromDataTransfer,
  collectClipboardImageFilesFromFileList,
  dotExtensionForClipboardBytes,
  extractClipboardImageUrlsFromHtml,
} from '../../lib/clipboardImageFiles';
import {rgbaImageToPngBytes} from '../../lib/clipboardImagePng';
import {
  extensionFromFileNameOrMime,
  saveVaultImageBytes,
  vaultImportFilesIntoAttachments,
} from '../../lib/desktopVaultAttachments';
import {resolveVaultImagePreviewUrl} from '../../lib/resolveVaultImagePreviewUrl';
import {wikiLinkRemark, wikiLinkSchema} from '../wikiLink';

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

function clipboardTypesHintImage(types: readonly string[]): boolean {
  return types.some(
    t =>
      t === 'image/png' ||
      t === 'image/jpeg' ||
      t === 'image/jpg' ||
      t === 'image/gif' ||
      t === 'image/webp' ||
      t.startsWith('image/'),
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

const InnerEditor = forwardRef<NoteMarkdownEditorHandle, NoteMarkdownEditorProps>(
  function InnerEditor(props, ref) {
    const {
      vaultRoot,
      activeNotePath,
      initialMarkdown,
      sessionKey,
      onMarkdownChange,
      onEditorError,
      placeholder,
      busy,
    } = props;

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

    const {get} = useEditor(
      root => {
        const crepe = new Crepe({
          root,
          defaultValue: initialMarkdown,
          features: {
            [CrepeFeature.Latex]: false,
            [CrepeFeature.Table]: false,
          },
          featureConfigs: {
            [CrepeFeature.Placeholder]: {
              text: placeholder,
              mode: 'doc',
            },
            [CrepeFeature.ImageBlock]: {
              proxyDomURL: url =>
                resolveVaultImagePreviewUrl(vaultRoot, activeNotePath, url),
              onUpload: async file => {
                const buf = new Uint8Array(await file.arrayBuffer());
                const ext =
                  extensionFromFileNameOrMime(file.name, file.type) ??
                  dotExtensionForClipboardBytes(
                    buf,
                    file.type,
                    file.name || 'image',
                  );
                return saveVaultImageBytes({
                  vaultRoot,
                  bytes: buf,
                  suggestedBaseName: file.name,
                  extensionWithDot: ext,
                });
              },
            },
          },
        });

        crepe.editor.use([...wikiLinkRemark, ...wikiLinkSchema]);

        crepe.editor.config(ctx => {
          ctx.update(uploadConfig.key, prev => ({
            ...prev,
            enableHtmlFileUploader: true,
            uploader: async (files, schema, ctxIn, _insertPos) => {
              // Milkdown slice accessor named "use*" is not a React hook.
              // eslint-disable-next-line react-hooks/rules-of-hooks -- useCrepeFeatures reads ctx slice
              const features = useCrepeFeatures(ctxIn).get();
              const hasImageBlock = features.includes(CrepeFeature.ImageBlock);
              const nodeType = hasImageBlock
                ? schema.nodes['image-block']
                : schema.nodes['image'];

              if (!nodeType) {
                return [];
              }

              const onUpload = hasImageBlock
                ? ctxIn.get(imageBlockConfig.key).onUpload
                : undefined;

              const images = await collectClipboardImageFilesFromFileList(files);

              const nodes = await Promise.all(
                images.map(async file => {
                  const src = onUpload
                    ? await onUpload(file)
                    : URL.createObjectURL(file);
                  return nodeType.createAndFill({src})!;
                }),
              );

              return nodes;
            },
          }));
        });

        crepe.on(listen => {
          listen.markdownUpdated((_ctx, markdown) => {
            onMarkdownChangeRef.current(markdown);
          });
        });

        return crepe;
      },
      // `initialMarkdown` is intentionally omitted: it only applies on mount after `sessionKey`
      // remounts the provider. Live edits flow through Milkdown, not React state, for this prop.
      [sessionKey, vaultRoot, activeNotePath, placeholder],
    );

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => {
          const ed = get();
          if (!ed) {
            return initialMarkdown;
          }
          return ed.action(getMarkdown());
        },
        loadMarkdown: (markdown: string) => {
          const ed = get();
          if (!ed) {
            return;
          }
          ed.action(replaceAll(markdown));
        },
      }),
      [get, initialMarkdown],
    );

    const getRef = useRef(get);
    useEffect(() => {
      getRef.current = get;
    }, [get]);

    const insertRelativePaths = useCallback((paths: readonly string[]) => {
      const ed = getRef.current();
      if (!ed) {
        return;
      }
      for (const src of paths) {
        ed.action(
          callCommand(insertImageCommand.key, {
            src,
            alt: 'Image',
          }),
        );
      }
    }, []);

    const [dropActive, setDropActive] = useState(false);

    const hostRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const el = hostRef.current;
      if (!el) {
        return;
      }

      const onPaste = (e: ClipboardEvent) => {
        if (!e.clipboardData) {
          return;
        }
        const dt = e.clipboardData;
        const types = Array.from(dt.types);

        if (!clipboardDataProbablyHasVaultImage(dt)) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (busy) {
          reportEditorError(
            'Please wait until the current operation finishes before pasting an image.',
          );
          return;
        }

        if (!isTauri()) {
          reportEditorError(
            'Pasting images into the vault requires the Notebox desktop app. Use `tauri dev` or the packaged app instead of a plain browser tab.',
          );
          return;
        }

        const html = dt.getData('text/html') ?? '';

        void (async () => {
          const relPaths: string[] = [];

          try {
            const files = await collectClipboardImageFilesFromDataTransfer(dt);
            for (const f of files) {
              const buf = new Uint8Array(await f.arrayBuffer());
              const ext =
                extensionFromFileNameOrMime(f.name, f.type) ??
                dotExtensionForClipboardBytes(
                  buf,
                  f.type,
                  f.name || 'paste',
                );
              relPaths.push(
                await saveVaultImageBytes({
                  vaultRoot,
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
                relPaths.push(await saveFetchedImageUrlToVault(vaultRoot, url));
              }
              for (const url of dataImageUrls) {
                relPaths.push(await saveFetchedImageUrlToVault(vaultRoot, url));
              }
            }

            if (relPaths.length === 0 && clipboardTypesHintImage(types)) {
              const image = await readImage();
              const png = await rgbaImageToPngBytes(image);
              relPaths.push(
                await saveVaultImageBytes({
                  vaultRoot,
                  bytes: png,
                  suggestedBaseName: 'paste',
                  extensionWithDot: '.png',
                }),
              );
            }

            if (relPaths.length === 0) {
              reportEditorError(
                'Could not import the pasted content as a vault image.',
              );
              return;
            }

            insertRelativePaths(relPaths);
          } catch (err) {
            reportEditorError(
              err instanceof Error ? err.message : String(err),
            );
          }
        })();
      };

      el.addEventListener('paste', onPaste, {capture: true});
      return () => {
        el.removeEventListener('paste', onPaste, {capture: true});
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

    const rootClass =
      dropActive
        ? 'note-markdown-editor-host note-markdown-editor-host--drop-target'
        : 'note-markdown-editor-host';

    return (
      <div ref={hostRef} className={rootClass} data-note-markdown-editor>
        <Milkdown />
      </div>
    );
  },
);

export const NoteMarkdownEditor = forwardRef<
  NoteMarkdownEditorHandle,
  NoteMarkdownEditorProps
>(function NoteMarkdownEditor(props, ref) {
  return (
    <MilkdownProvider key={String(props.sessionKey)}>
      <InnerEditor ref={ref} {...props} />
    </MilkdownProvider>
  );
});

import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord.css';

import {Crepe, CrepeFeature} from '@milkdown/crepe';
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

import {rgbaImageToPngBytes} from '../../lib/clipboardImagePng';
import {
  extensionFromFileNameOrMime,
  saveVaultImageBytes,
  vaultImportFilesIntoAttachments,
} from '../../lib/desktopVaultAttachments';
import {resolveVaultImagePreviewUrl} from '../../lib/resolveVaultImagePreviewUrl';

export type NoteMarkdownEditorProps = {
  vaultRoot: string;
  /** Absolute path to the open inbox `.md` file, or `null` while composing a new note. */
  activeNotePath: string | null;
  initialMarkdown: string;
  /** Bumped when the document should reload from `initialMarkdown` (note switch or new entry). */
  sessionKey: number;
  onMarkdownChange: (markdown: string) => void;
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

const InnerEditor = forwardRef<NoteMarkdownEditorHandle, NoteMarkdownEditorProps>(
  function InnerEditor(props, ref) {
    const {
      vaultRoot,
      activeNotePath,
      initialMarkdown,
      sessionKey,
      onMarkdownChange,
      placeholder,
      busy,
    } = props;

    const onMarkdownChangeRef = useRef(onMarkdownChange);
    useEffect(() => {
      onMarkdownChangeRef.current = onMarkdownChange;
    }, [onMarkdownChange]);

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
                  extensionFromFileNameOrMime(file.name, file.type) ?? '.png';
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
      if (!isTauri()) {
        return;
      }
      const el = hostRef.current;
      if (!el) {
        return;
      }

      const onPaste = (e: ClipboardEvent) => {
        if (busy) {
          return;
        }
        const dt = e.clipboardData;
        const types = dt ? Array.from(dt.types) : [];

        const fileList = dt?.files;
        if (fileList && fileList.length > 0) {
          const f = fileList.item(0);
          if (f && f.type.startsWith('image/')) {
            e.preventDefault();
            void (async () => {
              try {
                const buf = new Uint8Array(await f.arrayBuffer());
                const ext =
                  extensionFromFileNameOrMime(f.name, f.type) ?? '.png';
                const rel = await saveVaultImageBytes({
                  vaultRoot,
                  bytes: buf,
                  suggestedBaseName: f.name || 'paste',
                  extensionWithDot: ext,
                });
                insertRelativePaths([rel]);
              } catch {
                // Ignore failed saves
              }
            })();
            return;
          }
        }

        if (!clipboardTypesHintImage(types)) {
          return;
        }
        e.preventDefault();
        void (async () => {
          try {
            const image = await readImage();
            const png = await rgbaImageToPngBytes(image);
            const rel = await saveVaultImageBytes({
              vaultRoot,
              bytes: png,
              suggestedBaseName: 'paste',
              extensionWithDot: '.png',
            });
            insertRelativePaths([rel]);
          } catch {
            // Not an image or read failed
          }
        })();
      };

      el.addEventListener('paste', onPaste, {capture: true});
      return () => {
        el.removeEventListener('paste', onPaste, {capture: true});
      };
    }, [busy, insertRelativePaths, vaultRoot]);

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
              } catch {
                // User-visible errors can be added later
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
    }, [busy, insertRelativePaths]);

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

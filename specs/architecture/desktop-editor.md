# Desktop inbox editor (CodeMirror 6)

## Goals

- **Markdown-first:** The saved `.md` file and user-facing storage remain plain Markdown. The desktop inbox uses [CodeMirror 6](https://codemirror.net/) with `@codemirror/lang-markdown` for source editing; the document is plain text on disk, not a proprietary JSON tree.
- **Attachments:** Images live under `Assets/Attachments/` at the vault root (`Assets/` is a sibling of `Inbox/`). Notes reference them with relative URLs from an inbox note, for example `../Assets/Attachments/name.png`, inserted as `![Image](../Assets/Attachments/name.png)` after paste or drop.
- **Desktop-only:** This stack runs only in the Tauri app. No mobile-specific branching was added.

## Key components

- **Editor UI:** [`apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx) — `EditorView`, change listener to keep React state in sync with React/state for the log list and persistence. The component remounts when `sessionKey` changes (note switch / new entry).
- **Auto-save (inbox):** Open inbox notes persist to disk automatically after a short idle debounce (`INBOX_AUTOSAVE_DEBOUNCE_MS` in [`apps/desktop/src/lib/inboxAutosaveScheduler.ts`](../../apps/desktop/src/lib/inboxAutosaveScheduler.ts)). The hook [`apps/desktop/src/hooks/useMainWindowWorkspace.ts`](../../apps/desktop/src/hooks/useMainWindowWorkspace.ts) flushes pending writes before switching notes, opening a new-entry compose flow, opening a wiki-link target, changing vault, and when the main window loses focus; the main window’s close handler flushes then destroys the window. **Ctrl/Cmd+S** triggers an immediate flush (compose mode runs **Create note** validation/flow). Routine saves do not use the global `busy` flag; failures surface in the existing error banner. New notes still require **Create note** once (no file path exists until then).
- **Preview URLs:** [`apps/desktop/src/lib/resolveVaultImagePreviewUrl.ts`](../../apps/desktop/src/lib/resolveVaultImagePreviewUrl.ts) — turns relative attachment paths into `convertFileSrc` URLs for the Webview when markdown is rendered elsewhere. HTTP(S) and `data:` URLs pass through unchanged. Tauri must have **`app.security.assetProtocol.enable` set to `true` with a `scope` that includes the user’s vault paths** (see `tauri.conf.json`); otherwise images that use those local URLs render as broken after Markdown is persisted.
- **Writes:** [`apps/desktop/src/lib/desktopVaultAttachments.ts`](../../apps/desktop/src/lib/desktopVaultAttachments.ts) — base64 IPC to `vault_write_file_bytes`, shared by paste, HTML5 image drop, and Tauri path drop.
- **Markdown insertion helper:** [`apps/desktop/src/lib/formatVaultImageMarkdown.ts`](../../apps/desktop/src/lib/formatVaultImageMarkdown.ts) — builds `![Image](path)` lines after vault import.
- **Clipboard RGBA → PNG:** [`apps/desktop/src/lib/clipboardImagePng.ts`](../../apps/desktop/src/lib/clipboardImagePng.ts) — Tauri’s `readImage()` returns RGBA; we re-encode with canvas `toBlob('image/png')` so vault files stay ordinary PNGs.
- **Rust:** [`apps/desktop/src-tauri/src/vault.rs`](../../apps/desktop/src-tauri/src/vault.rs) — `vault_write_file_bytes` (same `assert_in_vault` rules as text writes) and `vault_import_files_into_attachments` (copy external drops into the vault with extension + magic-byte checks).

## CodeMirror choices

- **Extensions:** Markdown language support, history, default keymap, line wrapping, placeholder, and a small view plugin to highlight `[[wiki-style]]` spans in the source. Optional styling lives in [`apps/desktop/src/App.css`](../../apps/desktop/src/App.css) under `[data-app-surface='capture']` for the inbox.
- **Wiki links** in files remain plain `[[...]]` text; see [`apps/desktop/src/editor/wikiLink/remarkWikiLink.ts`](../../apps/desktop/src/editor/wikiLink/remarkWikiLink.ts) for the mdast shape used in tooling/tests.

## Vertical layout and click coordinates

CodeMirror 6 derives vertical layout from DOM measurements (for example line and block heights). Those measurements use the element border box: **`padding` and border count toward the measured height; CSS `margin` does not.** If vertical spacing is expressed only as margin on a `.cm-line`, a line decoration, or a block widget DOM node, the editor’s internal height map can be shorter than the visible layout. Clicks and cursor placement below that content then map to the wrong document positions (offset “phantom zone”).

**Rule:** For the inbox markdown editor, do not use vertical **margin** on anything that defines how tall a logical line or block widget appears in the editor. Use **padding** (or other in-box spacing) instead. This applies at least to:

- Line-level classes under `[data-app-surface='capture'] .note-markdown-editor-host` (for example fenced code: `cm-md-fence-line`, and heading line decorations).
- Vault image preview wrappers: [`cm-vault-image-preview`](../../apps/desktop/src/App.css) in `App.css`, and the widget root in [`vaultImagePreviewCodemirror.ts`](../../apps/desktop/src/editor/noteEditor/vaultImagePreviewCodemirror.ts).

Horizontal padding on the pane-level editor container (around the CodeMirror root) is fine; only vertical **margin** on measured line/block DOM is disallowed. The inbox editor uses the **full width** of the editor pane (no max-width column).

## Security and filesystem discipline

- All writes under the vault still go through existing `vault_*` commands and `assert_in_vault`.
- External file drops are never read from the frontend as arbitrary paths; Rust copies allowed image files into `Assets/Attachments/` and returns relative paths only.
- Clipboard and attachment helpers do not broaden the vault root scope.

## Tests

- Pure path/filename rules and layout constants are covered in `@notebox/core` (`attachmentPaths.test.ts`).
- Markdown image line formatting is covered in `apps/desktop` (`formatVaultImageMarkdown.test.ts`).

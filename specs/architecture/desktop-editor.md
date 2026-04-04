# Desktop Vault editor (CodeMirror 6)

The markdown editor lives in the **Vault** rail tab (`apps/desktop`): **vault tree** on the left, **editor** on the right. This document describes that editor stack, wiki behavior, and filesystem rules. For shell layout and the **tree vs wiki index** split, see [desktop-shell-patterns.md](../design/desktop-shell-patterns.md).

## Goals

- **Markdown-first:** The saved `.md` file and user-facing storage remain plain Markdown. The desktop Vault editor uses [CodeMirror 6](https://codemirror.net/) with `@codemirror/lang-markdown` for source editing; the document is plain text on disk, not a proprietary JSON tree.
- **Attachments:** Images live under `Assets/Attachments/` at the vault root (`Assets/` is a sibling of `Inbox/`). Notes reference them with relative URLs from a note under the vault, for example `../Assets/Attachments/name.png`, inserted as `![Image](../Assets/Attachments/name.png)` after paste or drop.
- **Desktop-only:** This stack runs only in the Tauri app. No mobile-specific branching was added.

## Key components

- **Editor UI:** [`apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx) — `EditorView`, change listener to keep React state in sync for persistence. The component remounts when `sessionKey` changes (note switch / new entry).
- **Auto-save:** Open notes persist to disk automatically after a short idle debounce (`INBOX_AUTOSAVE_DEBOUNCE_MS` in [`apps/desktop/src/lib/inboxAutosaveScheduler.ts`](../../apps/desktop/src/lib/inboxAutosaveScheduler.ts)). The hook [`apps/desktop/src/hooks/useMainWindowWorkspace.ts`](../../apps/desktop/src/hooks/useMainWindowWorkspace.ts) flushes pending writes before switching notes, opening a new-entry compose flow, opening a wiki-link target, changing vault, and when the main window loses focus; the main window’s close handler flushes then destroys the window. **Ctrl/Cmd+S** triggers an immediate flush (compose mode runs **Create note** validation/flow). Routine saves do not use the global `busy` flag; failures surface in the existing error banner. New notes still require **Create note** once (no file path exists until then).
- **Lazy note bodies:** The workspace does **not** prefetch markdown bodies for the whole vault. The active note’s text is loaded on demand (`readFile` when selection changes) and held in `inboxContentByUri` (in-memory cache) for the open note, autosave, wiki maintenance, and backlink scans. Refreshing the **flat Inbox note list** (`listInboxNotes`) updates sidebar metadata only; it does **not** delete cached bodies for notes outside that list. Explicit deletes / renames still update or remove the affected URIs.
- **Preview URLs:** [`apps/desktop/src/lib/resolveVaultImagePreviewUrl.ts`](../../apps/desktop/src/lib/resolveVaultImagePreviewUrl.ts) — turns relative attachment paths into `convertFileSrc` URLs for the Webview when markdown is rendered elsewhere. HTTP(S) and `data:` URLs pass through unchanged. Tauri must have **`app.security.assetProtocol.enable` set to `true` with a `scope` that includes the user’s vault paths** (see `tauri.conf.json`); otherwise images that use those local URLs render as broken after Markdown is persisted.
- **Writes:** [`apps/desktop/src/lib/desktopVaultAttachments.ts`](../../apps/desktop/src/lib/desktopVaultAttachments.ts) — base64 IPC to `vault_write_file_bytes`, shared by paste, HTML5 image drop, and Tauri path drop.
- **Markdown insertion helper:** [`apps/desktop/src/lib/formatVaultImageMarkdown.ts`](../../apps/desktop/src/lib/formatVaultImageMarkdown.ts) — builds `![Image](path)` lines after vault import.
- **Clipboard RGBA → PNG:** [`apps/desktop/src/lib/clipboardImagePng.ts`](../../apps/desktop/src/lib/clipboardImagePng.ts) — Tauri’s `readImage()` returns RGBA; we re-encode with canvas `toBlob('image/png')` so vault files stay ordinary PNGs.
- **Rust:** [`apps/desktop/src-tauri/src/vault.rs`](../../apps/desktop/src-tauri/src/vault.rs) — `vault_write_file_bytes` (same `assert_in_vault` rules as text writes) and `vault_import_files_into_attachments` (copy external drops into the vault with extension + magic-byte checks).

## CodeMirror choices

- **Extensions:** Markdown language support, history, default keymap, line wrapping, placeholder, `@codemirror/autocomplete` for wiki targets (WL-3), and a view plugin to highlight `[[wiki-style]]` spans in the source (**resolved** vs **unresolved** targets, WL-2). Styling lives in [`apps/desktop/src/App.css`](../../apps/desktop/src/App.css) under `[data-app-surface='capture']` for the Vault editor surface.
- **Parser extensions (vault source):** [`apps/desktop/src/editor/noteEditor/markdownEditorStyling.ts`](../../apps/desktop/src/editor/noteEditor/markdownEditorStyling.ts) passes `noteMarkdownParserExtensions` into `@codemirror/lang-markdown` alongside the default CommonMark base. This adds **GFM strikethrough** (`~~…~~`) and a Notebox-only inline span **`%%…%%`**: the file on disk remains plain Markdown text (the `%%` delimiters are literal); the desktop editor renders the inner span as smaller, muted body text. CommonMark strong and emphasis (`*`/`_`/`**`/`__`) render **inner** text bold or italic in the source editor; **delimiter characters** use the same muted tone as other markup (`EmphasisMark` → `cm-md-syntax-mark`), not heading weight. CodeMirror stacks highlight classes on one span for delimiters (e.g. `cm-md-strong cm-md-syntax-mark`); [`App.css`](../../apps/desktop/src/App.css) uses compound selectors so inherited `font-weight` / `font-style` / `text-decoration` do not affect ticks. ATX `#` heading marks keep their gutter styling and heading line typography. Horizontal rule lines (`---` at block level) receive extra top padding via a line-level decoration.
- **Wiki bracket styling:** `[[` and `]]` use the same muted delimiter tone as other markdown marks; only the inner span uses resolved vs unresolved link coloring and underline.

### Wiki links (WL-0 / WL-1 / WL-2 / WL-3)

- **On disk:** `[[...]]` stays plain Markdown. Tooling may parse to mdast via [`apps/desktop/src/editor/wikiLink/remarkWikiLink.ts`](../../apps/desktop/src/editor/wikiLink/remarkWikiLink.ts).
- **Stem-based only:** Targets use **filename stem** semantics (`[[target]]` / `[[target|label]]`). **No** path-based `[[...]]` syntax in this contract.
- **Vault-wide reference list:** Resolve, **resolved vs unresolved** styling, and **autocomplete** use **`vaultMarkdownRefs`** only — a flat async-built list of eligible `.md` notes (`collectVaultMarkdownRefs` in **`@notebox/core`**, held in [`useMainWindowWorkspace`](../../apps/desktop/src/hooks/useMainWindowWorkspace.ts)). The editor does not scan the vault on its own; [`InboxTab`](../../apps/desktop/src/components/VaultTab.tsx) passes refs-derived data into [`NoteMarkdownEditor`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx). The index may lag briefly after mutations; the UI may show stale resolve until it refreshes.
- **Backlinks (“Linked from”):** Uses the same **`vaultMarkdownRefs`** set as resolve. A debounced job in [`useMainWindowWorkspace`](../../apps/desktop/src/hooks/useMainWindowWorkspace.ts) (`VAULT_BACKLINK_COMPUTE_DEBOUNCE_MS`) merges `inboxContentByUri` with `readFile` for any ref missing from the cache, then runs [`listInboxWikiLinkBacklinkReferrersForTarget`](../../apps/desktop/src/lib/inboxWikiLinkBacklinkIndex.ts) over that expanded body map. Large vaults may take noticeable time on the first backlink pass for a selected note.
- **Activate:** `onWikiLinkActivate({ inner })` is implemented in [`useMainWindowWorkspace`](../../apps/desktop/src/hooks/useMainWindowWorkspace.ts) (flush, then [`openOrCreateInboxWikiLinkTarget`](../../apps/desktop/src/lib/inboxWikiLinkNavigation.ts)) with the current **`vaultMarkdownRefs`** projection (`{ name, uri }[]`). **Create** for an unresolved target: new `.md` under the **parent directory of the active note** if a markdown note is active; otherwise under **Inbox**. Reuses the same title → filename sanitization as note creation.
- **Resolved vs unresolved (WL-2):** [`InboxTab`](../../apps/desktop/src/components/VaultTab.tsx) passes `wikiLinkTargetIsResolved` into the editor via [`inboxWikiLinkTargetIsResolved`](../../apps/desktop/src/lib/inboxWikiLinkNavigation.ts) over **`vaultMarkdownRefs`** (true only when the resolver would return `open`, same as navigation). CodeMirror uses [`wikiLinkCodemirror.ts`](../../apps/desktop/src/editor/noteEditor/wikiLinkCodemirror.ts) (`cm-wiki-link--resolved` / `cm-wiki-link--unresolved`). When the ref list updates without a note switch, a compartment reconfigure updates link styling.
- **File rename (`.md` only):** Stem-based wiki link rewrite maintenance stays in [`planVaultWikiLinkRenameMaintenance`](../../apps/desktop/src/lib/vaultWikiLinkRenameMaintenance.ts) / [`applyVaultWikiLinkRenameMaintenance`](../../apps/desktop/src/lib/vaultWikiLinkRenameMaintenance.ts). **Folder rename or move** without a stem change does **not** run wiki rewrites.
- **Activate (same shell path):**
  - **Click** a wiki link in the source (primary button).
  - **Ctrl+click** (Linux/Windows) or **Cmd+click** (macOS) on the link span uses the same activation path (parity with common desktop “modifier + click” patterns).
  - **Shift+click** is intentionally not handled by the wiki-link hook so CodeMirror can extend the selection across link text.
  - **Ctrl+Enter** on Linux/Windows or **Cmd+Enter** on macOS (**`Mod-Enter`** in CodeMirror), with the caret anywhere inside the `[[...]]` span on that line.
  - If target resolution finds a unique existing note only by case-insensitive stem match, the shell rewrites the activated link target to that note's canonical filename casing, then opens the existing note (no new file creation).
  - Resolution also normalizes illegal filename characters with the same policy as note creation (for example `[[test?]]` against `Test.md`), so activating the link opens the existing note and rewrites the target instead of creating `test.md`, `test-2.md`, etc.
- **Typing assist:** Typing `[` immediately after `[` inserts `[]]` and leaves the caret between the inner brackets (`[[|]]`).
- **Autocomplete (WL-3):** With the caret in the **target** segment after `[[` (before any `|` or `]`), CodeMirror suggests existing notes from **`vaultMarkdownRefs`**. [`InboxTab`](../../apps/desktop/src/components/VaultTab.tsx) builds candidates via [`buildInboxWikiLinkCompletionCandidates`](../../packages/notebox-core/src/wikiLinkInboxCompletion.ts); [`NoteMarkdownEditor`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx) passes them into [`wikiLinkAutocomplete.ts`](../../apps/desktop/src/editor/noteEditor/wikiLinkAutocomplete.ts). Suggestions are prefix-filtered (case-insensitive) and capped (`WIKI_LINK_COMPLETION_MAX_OPTIONS`). Notes that share the same Markdown stem with another note are omitted so each completion resolves with `resolveInboxWikiLinkTarget` to **`open`** (ambiguous stems have no suggestion until navigation ambiguity UX ships; see [desktop-shell-wiki-backlog.md](../plans/desktop-shell-wiki-backlog.md) Phase P4).
- **Caret / hit testing:** [`apps/desktop/src/editor/noteEditor/wikiLinkInnerAtLineColumn.ts`](../../apps/desktop/src/editor/noteEditor/wikiLinkInnerAtLineColumn.ts) maps a line text + column to the raw link inner (including `target|display`). Document positions use [`wikiLinkInnerAtDocPosition.ts`](../../apps/desktop/src/editor/noteEditor/wikiLinkInnerAtDocPosition.ts) (keyboard activation and click hit testing).
- **IME:** If an input method editor is composing text inside `[[...]]`, **`Mod-Enter`** may be consumed by the IME instead of activating the link. Verify with a manual spot check when changing editor or platform input stacks; file a follow-up if activation fails under IME.

**Manual smoke (desktop Vault editor):**

- From an open note, activate the same link via plain click, **Ctrl/Cmd+click**, and **Mod-Enter**; all should open or create the same target.
- **Shift+click** across a link should extend the selection without navigating.
- While composing a new entry, activating a link still flushes through the workspace path above.
- Ambiguous or unsupported targets continue to surface via the existing error banner (no picker yet).
- Optional: with an IME enabled, caret inside `[[...]]`, confirm whether **Mod-Enter** still activates or is captured by the IME.

## Vertical layout and click coordinates

CodeMirror 6 derives vertical layout from DOM measurements (for example line and block heights). Those measurements use the element border box: **`padding` and border count toward the measured height; CSS `margin` does not.** If vertical spacing is expressed only as margin on a `.cm-line`, a line decoration, or a block widget DOM node, the editor’s internal height map can be shorter than the visible layout. Clicks and cursor placement below that content then map to the wrong document positions (offset “phantom zone”).

**Rule:** For the Vault markdown editor, do not use vertical **margin** on anything that defines how tall a logical line or block widget appears in the editor. Use **padding** (or other in-box spacing) instead. This applies at least to:

- Line-level classes under `[data-app-surface='capture'] .note-markdown-editor-host` (for example fenced code: `cm-md-fence-line`, and heading line decorations).
- Vault image preview wrappers: [`cm-vault-image-preview`](../../apps/desktop/src/App.css) in `App.css`, and the widget root in [`vaultImagePreviewCodemirror.ts`](../../apps/desktop/src/editor/noteEditor/vaultImagePreviewCodemirror.ts).

Horizontal padding on the pane-level editor container (around the CodeMirror root) is fine; only vertical **margin** on measured line/block DOM is disallowed. The editor uses the **full width** of the editor pane (no max-width column).

## Security and filesystem discipline

- All writes under the vault still go through existing `vault_*` commands and `assert_in_vault`.
- External file drops are never read from the frontend as arbitrary paths; Rust copies allowed image files into `Assets/Attachments/` and returns relative paths only.
- Clipboard and attachment helpers do not broaden the vault root scope.

## Tests

- Pure path/filename rules and layout constants are covered in `@notebox/core` (`attachmentPaths.test.ts`).
- Markdown image line formatting is covered in `apps/desktop` (`formatVaultImageMarkdown.test.ts`).
- Wiki link helpers: `apps/desktop` — `wikiLinkInnerAtLineColumn.test.ts`, `wikiLinkInnerAtDocPosition.test.ts`, [`inboxWikiLinkNavigation.test.ts`](../../apps/desktop/src/lib/inboxWikiLinkNavigation.test.ts); core resolver — `wikiLinkInbox.test.ts`; core completion list — `wikiLinkInboxCompletion.test.ts` (completion inputs are the same shape as entries derived from **`vaultMarkdownRefs`** in the shell).

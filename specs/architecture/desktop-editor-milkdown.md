# Desktop inbox editor (Milkdown)

## Goals

- **Markdown-first:** The saved `.md` file and user-facing storage remain plain Markdown. The editor uses [Milkdown Crepe](https://milkdown.io/) for a WYSIWYG experience; serialization goes through Milkdown’s Markdown pipeline, not a proprietary document JSON store.
- **Attachments:** Images live under `Assets/Attachments/` at the vault root (`Assets/` is a sibling of `Inbox/`). Notes reference them with relative URLs from an inbox note, for example `../Assets/Attachments/name.png`.
- **Desktop-only:** This stack runs only in the Tauri app. No mobile-specific branching was added.

## Key components

- **Editor UI:** [`apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx) — Crepe + `@milkdown/react`, Markdown change listener to keep React state in sync for Save/Create.
- **Preview URLs:** [`apps/desktop/src/lib/resolveVaultImagePreviewUrl.ts`](../../apps/desktop/src/lib/resolveVaultImagePreviewUrl.ts) — turns relative attachment paths into `convertFileSrc` URLs for the Webview. HTTP(S) and `data:` URLs pass through unchanged.
- **Writes:** [`apps/desktop/src/lib/desktopVaultAttachments.ts`](../../apps/desktop/src/lib/desktopVaultAttachments.ts) — base64 IPC to `vault_write_file_bytes`, shared by paste, drop, and toolbar upload.
- **Clipboard RGBA → PNG:** [`apps/desktop/src/lib/clipboardImagePng.ts`](../../apps/desktop/src/lib/clipboardImagePng.ts) — Tauri’s `readImage()` returns RGBA; we re-encode with canvas `toBlob('image/png')` so vault files stay ordinary PNGs.
- **Rust:** [`apps/desktop/src-tauri/src/vault.rs`](../../apps/desktop/src-tauri/src/vault.rs) — `vault_write_file_bytes` (same `assert_in_vault` rules as text writes) and `vault_import_files_into_attachments` (copy external drops into the vault with extension + magic-byte checks).

## Milkdown / Crepe choices

- **Crepe** bundles CommonMark + GFM-related pieces (lists, task lists, links, code blocks, images) with sensible defaults, so we avoid hand-picking many low-level plugins for the first version.
- **Disabled features:** `CrepeFeature.Latex` and `CrepeFeature.Table` are off to keep the bundle smaller and the first release focused.
- **Image block:** `featureConfigs[CrepeFeature.ImageBlock].proxyDomURL` wires vault-relative `src` values to Tauri file URLs for display only; Markdown on disk stays relative.
- **ImageBlock `onUpload`:** Toolbar/file picks in the editor run the same `saveVaultImageBytes` path as paste/drop.

## Security and filesystem discipline

- All writes under the vault still go through existing `vault_*` commands and `assert_in_vault`.
- External file drops are never read from the frontend as arbitrary paths; Rust copies allowed image files into `Assets/Attachments/` and returns relative paths only.
- Clipboard and attachment helpers do not broaden the vault root scope.

## Tests

- Pure path/filename rules and layout constants are covered in `@notebox/core` (`attachmentPaths.test.ts`).

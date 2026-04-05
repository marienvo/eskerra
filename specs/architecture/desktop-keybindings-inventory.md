# Desktop keybindings inventory

Machine- and human-readable catalog of **desktop (Tauri) vault UI** keyboard behavior. **CodeMirror** uses normalized key names (`Mod` = Cmd on macOS, Ctrl on Linux/Windows). US QWERTY is the reference layout for character keys; see [`desktop-editor.md`](./desktop-editor.md) for editor semantics.

**Stable action ids** use `notebox.<area>.<action>` so a future command palette (Phase P2 in [`desktop-shell-wiki-backlog.md`](../plans/desktop-shell-wiki-backlog.md)) can register the same ids with default chords.

## Governance (Phase P2 and customization)

- Per [`extension-readiness.md`](./extension-readiness.md): avoid **new ad hoc global shortcuts** outside a future central policy; **settings** (including keybindings) should remain inspectable and owned as documented there.
- **When the command palette / shell command registrar lands:** register new user-visible shortcuts **only** through that registrar; extend **this inventory** when adding or changing default bindings. Do not scatter `document`-level listeners for app commands without going through that seam.

## Inventory

| Action id | Default keys (CodeMirror / DOM) | Scope | Primary implementation |
|-----------|----------------------------------|-------|-------------------------|
| `notebox.vault.editor.save` | `Mod-s` | Vault markdown editor (root + table cell) | [`noteMarkdownCoreKeymap.ts`](../../apps/desktop/src/editor/noteEditor/noteMarkdownCoreKeymap.ts) → wired from [`NoteMarkdownEditor.tsx`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx), [`noteMarkdownCellEditor.ts`](../../apps/desktop/src/editor/noteEditor/noteMarkdownCellEditor.ts) |
| `notebox.vault.editor.wikiBracketAssist` | `[` (after `[`, empty selection) | Vault markdown editor (root + cell) | Same |
| `notebox.vault.editor.activateLinkAtCaret` | `Mod-Enter` | Vault markdown editor (root + cell) | Same |
| `notebox.vault.editor.foldCode` | `Ctrl-Shift-[` / `Cmd-Alt-[` (platform folding) | **Root** editor only (`foldKeymap`) | [`NoteMarkdownEditor.tsx`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx) |
| `notebox.vault.editor.unfoldCode` | `Ctrl-Shift-]` / `Cmd-Alt-]` | Root editor only | Same |
| `notebox.vault.editor.foldAll` | `Ctrl-Alt-[` / `Cmd-Alt-[` | Root editor only | Same |
| `notebox.vault.editor.unfoldAll` | `Ctrl-Alt-]` / `Cmd-Alt-]` | Root editor only | Same |
| `notebox.vault.editor.indentWithTab` | `Tab`, `Shift-Tab` (standard CodeMirror) | Root + cell (cell: superseded by table nav where applicable) | `@codemirror/commands` via editor keymaps |
| `notebox.vault.editor.markdown.surround` | `[`, `*`, `_`, `` ` ``, `~`, `%`, `=` (+ shifted variants where applicable) | Root + cell | [`markdownSelectionSurround.ts`](../../apps/desktop/src/editor/noteEditor/markdownSelectionSurround.ts) |
| `notebox.vault.editor.markdown.standard` | default + history keymaps | Root + cell | `@codemirror/commands` |
| `notebox.vault.editor.tableCell.nextPrev` | `Tab`, `Shift-Tab` | Eskerra table **cell** editor only | [`noteMarkdownCellEditor.ts`](../../apps/desktop/src/editor/noteEditor/noteMarkdownCellEditor.ts) |
| `notebox.vault.editor.tableCell.newlineOrComplete` | `Enter` | Table cell (completion-aware) | Same |
| `notebox.vault.editor.tableCell.escapeOrCloseCompletion` | `Escape` | Table cell | Same |
| `notebox.vault.editor.tableCell.literalPipe` | `\|` (noop / swallow for cell model) | Table cell | Same |
| `notebox.vault.tree.toggleSelectionFocused` | `Control+Space` | Vault tree | **Disabled** in app: [`VaultPaneTree.tsx`](../../apps/desktop/src/components/VaultPaneTree.tsx) (`toggleSelectedItem.isEnabled: () => false`) |
| `notebox.vault.tree.rangeSelectUp` | `Shift+ArrowUp` | Vault tree | `@headless-tree` `selectionFeature` + `hotkeysCoreFeature` |
| `notebox.vault.tree.rangeSelectDown` | `Shift+ArrowDown` | Vault tree | Same |
| `notebox.vault.tree.selectAll` | `Control+KeyA` | Vault tree | Same |
| `notebox.dialog.renameNote.submit` | `Enter` | Rename note dialog input | [`VaultTab.tsx`](../../apps/desktop/src/components/VaultTab.tsx) |
| `notebox.dialog.renameFolder.submit` | `Enter` | Rename folder dialog input | Same |
| `notebox.vault.editor.imagePreview.toggleExpand` | `Enter`, `Space` | Focused vault image preview widget | [`vaultImagePreviewCodemirror.ts`](../../apps/desktop/src/editor/noteEditor/vaultImagePreviewCodemirror.ts) |

## Tree hotkeys feature

The vault tree uses `@headless-tree/react` with **`hotkeysCoreFeature`**. That feature attaches the keydown listener that dispatches **selection** presets (`Shift+ArrowUp` / `Down`, `Ctrl+A`). **`toggleSelectedItem` (`Control+Space`)** is intentionally turned off in this app to avoid stealing a common chord from nested editors or system behavior. Do not remove `hotkeysCoreFeature` without re-homing those other tree shortcuts.

## Related specs

- Editor behavior detail: [`desktop-editor.md`](./desktop-editor.md)
- Extension / settings policy: [`extension-readiness.md`](./extension-readiness.md)
- Backlog — central command ownership: [`desktop-shell-wiki-backlog.md`](../plans/desktop-shell-wiki-backlog.md) Phase P2

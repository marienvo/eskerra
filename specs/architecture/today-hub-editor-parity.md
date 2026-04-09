# Today Hub: read (static) vs edit (CodeMirror) typography parity

## Goal

Inactive hub cells render markdown as static DOM ([`TodayHubCellStaticRichText`](../../apps/desktop/src/components/TodayHubCellStaticRichText.tsx)) with the same `cm-md-*` classes as CodeMirror. Active cells use [`NoteMarkdownEditor`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx). **Bullet lists and body lines must not shift vertically** when switching read ↔ edit or when comparing two columns side by side.

## Shared tokens

Both modes sit under [`.note-markdown-editor-wrap`](../../apps/desktop/src/App.css), which defines `--nb-editor-font-size` and `--nb-editor-line-height`.

Hub uses a slightly tighter line box than the main inbox editor (historical ratio **1.5625 / 1.6** vs main):

- **Edit:** `[data-app-surface='capture'] .today-hub-canvas__cm-host .note-markdown-editor-host .cm-scroller` sets `line-height: calc(var(--nb-editor-line-height) * 1.5625 / 1.6)`.
- **Read:** `.today-hub-canvas__cell-static-rich` sets the same `line-height` and `font-size: var(--nb-editor-font-size)`.

## Pitfall (regressed before): extra `min-height` on static `.cm-line`

Static lines use `<div class="cm-line">` per row. There is **no** matching `min-height` on CodeMirror `.cm-line` in hub edit mode.

If static rules add:

```css
min-height: calc(1em * var(--nb-editor-line-height) * 1.5625 / 1.6);
```

then `getComputedStyle` still reports the **same** `line-height` as CodeMirror (~22.7px at 15px / 1.55 base), but **layout can round differently**: static lines may get **`clientHeight` one pixel taller** than CodeMirror lines, so bullets appear to “jump” vertically.

**Rule:** Hub static `.cm-line` must rely on **inherited `line-height` only** (plus normal block/heading/list padding from shared `cm-md-*` rules). Do not add a separate per-line `min-height` for “grid” parity unless CodeMirror hub lines get the **identical** rule (and layout has been verified — CodeMirror line metrics are sensitive).

## Debug checklist

1. Compare `getComputedStyle(.cm-scroller)` vs `getComputedStyle(.today-hub-canvas__cell-static-rich)` for `font-size` and `line-height`.
2. Compare **first** `.cm-line` under each: `line-height`, **`min-height`**, and **`clientHeight`**. Mismatched `clientHeight` with identical `line-height` strongly suggests an extra static-only constraint (often `min-height`).

## Related CSS entry points

- Hub canvas: `.today-hub-canvas`, `.today-hub-canvas__cell-static-rich`, `.today-hub-canvas__cm-host`
- Editor tokens: `.note-markdown-editor-wrap` in [`App.css`](../../apps/desktop/src/App.css)

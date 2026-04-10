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

**Rule:** Hub static `.cm-line` must rely on **inherited `line-height` only** (plus normal block/heading/list padding from shared `cm-md-*` rules). Do not add **universal** per-line `min-height`: it inflated `clientHeight` vs CodeMirror on lines that already had text.

**Exception — blank lines:** Empty markdown lines render as `:empty` `.cm-line` nodes with no strut; they collapse without `min-height`. Use **`.cm-line:empty` only** with `min-height: 1lh` so the blank line’s block size matches the **used** hub line height (inherited from `.today-hub-canvas__cell-static-rich`). Do **not** use `calc(1em * var(--nb-editor-line-height) * 1.5625 / 1.6)` here: it can round **1px taller** than CodeMirror lines while `line-height` still matches on paper.

## Horizontal inset (read vs edit)

Body text must start at the **same** horizontal offset in:

- `.today-hub-canvas__cell-readonly` (`padding-inline-start`), and
- `.today-hub-canvas__cm-host .note-markdown-editor-host .cm-content` (`padding-inline` start).

**Single token:** `.today-hub-canvas__cell` defines `--today-hub-body-pad-inline-start`. Both rules consume it. Do not duplicate `calc(0.6rem + … - Npx)` with different `N` (a prior bug used `-19px` on readonly and `-30px` on `.cm-content`, shifting edit mode ~5–6px left vs read in WebKit).

**`ch` / font-size:** `--nb-editor-heading-gutter` is `9.25ch`. `ch` resolves against the element’s **used font size**. Hub cells must set `font-size: var(--nb-editor-font-size)` on **`.today-hub-canvas__cell`** so readonly (which would otherwise inherit `0.88rem` from `.today-hub-canvas`) uses the same `ch` width as `.cm-scroller` / `.cm-content`. Otherwise `padding-inline` can match **by token** but diverge **by computed px** (~5px).

**Debug:** Log `getComputedStyle(readonly).paddingInlineStart` vs `getComputedStyle(.cm-content).paddingInlineStart` for the same row; they must match.

## List indentation (read vs edit)

CodeMirror’s `.cm-content` uses **`white-space: break-spaces`** (see `@codemirror/view` base theme) and the default **`EditorState.tabSize` facet value of 4** (tabs in the document render at four columns).

Hub static preview used **`white-space: pre-wrap`** without an explicit `tab-size`, so nested lists could look **more indented in read mode** than in edit (browser default tab width and different wrapping rules).

**Rule:** `.today-hub-canvas__cell-static-rich` must use **`white-space: break-spaces`** and **`tab-size: 4`** so list lines match the editor’s horizontal spacing.

## Debug checklist

1. Compare `getComputedStyle(.cm-scroller)` vs `getComputedStyle(.today-hub-canvas__cell-static-rich)` for `font-size` and `line-height`.
2. Compare **first** `.cm-line` under each: `line-height`, **`min-height`**, and **`clientHeight`**. Mismatched `clientHeight` with identical `line-height` strongly suggests an extra static-only constraint (often `min-height`).
3. Compare **horizontal:** `paddingInlineStart` on readonly vs hub `.cm-content` (see above).
4. Compare **`whiteSpace`** and **`tabSize`** on `.today-hub-canvas__cell-static-rich` vs hub `.cm-content` (see “List indentation”).

## Related CSS entry points

- Hub canvas: `.today-hub-canvas`, `.today-hub-canvas__cell-static-rich`, `.today-hub-canvas__cm-host`
- Editor tokens: `.note-markdown-editor-wrap` in [`App.css`](../../apps/desktop/src/App.css)

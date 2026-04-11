# Desktop text rendering (WebKit / Tauri)

This note documents **intentional CSS choices** for the Linux desktop app ([`apps/desktop`](../../apps/desktop)) so we do not regress on blurry or “fake bold” text, especially in **list rows**, **small uppercase labels**, and the **inbox markdown editor** (CodeMirror on WebKitGTK).

**Engine:** The desktop shell uses **WebKit** (e.g. WebKitGTK / WKWebView via Tauri). Subpixel antialiasing and compositing behave differently than Chromium-only stacks.

## Symptoms we fixed (do not reintroduce)

1. **Episode rows:** Default state looked **thicker / fuzzier / bold-like**; **hover** looked sharp.  
   **Cause:** `<button class="episode-row">` used a **transparent** background. Text was composited on transparency over a tinted panel. On hover, an **opaque** fill caused glyphs to render with cleaner AA.

2. **Inbox file list rows:** Same pattern as episode rows: **`.note-list button`** with `background: transparent` over `--color-capture-panel` caused WebKit to render default state fuzzier than hover. Fixed with **opaque** `var(--color-capture-panel)` under `[data-app-surface='capture']`.

3. **Global `text-rendering: optimizeLegibility` on `:root`:** Can make **small UI** type and caps look uneven next to `text-rendering: auto` regions.

4. **Inbox CodeMirror editor (right pane):** `text-rendering: optimizeLegibility` on `.cm-scroller` (and plain `.panel-surface textarea`) made glyphs look **uneven or heavier on one edge** next to the left-pane list, which uses `text-rendering: auto`. **Fix:** use `text-rendering: auto` on those editor surfaces to match `body` and `.note-list`.

5. **Inbox CodeMirror root (`.cm-editor`):** Same transparency pattern as list rows: `background: transparent` over the editor chrome could make WebKitGTK text look **thicker or fuzzier** than opaque UI. **Fix:** `background: var(--color-editor-bg)` on `[data-app-surface='capture'] .note-markdown-editor-host .cm-editor` so the text layer matches the filled wrap/panel.

6. **Heavy weight on tiny uppercase group captions** (`.section-heading`): `font-weight: 700` at very small sizes often looks **muddy** on non-retina displays.

7. **Inbox editor (scroll / compositing):** After fixing `text-rendering`, opaque `.cm-editor`, and related layout, text could still look **uneven or heavier on one edge**, especially **when scrolling**. **Cause:** WebKitGTK often paints scrolling text with **subpixel LCD antialiasing** in a way that interacts badly with CodeMirror’s scroll layer. **Fix:** **`-webkit-font-smoothing: antialiased`** on capture **`[data-app-surface='capture'] .note-markdown-editor-host .cm-scroller`** (grayscale AA; same tradeoff as `.playlist-body`: slightly lighter strokes, more stable appearance). **Do not remove** this without re-checking on Linux WebKitGTK at fractional UI scale.

8. **Today Hub week strip labels** (`.today-hub-canvas__row-date`, `.row-date-end`, `.col-head`): Small type on the gray date bar showed **harsh or uneven antialiasing** while computed style stayed **`font-smoothing: auto`**. **Fix:** same **`-webkit-font-smoothing: antialiased`**, **`font-synthesis: none`**, and **`text-rendering: auto`** as other capture chrome labels (see `App.css`). Re-check on Linux WebKitGTK after changes.

9. **Vault search palette** (`.vault-search-content`, **`VaultSearchPalette`**): Search **snippet** lines used **`ui-monospace`** at ~`0.78rem` with default **`-webkit-font-smoothing: auto`**, while titles used **Inter** — snippets looked **jagged / uneven** next to titles on WebKitGTK. **Fix:** snippets **inherit** the same UI sans as **`.quick-open-command__item-path`** (no forced monospace); apply **`-webkit-font-smoothing: antialiased`**, **`font-synthesis: none`**, and **`text-rendering: auto`** on the **shared shell dialog** (see **Command palettes** below). Re-check after CSS changes.

10. **Quick Open palette** (Shift-Shift, **`QuickOpenNotePalette`**, **`.quick-open-content`** only): **Secondary path lines** (`.quick-open-command__item-path`) looked **thinner / jaggier** than **titles** (`.quick-open-command__item-title`) on WebKitGTK — same class of bug as vault search snippets: **small secondary type** + default subpixel smoothing **without** the overlay’s grayscale AA tuning. Vault search had the fix on **`.vault-search-content`**, but Quick Open did not add that class, so it missed the rules. **Fix:** apply the **same three properties** on **`.quick-open-content`** (all command palettes use it); set **`.quick-open-command__item-path`** to **`font-family: inherit`** and repeat the smoothing trio so paths cannot diverge from titles.

11. **Inbox editor fold gutter vs paper:** Collapse icons should sit **in the panel margin** (same gray as `.note-markdown-editor-scroll`), not on the **white paper** card. **Layout:** `.note-markdown-editor-page` is a flex row: **`.note-markdown-editor-fold-rail`** (narrow, transparent over scroll gray) + **`.note-markdown-editor-paper`** (solid `--nb-editor-paper`, shadow). **`.note-markdown-editor-host`** inside the paper uses a **negative `margin-inline-start`** and wider `width` so CodeMirrors **`.cm-gutters`** paint in the rail; **`.cm-gutters`** and **`EditorView.theme`** use **transparent** gutter backgrounds; **`.cm-scroller`** uses a **horizontal gradient** (transparent for the gutter width, then paper). **Linked from** padding omits the old fold width (see `.inbox-backlinks`). Re-test alignment and scrolling on Linux WebKitGTK after changing this layout.

## Command palettes (Quick Open, vault search, future cmdk dialogs)

These overlays share **`Dialog.Content`** styling via **`.quick-open-content`**. **Do not** put WebKit text-smoothing rules **only** on a palette-specific class (e.g. **`.vault-search-content`**) unless that class is **layout-only**. Otherwise **Shift-Shift** (Quick Open) and **vault search** will **diverge** again: one dialog gets grayscale AA on the shell, the other keeps default subpixel behavior and secondary lines look **jagged** next to titles.

**Checklist when adding or restyling a palette:**

1. **Shell container:** **`.quick-open-content`** must include **`-webkit-font-smoothing: antialiased`**, **`text-rendering: auto`**, and **`font-synthesis: none`** (see symptoms **9–10** and the rules table).
2. **Primary + secondary lines:** **`.quick-open-command__item-title`** and **`.quick-open-command__item-path`** must both use **UI sans** — **no** **`ui-monospace` / `monospace`** on paths, snippets, or metadata unless you have measured a specific need and added a row to the rules table.
3. **Palette-only tweaks:** Use an extra class (e.g. **`.vault-search-content`**) **only** for **`max-height`**, padding, or other layout — **not** as the sole place for smoothing rules.
4. **Verification:** On **Linux WebKitGTK**, compare **title vs path** (or **title vs snippet**) at **~0.78–0.9rem** after CSS changes. If secondary text looks **thin, jagged, or uneven** vs the title, the shell or secondary selector is missing steps **1–2** in this checklist.

## Rules (keep these unless you measure a regression)

| Area | Rule | Where |
| --- | --- | --- |
| Default UI chrome | `text-rendering: auto` on `body` | [`apps/desktop/src/index.css`](../../apps/desktop/src/index.css) |
| Long-form editor | `text-rendering: auto` on `.panel-surface textarea` and capture inbox `.cm-scroller`; **keep** **`-webkit-font-smoothing: antialiased`** on that `.cm-scroller` for WebKitGTK scroll stability | [`apps/desktop/src/App.css`](../../apps/desktop/src/App.css) |
| Inbox markdown editor surface | Opaque `.cm-editor`: `background: var(--color-editor-bg)` under capture (not `transparent` over the panel) | `App.css` |
| Episode list rows | **Opaque** row background matching the pane: `background: var(--color-consume-surface)` (not `transparent`) | `.episode-row` in `App.css` |
| Episode row buttons | Explicit `font-weight: 400` and `font-synthesis: none` on `.episode-row` and `.ep-title` | `App.css` |
| Episodes scroll region | `text-rendering: auto` on `.episode-scroll` (redundant with `body` but documents intent) | `App.css` |
| Inbox note list | **Opaque** default row: `[data-app-surface='capture'] .note-list button` uses `background: var(--color-capture-panel)` — not `transparent` over the warm panel | `App.css` |
| Inbox list scroll | `text-rendering: auto` on `.note-list` (parity with `.episode-scroll`) | `App.css` |
| Inbox row buttons | `font-synthesis: none` on `.note-list button` | `App.css` |
| Inbox editor scroll surface | `font-synthesis: none` on capture `.cm-scroller` (same rationale as list rows) | `App.css` |
| Inbox editor WebKit smoothing | **`-webkit-font-smoothing: antialiased`** on capture `.cm-scroller` (same idea as `.playlist-body`; tradeoff: slightly lighter strokes vs more even AA when scrolling) | `App.css` |
| Podcasts playlist body | Dense metadata / monospace: `-webkit-font-smoothing: antialiased` and `text-rendering: geometricPrecision` on `.playlist-body` | `App.css` |
| Inbox fold rail + paper | Flex **`.note-markdown-editor-page`**: rail + paper; transparent **`.cm-gutters`**, gradient **`.cm-scroller`**, host negative margin only under **`.note-markdown-editor-paper`** | [`VaultTab.tsx`](../../apps/desktop/src/components/VaultTab.tsx), [`App.css`](../../apps/desktop/src/App.css), [`NoteMarkdownEditor.tsx`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx) |
| Today Hub week strip | **`-webkit-font-smoothing: antialiased`**, **`font-synthesis: none`**, **`text-rendering: auto`** on **`.today-hub-canvas__row-date`**, **`.row-date-end`**, **`.col-head`** | `App.css` |
| Command palette shell | **`.quick-open-content`**: **`-webkit-font-smoothing: antialiased`**, **`font-synthesis: none`**, **`text-rendering: auto`** (Quick Open + vault search + any future palette using this class) | `App.css`, **`QuickOpenNotePalette.tsx`**, **`VaultSearchPalette.tsx`** |
| Command palette paths / snippets | **`.quick-open-command__item-path`**: **`font-family: inherit`** + same smoothing trio as shell; **`.vault-search-hit__snippet`**: UI sans only (no **`ui-monospace`**) | `App.css` |
| Vault search layout only | **`.vault-search-content`**: **`max-height`** override — **not** the place for unique font-smoothing rules | `App.css` |

## Fractional UI scale (GNOME / Wayland)

At **125% or 150%** (or other non-integer scale factors), glyphs may not align to whole device pixels; subpixel AA can **vary by row** or after resize. CSS cannot fully normalize that. If text looks “half good / half bad,” first confirm list **rows use opaque backgrounds** (no `transparent` buttons on tinted panels). Do not “fix” by reintroducing `transparent` row backgrounds.

## Group captions (`.section-heading`)

These are **small, uppercase, tracked** labels above episode groups. Prefer:

- **Moderate weight** (`500`–`600`, not `700` at microscopic sizes).
- **Readable size** (avoid stacking weight + tiny px + tight caps).
- **`font-synthesis: none`** to avoid faux bold.
- Optional **`-webkit-font-smoothing: antialiased`** on WebKit for more even grayscale AA on small caps (tradeoff: slightly lighter strokes).

Implementation lives in `App.css` on `.section-heading`; adjust there and update this doc if the strategy changes.

## Feed quirks

Episode titles may contain stray `**` from sources. List display strips those via `episodeListLabel()` in [`EpisodesPane.tsx`](../../apps/desktop/src/components/EpisodesPane.tsx) so inline markers do not look like uneven weight.

## Related

- [design-system-calm-editorial.md](design-system-calm-editorial.md) — palette and surfaces (including `--color-consume-surface` used for opaque rows).

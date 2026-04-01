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

Episode titles may contain stray `**` from sources. List display strips those via `episodeListLabel()` in [`PodcastsTab.tsx`](../../apps/desktop/src/components/PodcastsTab.tsx) so inline markers do not look like uneven weight.

## Related

- [design-system-calm-editorial.md](design-system-calm-editorial.md) — palette and surfaces (including `--color-consume-surface` used for opaque rows).

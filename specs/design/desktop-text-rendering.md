# Desktop text rendering (WebKit / Tauri)

This note documents **intentional CSS choices** for the Linux desktop app ([`apps/desktop`](../../apps/desktop)) so we do not regress on blurry or “fake bold” text, especially in **list rows** and **small uppercase labels**.

**Engine:** The desktop shell uses **WebKit** (e.g. WebKitGTK / WKWebView via Tauri). Subpixel antialiasing and compositing behave differently than Chromium-only stacks.

## Symptoms we fixed (do not reintroduce)

1. **Episode rows:** Default state looked **thicker / fuzzier / bold-like**; **hover** looked sharp.  
   **Cause:** `<button class="episode-row">` used a **transparent** background. Text was composited on transparency over a tinted panel. On hover, an **opaque** fill caused glyphs to render with cleaner AA.

2. **Inbox file list rows:** Same pattern as episode rows: **`.note-list button`** with `background: transparent` over `--color-capture-panel` caused WebKit to render default state fuzzier than hover. Fixed with **opaque** `var(--color-capture-panel)` under `[data-app-surface='capture']`.

3. **Global `text-rendering: optimizeLegibility` on `:root`:** Can make **small UI** type and caps look uneven next to `text-rendering: auto` regions.

4. **Heavy weight on tiny uppercase group captions** (`.section-heading`): `font-weight: 700` at very small sizes often looks **muddy** on non-retina displays.

## Rules (keep these unless you measure a regression)

| Area | Rule | Where |
| --- | --- | --- |
| Default UI chrome | `text-rendering: auto` on `body` | [`apps/desktop/src/index.css`](../../apps/desktop/src/index.css) |
| Long-form editor | `text-rendering: optimizeLegibility` on markdown `textarea` only | [`apps/desktop/src/App.css`](../../apps/desktop/src/App.css) (`.panel-surface textarea`) |
| Episode list rows | **Opaque** row background matching the pane: `background: var(--color-consume-surface)` (not `transparent`) | `.episode-row` in `App.css` |
| Episode row buttons | Explicit `font-weight: 400` and `font-synthesis: none` on `.episode-row` and `.ep-title` | `App.css` |
| Episodes scroll region | `text-rendering: auto` on `.episode-scroll` (redundant with `body` but documents intent) | `App.css` |
| Inbox note list | **Opaque** default row: `[data-app-surface='capture'] .note-list button` uses `background: var(--color-capture-panel)` — not `transparent` over the warm panel | `App.css` |
| Inbox list scroll | `text-rendering: auto` on `.note-list` (parity with `.episode-scroll`) | `App.css` |
| Inbox row buttons | `font-synthesis: none` on `.note-list button` | `App.css` |
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

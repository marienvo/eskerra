# Desktop shell tooltips

Normative rules for **hover/focus hints** in the Notebox desktop (Tauri) shell. Visual styling and timing are defined in CSS; this document states **when** to use that system and **accessibility** expectations.

## Single pattern (required)

Icon-only controls and compact actions in the desktop shell **must** use:

- Class `app-tooltip-trigger` on the interactive element.
- Attribute `data-tooltip` with the same short label shown on hover (US English, sentence case unless a proper noun).
- Attribute `data-tooltip-placement` with one of:
  - `inline-end` — tooltip opens toward the **inline end** (to the right in LTR), for controls on the **leading** side of the shell (for example, rail tabs).
  - `inline-start` — tooltip opens toward the **inline start** (to the left in LTR), for controls on the **trailing** edge of a bar (for example, window controls, pane header actions) so the bubble stays inside the window.

**Do not** use the native HTML `title` attribute for these action tooltips; it produces inconsistent OS/browser chrome and conflicts with the shell design.

## Source of truth (implementation)

- Styles: [`apps/desktop/src/App.css`](../../apps/desktop/src/App.css) — section **Desktop shell tooltips** (`.app-tooltip-trigger`, `data-tooltip`, placement rules, dwell delay, `prefers-reduced-motion`).
- Dwell behavior: tooltip appears after a short delay on hover/focus; quick passes do not flash a label. Screen readers use explicit names, not the tooltip pseudo-element.

## Exception: truncated or dynamic text

Use the native `title` attribute **only** where the primary need is to expose **full text** that is visually truncated (for example, an ellipsized file name in a pane title). That is a document hint, not an action tooltip. If product requirements later demand the same visual treatment as shell tooltips for those strings, extend the CSS pattern in `App.css` and update this document.

## Accessibility

- Every icon-only or ambiguous control **must** have a concise `aria-label` (or visible text) that matches the intent of `data-tooltip`. The tooltip is supplementary for pointer and keyboard focus visibility; it is not the sole accessible name.

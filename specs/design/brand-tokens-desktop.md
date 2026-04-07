# Eskerra desktop brand tokens

Product logo files live in [`assets/brand/`](../../assets/brand/) (see that folder’s README).

Normative colors for the **desktop** shell (Tauri). Where these differ from [design-system-calm-editorial.md](design-system-calm-editorial.md), **this document is authoritative for the desktop app** implementation.

## Main window chrome background

The **primary** (main) window uses a full-bleed **SVG** layer (`AppChromeBackground` in [`apps/desktop/src/components/AppChromeBackground.tsx`](../../apps/desktop/src/components/AppChromeBackground.tsx)) that draws **1–30** organic ellipses from [`APP_CHROME_PALETTE`](../../apps/desktop/src/shell/appChromePalette.ts), merged with a **single** shared Gaussian blur (`feGaussianBlur`). For **two or more** colors, an **opaque** full-viewport `<rect>` filled with the **first** palette entry sits **under** the blurred group so blur fringes do not composite to transparency (the main window must not read as see-through under Tauri). One color yields a solid fill only. The HTML/body backdrop token `--color-app-chrome-backdrop` matches that first palette tone. **Title bar**, **status bar**, and **rail** use **transparent** backgrounds so the chrome gradient shows through. **Panel gutters** show the same gradient because `.app-body`, `.main-column`, and `.main-stage` are transparent while `.panel-surface` keeps card surfaces. The standalone **settings** webview root is unchanged and still uses `brandBackground`.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `appChromeBackdrop` | `#031226` | HTML/`body` backdrop behind `.app-root` (`--color-app-chrome-backdrop`). Matches the first entry in `APP_CHROME_PALETTE` so startup does not flash the old flat gray. Update both when changing that palette anchor. |
| `brandBackground` | `#f2f2f2` | **Reference** neutral for mixes and for contexts that still expect “gray shell” semantically (`--color-bg`, `--color-brand-bg`); the **main window** canvas is the blurred chrome layer, not this flat color. **Settings** webview root still uses this as the page fill. |
| `brandSurfaceBright` | `rgb(250, 250, 250)` (`#fafafa`) | Primary surfaces for resizable panels, editors, and modal bodies (`--color-surface`, capture/consume panel tokens, `--color-editor-bg`). Near-white so panels read slightly softer than pure white on the chrome gradient. |
| `interactiveText` | `rgb(203, 77, 73)` | **Only** inline text that must read as clickable (links in prose, body copy). **Do not** use for filled buttons, block backgrounds, or broad UI chrome (`--color-interactive-text`). |
| Accent (`--color-accent`, `--color-focus-ring`) | `#4fafe6` (see [`index.css`](../../apps/desktop/src/index.css)) | Controls, primary actions, focus rings, and **structured table edit** selection outline / selected-row tint in the vault markdown table widget. |
| `--color-shell-status-error` | `var(--color-error)` | **Foreground** for **`AppStatusBar`** transient **error** chip text (same as `.error-banner` body). |
| `--color-shell-status-error-bg` | `var(--color-error-banner-bg)` | **Background** for the error chip (banner-light pill). |
| `--color-shell-status-error-border` | `var(--color-error-banner-border)` | **Border** for the error chip. |
| `--color-shell-status-info` | `var(--color-text)` | **Foreground** for **`AppStatusBar`** transient **info** chip text (same as `.info-banner` body). |
| `--color-shell-status-info-bg` | Same mix as `.info-banner` background (see [`index.css`](../../apps/desktop/src/index.css)) | **Background** for the info chip. |
| `--color-shell-status-info-border` | Same mix as `.info-banner` bottom border (see [`index.css`](../../apps/desktop/src/index.css)) | **Border** for the info chip. |

## Do not

- Do **not** use `interactiveText` for primary/secondary buttons or icon buttons; keep the existing accent / neutral button system.
- Do **not** use `interactiveText` for Eskerra structured table **widget** chrome (rail actions, in-document table mode marks) that should read as selected; use `--color-accent`. Table shell grid cells do not use a separate accent outline; focus uses normal editor styling.
- Do **not** substitute `interactiveText` for semantic states (error, recording, success); those keep semantic tokens.

## Implementation

Desktop maps these to CSS custom properties in [`apps/desktop/src/index.css`](../../apps/desktop/src/index.css): `--color-app-chrome-backdrop`, `--color-brand-bg`, `--color-brand-surface-bright`, `--color-interactive-text`, etc.

**Shell layout (main window):** `.app-root` is transparent; the **chrome gradient** is `AppChromeBackground`. Gutter areas use transparency so the gradient shows **between** near-white **panels** (`brandSurfaceBright` on `.panel-surface`). `--color-bg` / `--color-brand-bg` remain the **semantic** neutral for color-mix and for UI that is not yet transparent (for example the **settings** window root). The **active** rail tab uses the accent color so it reads as selected.

**Status bar** transient messages render as a **centered pill** (opaque background + border + shadow) using `--color-shell-status-*` tokens so they match **`.error-banner`** / **`.info-banner`** semantics while sitting on the blurred chrome. Do not use bare shell tagline colors for these messages.

# Notebox desktop brand tokens

Product logo files live in [`assets/brand/`](../../assets/brand/) (see that folder’s README).

Normative colors for the **desktop** shell (Tauri). Where these differ from [design-system-calm-editorial.md](design-system-calm-editorial.md), **this document is authoritative for the desktop app** implementation.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `brandBackground` | `#f2f2f2` | Default app shell and gutters between panels (`--color-bg`, `--color-brand-bg`). Soft gray so white panels read as cards on the canvas. |
| `brandSurfaceBright` | `rgb(250, 250, 250)` (`#fafafa`) | Primary surfaces for resizable panels, editors, and modal bodies (`--color-surface`, capture/consume panel tokens, `--color-editor-bg`). Near-white so panels read slightly softer than pure white on the gray shell. |
| `interactiveText` | `rgb(203, 77, 73)` | **Only** inline text that must read as clickable (links in prose, body copy). **Do not** use for filled buttons, block backgrounds, or broad UI chrome (`--color-interactive-text`). |
| Accent (`--color-accent`, `--color-focus-ring`) | `#4fafe6` (see [`index.css`](../../apps/desktop/src/index.css)) | Controls, primary actions, focus rings, and **structured table edit** selection outline / selected-row tint in the vault markdown table widget. |

## Do not

- Do **not** use `interactiveText` for primary/secondary buttons or icon buttons; keep the existing accent / neutral button system.
- Do **not** use `interactiveText` for Eskerra table **active cell** outline or table-mode focus chrome in the editor; use `--color-accent`.
- Do **not** substitute `interactiveText` for semantic states (error, recording, success); those keep semantic tokens.

## Implementation

Desktop maps these to CSS custom properties in [`apps/desktop/src/index.css`](../../apps/desktop/src/index.css): `--color-brand-bg`, `--color-brand-surface-bright`, `--color-interactive-text`.

**Shell layout:** The primary window background (`.app-root`, `.app-body`, `.main-stage`, and the rail strip) uses **`brandBackground`** via `--color-bg` / `--color-brand-bg`. Resizable **panels** use **`brandSurfaceBright`** (and related capture/consume tokens) so they read as near-white regions on the gray shell. The **active** rail tab uses the accent color so it reads as selected.

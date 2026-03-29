# Notebox desktop brand tokens

Product logo files live in [`assets/brand/`](../../assets/brand/) (see that folder’s README).

Normative colors for the **desktop** shell (Tauri). Where these differ from [design-system-calm-editorial.md](design-system-calm-editorial.md), **this document is authoritative for the desktop app** implementation.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `brandBackground` | `rgb(250, 250, 250)` | Default app shell and long-form backgrounds (`--color-bg`, `--color-brand-bg`). |
| `brandSurfaceBright` | `#FFFFFF` | **Only** for elements that must read as elevated or “pressed” against the soft white background—e.g. active rail tab, primary control surfaces that need to pop. **Do not** use as the only large reading surface. |
| `interactiveText` | `rgb(203, 77, 73)` | **Only** inline text that must read as clickable (links in prose, body copy). **Do not** use for filled buttons, block backgrounds, or broad UI chrome (`--color-interactive-text`). |

## Do not

- Do **not** use `interactiveText` for primary/secondary buttons or icon buttons; keep the existing accent / neutral button system.
- Do **not** paint large panels or the main editor with `brandSurfaceBright` only; prefer `brandBackground` or a subtle off-white surface token.
- Do **not** substitute `interactiveText` for semantic states (error, recording, success); those keep semantic tokens.

## Implementation

Desktop maps these to CSS custom properties in [`apps/desktop/src/index.css`](../../apps/desktop/src/index.css): `--color-brand-bg`, `--color-brand-surface-bright`, `--color-interactive-text`.

**Shell layout:** The primary window background (`.app-root`, `.app-body`, `.main-stage`, and the rail strip) uses **`brandBackground`** via `--color-bg` / `--color-brand-bg`. The **active** rail tab uses **`brandSurfaceBright`** so it reads as slightly elevated against that soft white.

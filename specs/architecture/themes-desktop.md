# Desktop themes

## Data

- **Bundled themes** ship in `@eskerra/core` (`BUNDLED_THEMES`, today: `eskerra-default` with dark + light five-color palettes).
- **Vault themes** are JSON files under **`.eskerra/themes/*.json`** (see `listVaultThemes` / `writeVaultTheme` in `@eskerra/core`). Each file has `name`, `light.palette`, and `dark.palette` (1–30 hex `#RRGGBB` strings). The file name stem is the canonical theme `id`.
- **Preference** (`themeId` + `mode`: `light` | `dark` | `auto`):
  - Stored in **R2** as **`theme-preference.json`** when Cloudflare R2 is fully configured for the vault (same transport as `playlist.json`).
  - Otherwise stored in **`.eskerra/settings-shared.json`** under `themePreference` (see `buildEskerraSettingsFromForm` preserving it when R2 fields are incomplete).

## UI

- **Main window:** `ThemeProvider` (wraps `App` in [`apps/desktop/src/App.tsx`](../../apps/desktop/src/App.tsx)) drives `AppChromeBackground`’s palette, sets `document.documentElement.dataset.uiChrome` (`light` | `dark`), `color-scheme`, and runtime CSS variables for chrome anchors.
- **Title bar** (workspace select, editor tab pills, min/close): fixed **dark** and **light** shell colors via [`apps/desktop/src/theme/uiChromeColors.css`](../../apps/desktop/src/theme/uiChromeColors.css) scoped with `html[data-ui-chrome='light'] .window-title-bar` overrides; not editable per theme.
- **Settings:** full-screen **in-app** page with **Sync** and **Themes** tabs ([`SettingsPage.tsx`](../../apps/desktop/src/components/SettingsPage.tsx)). Users can **export** a bundled theme to the vault (name → kebab file name). **Reveal in file manager** is available for vault themes.

## Live reload

Vault theme JSON changes are picked up via the existing **`vault-files-changed`** event when paths touch `.eskerra/themes/` ([`useVaultThemes.ts`](../../apps/desktop/src/theme/useVaultThemes.ts)).

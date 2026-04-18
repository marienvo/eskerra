# Design tokens contract

## Source of truth

- **Colors (calm editorial):** `packages/eskerra-tokens/src/calmEditorial.ts`
- **Desktop brand anchors:** `packages/eskerra-tokens/src/desktopBrand.ts`
- **Vault read-only markdown links (internal red / external blue, light + dark):** `packages/eskerra-tokens/src/vaultReadonlyLinks.ts` — documented in `specs/design/vault-readonly-link-colors.md`; CSS vars `--color-vault-readonly-link-*` in generated `desktop-root.css`
- **Desktop CSS custom properties (`:root`):** generated file `packages/eskerra-tokens/generated/desktop-root.css`, produced by `buildDesktopRootCss()` in `packages/eskerra-tokens/src/generators/buildDesktopRootCss.ts`

## Rules

1. Do **not** hand-edit `generated/desktop-root.css`. Change TS sources and run `npm run generate -w @eskerra/tokens`.
2. The desktop app loads tokens via `import '@eskerra/tokens/desktop-root.css'` in `apps/desktop/src/main.tsx` (before `index.css`).
3. **Drift:** `npm run check:generated -w @eskerra/tokens` must pass in CI (`npm test` at repo root includes it).
4. **Mobile accent:** `apps/mobile/src/core/ui/accentColor.ts` imports `calmEditorial.accent` from `@eskerra/tokens` so mobile stays aligned with the spec table.

## RN colors

- `packages/eskerra-tokens/src/rnColors.ts` exports `rnColors` for `StyleSheet`-based usage in RN apps and `@eskerra/ds-mobile`.

# Design system architecture (binding)

This document is the normative architecture for Eskerra’s design tokens, desktop DOM design system, mobile RN design system, and Storybook runtimes. Implementation must follow it unless a task explicitly supersedes it.

## Packages and Storybook runtimes

- **`@eskerra/tokens`** (`packages/eskerra-tokens`) — TypeScript source of truth for calm editorial colors, desktop brand anchors, vault read-only markdown link pairs (`vaultReadonlyLinks.ts`; see `specs/design/vault-readonly-link-colors.md`), RN color exports, and **generated** `generated/desktop-root.css`. Run `npm run generate -w @eskerra/tokens` after changing token TS; CI runs `npm run check:generated -w @eskerra/tokens`.
- **`@eskerra/ds-desktop`** (`packages/eskerra-ds-desktop`) — Narrow DOM primitives (Surface, Text, Divider, IconGlyph, Button, …). **Not** shell chrome (rail tabs, pane headers, splits, toolbars).
- **`@eskerra/ds-mobile`** (`packages/eskerra-ds-mobile`) — RN primitives for Android; shares **one story file set** between on-device and RN-Web Storybook only.

### Three Storybook runtimes (not “two Storybooks”)

All three runtimes use **Storybook 10.x** (aligned on the `10.3.x` line; `@storybook/react-native` may trail patch behind web packages).

1. **Desktop web Storybook** — `@storybook/react-vite`, only for `eskerra-ds-desktop`. Own story files under that package.
2. **Mobile on-device Storybook** — `@storybook/react-native`, Android truth for gestures, Reanimated, keyboard, lists, TrackPlayer, etc.
3. **Mobile RN-Web Storybook** — `@storybook/react-native-web-vite` (official framework; **no** hand-rolled `react-native` → `react-native-web` Vite alias), same mobile story files as on-device; docs/review + fast CI.

**Story sharing:** only **mobile** on-device and mobile RN-Web share stories. **Desktop does not share story files with mobile** — shared are CSF3 conventions and `@eskerra/tokens` values only.

**Forbidden:** `react-native-web` inside the Tauri desktop app.

## Layering

| Layer | Location | Stories |
| --- | --- | --- |
| L1 Tokens | `packages/eskerra-tokens` | Reference stories allowed |
| L2 DS | `packages/eskerra-ds-desktop`, `packages/eskerra-ds-mobile` | Contract + reference (see rules) |
| L3 Product | `apps/desktop/src/shell`, `apps/mobile/src/features` | Default none; optional **sandbox** stories under `__sandbox__/` |

## L3 sandbox stories (narrow exception)

- Path: `apps/*/src/**/__sandbox__/*.stories.tsx`
- Not part of DS API; no mandatory `play`; not published on the official docs site.
- Must not push product-only props into L2 to “make stories easier”.

## Verification gates (summary)

- **PR-gated:** types, lint, unit tests, token drift (`check:generated`), CSF compiles.
- **Merge-gated:** Storybook test-runner + a11y on **desktop web** and **mobile RN-Web**; `npm test` green.
- **Release-gated:** mobile **on-device** Storybook / QA checklist for touched DS; designer sign-off; APK smoke.
- **RN-Web green ≠ Android ship** — native validation is release-gated, not merge-gated.

## Gluestack (mobile)

Policy lives in the implementation plan and `.cursor/rules/design-system.mdc`: direct Gluestack in `apps/mobile/src/features/**` only where no DS primitive exists; token-bearing controls must live in `@eskerra/ds-mobile`; no Gluestack in DS package; thin migration wrappers at most one release cycle.

## Related specs

- `specs/design/design-system-calm-editorial.md` — calm editorial token table
- `specs/design/brand-tokens-desktop.md` — desktop shell brand overrides
- `specs/design/design-tokens-contract.md` — generator contract (if present)

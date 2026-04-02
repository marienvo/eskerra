# Desktop import boundaries (enforcement plan)

Goal: make **layer violations detectable** over time—without blocking day-one velocity. Ratchet strictness upward.

**Not in scope yet:** automated enforcement is optional until Phase 1+ in [plugin-readiness-masterplan.md](../plans/plugin-readiness-masterplan.md).

## Zones

| Zone | Path glob | May import |
|------|-----------|------------|
| `core` | `packages/notebox-core/src/**` | TypeScript stdlib; small pure dependencies only |
| `desktop-lib` | `apps/desktop/src/lib/**` | `@notebox/core`, npm; **may** use `@tauri-apps/*` where needed |
| `desktop-editor` | `apps/desktop/src/editor/**` | `@notebox/core`, React, CodeMirror packages |
| `desktop-ui` | `apps/desktop/src/components/**`, `apps/desktop/src/hooks/**` | `@notebox/core`, `lib`, React |

## Forbidden edges (target state)

1. `desktop-editor` → `@tauri-apps/*` **forbidden** (inject adapters from `desktop-lib` or props).
2. `core` → `react`, `react-native`, `@tauri-apps/*` **forbidden**.
3. Prefer `desktop-editor` → `desktop-lib` over `desktop-editor` → deep `components` imports for side effects.

## Policy owners (conceptual)

| Concern | Owner (conceptual) |
|---------|---------------------|
| Markdown image `src` → preview-safe URL | `lib/` (for example resolver module); editor consumes a **function type** only |
| Attachment bytes and paths under `Assets/Attachments` | `lib/` (vault attachment helpers) |
| Note open/save and hydrate orchestration | `hooks/` + `lib/` (target: not `App.tsx` forever, not editor) |

## Rollout

1. Use the PR checklist for risky PRs.
2. **Active:** ESLint `no-restricted-imports` for `@tauri-apps/*` under `apps/desktop/src/editor/**` ([`eslint.config.js`](../../apps/desktop/eslint.config.js) — landed with Phase 1 attachment host).
3. Expand path-based `eslint-plugin-import` boundaries when churn allows.

## Non-goals

Perfect layering in one PR. Prefer **small fixes + ratchet**.

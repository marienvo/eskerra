# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from repo root (npm workspaces — deps are hoisted):

```bash
npm install                          # install all workspace deps
npm test                             # run all tests (Vitest + Jest + scripts)
npm run lint                         # ESLint for mobile + desktop
npm run desktop                      # start Tauri dev (Vite + native window)
npm run mobile                       # start Metro for Android dev
npm run mobile:android               # build + run on device/emulator
npm run desktop:build                # semver bump + production RPM build
npm run storybook:desktop            # desktop DS Storybook (port 6006)
npm run test:storybook-web           # Playwright tests against RN-Web Storybook
```

Per-workspace (use `-w <name>`):

```bash
npm run apk -w mobile                # debug APK
npm run apk-release -w mobile        # release APK
npm run desktop:dev -w @eskerra/ds-desktop   # desktop DS dev server
```

Run a single Vitest test file:

```bash
npx vitest run packages/eskerra-core/src/some.test.ts
npx vitest run apps/desktop/src/some.test.ts
```

Run a single Jest test (mobile):

```bash
cd apps/mobile && npx jest src/path/to/test.test.ts
```

## Architecture

**Eskerra** is a Markdown notes + podcast companion. The vault is a user-selected directory shared across devices (e.g., via Syncthing); optional Cloudflare R2 provides playlist cloud backup. No backend, no sync service.

**Vault layout:**
- `Inbox/` — user `.md` notes (source of truth from directory listing)
- `General/` — podcast feeds (`YYYY [Label] - podcasts.md`) and episode cache (`📻 [Title].md`)
- `.eskerra/settings-shared.json` — vault-scoped settings, synced across devices
- `.eskerra/settings-local.json` — per-device identity, not synced
- `.eskerra/playlist.json` — playback state; R2 is authoritative when configured

**Two apps, one vault contract:**

| | Mobile (`apps/mobile/`) | Desktop (`apps/desktop/`) |
|---|---|---|
| Framework | React Native (Android only, iOS never) | Tauri 2 + Vite + React |
| File access | Android SAF via `react-native-saf-x` | Direct POSIX via Tauri Rust commands |
| Search | SQLite FTS5 (Kotlin) | Tantivy (Rust) |
| Audio | `react-native-track-player` | `HTMLAudioElement` + MPRIS (Linux) |
| Editor | — | CodeMirror 6 |

**Monorepo packages:**
- `packages/eskerra-core/` — shared TypeScript vault types, `VaultFilesystem` interface, settings parsing (no React)
- `packages/eskerra-tokens/` — design token generator (no React; generates CSS)
- `packages/eskerra-ds-desktop/` — desktop design system primitives (L2; no business logic)
- `packages/eskerra-ds-mobile/` — mobile design system via Gluestack (L2; no business logic)

**Layer model:**
- **L1** (`@eskerra/tokens`): values and generators only
- **L2** (`@eskerra/ds-desktop`, `@eskerra/ds-mobile`): product-agnostic primitives (Surface, Text, Button…)
- **L3** (`apps/*/src/`): product features that compose L2 components

Both apps implement the `VaultFilesystem` interface from `@eskerra/core`, so feature code is platform-agnostic.

## Key invariants

**Startup performance:** First screen render is the sacred path. Defer all vault scans, feed refreshes, markdown parsing, and indexing until after first render. Use last-known cached state for first paint, then refresh in background. Nothing expensive runs on startup.

**CodeMirror layout (desktop editor):** Use `padding`, not `margin`, for vertical spacing inside editor containers. CodeMirror's height map breaks with margin-based layouts.

**Note body cache (desktop):** `inboxContentByUri` must stay in sync with disk at all times. Heal the cache on note switch if disk and cache diverge. Never persist stale content.

**Playlist merge (multi-device):** Higher `controlRevision` wins. If tied, higher `updatedAt` wins. If tied, remote wins. R2 is authoritative; `.eskerra/playlist.json` is the offline fallback.

**Kotlin on mobile:** Only use Kotlin when there is a measurable Android API/SAF benefit, heavy file I/O, or a proven TypeScript bottleneck. Default to TypeScript.

**Testing:** Failing tests are blockers. Match testing tools to language: Vitest for TypeScript/desktop, Jest for React Native, Playwright for Storybook. The `vitest.setup.ts` harness in `apps/desktop/` isolates Tauri imports — follow the existing pattern for new desktop tests.

**Releases:** Semver is canonical in `apps/mobile/package.json`. The bump script (`scripts/bump-release-version.mjs`) syncs desktop Vite splash, Tauri config, `Cargo.toml`, and `metainfo.xml`. CI checks alignment.

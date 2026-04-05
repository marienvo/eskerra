# Extension readiness: boundaries and ownership

This document keeps the codebase **internally extensible** without building a plugin host. **Community extensions** are a possible future outcome, not a present design driver—decisions here favor **maintainable seams for first-party modules** and a **tight shell**.

Authoritative stacks and mobile constraints elsewhere: [app-architecture.md](./app-architecture.md), [stack-and-constraints.md](./stack-and-constraints.md), [platform-targets.md](./platform-targets.md).

Follow-on work is tracked in [desktop-shell-wiki-backlog.md](../plans/desktop-shell-wiki-backlog.md).

## Product core

- **Source of truth:** plain `.md` files in the vault, legible outside the app.
- **Foundation:** filesystem layout and naming ([`packages/notebox-core`](../../packages/notebox-core) vault layout helpers).
- **Git:** optional; not required for correctness.

## Invariants

1. **Markdown in the vault stays plain** and user-legible; no proprietary note container as primary storage.
2. **No silent Markdown rewriting**—only explicit user actions or explicit, documented user settings.
3. **No writes outside the vault** except **app-owned stores** (for example desktop Tauri store) and explicit user-directed picks.
4. **No arbitrary native access** from feature code—platform calls sit behind **adapters** in the app shell (`apps/desktop/src/lib/` and kin).
5. **UI changes are regional**—features land in owned panes/routes; no global UI injection surface.
6. **Keybindings:** no ad hoc global shortcuts that bypass a future central policy when that exists.
7. **Background work:** avoid silent perpetual processors unless justified as core; prefer explicit triggers and deferred work after first paint (see `.cursor/rules/performance.mdc`).
8. **Do not let ad hoc features own sync or global state models**—when sync exists, it gets a single owner.
9. **`.notebox` stays intentional** (see below)—not a cache for ephemeral UI or runtime session.

## `.notebox` and vault clutter

**Allowed in `.notebox` and co-located vault metadata files**

- **Durable, small, vault-scoped artifacts** the user can reason about: shared/local settings, device identity needed for shared files, playlist or index files that are **defined product behavior**, migration helpers tied to vault layout.
- Content should remain **inspectable** (JSON/Markdown/text) where practical.

**Not allowed**

- **Ephemeral runtime state**: open tabs, pane sizes, last focus, command palette history, recent files lists, UI session snapshots, caches rebuildable from filesystem scans.
- **High-churn scratch or logs** used only to optimize UI.
- **“We might need this later” blobs** without a named owner and retention rule.

**Rule of thumb:** if losing it is annoying but not destructive, it belongs in **app storage** (for example `notebox-desktop.json`), not `.notebox`.

## Settings vs runtime state

| Kind | Examples | Storage |
|------|-----------|---------|
| Settings | theme, keybindings, pointer to vault root | app settings and/or `.notebox` per existing product rules |
| Runtime | tabs, splits, selection, playback progress signals tied to UI session, catalog refresh hints | **app store** unless the product explicitly defines vault-backed runtime (document that exception) |

## Layer model (desktop)

### `packages/notebox-core`

**Owns:** vault path algebra, `VaultFilesystem` typing, portable Markdown/Crypto-agnostic helpers, attachment naming rules, playlist entry **pure** logic, small parsers.

**Must not:** depend on React, React Native, or Tauri.

### `apps/desktop/src/lib/` — platform and services

**Owns:** Tauri adapter for `VaultFilesystem`, OS path helpers, webview-safe media URLs, vault **operations** (read/write notes, bootstrap layout), podcast/R2 glue tied to desktop.

**[`vaultBootstrap.ts`](../../apps/desktop/src/lib/vaultBootstrap.ts) today:** a **convenient orchestration bundle** for MVP. It is **not** the long-term default place to add new cross-cutting behavior. As capabilities grow, **split ownership** by concern (vault lifecycle, inbox notes, playlist sync, R2, migrations) with thin entry points—avoid turning this file into a permanent god module.

### `apps/desktop/src/editor/` — editing surface

**Owns:** CodeMirror setup, selection, editing gestures, decorations driven by **document text** (wiki highlight, image line widgets).

**Must not own:** broad vault orchestration, playlist policy, or unconstrained filesystem walks. Side effects from editing should be **user-gesture-driven** and wired through **shell-owned services** (see [desktop-shell-wiki-backlog.md](../plans/desktop-shell-wiki-backlog.md)).

### `apps/desktop/src/components/` and `hooks/`

**Owns:** composition and binding UI to services.

**Avoid:** embedding vault policy that belongs in `lib/` or core.

## Legitimate internal extension seams (now)

- **Adapters:** `VaultFilesystem`, audio player, future search/sync transports—**one owning module** each.
- **Indexing seam (when justified):** a shell-owned link/indexing seam may be introduced for scale-sensitive mechanics (discovery, batched reads, invalidation, optional runtime caching), but only when benchmark gates show the TypeScript-first path is insufficient.
- **Command registration (future):** when a command palette ships, a **single registrar** in the shell enumerates actions; features do not bind keys in isolation. Keep default chords documented in [desktop-keybindings-inventory.md](./desktop-keybindings-inventory.md); extend that inventory whenever registrar-backed shortcuts change.

### `VaultFilesystem` vs indexing seam

- `VaultFilesystem` stays the **primitive file API** (exists/read/write/list/mkdir/unlink).
- A future indexing seam is **not** required by default; it is an optional boundary for high-scale mechanics if measured need appears.
- Business rules do not move into native implementations:
  - parsing/normalization/link identity
  - ambiguity handling
  - rewrite policy
  - any user-visible “what should happen” decisions
- If native acceleration is introduced behind the seam, it remains replaceable and mechanics-only.

### Runtime-first storage posture

- Default assumption: link/index state is runtime or app-owned cache.
- Durable `.notebox` index artifacts are allowed only when explicitly productized with named ownership, retention, and user-facing behavior.
- Do not add durable vault artifacts “just in case” a later feature might need them.

Explicitly **out of scope until needed:** third-party plugin manifests, dynamic loading, sandboxing, alternate pluggable editors.

## Review

Use [extension-readiness-pr.md](../review-checklists/extension-readiness-pr.md) and [desktop-import-boundaries.md](../rules/desktop-import-boundaries.md) in PRs that touch vault, editor, or shell orchestration.

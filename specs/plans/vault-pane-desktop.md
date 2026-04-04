# Plan: Log → Vault pane (desktop)

**Status:** planned. **Scope:** [apps/desktop](../../apps/desktop), [apps/desktop/src-tauri](../../apps/desktop/src-tauri), [packages/notebox-core](../../packages/notebox-core). Android out of scope.

## Rule (non-negotiable)

The tree is **lazy and expansion-driven**; the **wiki reference index** is **vault-wide and asynchronous**. These are **separate models** with **separate performance constraints**. Do not use the wiki index to drive tree expansion, and do not walk the vault from the tree to serve wiki resolve. Do not mix them.

## Responsibilities

| Layer | Role |
|--------|------|
| **Core** | Name filters, excluded dir names (`Assets`, `Scripts`, `Templates`), pruning predicates, optional `subtreeHasVisibleMarkdown` cache **keying** and invalidation contract (pure rules + unit tests). |
| **FS / Tauri** | `listFiles`, `renameFile`, `removeTree` (recursive delete under vault); keep paths inside vault root. |
| **Tree UI** | On expand: `listFiles` → apply core filters → decide visible children using **memoized** subtree visibility (see pruning). Rows: folders (`folder`) and `.md` files (`article`). headless-tree + `@tanstack/react-virtual` + Radix context menu. **No** wiki index on expand. |
| **Wiki index** | Async build/update of `vaultMarkdownRefs` (flat `{ name, uri }[]` for eligible `.md` paths). Feeds resolve, autocomplete, resolved styling only. **Must not block** first paint or tree interaction; UI may show stale resolve until index catches up. |
| **Editor / workspace** | Lazy `contentByUri` (load on open + autosave path only). **No** full-vault body prefetch. |

## Visibility and pruning (core)

- Ignore entries whose **name** starts with `.` or `_` (files and directories).
- Recurse the same rules under each visible directory.
- Hard-exclude directories named **`Assets`**, **`Scripts`**, **`Templates`** (match product naming; Linux: case-sensitive).
- **Prune:** hide a subdirectory if its subtree contains **no** eligible `.md` **unless** the directory is **empty** after filters (empty dir stays visible).
- **Memoization:** `subtreeHasVisibleMarkdown(dirUri)` (or equivalent) is **cached per directory path**. **Invalidate** the cache for `dirUri` and any **ancestor** paths up to vault root on **create / delete / move / rename** of any path that can change subtree membership (files or folders). External `vault-files-changed`: conservative invalidation (e.g. clear all or ancestor set from event payload if available).
- **Expand path:** avoid **deep blocking DFS** on the UI thread. Prefer shallow work plus cache; **eventual correctness** after invalidation refresh is acceptable (e.g. placeholder folder visibility until background memo fill completes).

## Wiki links

- **Stem-based only** (filename stem, existing `[[target]]` / `[[target|label]]` rules). **No** path-based `[[...]]` syntax in this plan.
- Feed `resolveInboxWikiLinkTarget` / navigation with refs from **`vaultMarkdownRefs`** (async index), not from tree state.
- **Create** new note for unresolved link: parent directory = parent of **active note**, else **Inbox**. Reuse existing inbox **filename/title sanitization**; persist with `writeFile` under that parent (refactor shared helper from [vaultBootstrap](../../apps/desktop/src/lib/vaultBootstrap.ts) as needed—no second naming system).
- **File rename** (`.md` only): keep **existing** stem-based wiki link rewrite maintenance ([planInboxWikiLinkRenameMaintenance](../../apps/desktop/src/lib/inboxWikiLinkRenameMaintenance.ts)).
- **Folder rename / move (no stem change):** **do not** run wiki link rewrites.

## CRUD

- Generalize [deleteInboxMarkdownNote](../../apps/desktop/src/lib/vaultBootstrap.ts) / [renameInboxMarkdownNote](../../apps/desktop/src/lib/vaultBootstrap.ts) to vault-scoped markdown under root (same conflict rules).
- Add Tauri **`remove_tree`** (or equivalent) + [VaultFilesystem](../../packages/notebox-core/src/vaultFilesystem.ts) `removeTree`; folder delete in UI uses this.
- **Replace** today’s `refreshNotes` pattern that prefetches **all** inbox bodies ([useMainWindowWorkspace.ts](../../apps/desktop/src/hooks/useMainWindowWorkspace.ts)); use lazy `contentByUri` + async `vaultMarkdownRefs` only.

## Backlinks

**Out of scope** for this plan. Do **not** design, spec, or implement vault-wide backlinks here. When needed, author a **new** plan under `specs/plans/` (separate file). Until then, ship Vault without extending backlinks behavior.

## Selection, drag-and-drop, bulk (sequential phases)

Do **not** implement multi-select and DnD in the same phase.

1. **Phase A — Single-item drag-and-drop:** move one file or one folder via DnD; collision checks; `renameFile`; invalidate prune cache + refresh tree + kick wiki index refresh if required by contract.
2. **Phase B — Multi-select:** range/modifier selection only; **no** bulk actions required in this phase beyond visual selection if already needed for Phase C prep (minimal).
3. **Phase C — Bulk operations:** delete/move selected items; explicit confirmations; safe ordering (e.g. deepest paths first for deletes); **no** new architecture beyond reused CRUD + invalidation.

## Phases (implementation order)

**Phase 1 — Core + FS + workspace shell**

- Core filters, pruning helpers, memo/invalidation contract + tests.
- `removeTree` + typed FS surface.
- Generalized markdown delete/rename; lazy `contentByUri`; stop full-list body prefetch.
- Async `vaultMarkdownRefs` builder (background, cancellable per vault); **does not block** UI.

**Phase 2 — Vault tree UI**

- Rename chrome Log → Vault ([RailNav.tsx](../../apps/desktop/src/components/RailNav.tsx), [InboxTab.tsx](../../apps/desktop/src/components/InboxTab.tsx)).
- Lazy tree (expand loads children only), virtualization, context menu (open / rename / delete), single selection.
- Prune cache wired; invalidation on mutations and session rules above.

**Phase 3 — Wiki index integration**

- Navigation + autocomplete + resolved highlighting consume `vaultMarkdownRefs` only.
- Remove “Inbox-only wiki” user messaging where obsolete; stem policy unchanged.

**Phase 4 — Phase A (single-item DnD)**

- As in “Selection, drag-and-drop…”, Phase A only.

**Phase 5 — Phase B (multi-select)**, then **Phase 6 — Phase C (bulk ops)**

- As above; minimal UI, safe defaults.

**Phase 7 — Docs**

- Update [desktop-shell-patterns.md](../design/desktop-shell-patterns.md) and [desktop-editor.md](../architecture/desktop-editor.md) for Vault pane, two-model rule, wiki stem-only.

## Tests and quality

- Core: filter + pruning + cache invalidation unit tests.
- Desktop: mocked `VaultFilesystem` for tree load and CRUD; wiki navigation against mocked async index.
- `npm run lint -w @notebox/desktop`, `npm run test -w @notebox/desktop` before merge.

## Checklist

- [ ] Phase 1: core + `removeTree` + CRUD + lazy content + async `vaultMarkdownRefs`
- [ ] Phase 2: Vault tree UI (lazy, virtual, context menu, single select, prune cache)
- [ ] Phase 3: wiki wired to index only; stem-only; file rename rewrite only; no folder-move rewrites
- [ ] Phase 4: single-item DnD
- [ ] Phase 5: multi-select
- [ ] Phase 6: bulk operations
- [ ] Phase 7: desktop specs updated
- [ ] Backlinks: separate plan when started; **not** part of this checklist

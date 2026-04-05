# Desktop Vault: recommended follow-up work

**Purpose:** Track implementation and hygiene items that remain **after** Vault-tab docs landed in [desktop-shell-patterns.md](../design/desktop-shell-patterns.md) and [desktop-editor.md](../architecture/desktop-editor.md). This replaces scattered notes from the retired vault-pane rollout checklist.

**Scope:** `apps/desktop`, `packages/eskerra-core`. Android out of scope.

---

## 1. Tree pruning (high value, spec gap vs intended behavior)

**Issue:** `loadVaultTreeVisibleChildRows` ([`apps/desktop/src/lib/vaultTreeLoadChildren.ts`](../../apps/desktop/src/lib/vaultTreeLoadChildren.ts)) applies `filterVaultTreeDirEntries` only. It does **not** call [`shouldPruneVaultTreeSubdirectory`](../../packages/eskerra-core/src/vaultVisibility.ts) or [`vaultSubtreeHasEligibleMarkdown`](../../packages/eskerra-core/src/vaultMarkdownSubtree.ts).

**Evidence:** [`SubtreeMarkdownPresenceCache`](../../packages/eskerra-core/src/vaultVisibility.ts) is invalidated in [`useMainWindowWorkspace`](../../apps/desktop/src/hooks/useMainWindowWorkspace.ts) but is **not** passed into [`VaultPaneTree`](../../apps/desktop/src/components/VaultPaneTree.tsx) or the loader.

**Goal:** Hide a subdirectory when it is non-empty after filters but its subtree contains no eligible `.md`, except keep empty directories visible (see helpers in `@eskerra/core`).

**Approach sketch:** Thread `SubtreeMarkdownPresenceCache` (or a stable ref) from `useMainWindowWorkspace` → `InboxTab` → `VaultPaneTree` → `loadVaultTreeVisibleChildRows` (or a wrapper), using `vaultSubtreeHasEligibleMarkdown` with abort/signal as needed. Add/extend tests with a mocked `VaultFilesystem`.

**Doc touch-up after:** Optionally mention pruning behavior explicitly in [desktop-shell-patterns.md](../design/desktop-shell-patterns.md) if not already implied.

---

## 2. Backlinks panel vs vault-wide notes

**Issue:** [`selectedNoteBacklinkUris`](../../apps/desktop/src/hooks/useMainWindowWorkspace.ts) feeds [`listInboxWikiLinkBacklinkReferrersForTarget`](../../apps/desktop/src/lib/inboxWikiLinkBacklinkIndex.ts) with `notes` from [`listInboxNotes`](../../apps/desktop/src/lib/vaultBootstrap.ts) (Inbox folder only). Referrers **outside** `Inbox/` do not appear in the backlinks list even when they link to the open note.

**Decision needed:** Either accept Inbox-scoped backlinks as intentional MVP, or extend the source set (for example all `vaultMarkdownRefs` with lazy body loads, or a dedicated indexer). Vault-wide backlinks were explicitly **out of scope** in the original vault-pane plan; treat this as a product/architecture choice before coding.

---

## 3. Cursor rule alignment (Vault tab wording)

**Issue:** [`.cursor/rules/desktop-ui.mdc`](../../.cursor/rules/desktop-ui.mdc) still says “Main **Inbox** and **Podcasts** horizontal splits.” The Vault tab is the primary label in the shell; layout persistence still uses the `inbox` key in `layoutPanelsV4` (see shell patterns spec).

**Goal:** One short clarification in the rule file so assistants match current UI terminology without breaking the `layoutStore` constraint.

---

## 4. Code hygiene: stale identifier name

**Issue:** `inboxBodyPrefetchGenRef` in [`useMainWindowWorkspace`](../../apps/desktop/src/hooks/useMainWindowWorkspace.ts) names a generation guard for note list refresh; full vault body prefetch is **not** what it does anymore.

**Goal:** Rename (for example `inboxNoteListRefreshGenRef`) and adjust call sites only; no behavior change.

---

## 5. Document hard-excluded tree directory names

**Issue:** [`VAULT_TREE_HARD_EXCLUDED_DIRECTORY_NAMES`](../../packages/eskerra-core/src/vaultVisibility.ts) includes product folders (e.g. `Assets`, `Scripts`, `Templates`, `Excalidraw`). Only some of these are spelled out in user-facing architecture docs.

**Goal:** Add a single sentence or table row in [desktop-shell-patterns.md](../design/desktop-shell-patterns.md) (or [desktop-editor.md](../architecture/desktop-editor.md) if tree rules fit better there) listing **authoritative** excluded names so behavior is not “code-only.”

---

## 6. Backlog doc cross-reference (minor)

**Issue:** [desktop-shell-wiki-backlog.md](desktop-shell-wiki-backlog.md) line referencing [desktop-editor.md](../architecture/desktop-editor.md) still says “inbox editor behavior”; the editor spec title and scope are now **Vault**-oriented.

**Goal:** Update that one authoritative line to “Vault editor” (or equivalent) on the next edit pass to the backlog.

---

## Suggested order

1. Rule file + backlog line (quick consistency).
2. Rename `inboxBodyPrefetchGenRef`.
3. Tree pruning (largest behavior change; needs tests).
4. Excluded-dir doc line.
5. Backlinks: product decision, then implementation if approved.

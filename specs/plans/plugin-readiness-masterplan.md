# Plugin-readiness masterplan (post–Phase 0)

**Status:** Phase 0 is documentation only ([extension-readiness.md](../architecture/extension-readiness.md), checklist, import-boundary rules). **No code refactors** are part of Phase 0.

**Design target:** **internal extensibility**—first-party modules and clear seams. **Community extensions** are an imaginable future; they are **not** a driver for near-term work. Do **not** build a plugin API or host until product need is explicit.

---

## Phase 1 — Attachment and clipboard seam

**Status (implemented):** [`noteInboxAttachmentHost.ts`](../../apps/desktop/src/lib/noteInboxAttachmentHost.ts) defines `NoteInboxAttachmentHost` + `createNoteInboxAttachmentHost()`; [`InboxTab.tsx`](../../apps/desktop/src/components/InboxTab.tsx) constructs it with `useMemo` and passes `attachmentHost` into [`NoteMarkdownEditor.tsx`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx). ESLint `no-restricted-imports` blocks `@tauri-apps/*` under `apps/desktop/src/editor/` ([`eslint.config.js`](../../apps/desktop/eslint.config.js)).

**Goal:** The editor is a **text surface**; vault writes and Tauri clipboard/drag-drop live behind shell-owned adapters.

**Remaining / later:** Preview widgets still use [`resolveVaultImagePreviewUrl`](../../apps/desktop/src/lib/resolveVaultImagePreviewUrl.ts) via CodeMirror (Phase 2).

**Acceptance:** Editor does not import `@tauri-apps/*`; manual smoke on paste, drop, save, and OS file drop.

**Risks:** Clipboard edge cases; regressions caught by manual smoke.

**Defer:** A full DI framework.

---

## Phase 2 — Media preview URL owner

**Status (implemented):** [`vaultImagePreviewTypes.ts`](../../apps/desktop/src/editor/noteEditor/vaultImagePreviewTypes.ts) defines `VaultImagePreviewUrlResolver`; [`vaultImagePreviewCodemirror.ts`](../../apps/desktop/src/editor/noteEditor/vaultImagePreviewCodemirror.ts) takes `resolvePreviewUrl` on refs and does **not** import `lib/`. [`InboxTab.tsx`](../../apps/desktop/src/components/InboxTab.tsx) passes [`resolveVaultImagePreviewUrl`](../../apps/desktop/src/lib/resolveVaultImagePreviewUrl.ts) into [`NoteMarkdownEditor`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx). Tauri `convertFileSrc` stays in `lib/` only.

**Goal:** One owner converts Markdown image references to **webview-safe** preview URLs; the editor depends only on a **function type**.

**Acceptance:** No `resolveVaultImagePreviewUrl` / `@tauri-apps/*` imports under `editor/` for image preview (ESLint already blocks `@tauri-apps/*` in `editor/`).

---

## Phase 3 — Inbox refresh vs playlist invalidation

**Status (implemented):** [`App.tsx`](../../apps/desktop/src/App.tsx) no longer bumps playlist revision inside `refreshNotes`. The local state is now named `playlistDiskRevision` to make ownership explicit. Increment sources are playlist-relevant only: `useDesktopPodcastPlayback` (`onPlaylistDiskUpdated`) and remote playlist polling (`onRemotePlaylistChanged`).

**Goal:** Inbox filesystem refresh must not **implicitly** reload podcast playlist state unless playlist-relevant data changed.

**Acceptance:** Listing/prefetching inbox does not bump playlist reload generation by default.

**Known tradeoff:** generic `vault-files-changed` has no file-path payload, so external edits to `.notebox/playlist.json` by other tools are not singled out here; keep for a later targeted watcher/event payload improvement if needed.

---

## Phase 4 — Workspace orchestration extraction

**Goal:** Shrink [`App.tsx`](../../apps/desktop/src/App.tsx)—vault hydrate, FS watch, note open/save/new, transient images—into a dedicated hook or small module set.

**Why:** Future command palette and features attach to a stable integration layer, not an ever-growing root component.

**Scope:** Incremental extraction (for example `useMainWindowWorkspace`); keep UI tree readable.

**Acceptance:** Agreed team bar: new business logic avoids `App.tsx` unless reviewed with checklist.

**Defer:** Full router architecture rewrite.

---

## Phase 5 — Command palette and command ownership

**Goal:** Named actions and default bindings live in **one registrar** when the palette ships.

**Why:** Prevents keybinding hijacks and scattered shortcuts.

**Scope:** Minimal registry; migrate a handful of actions first.

**Acceptance:** Palette actions enumerated in one module; editor does not register global keys silently.

**Defer:** Third-party command contributions.

---

## Phase 6 — Wiki resolution and indexing owner

**Status (6A—desktop inbox MVP + keyboard parity):**
- Core inbox-only wiki-link resolver in [`wikiLinkInbox.ts`](../../packages/notebox-core/src/wikiLinkInbox.ts) with explicit `ambiguous` result.
- Shell-owned open/create flow in [`inboxWikiLinkNavigation.ts`](../../apps/desktop/src/lib/inboxWikiLinkNavigation.ts), reusing existing inbox creation policy (`buildInboxMarkdownFromCompose` + `createInboxMarkdownNote`).
- Editor in [`NoteMarkdownEditor.tsx`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx): click and **`Mod-Enter`** (Ctrl+Enter / Cmd+Enter) activate the wiki link under the caret via the same callback as click; `[` close assist for `[[...]]`; highlights in source.
- Minimal `Inbox/` prefix support only (case-insensitive strip); no broader path semantics.

**Goal:** Wiki links move from syntax-only to resolvable paths with a **single index owner**; editor asks a service, does not walk the vault.

**Why:** Avoid ownership spread across editor, inbox, and ad hoc FS scans.

**Scope:** Incremental read-only index, debounced rebuild, off startup critical path per performance rules.

**Acceptance:** No direct vault directory walks for wiki targets inside `editor/`.

**Still deferred after 6A:** backlinks, global indexing framework, fuzzy/ranked matching, ambiguity picker UI, optional mod+click policy, command-palette integration.

**Detailed phased plan (wiki-only):** [wiki-links-phased-roadmap.md](./wiki-links-phased-roadmap.md).

**Defer:** Full-text search product.

---

## Automated lint ratchet (cross-cutting)

After Phase 1 (or in parallel if low conflict):

- ESLint `no-restricted-imports`: block `@tauri-apps/*` from `apps/desktop/src/editor/**`.
- Later: add path-based `import/no-restricted-paths` or `eslint-plugin-boundaries` per [desktop-import-boundaries.md](../rules/desktop-import-boundaries.md).

---

## First implementation step when coding resumes (recommended)

**Phase 1 kickoff:** decouple attachment persistence and Tauri clipboard from `NoteMarkdownEditor` via a small `lib/`-owned adapter and editor props. Highest leverage vs stated smells; enables editor Tauri import ban.

---

## Reference assessment buckets (from planning)

- **Already fine:** `VaultFilesystem` in core; vault layout in core; runtime UI in app store vs Markdown files; wiki highlight-only for V1.
- **Worth adjusting (tracked above):** editor/platform coupling; playlist bump coupling; `App.tsx` size; thick `vaultBootstrap` **split over time**—not grown as default dumping ground.
- **Explicitly wait:** plugin manifests, global event bus, Zustand/Redux big bang, unified search service until a milestone commits to it.

---

## Document index

| Doc | Role |
|-----|------|
| [extension-readiness.md](../architecture/extension-readiness.md) | Principles, `.notebox` rules, layers |
| [extension-readiness-pr.md](../review-checklists/extension-readiness-pr.md) | PR checklist |
| [desktop-import-boundaries.md](../rules/desktop-import-boundaries.md) | Future ESLint zones |
| [wiki-links-phased-roadmap.md](./wiki-links-phased-roadmap.md) | Wiki links: phases WL-0–WL-6, ownership, ordering |

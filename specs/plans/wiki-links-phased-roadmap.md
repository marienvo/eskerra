# Wiki links: phased roadmap

**Status:** Planning document. **No implementation commitment** beyond what is already landed (see *Current baseline*). Aligns with [extension-readiness.md](../architecture/extension-readiness.md) and [plugin-readiness-masterplan.md](./plugin-readiness-masterplan.md) Phase 6.

**Product context:** Filesystem-first, Markdown-first, desktop-first today; internally extensible **without** a plugin API; performance-sensitive; the editor stays a **text surface** and must not own vault traversal, lifecycle policy, or broad indexing.

---

## Overview

Wiki-style `[[...]]` links are first-class navigation and authoring affordances. Work splits into:

1. **Near-term product value** — activate links, create missing targets, typing comfort, resolved vs unresolved visuals, then autocomplete.
2. **Architectural ownership** — pure parsing/normalization/matching in `@notebox/core`; resolve/open/create/rename/backlinks policy in **shell / lib / workspace** hooks; editor handles syntax, gestures, and completion UI only.
3. **Larger, riskier consistency work** — vault-wide rename propagation and any durable forward/backward index stored in the vault must be deliberate, measured, and explicit about writes.

This roadmap uses phase IDs **WL-0 … WL-6** so they do not collide with attachment / playlist phases in the plugin-readiness plan.

---

## Current baseline (WL-0)

**Already in tree (MVP slice “6A” in the masterplan):**

- **Core:** [`packages/notebox-core/src/wikiLinkInbox.ts`](../../packages/notebox-core/src/wikiLinkInbox.ts) — parse `[[target]]` / `[[target|display]]`, optional `Inbox/` prefix strip, and exact case-sensitive match against `stemFromMarkdownFileName`; explicit `open` / `create` / `ambiguous` / `unsupported`. `sanitizeFileName` is used for create-time filesystem safety only (keeps case and spaces, strips filesystem-dangerous characters).
- **Shell:** [`apps/desktop/src/lib/inboxWikiLinkNavigation.ts`](../../apps/desktop/src/lib/inboxWikiLinkNavigation.ts) — `openOrCreateInboxWikiLinkTarget` delegates creation to existing inbox compose policy.
- **Workspace:** [`apps/desktop/src/hooks/useMainWindowWorkspace.ts`](../../apps/desktop/src/hooks/useMainWindowWorkspace.ts) — wires activation, flush-before-navigate, `refreshNotes` after create, error surface for ambiguous and unsupported paths.
- **Editor:** [`apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx) — click-to-activate (plain primary or **Ctrl/Cmd+primary**; not **Shift+primary**, reserved for selection), **`Mod-Enter`** (Ctrl+Enter / Cmd+Enter) with caret inside `[[...]]`, `[` typing assist inserting `[]]` with caret between brackets, resolved/unresolved wiki highlight via [`wikiLinkCodemirror.ts`](../../apps/desktop/src/editor/noteEditor/wikiLinkCodemirror.ts), inbox `[[` autocomplete via [`wikiLinkAutocomplete.ts`](../../apps/desktop/src/editor/noteEditor/wikiLinkAutocomplete.ts); line/column helper [`wikiLinkInnerAtLineColumn.ts`](../../apps/desktop/src/editor/noteEditor/wikiLinkInnerAtLineColumn.ts); doc-position helper [`wikiLinkInnerAtDocPosition.ts`](../../apps/desktop/src/editor/noteEditor/wikiLinkInnerAtDocPosition.ts).
- **Completion data (WL-3):** [`packages/notebox-core/src/wikiLinkInboxCompletion.ts`](../../packages/notebox-core/src/wikiLinkInboxCompletion.ts) — `buildInboxWikiLinkCompletionCandidates` / `filterInboxWikiLinkCompletionCandidates`; shell supplies candidates from the inbox note list ([`InboxTab.tsx`](../../apps/desktop/src/components/InboxTab.tsx)).
- **Tooling:** [`apps/desktop/src/editor/wikiLink/remarkWikiLink.ts`](../../apps/desktop/src/editor/wikiLink/remarkWikiLink.ts) — mdast round-trip for tests/tooling.

**Gaps vs stated near-term goals (honest):** backlinks and rename propagation are explicitly deferred in the masterplan; autocomplete does not yet cover the `target|display` display segment or ambiguous-stem picker UX (WL-6).

**WL-1 closure:** Keyboard (`Mod-Enter`) and **Ctrl/Cmd+click** use the same `onWikiLinkActivate` path as plain click; **Shift+click** does not activate (selection extension). See [`desktop-editor.md`](../architecture/desktop-editor.md).

---

## Ownership boundaries (strict)

| Concern | Editor (`apps/desktop/src/editor/`) | Shell / lib / workspace | `@notebox/core` |
|--------|-------------------------------------|-------------------------|-----------------|
| Wiki link **syntax** in buffer | Yes | No | Pure parse helpers only |
| **Click / key** activation **intent** | Yes (detect span, invoke callback) | No UI | No |
| **Typing assist** (`]]`, autocomplete UI) | Yes | Supplies **data** (note list, optional index snapshot) via props/callbacks | Optional pure filters/sort if shared |
| **Resolve** target against vault state | No | Yes | Pure `resolve*` from in-memory lists |
| **Open / create** note | No | Yes | No I/O |
| **Vault scans**, debounced rebuild | No | Yes (may use native-capable seam if benchmarks require it) | No |
| **Rename propagation** | No | Yes (orchestration, FS writes) | Pure **rewrite** helpers on strings/paths |
| **Backlinks / forward index** ownership | Renders **provided** summary only | Builds and refreshes runtime index via seam | Pure graph utilities + link identity rules |

**Invariant:** No `editor/` code walks the vault for wiki targets; ESLint continues to keep Tauri out of `editor/` per existing rules.

---

## Work item difficulty

| Size | Items | Rationale |
|------|--------|-----------|
| **Small** | `]]` / `[` assist tweaks; `Ctrl+Enter` (or chosen chord) when caret is inside `[[...]]`; second CSS class for “unresolved” **if** shell passes a cheap stem set or resolve predicate; pipe/display edge cases in parser tests | Localized editor + thin props; no new background jobs |
| **Medium** | Resolved vs unresolved **accurate** styling driven from live note list; `[[` autocomplete for **inbox note titles**; ambiguity **picker** UX (replace banner-only); section at bottom for **backlinks** backed by a **read-only** inverted index refreshed on known triggers | Requires clear data contracts and UI polish; backlinks need a defined refresh strategy but not necessarily vault-wide writes |
| **Large** | **Rename propagation** (detect rename, find referencing files, batch rewrite `[[...]]`, conflict/undo story); **vault-wide** forward index with durable storage and reconciliation; cross-folder path semantics in links; concurrent external edits + sync story | Many files touched, user data risk, performance tuning, needs explicit acceptance tests and possibly “dry run” / backup posture |

---

## Autocomplete vs backlinks vs rename propagation vs resolve

| Topic | What it is | Primary owner | Typical dependency |
|-------|------------|---------------|---------------------|
| **Resolve / open / create** | Map `[[inner]]` → existing note URI or create path using **current** naming rules | Shell + core pure resolver | In-memory note list (already refreshed for inbox) |
| **Autocomplete** | Suggest exact note stems while typing inside `[[` | Editor UI + shell-provided **candidate list** (or small snapshot) | Same note list as resolve for inbox scope; **does not require** a backlink index |
| **Backlinks** | “Notes that link **to** this note” (reverse direction) | Shell-owned **read** index or on-demand scan **off hot path** | Forward link extract per file or maintained forward map; **read-mostly**, no obligation to rewrite files |
| **Rename propagation** | When a note **file** changes identity (rename), **mutate** other files’ Markdown to preserve intent | Shell orchestration + core pure rewrite | Reliable **forward** reference map or conservative vault scan; **writes** across many files; ordering and failure handling matter |

**Rule for native code:** Any Rust/Kotlin path remains mechanics-only (enumeration, batched reads, invalidation, optional caching). Business rules (parse/normalize/identity/ambiguity/rewrite policy) stay in `@notebox/core`.

**Why rename propagation >> basic wiki linking:** Opening or creating follows **one** resolution step and **one** file write. Rename propagation touches **N** files, must respect autosave/concurrency, must align with sanitize/stem rules over time, and mistakes corrupt user-visible Markdown across the vault.

**Why backlinks ≠ rename propagation:** Backlinks are a **derived view**; if the derivation is wrong stale, the vault files remain truth. Rename propagation **changes** files; errors are destructive and harder to undo. They may **share** a forward-link extraction pass or index structure later, but product and engineering risk profiles differ: backlinks can ship as **read-only** and iterative; rename must ship with **strong** guards.

---

## Recommended phase order

| Order | Phase id | Short name |
|------|----------|------------|
| ✓ done | **WL-0** | Inbox wiki MVP (resolve, open/create, click, `[` assist, highlight) |
| ✓ done | **WL-1** | Activation parity — **keyboard** (`Mod-Enter`); **Ctrl/Cmd+click** same shell path as plain click (`Shift+click` does not activate) |
| ✓ done | **WL-2** | Resolved vs unresolved styling (data from shell, decoration in editor) |
| ✓ done | **WL-3** | `[[` autocomplete (inbox-scoped; candidate list from shell) |
| 4 | **WL-4** | Backlinks + minimal forward-link **read** model |
| 5 | **WL-5** | Rename-safe link maintenance (vault-wide rewrite engine) |
| 6 | **WL-6** | Smarter resolution (ambiguity UI, optional path rules—not a global search platform) |

**Ordering rationale:** Delivers user-visible value early (WL-1–WL-3) without blocking on an index. WL-4 introduces the **first** intentional link graph **read** path under shell ownership. WL-5 is intentionally late: highest blast radius. WL-6 fills product gaps without turning into “build Omnisearch.”

**Uncertainty:** If product prioritizes backlinks over autocomplete, swap WL-3 and WL-4—but see *Recommended next step* for the default recommendation.

---

## Phase details

### WL-1 — Activation parity

- **Goal:** Click and **keyboard** activation behave the same for a wiki link under the caret (e.g. `Ctrl+Enter` on Linux/Windows, consistent with desktop patterns; exact chord can follow platform table in eventual command registry).
- **Desktop status:** Implemented in [`NoteMarkdownEditor.tsx`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx): **`Mod-Enter`** (Ctrl+Enter on Linux/Windows, Cmd+Enter on macOS) with caret inside `[[...]]`; **plain click** and **Ctrl/Cmd+click** on the link span call the same `onWikiLinkActivate` path. **Shift+click** is not handled here so CodeMirror can extend selection across link text.
- **Why now:** Finishes “first-class” feel before investing in heavier data plumbing.
- **Scope:** Editor detects “caret inside `[[...]]`” (reuse line/column logic akin to click); dispatch to existing `onWikiLinkActivate`. Document chord in desktop editor spec if stabilized.
- **Excludes:** New resolve semantics; vault scan; new dependencies.
- **Ownership:** Editor (gesture); shell (unchanged callback).
- **Risks / complexity:** **Small**—keymap precedence vs Markdown default bindings; verify compose/new-entry and IME edge cases.
- **Acceptance:** From an inbox note, with caret inside a valid `[[inner]]`, chord triggers same navigation path as click; unsupported/ambiguous still surface via existing shell error handling.

### WL-2 — Resolved vs unresolved styling

- **Goal:** Visually distinguish links that resolve to an existing inbox note from those that would create or are otherwise unresolved **within current policy**.
- **Why now:** Users learn trust and repair links without activating each one.
- **Scope:** Shell/workspace exposes a stable snapshot: e.g. `Set<string>` of inbox stems or a small `isWikiTargetResolved(inner) -> boolean` backed only by current note list (no deep scan). Editor applies two decoration classes (or mark attributes) for resolved vs unresolved spans; tokens in design/CSS.
- **Excludes:** Cross-folder resolution; live file watcher reactivity beyond existing refresh triggers; storing state in `.notebox` for this alone.
- **Ownership:** Shell computes truth from **already-maintained** inbox index; editor renders.
- **Risks / complexity:** **Small–medium**—decoration updates must stay cheap on large notes; avoid running full markdown AST on every keystroke (string/regex-based Decoration is consistent with current `wikiLinkCodemirror` approach, with optional debounced reconcile).
- **Acceptance:** Creating a note updates unresolved→resolved after the same refresh path used today; purely pathological performance checked on a long note with many `[[` spans (manual or simple benchmark).
- **Desktop status:** Implemented: [`wikiLinkCodemirror.ts`](../../apps/desktop/src/editor/noteEditor/wikiLinkCodemirror.ts), [`InboxTab.tsx`](../../apps/desktop/src/components/InboxTab.tsx) + [`NoteMarkdownEditor.tsx`](../../apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx) (`wikiLinkTargetIsResolved`). See [`desktop-editor.md`](../architecture/desktop-editor.md).

### WL-3 — `[[` autocomplete

- **Goal:** After typing `[[`, offer completions against **existing inbox notes** using the exact stored stem so accepted completions resolve case-sensitively.
- **Why now:** High authoring value; still inbox-scoped like WL-0 resolver.
- **Scope:** CodeMirror completion source fed by shell-provided list; may include display form `[[stem|label]]` policy documented with core helpers; respect performance (defer population after first paint principles).
- **Excludes:** Full-text search; fuzzy vault-wide ranking product; plugin extensibility.
- **Ownership:** Editor implements Completion UI; shell passes candidates; core may expose normalize/compare helpers shared with resolver.
- **Risks / complexity:** **Medium**—UX (trigger characters, merge with Markdown mode), large vault lists (cap, prefix-only first).
- **Acceptance:** Typing `[[` then a few letters narrows inbox notes; accepting a completion inserts a link that `resolveInboxWikiLinkTarget` would classify as `open` for that note.
- **Desktop status:** Implemented: `@codemirror/autocomplete` via [`wikiLinkAutocomplete.ts`](../../apps/desktop/src/editor/noteEditor/wikiLinkAutocomplete.ts); candidates from [`wikiLinkInboxCompletion.ts`](../../packages/notebox-core/src/wikiLinkInboxCompletion.ts), wired in [`InboxTab.tsx`](../../apps/desktop/src/components/InboxTab.tsx). Completions apply only in the wiki **target** segment (before `|`). Duplicate Markdown stems are skipped so each suggestion resolves uniquely.

### WL-4 — Backlinks and first forward-link read model

- **Goal:** Show **backlinks** at the bottom of the open note (or adjacent panel per shell UX), derived from vault Markdown, compatible with filesystem-first truth (files are canonical).
- **Why now:** Establishes the **shell-owned** link graph read path needed later for safer rename decisions—without yet writing back and without committing to a native implementation.
- **Scope:** Define a minimal **forward link** extraction (wiki links only, inbox scope first): parse text or reuse core/remark pipeline **off** the critical path; build inverted map **keyed** by consistent stem/note identity; refresh on vault fs events / existing `refreshNotes` / explicit triggers per performance rules; UI renders provided list with navigation.
- **Native-capable seam posture:** Introduce the seam boundary in WL-4; accelerate with Rust/Kotlin only if the TypeScript-first implementation misses explicit performance gates.
- **Excludes:** Automatic link rewriting; durable `.notebox` cache **unless** product explicitly wants inspectable artifact—if added, must meet `.notebox` rules in extension-readiness (named owner, not ephemeral churn).
- **Ownership:** Shell builds and stores runtime model; editor/note chrome displays; `@notebox/core` remains owner of link semantics.
- **Risks / complexity:** **Medium**—first recurring **vault-wide** read pass; must be debounced and measured (see `.cursor/rules/performance.mdc`); stale backlinks acceptable short-term if refresh rules are clear.
- **Acceptance:** For a vault with known links, opening note B shows note A when A’s body contains `[[B]]`; performance gates are met or a benchmark-backed decision is documented to introduce native acceleration.

### WL-5 — Rename-safe link maintenance

- **Detailed design:** [wiki-rename-phase.md](./wiki-rename-phase.md).
- **Goal:** When an inbox note is **renamed** (filename / identity change per product definition), update `[[...]]` references across the vault so links stay coherent and filename-safe.
- **Why later:** Largest user-data and performance risk; depends on a trustworthy **set of referencing files** (from WL-4-style model or equivalent).
- **Scope:** Define rename event source (single app rename path); compute affected files; apply pure rewrite from core; transactional story (per-file save order, rollback strategy); explicit user confirmation if needed; **no silent** rewrites outside documented policy (extension invariant).
- **Scale posture:** Start TypeScript-first for planning/orchestration; only add native acceleration for enumeration/read mechanics if WL-5 benchmarks miss targets after basic optimization.
- **Excludes:** Merge conflict resolution with git; multi-device real-time sync (unless already product scope); Obsidian-style global fuzzy renames.
- **Ownership:** Shell orchestrates writes and failure handling; core supplies deterministic string rewrite; native code (if introduced) must not own rewrite semantics.
- **Risks / complexity:** **Large**—incorrect batch edit is catastrophic; must have tests with golden Markdown fixtures and ambiguous stem policy.
- **Acceptance:** Rename note updates referencing inbox notes; unlinked or ambiguous cases are reported, not silently corrupted; perf is measured by touched-file scale buckets, with total touched bytes reported and evaluated alongside, per WL-5 gates.

### WL-6 — Smarter resolution (non-search-platform)

- **Goal:** Better handling of **ambiguity** (picker vs error), optional relative/path semantics **if** product requires, and clearer UX when multiple notes share stems.
- **Why later:** Depends on stable WL-0–WL-5 patterns; avoid speculative path grammar.
- **Scope:** Ambiguity UI; optional expanded target grammar documented in specs; still **no** general search platform commitment.
- **Excludes:** Plugin API; third-party link providers.
- **Ownership:** Resolver in core (pure); policy in shell; editor for picker UI only.
- **Risks / complexity:** **Medium–large** depending on path rules.
- **Acceptance:** Documented matrix of inputs → `open | create | ambiguous` with tests in core.

---

## Performance gates (WL-4 and WL-5)

Native acceleration is optional and introduced only when a TypeScript-first path misses targets after basic optimization.

- **Reference requirement:** Any benchmark result must record reference hardware and reference vault composition (file count, touched files, touched bytes, large-file distribution) so decisions are repeatable.
- **Cold start impact:** WL-4 indexing work adds no more than **50 ms** main-thread blocking before first render and no more than **200 ms** to first-screen interactive on the 10k-file reference vault.
- **Initial background index build:** first backlink-capable runtime index for a 10k-file reference vault completes in **<= 5 s** on reference hardware.
- **Incremental backlinks recompute:** single-file change updates backlinks within **150 ms p95** and **500 ms p99**.
- **Rename planning latency:** affected-reference discovery completes within **500 ms** (500 touched files), **2 s** (2k touched files), and **8 s** (10k touched files) — the primary numeric gates.
- **Rename planning and touched content:** total touched bytes must be measured and reported with every run. Hitting file-count targets alone is not sufficient: disproportionate latency or unacceptable UX from large-content workloads fails the gate.
- **Rename apply measurement:** plan and apply timings are tracked separately; native write-path acceleration is deferred unless TypeScript orchestration misses approved apply targets.
- **Memory ceiling:** steady-state link-index memory stays under **128 MB** on the 10k-file reference vault unless product requirements explicitly approve a higher ceiling.

**Basic optimization before native:** reduce unnecessary work, batch reads sensibly, defer non-critical work, and improve invalidation quality (current desktop `vault-files-changed` is intentionally coarse and may need better payloads or indexer-managed invalidation).

---

## Do next / do later (summary)

| Do next (after WL-1) | Do later |
|----------------------|----------|
| WL-2 resolved/unresolved | WL-5 rename engine |
| WL-3 autocomplete | Durable index files in `.notebox` (only with explicit product + retention) |
| WL-4 backlinks | Cross-vault or arbitrary path links |
| WL-6 ambiguity UX when pain is felt | Full-text search product; WL-6 path grammar until required |

---

## Recommended next step

- **After WL-1 (keyboard and click parity):** **WL-2** (resolved vs unresolved visuals). Low risk relative to indexing; makes the feature easier to scan before autocomplete (**WL-3**).

- **Should “Phase 4A” (first indexing / backlinks, i.e. **WL-4**) come before autocomplete (**WL-3**)?** **Default: no.** Autocomplete can be satisfied with the **existing inbox note list** refreshed by current workspace behavior. **WL-4** introduces recurring extraction/index **read** paths and refresh policy; it is valuable but heavier than WL-3 for incremental product gain. If leadership explicitly prioritizes graph navigation over authoring speed, swap the order.

- **First truly large wiki-link-related project:** **WL-5 (rename propagation)**—vault-wide **writes**, correctness under concurrency, and user-trust requirements dominate complexity. **WL-4** is the first **sustained vault-wide read** for links and is “medium” by comparison; treat WL-4 as the **on-ramp** that de-risks WL-5 by proving extraction and stem identity rules at scale.

---

## References

- [extension-readiness.md](../architecture/extension-readiness.md) — layers, `.notebox` rules, editor constraints.
- [plugin-readiness-masterplan.md](./plugin-readiness-masterplan.md) — Phase 6 / 6A status.
- [wiki-link-indexing-architecture.md](../architecture/wiki-link-indexing-architecture.md) — seam boundaries, storage posture, and benchmark gates.
- [desktop-editor.md](../architecture/desktop-editor.md) — inbox editor behavior and flush rules.

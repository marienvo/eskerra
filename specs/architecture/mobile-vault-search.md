# Mobile vault search (Android)

Full-vault markdown search on Android uses a **native Kotlin** module `EskerraVaultSearch` backed by **SQLite FTS5**, exposed to React Native via `NativeModules` + `NativeEventEmitter`. TypeScript types and highlight utilities are shared with desktop via **`@eskerra/core`** (`vaultSearchTypes`, `vaultSearchHighlight`).

## Product rules

- **No indexing on cold start** — no vault scan or FTS work runs before the first meaningful render; indexing is scheduled only after a vault session exists (see `.cursor/rules/performance.mdc`).
- **Lazy activation** — `open(baseUri)` from `VaultContext` after vault session apply is lightweight (DB metadata). **`requestVaultSearchIndexWarmup(baseUri)`** in [`vaultSearchIndexMaintenance.ts`](../../../apps/mobile/src/features/vault/vaultSearchIndexMaintenance.ts) runs after **`InteractionManager.runAfterInteractions`** (post–first paint / transitions) and performs the same **`open` → `getIndexStatus` → rebuild or reconcile** pipeline as before, so the index warms even if the user never focuses the Vault tab. **`runVaultSearchIndexMaintenance(baseUri)`** is the single-flight implementation; **`VaultSearchScreen`** uses it on mount to populate hook props without a second duplicate maintenance path.
- **Foreground refresh** — **`installVaultSearchAutoRefresh`** (same module) attaches **`AppState`** (`active` → re-run maintenance) and a **5-minute** interval while the app is active so reconcile/rebuild rules stay applied without opening search.
- **Background periodic reconcile** — Android **`VaultSearchReconcileWorker`** (WorkManager, unique periodic work, battery-not-low) calls the same reconcile path as the native module. The active vault tree URI is mirrored from JS via **`persistActiveVaultUriForWorker`** when `baseUri` is set in [`VaultContext`](../../../apps/mobile/src/core/vault/VaultContext.tsx) (SharedPreferences `eskerra_vault_search_worker`).
- **Stale async safety** — every event includes **`vaultInstanceId`**; JS (`useVaultContentSearch`) drops events whose `vaultInstanceId` or `searchId` does not match the active search/session.

## SQLite schema (v1)

- Virtual table **`notes`** (`fts5`): `uri` (UNINDEXED), `rel_path`, `title`, `filename`, `body`, tokenizer `unicode61 remove_diacritics 2`.
- **`note_meta`**: `uri`, `rel_path`, `filename`, `title`, `size`, `last_modified` (+ index on `rel_path`).
- **`index_meta`**: key/value strings for `schema_version`, `base_uri_hash`, `vault_instance_id`, `last_titles_at`, `last_full_build_at`, `last_reconciled_at`, etc.

Index file: `context.filesDir/vault-search-index/<sha1(canonicalBaseUri)>.sqlite`.

`schema_version` in meta must match the module’s **`SCHEMA_VERSION`** constant. On mismatch, native first attempts **`VaultSearchSchema.migrate`**. If migration cannot upgrade in place, JS still calls **`scheduleFullRebuild`**, which **clears indexed rows** and reindexes incrementally **without deleting the SQLite file** (so partial progress survives process death).

### Index readiness vs body completeness

- **`last_titles_at`**: set when **title/path** rows exist for every eligible markdown file (`body` may still be empty for the body-ingest phase).
- **`last_full_build_at`**: set when **body** text has been filled (or skipped for oversize files) for all rows that need it.
- **`open` / `getIndexStatus`** return **`indexReady: true`** once **`last_titles_at` > 0** (search is useful for title/path immediately; body matches appear as the second phase completes).
- **`bodiesIndexReady: true`** iff **`last_full_build_at` > 0**. JS shows a small footer hint while **`bodiesIndexReady`** is false but the user is searching.

Legacy DBs that only had **`last_full_build_at`** (pre–`last_titles_at`) are shimmed on writer **`open`**: **`last_titles_at`** is backfilled from **`last_full_build_at`** when missing.

## `VaultPath` (Kotlin)

Central URI/path helpers: canonicalize base URI, **SHA-1** `baseUriHash`, `relativePath`, `titleFromFileName`, `keyForIndex` for row keys. All SAF reads, inserts, deletes, and search result mapping go through this type.

## Index lifecycle (JS)

When **`baseUri`** is set ([`VaultContext`](../../../apps/mobile/src/core/vault/VaultContext.tsx)):

1. **`requestVaultSearchIndexWarmup(baseUri)`** schedules **`runVaultSearchIndexMaintenance`** (Android + native available).
2. Maintenance: `open(baseUri)` → `getIndexStatus(baseUri)` → if **`fullNeedsRebuild`** (`apps/mobile/src/features/vault/vaultSearchLifecycle.ts`): **`scheduleFullRebuild(baseUri, reason)`** with `missing` | `schema-mismatch` | `base-uri-change` → **`open`** again so returned **`vaultInstanceId`** matches the post-rebuild native state → else if **`shouldReconcile`** (`lastReconciledAt` older than **60 s** default): **`reconcile(baseUri)`** (fire-and-forget).

**Vault search screen** (`VaultSearchScreen`) calls **`runVaultSearchIndexMaintenance`** on mount (same in-flight promise as warm-up if both run close together) and uses the returned **`open`** fields for **`useVaultContentSearch`**. A **Retry** control calls **`scheduleFullRebuild(baseUri, 'manual-retry')`** after native emits **`vault-search:index-status`** with **`status: "error"`**.

`touchPaths(baseUri, uris[])` is invoked after successful **create / write / delete** of inbox notes from `NotesContext` so in-app edits stay indexed without waiting for reconcile.

## Native full rebuild (incremental)

`scheduleFullRebuildSync` **does not delete** the SQLite file. It validates the SAF vault root, rotates **`vault_instance_id`**, clears **`notes` / `note_meta`**, then:

1. **Titles phase** — walks eligible markdown, inserts **`notes` + `note_meta`** with **`body = ''`** in batches (~50), **`reopenReader()`** after each batch, emits **`vault-search:index-progress`** (`phase: "titles"`).
2. Sets **`last_titles_at`**, emits **`vault-search:index-status`** `ready` with **`reason: "incremental-titles"`** and **`bodiesIndexReady: false`** so search can start while bodies catch up.
3. **Bodies phase** — selects rows with **`size > 0`** and empty **`body`**, reads file bytes in batches (~25), **`UPDATE`** FTS rows, emits **`vault-search:index-progress`** (`phase: "bodies"`).
4. Sets **`last_full_build_at`** / **`last_reconciled_at`**, emits **`ready`** with **`reason: "full-rebuild"`** and **`bodiesIndexReady: true`**.

`rebuildInProgress` gates **`isBuilding`** in **`open`/`getIndexStatus`** so JS **`shouldReconcile`** skips work while a rebuild holds the write executor.

## Search & ranking (native)

- **FTS5** candidate query with **`Fts5Query.buildSafeMatch`** (tokens wrapped in double-quoted phrases; strips characters that break FTS; drops operator-only tokens).
- Candidates: BM25-ordered, capped (e.g. 100), then a **tier score** pass (exact title/path > prefix > fuzzy title-path for query length ≥ 4 with bounded Levenshtein; body tier otherwise) + small BM25 tie-in.
- **Payload size:** initial `vault-search:update` with top **50** notes; final `vault-search:done` with top **150**; at most **one** snippet per note; **`lineNumber`** nullable when not derived from a reliable body line scan.
- **`vault-search:done` / `update` `progress`** may include **`bodiesIndexReady`** and **`indexReady`** reflecting **`index_meta`** (title-only phase vs full body index).

## Concurrency

- **WAL** journal mode; one **write** executor (rebuild, reconcile, `touchPaths`) and a separate **read** connection + executor for search so typing is not blocked by reconcile.
- **`reconcileSync`** applies large diffs in batches (~100 URIs per transaction) and emits **`vault-search:index-progress`** (`phase: "reconcile"`) when the total change count exceeds the batch size.

## Events (bridge)

- `vault-search:update` / `vault-search:done` — `{ searchId, vaultInstanceId?, notes?, progress }`.
- `vault-search:index-status` — `{ vaultInstanceId?, status, bodiesIndexReady?, indexedNotes?, added?, updated?, removed?, reason?, skippedNotes?, lastReconciledAt?, … }` (`status`: `building` | `ready` | `error`; `reason` e.g. `full-rebuild`, `incremental-titles`, `reconcile`; `skippedNotes` on rebuild-ready after indexing; `lastReconciledAt` epoch ms on some `ready` payloads).
- **`vault-search:index-progress`** — `{ vaultInstanceId, phase: "titles" | "bodies" | "reconcile", processed, total, indexed, skipped }` for UI progress during incremental work.

## JS search screen

`VaultSearchScreen` passes **`indexReady`**, **`bodiesIndexReady`** (from `open()`), and **`lastReconciledAt`** into `useVaultContentSearch`. Before the **first** `start()` in a focus session, if the index is ready and `lastReconciledAt` is older than **10 s** (or missing), the hook kicks off a single best-effort **`reconcile(baseUri)`** (fire-and-forget — **not** awaited before `start()`, so SAF vault walks do not block FTS). Native **`reconcileSync`** always emits **`vault-search:index-status`** with `status: "ready"` and **`lastReconciledAt`** after a successful reconcile, including when the diff is empty, so JS can advance its stale-throttle without re-walking the vault every session. Stale native events increment a dev-only dropped counter and **`console.debug`** when `searchId` or `vaultInstanceId` mismatches.

`useVaultContentSearch` subscribes to **`vault-search:index-status`** and **`vault-search:index-progress`**: it keeps **`indexStatusLive`** and **`indexProgress`** for UI, does **not** force **`indexReadyRef`** to false on `building` (titles may already be searchable), updates **`vaultInstanceId` ref** when the native instance id rotates on full rebuild, and **auto-retries `start()`** once when `status === "ready"` arrives after a search **`done`** with `indexReady: false` (so typing during indexing does not require another keystroke). The same retry also runs when **`indexReady`** from **`open()`** flips to true while a pending retry is queued (covers the case where no index-status event was emitted yet).

## Native rebuild safety

`scheduleFullRebuildSync` validates the SAF vault root (**`DocumentFile` exists and is directory**) **before** mutating index rows. Failures emit **`vault-search:index-status`** with `status: "error"` and reject the `scheduleFullRebuild` promise. While the read DB is not open but a write session or `activeBaseUri` is active, **`startSearchSync`** completes with **`progress.indexStatus: "building"`** and **`isBuilding: true`** instead of a silent `idle` not-ready state.

## JVM / Robolectric tests

Robolectric’s host SQLite build **does not load FTS5**, so unit tests avoid creating the FTS virtual table there; schema-migration / instance-id tests use **`index_meta` only**. Concurrency uses a plain table + WAL + cross-thread transaction. FTS5 behaviour is covered on-device / in integration and by pure `Fts5Query` / `SearchRanker` tests.

## `vaultInstanceId` rotation

The id in `index_meta` **rotates** when: DB is first created; successful **`scheduleFullRebuild`** start (new write session); defensive **base_uri_hash** mismatch. It does **not** rotate on `reconcile`, `touchPaths`, repeated `open()`, or process restart (same DB file).

## Out of scope (v1)

See the product plan: no iOS, no wiki-link index, no SAF file observer, no fuzzy body match, no multi-snippet / markdown-stripped snippets.

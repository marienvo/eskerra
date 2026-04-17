# Mobile vault search (Android)

Full-vault markdown search on Android uses a **native Kotlin** module `EskerraVaultSearch` backed by **SQLite FTS5**, exposed to React Native via `NativeModules` + `NativeEventEmitter`. TypeScript types and highlight utilities are shared with desktop via **`@eskerra/core`** (`vaultSearchTypes`, `vaultSearchHighlight`).

## Product rules

- **No indexing on cold start** — work begins only after the user focuses the **Vault** tab (see `.cursor/rules/performance.mdc`).
- **Lazy activation** — `open(baseUri)` from `VaultContext` after vault session apply is lightweight (DB metadata); rebuild/reconcile run from Vault tab `useFocusEffect` when needed.
- **Stale async safety** — every event includes **`vaultInstanceId`**; JS (`useVaultContentSearch`) drops events whose `vaultInstanceId` or `searchId` does not match the active search/session.

## SQLite schema (v1)

- Virtual table **`notes`** (`fts5`): `uri` (UNINDEXED), `rel_path`, `title`, `filename`, `body`, tokenizer `unicode61 remove_diacritics 2`.
- **`note_meta`**: `uri`, `rel_path`, `filename`, `title`, `size`, `last_modified` (+ index on `rel_path`).
- **`index_meta`**: key/value strings for `schema_version`, `base_uri_hash`, `vault_instance_id`, `last_full_build_at`, `last_reconciled_at`, etc.

Index file: `context.filesDir/vault-search-index/<sha1(canonicalBaseUri)>.sqlite`.

`schema_version` in meta must match the module’s **`SCHEMA_VERSION`** constant. On mismatch, native reports **`indexReady: false`** with the **stored** schema number in the status map; JS calls **`scheduleFullRebuild`**.

## `VaultPath` (Kotlin)

Central URI/path helpers: canonicalize base URI, **SHA-1** `baseUriHash`, `relativePath`, `titleFromFileName`, `keyForIndex` for row keys. All SAF reads, inserts, deletes, and search result mapping go through this type.

## Index lifecycle (JS)

On **Vault** route focus (`VaultScreen`):

1. `open(baseUri)` (writer + WAL; ensures schema exists).
2. `getIndexStatus(baseUri)`.
3. If **`fullNeedsRebuild`** (see `apps/mobile/src/features/vault/vaultSearchLifecycle.ts`): `scheduleFullRebuild(baseUri, reason)` with `missing` | `schema-mismatch` | `base-uri-change`.
4. Else if **`shouldReconcile`** (`lastReconciledAt` older than **60 s** default): `reconcile(baseUri)`.

`touchPaths(baseUri, uris[])` is invoked after successful **create / write / delete** of inbox notes from `NotesContext` so in-app edits stay indexed without waiting for reconcile.

## Search & ranking (native)

- **FTS5** candidate query with **`Fts5Query.buildSafeMatch`** (tokens wrapped in double-quoted phrases; strips characters that break FTS; drops operator-only tokens).
- Candidates: BM25-ordered, capped (e.g. 100), then a **tier score** pass (exact title/path > prefix > fuzzy title-path for query length ≥ 4 with bounded Levenshtein; body tier otherwise) + small BM25 tie-in.
- **Payload size:** initial `vault-search:update` with top **50** notes; final `vault-search:done` with top **150**; at most **one** snippet per note; **`lineNumber`** nullable when not derived from a reliable body line scan.

## Concurrency

- **WAL** journal mode; one **write** executor (rebuild, reconcile, `touchPaths`) and a separate **read** connection + executor for search so typing is not blocked by reconcile.

## Events (bridge)

- `vault-search:update` / `vault-search:done` — `{ searchId, vaultInstanceId?, notes?, progress }`.
- `vault-search:index-status` — `{ vaultInstanceId?, status, indexedNotes?, added?, updated?, removed?, … }`.

## `vaultInstanceId` rotation

The id in `index_meta` **rotates** when: DB is first created; DB file recreated after corruption/delete; successful **`scheduleFullRebuild`** commit; defensive **base_uri_hash** mismatch. It does **not** rotate on `reconcile`, `touchPaths`, repeated `open()`, or process restart (same DB file).

## Out of scope (v1)

See the product plan: no iOS, no wiki-link index, no SAF file observer, no fuzzy body match, no multi-snippet / markdown-stripped snippets.

# Podcast Loading Trace

## Scope

This spec defines how the Podcasts screen loads data, when the small initial spinner can disappear, and how cache layers are used to keep warm-start rendering fast.

## Goals

- Render episode rows as soon as legacy podcast markdown files are parsed.
- Keep spinner-blocking work limited to data required for first paint.
- Move RSS and artwork enrichment to background work.
- Persist artwork URI cache across app restarts.
- Persist RSS feed URL mappings per series so phase 1 can resolve artwork keys without waiting for `📻` markdown reads.

## Components And Responsibilities

- `usePodcasts`: orchestrates file reads, parse flow, section state, and spinner timing.
- `usePlayer`: restores playlist state once per vault session and matches to episodes as they arrive.
- `podcastImageCache`: resolves artwork URI through memory cache, persistent cache, SAF metadata, and optional network fallback.
- `rssFeedUrlCache`: holds RSS feed URL maps per vault and persists them to `AsyncStorage`.
- `generalPodcastMarkdownIndexCache`: persists a **small** snapshot of podcast-relevant files under `General` (legacy `*- podcasts.md` and `📻 … .md` only) so cold starts avoid `listFiles` over tens of thousands of unrelated markdown files.
- **Android:** `listGeneralMarkdownFiles` (and Inbox `listNotes`) can use the `NoteboxVaultListing` Kotlin module for directory listing and filtering on a background thread, with fallback to `react-native-saf-x` in JS when needed; see `specs/architecture/known-risks.md` section 7.

## Cache Layers

### Persistent podcast markdown index (General)

- Location: `AsyncStorage`.
- Key: `notebox:generalPodcastMarkdownIndex:${baseUri}`.
- Value: JSON `{ v: 1, snapshottedAt, entries: RootMarkdownFile[] }` where `entries` is only files matching `isPodcastFile` or the RSS emoji filename pattern (not the full `General` listing).
- **Fast path:** `refresh()` loads this snapshot first; if present, it **does not** call `listGeneralMarkdownFiles` on the critical path before showing episodes (still reads each podcast markdown body via SAF as today).
- **Background reconcile:** A full `listGeneralMarkdownFiles` runs asynchronously; if the derived podcast-relevant set differs from what was shown, state is rebuilt and the snapshot is updated.
- **First run / no cache:** Same as before — full `listGeneralMarkdownFiles`, then save snapshot.
- **Pull-to-refresh:** Pass `{ forceFullScan: true }` to `refreshPodcasts` to always run a full listing immediately (picks up new podcast files without waiting for background reconcile).

### Episode File Content Cache

- Location: module-level `fileContentCache` in `usePodcasts`.
- Key: markdown file URI.
- Value: `{ lastModified, content }`.
- Lifetime: JS runtime session.
- Invalidation: file `lastModified` mismatch or app restart.

### RSS Feed URL Caches

- Location: module-level maps in `rssFeedUrlCache`.
- Keys: `baseUri::seriesName` and `baseUri::normalizedSeriesName`.
- Value: RSS feed URL.
- Lifetime: JS runtime session, hydrated from persistent storage on each `refresh()` before vault file listing.
- Purpose: enrich episodes and sections without waiting for RSS markdown file reads in the same session; after an app restart, persisted entries restore URLs before phase 2 runs.
- Episode enrichment tries **both** `seriesName` (line parentheses) and `sectionTitle` (filename section) when resolving a cached RSS URL, because persisted keys from `📻` files often match the section title rather than the per-line series name.

### Persistent RSS Feed URL Cache

- Location: `AsyncStorage`.
- Key: `notebox:rssFeedUrlBySeries:${baseUri}`.
- Value: JSON `{ v: 1, bySeries, byNormalized }` with series display names and normalized keys (without the `baseUri::` prefix inside each record).
- Lifetime: across app restarts for the same app install.
- Write-through: `persistRssFeedUrl` schedules a chained `setItem` (same pattern as artwork URI persistence).
- Hydration: `loadPersistentRssFeedUrlCache` fills only map keys that are not already present (in-memory wins over stale storage).

### Artwork URI Memory Cache

- Location: module-level `artworkUriMemoryCache` in `podcastImageCache`.
- Key: `baseUri::rss-hash`.
- Value: renderable URI (`content://.../document/...`, `file://`, or remote fallback URL). **Null is not a durable negative cache:** misses do not store `null` in a way that blocks later hydration from disk or `AsyncStorage`.
- Lifetime: JS runtime session.
- Purpose: avoid repeated SAF reads during row renders.
- `peekCachedPodcastArtworkUriFromMemory` allows list rows to show a known URI on the **first paint** when the in-memory map was warmed by `loadPersistentArtworkUriCache` or earlier resolution (see `usePodcastArtwork`).

### Persistent Artwork URI Cache

- Location: `AsyncStorage`.
- Key: `notebox:artworkUriCache:${baseUri}`.
- Value: serialized map of non-empty artwork URIs keyed by memory cache key.
- Lifetime: across app restarts for the same app install.
- Purpose: hydrate memory cache early so warm restarts can render artwork without per-series SAF checks.
- **Local file validation:** Cached `content://` document URIs are checked with `safUriExists` (SAF `exists`). If the user deletes files under `.notebox/podcast-images`, stale pointers are removed from memory and this `AsyncStorage` map is rewritten on load; disk JSON entries drop `localImageUri` (keeping `imageUrl` when present) or are cleared so `getPodcastArtworkUri` can fall back to remote URLs or re-download.

## Loading Phases

### Phase 1 (Spinner-Blocking)

`refresh()` performs rendering-critical work. It begins with `AsyncStorage` hydration (no `listFiles` on `General` yet; artwork hydration may run one `exists` check per persisted `content://` artwork URI, no artwork network):

1. `await Promise.all([loadPersistentArtworkUriCache(baseUri), loadPersistentRssFeedUrlCache(baseUri)])`.
2. Resolve podcast-relevant file list: either `loadPersistedPodcastMarkdownIndex(baseUri)` when not forcing a full scan, or `listGeneralMarkdownFiles(baseUri)` when there is no snapshot or `forceFullScan` is true; then `filterPodcastRelevantGeneralMarkdownFiles` and persist the snapshot when a full listing ran.
3. Split into legacy podcast files and `📻` RSS files via `splitPodcastAndRssMarkdownFiles`.
4. Read and parse legacy podcast markdown bodies (SAF `readFile` per file).
5. Enrich episodes with RSS URLs from `rssFeedUrlCache` (including entries restored from persistent storage), using `seriesName` then `sectionTitle` as lookup keys.
6. Build sections and commit state.
7. Fire-and-forget `primeArtworkCacheFromDisk` for every RSS URL found on episodes or sections (so SAF metadata can populate memory **without** waiting for phase 2 `📻` reads when there are no RSS files or phase 2 is slow).
8. Set `isLoading=false` in `finally`.

Spinner target: disappears after steps 1–6 complete (step 7 does not block the spinner). When a persisted podcast markdown index exists, step 2 avoids a full `listFiles` on `General` on the critical path; a full listing may still run afterward in the background.

### Background (after fast path index)

When phase 1 used a persisted snapshot (no full listing in the `try` block), `refresh()` schedules a full `listGeneralMarkdownFiles`, recomputes the podcast-relevant subset, updates `AsyncStorage`, and refreshes React state if the index changed.

### Phase 2 (Background)

After phase 1 state is rendered:

1. Read RSS markdown files (`📻 ... .md`).
2. Extract RSS feed URL + section title.
3. Persist RSS URL mappings via `persistRssFeedUrl` (memory + `AsyncStorage` write-through).
4. Re-enrich episodes and sections if new URLs changed visible data.
5. Prime artwork cache via `primeArtworkCacheFromDisk(baseUri, rssFeedUrls)`.

`primeArtworkCacheFromDisk` only performs cached SAF metadata lookups via `getCachedPodcastArtworkUri`. It does not trigger network fetches.

### Player Restore (Concurrent With Podcast Load)

- `usePlayer` effect 1 runs on `[baseUri, player]` and reads `playlist.json` once per vault session.
- effect 2 matches the saved playlist entry against `episodesById` as episode maps update.
- This decouples playlist read timing from phase 2 enrichment.

## UI: Episode rows

- `EpisodeRow` resolves artwork using `episode.rssFeedUrl` and falls back to `section.rssFeedUrl` when the episode has no URL after enrichment (belt-and-suspenders with the dual-key enrich step).

## Artwork Resolution Rules

Given `baseUri` and `rssFeedUrl`:

1. Check artwork memory cache (including synchronous peek for first paint in `usePodcastArtwork`).
2. If miss, check SAF metadata entry (`readPodcastImageCacheEntry`) for fresh cached URI.
3. If stale or missing and caller allows full resolution (`getPodcastArtworkUri`), fetch RSS artwork URL and attempt download.
4. On successful local download, write image file + metadata and update memory cache.
5. On download failure, store remote URL fallback metadata and cache fallback URI.
6. Every memory-cache update schedules AsyncStorage write-through for that `baseUri`.

## Warm Vs Cold Behavior

### Cold Start (No Persistent Caches Yet)

- Phase 1 still renders quickly from podcast markdown files.
- Without persisted RSS URLs, `rssFeedUrl` may stay empty until phase 2 reads `📻` markdown; artwork then follows.
- Priming and row-level fetches progressively populate memory + persistent artwork and RSS caches.

### Warm Restart (Persistent Artwork and/or RSS Cache Present)

- Phase 1 hydrates artwork memory cache and RSS maps from `AsyncStorage` before listing vault files.
- Episode rows can resolve `rssFeedUrl` and artwork immediately when both persistent layers hit.
- Phase 2 still runs to reconcile `📻` markdown changes and to `primeArtworkCacheFromDisk` for SAF metadata refresh.

## SAF Call Budget (Warm Restart, Cached Content)

Expected call profile after this design:

- `AsyncStorage.getItem` for artwork + RSS caches: 2 reads at phase 1 start (app-internal, not SAF).
- `listGeneralMarkdownFiles`: typically **0 on the critical path** when a warm podcast index snapshot exists; **1+ in background** reconcile, or **1 in try** on cold start / `forceFullScan`. Each call still does `exists` + `listFiles` on `General`.
- podcast markdown reads: typically 0 SAF reads when `fileContentCache` is warm in-session.
- `readPlaylist`: 2 calls, concurrent with podcast loading.
- phase 2 RSS reads: often 0 when `fileContentCache` is warm in-session.
- phase 2 artwork priming: 0 when memory cache is already hydrated from `AsyncStorage`.
- row artwork resolution: 0 when memory cache hits.

Total target on warm path: roughly 4 SAF calls plus any required validation misses.

## Non-Goals

- Persisting negative artwork lookups (`null`) across restarts.
- Blocking first paint on RSS file parsing or artwork priming.
- Forcing network refresh before showing cached artwork.

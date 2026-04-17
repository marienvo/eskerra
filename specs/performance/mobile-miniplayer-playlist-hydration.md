# Mobile MiniPlayer / R2 playlist hydration

## Problem (before)

On cold start with R2 playlist sync enabled, the bottom **MiniPlayer** stayed hidden until late in startup. Two causes were identified in code review:

1. **`readPlaylistCoalesced` dropped the settled promise** in a `.finally()` handler, so `App.tsx` bootstrap’s `playlist_prime` read did **not** dedupe the later `usePlayer` restore read → a **second** signed `GET` on `playlist.json` (R2).
2. **`usePlayer` restore** awaited `player.ensureSetup()` (native `TrackPlayer.setupPlayer()`) **before** reading the playlist and sending `HYDRATE`, so UI paint waited on native setup even though the MiniPlayer only needs machine context + catalog episode.

## Changes (after)

| Area | Change |
| --- | --- |
| [`apps/mobile/src/core/storage/eskerraStorage.ts`](../../apps/mobile/src/core/storage/eskerraStorage.ts) | Keep the resolved `readPlaylistCoalesced` promise in the coalescer map; remove the entry only on **reject** so bootstrap prime is reused. |
| [`apps/mobile/src/features/podcasts/hooks/usePlayer.ts`](../../apps/mobile/src/features/podcasts/hooks/usePlayer.ts) | Restore: start `readPlaylistCoalesced` and `ensureSetup` in parallel; **HYDRATE** as soon as playlist + catalog are valid; then await setup and `getState()` for the existing “native already playing” tail. Remote sync: start playlist read in parallel with `ensureSetup`, then keep setup → `getState` → consume `saved`. Resync: parallel read + setup; HYDRATE before awaiting setup on the happy path. |

## How to measure (device / dev build)

Use existing app breadcrumbs (see [`apps/mobile/App.tsx`](../../apps/mobile/App.tsx)):

- `bootstrap.playlist_prime.complete` — `elapsed_ms`, `has_playlist`
- `bootstrap.podcast_phase1.complete` — `elapsed_ms`, `episode_count`
- `bootstrap.vault_preload.complete` — `elapsed_ms`

**Target UX metric:** time from **MainTabs first frame** (or end of splash) until **MiniPlayer container** is non-null when a playlist entry exists — i.e. first paint after `HYDRATE` with `activeEpisode`.

Suggested manual protocol:

1. Cold start the app with a vault that has R2 playlist configured and a non-empty `playlist.json` pointing at a catalog episode.
2. Note wall-clock or logcat timestamps for splash dismiss vs. mini player chrome visible.
3. Compare **before** vs **after** on the same device/network; expect fewer R2 round-trips and earlier MiniPlayer when native setup is slow.

**Automated regression:** Jest covers coalesced vault reads (`readPlaylistCoalesced reuses settled result without a second vault read`) and `restore sends HYDRATE before ensureSetup promise settles` in [`apps/mobile/__tests__/usePlayer.test.ts`](../../apps/mobile/__tests__/usePlayer.test.ts).

## Result classification

| Status | Notes |
| --- | --- |
| **Pending (quantitative)** | No device timings were captured in-repo at authoring time; fill in a dated row below after you run the protocol above. |

### Measurement log (fill in)

| Date | Device / OS | Before `elapsed_ms` (prime → UI) | After `elapsed_ms` | Notes |
| --- | --- | --- | --- | --- |
| _TBD_ | _e.g. Pixel, Android 15_ | _TBD_ | _TBD_ | _Wi‑Fi vs LTE, same vault_ |

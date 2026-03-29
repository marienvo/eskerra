# Desktop and mobile parity

This document states what is shared between the **Android** app (`apps/mobile`) and the **desktop companion** (`apps/desktop`), what differs by platform, and what is intentionally deferred.

## Shared vault contract

The following are **identical on disk** once a vault root is chosen:

- **Vault root** is a single directory the user selects.
- **`Inbox/`** holds user-authored markdown notes (`.md`).
- **`General/`** holds podcast-related markdown and **`General/Inbox.md`**, a generated index of inbox note stems (same format as on Android).
- **`.notebox/settings-shared.json`** stores vault-scoped settings synced with the vault: optional Cloudflare **R2** (S3-compatible) fields only. **`displayName`** and **`deviceName`** live in **`.notebox/settings-local.json`** (per device; default empty strings; typically not committed), along with **`playlistKnownUpdatedAtMs`** (nullable number): the last playlist **`updatedAt`** timestamp this device accepted after a successful R2 or fallback local read/write. Legacy **`settings.json`** is read once for migration into `settings-shared.json`. If legacy **`displayName`** still appears in shared JSON, the app copies it into local settings and rewrites shared without that key. Parsing and defaults are implemented in `@notebox/core`. **Security:** storing R2 keys in the shared file is an accepted tradeoff for private vaults; see **section 9** in [`known-risks.md`](known-risks.md).
- **Playback playlist (`playlist.json`):** when **R2 is fully configured** in shared settings, the canonical JSON object lives in the R2 bucket as **`playlist.json`** at the bucket root (**one vault per bucket**). It includes the playback fields plus **`updatedAt`** (Unix ms). Devices compare timestamps with `playlistKnownUpdatedAtMs` and with any **`.notebox/playlist.json`** on disk: the **newer `updatedAt` wins**; there is no field-level merge. **`.notebox/playlist.json`** is **not** authoritative while R2 works; it is used for **offline / error fallback** until R2 succeeds again. With **no** R2 configuration, **`.notebox/playlist.json`** remains the only playlist store (still includes `updatedAt` on new writes).

## Platform-specific bootstrap

| Concern | Android (`apps/mobile`) | Desktop (`apps/desktop`) |
| ------- | ----------------------- | ------------------------- |
| Selected root | SAF **tree URI** persisted in AsyncStorage (`notesDirectoryUri`) | **Absolute POSIX path**; session in Tauri + persisted path in the app store plugin (`notebox-desktop.json` under the app data dir) |
| File API | `react-native-saf-x` via `safVaultFilesystem` implementing `VaultFilesystem` | Tauri **`vault_*` commands** (Rust `std::fs`) implementing the same `VaultFilesystem` surface for the web UI |
| Indexing / listing | SAF + optional Kotlin `NoteboxVaultListing` acceleration | POSIX `read_dir` via `vault_list_dir` (no RSS batch sync in MVP) |

## Feature matrix (MVP vs deferred)

| Capability | Android | Desktop (current milestone) |
| ---------- | ------- | --------------------------- |
| Choose vault folder | Yes (SAF) | Yes (native folder dialog) |
| Read/write Inbox markdown | Yes | Yes |
| Edit vault display name (`settings-local.json`) | Yes | Yes |
| Stream MP3 / resume from `playlist.json` | Yes (`react-native-track-player`) | Yes (`HTMLAudioElement` + Linux MPRIS via souvlaki) |
| Episodes list from vault `General/` podcast markdown | Yes (sectioned list) | Yes (desktop parses the same `*- podcasts.md` / RSS pie rules via TypeScript under `apps/desktop/src/lib/podcasts/`) |
| OS play/pause (lock screen / shell) | Yes (Track Player service) | Yes on Linux (MPRIS); other OSes depend on Tauri + souvlaki behavior |
| Filesystem-driven vault refresh | Pull-to-refresh / native listing | **notify**-based watch on `Inbox/`, `General/`, `.notebox/` with debounced UI refresh (plus optional Settings “Refresh from disk”) |
| RSS → vault markdown sync (Kotlin / native) | Yes | **Deferred** — not required for first desktop milestone |
| Native podcast artwork cache module | Android | **Deferred** on desktop |

## Media architecture

- **Android:** `AudioPlayer` implementation uses **Track Player**; `AudioPlayer` interface types live in `@notebox/core`.
- **Desktop:** `HtmlAudioPlayer` implements the same interface using **`<audio>`**; Rust commands **`media_set_metadata`**, **`media_set_playback`**, and **`media_clear_session`** mirror state to the OS on Linux (**souvlaki** / MPRIS). The frontend listens for the **`media-control`** event for shell-driven **play / pause / toggle** and toggles the web audio element accordingly.
- **Shared playlist:** both apps use the same **`playlist.json`** payload (vault disk path or R2 object). With R2 enabled, they **re-read on startup** and on **vault/podcast refresh** so another device’s newer `updatedAt` replaces local playback state when applicable.

## Desktop main-window UX

Primary-window flows should **not** use modal backdrops over the shell; use panes or a separate window. See [`specs/design/desktop-shell-patterns.md`](../design/desktop-shell-patterns.md).

## Performance expectations

- **Desktop** uses direct filesystem access; still avoid full vault scans on startup unless the first screen requires it (same product instinct as mobile). Heavy work should stay off the first paint path.
- **Measurement:** when changing startup or indexing behavior on either app, add simple timing logs per `.cursor/rules/performance.mdc`.

## Roadmap

Phased work to reach **feature parity** with the current Android app (inbox, podcasts from vault, RSS refresh, played state, shell polish) lives in [`specs/plans/desktop-feature-parity-phased.md`](../plans/desktop-feature-parity-phased.md). Use it to schedule **layout and QA passes between phases**.

## Testing notes

- **TypeScript:** `npm test` at the repo root runs `@notebox/core` (Vitest), `apps/mobile` (Jest), and release helper Node tests.
- **Desktop Rust:** `cargo check` / `cargo clippy` / `tauri dev` require Linux **WebKitGTK + GTK** dev packages (see [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux)). On Fedora, install the packages listed there plus **`gtk3-devel`** and **`pango-devel`** if Cargo fails with missing `gdk-3.0.pc` / `pango.pc` (`gdk-sys` / `pango-sys`). The [README](../../README.md) documents the exact `dnf` commands and `npm run desktop`.
- **CI:** Ubuntu runners install GTK/WebKit packages before `cargo check` for `apps/desktop/src-tauri` (see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)).

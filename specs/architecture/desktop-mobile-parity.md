# Desktop and mobile parity

This document states what is shared between the **Android** app (`apps/mobile`) and the **desktop companion** (`apps/desktop`), what differs by platform, and what is intentionally deferred.

## Shared vault contract

The following are **identical on disk** once a vault root is chosen:

- **Vault root** is a single directory the user selects.
- **`Inbox/`** holds user-authored markdown notes (`.md`).
- **`General/`** holds podcast-related markdown and **`General/Inbox.md`**, a generated index of inbox note stems (same format as on Android).
- **`.notebox/settings.json`** stores vault-scoped settings (currently `displayName`). Parsing and defaults are implemented in `@notebox/core`.
- **`.notebox/playlist.json`** stores the last playback pointer (`episodeId`, `mp3Url`, `positionMs`, `durationMs`) for resuming audio across devices that share the same vault folder.

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
| Edit `settings.json` display name | Yes | Yes |
| Stream MP3 / resume from `playlist.json` | Yes (`react-native-track-player`) | Yes (`HTMLAudioElement` + Linux MPRIS via souvlaki) |
| OS play/pause (lock screen / shell) | Yes (Track Player service) | Yes on Linux (MPRIS); other OSes depend on Tauri + souvlaki behavior |
| RSS → vault markdown sync (Kotlin / native) | Yes | **Deferred** — not required for first desktop milestone |
| Native podcast artwork cache module | Android | **Deferred** on desktop |

## Media architecture

- **Android:** `AudioPlayer` implementation uses **Track Player**; `AudioPlayer` interface types live in `@notebox/core`.
- **Desktop:** `HtmlAudioPlayer` implements the same interface using **`<audio>`**; Rust commands **`media_set_metadata`**, **`media_set_playback`**, and **`media_clear_session`** mirror state to the OS on Linux (**souvlaki** / MPRIS). The frontend listens for the **`media-control`** event for shell-driven **play / pause / toggle** and toggles the web audio element accordingly.
- **Shared playlist file:** both apps read/write **`.notebox/playlist.json`** so resuming the same vault on another app is possible when URLs and file layout match.

## Performance expectations

- **Desktop** uses direct filesystem access; still avoid full vault scans on startup unless the first screen requires it (same product instinct as mobile). Heavy work should stay off the first paint path.
- **Measurement:** when changing startup or indexing behavior on either app, add simple timing logs per `.cursor/rules/performance.mdc`.

## Testing notes

- **TypeScript:** `npm test` at the repo root runs `@notebox/core` (Vitest), `apps/mobile` (Jest), and release helper Node tests.
- **Desktop Rust:** `cargo check` / `cargo clippy` / `tauri dev` require Linux **WebKitGTK + GTK** dev packages (see [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux)). On Fedora, install the packages listed there plus **`gtk3-devel`** and **`pango-devel`** if Cargo fails with missing `gdk-3.0.pc` / `pango.pc` (`gdk-sys` / `pango-sys`). The [README](../../README.md) documents the exact `dnf` commands and `npm run desktop`.
- **CI:** Ubuntu runners install GTK/WebKit packages before `cargo check` for `apps/desktop/src-tauri` (see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)).

# Notebox

Notebox is a **notes + podcast** companion with two apps in one repo:

| App | Location | Stack |
| --- | --- | --- |
| **Mobile** | [`apps/mobile/`](apps/mobile/) | React Native (**Android only**) |
| **Desktop** | [`apps/desktop/`](apps/desktop/) | Tauri 2 + Vite + React (Linux-first; Fedora / GNOME is the reference) |
| **Shared logic** | [`packages/notebox-core/`](packages/notebox-core/) | TypeScript (vault paths, settings, `VaultFilesystem`, audio types) |

Both apps use the same **vault layout** on disk: user-chosen root folder, then `Inbox/`, `General/`, and `/.notebox/settings-shared.json` plus per-device `/.notebox/settings-local.json` (see [`specs/architecture/desktop-mobile-parity.md`](specs/architecture/desktop-mobile-parity.md)).

---

## Prerequisites (all developers)

- **Node.js** `>= 22.11.0` and **npm**
- From the **repository root**, run **`npm install`** once (workspaces hoist dependencies).

---

## Quick commands (run from repo root)

| Command | What it does |
| --- | --- |
| `npm run mobile` | Start Metro for the Android app |
| `npm run mobile:android` | Build/run the Android app on a device or emulator |
| `npm run desktop` | **Desktop:** `tauri dev` (Vite + native window) |
| `npm run desktop:build` | **Desktop:** production web build + `tauri build` |
| `npm test` | `@notebox/core` (Vitest) + mobile (Jest) + release helper tests |
| `npm run lint` | ESLint for mobile + desktop |

Workspace-scoped scripts (same as above, explicit):

```bash
npm run start -w @notebox/mobile
npm run desktop:dev -w @notebox/desktop
```

---

## Mobile (Android)

### What the mobile app does

- Select a Notes directory with the Android folder picker (SAF).
- Persist the selected tree URI in AsyncStorage.
- Create/update `/.notebox/settings-shared.json` (for example `displayName` and optional R2 fields), and `/.notebox/settings-local.json` for per-device `deviceName`.
- Debug APK build/install scripts live under [`scripts/`](scripts/) and call Gradle in [`apps/mobile/android/`](apps/mobile/android/).

### Extra prerequisites (Android only)

- Java 17
- Android Studio (SDK + emulator tools)
- `adb` on `PATH`, `ANDROID_HOME` set

For installs on a physical device: enable Developer Options and USB debugging.

### Local development (emulator + Fast Refresh)

1. Start an Android emulator (AVD Manager).
2. Terminal 1 — Metro:

   ```bash
   npm run mobile
   ```

3. Terminal 2 — run the app:

   ```bash
   npm run mobile:android
   ```

Press `r` in the Metro terminal for a full reload if Fast Refresh gets stuck.

### Build APK and install on a phone

**Debug** (expects Metro in dev; for quick installs):

```bash
npm run build:apk -w @notebox/mobile
npm run install:apk -w @notebox/mobile
# or both:
npm run apk -w @notebox/mobile
```

APK output: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

**Release** (JS bundled into the APK; no Metro on the device):

```bash
npm run build:apk-release -w @notebox/mobile
npm run install:apk-release -w @notebox/mobile
npm run apk-release -w @notebox/mobile
```

APK output: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`

The release flow runs [`scripts/bump-release-version.mjs`](scripts/bump-release-version.mjs) first (see script comments). Debug APK builds do **not** bump versions.

Release signing defaults to the **debug keystore** in [`apps/mobile/android/app/build.gradle`](apps/mobile/android/app/build.gradle) — fine for local testing, not for Play Store.

### First-launch check (mobile)

1. Open the app, tap **Choose Notes Directory**, pick a folder.
2. Confirm `/.notebox/settings-shared.json` (and `settings-local.json`) exist after first init.
3. Change `displayName`, save, force-close and reopen to verify persistence.

If Android revokes SAF access, the app should clear the saved URI and send you back to setup.

---

## Desktop (Tauri)

The desktop app is optional for mobile-only work. To run it you need:

1. **Rust** (e.g. [rustup](https://rustup.rs/) `stable`) — Tauri builds the native shell with Cargo.
2. **Linux system libraries** for WebKitGTK and GTK (Tauri’s webview and GUI stack). Follow the official list: [Tauri: Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux).

### Fedora (common reference)

Install the dependencies Tauri documents for Fedora, then the **C development** group:

```bash
sudo dnf check-update
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl wget file \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  libxdo-devel
sudo dnf group install "c-development"
```

If `cargo` / `tauri dev` fails with **`gdk-sys` / `pango-sys` not found** (missing `gdk-3.0.pc` / `pango.pc`), install GTK/Pango development packages explicitly:

```bash
sudo dnf install gtk3-devel pango-devel
```

Then from the **repo root**:

```bash
npm run desktop
```

This runs `desktop:dev` in [`apps/desktop`](apps/desktop/) (`tauri dev`: starts Vite and the native window).

Production-style build:

```bash
npm run desktop:build
```

Vault selection, `.notebox` settings, inbox notes, MP3 streaming, and Linux **MPRIS** (play/pause from GNOME) are described in [`specs/architecture/desktop-mobile-parity.md`](specs/architecture/desktop-mobile-parity.md).

---

## Tests and lint

```bash
npm test
npm run lint
```

---

## Known limitations

- **Mobile:** Android only (see [`specs/architecture/platform-targets.md`](specs/architecture/platform-targets.md)).
- **Desktop:** developed and tested primarily on **Linux**; other OS targets are best-effort upstream behavior.
- No sync service, backend, or multi-device coordination beyond sharing the same folder (for example via Syncthing) and the shared vault files.

---

## More documentation

- Architecture: [`specs/architecture/`](specs/architecture/)
- Desktop vs mobile contract: [`specs/architecture/desktop-mobile-parity.md`](specs/architecture/desktop-mobile-parity.md)

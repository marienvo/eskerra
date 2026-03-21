# Notebox (Android MVP)

Notebox is an Android-first React Native MVP that lets you pick a Notes directory, then stores app settings in a hidden `/.notebox/settings.json` file inside that directory by using the Android Storage Access Framework (SAF).

## What this MVP does

- Lets you select a Notes directory with the Android folder picker.
- Persists the selected directory URI in AsyncStorage.
- Creates and updates `/.notebox/settings.json`.
- Exposes one demo setting: `displayName`.
- Supports a one-command debug APK build/install flow.

## Prerequisites

- Node.js `>= 22.11.0`
- npm (bundled with Node)
- Java 17
- Android Studio (SDK + emulator tools)
- `adb` available on `PATH`
- `ANDROID_HOME` configured

For physical device installs via `adb`:

- Android phone with Developer Options enabled
- USB debugging enabled and authorized for this machine

## Install dependencies

```bash
npm install
```

## Local development (emulator + Fast Refresh)

React Native provides Fast Refresh out of the box (HMR-like behavior). Most code edits appear in the running emulator immediately after save.

1. Start an Android emulator from Android Studio (AVD Manager).
2. In terminal 1, start Metro:

```bash
npm run start
```

3. In terminal 2, install and run the debug app on the emulator:

```bash
npm run android
```

After this, save changes in `*.ts`/`*.tsx` files to see Fast Refresh updates. If the app gets out of sync, press `r` in the Metro terminal for a full reload.

## Build APK and install on phone

### Debug build (development)

Build debug APK:

```bash
npm run build:apk
```

Install APK to a connected Android device via `adb`:

```bash
npm run install:apk
```

Build + install in one command:

```bash
npm run apk
```

Expected APK path: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release build (standalone, no Metro required)

A release build bundles the JavaScript into the APK itself. The app works without a Metro server running on your computer.

Build release APK (takes some time):

```bash
npm run build:apk-release
```

Install release APK to a connected Android device via `adb`:

```bash
npm run install:apk-release
```

Build + install in one command:

```bash
npm run apk-release
```

Expected APK path: `android/app/build/outputs/apk/release/app-release.apk`

> **Note:** The release build is signed with the debug keystore by default (see `android/app/build.gradle`). This is fine for local testing but not for publishing to the Play Store.

## First-launch verification flow

1. Open the app.
2. Tap **Choose Notes Directory**.
3. Select an existing Notes folder in the Android picker.
4. App initializes `/.notebox/settings.json`.
5. Update `displayName` and tap **Save**.
6. Force-close and relaunch the app to verify persisted URI and setting.

## Permission recovery behavior

If Android revokes folder permission, the app detects invalid access during bootstrap, clears the saved URI, and routes back to setup so you can choose a directory again.

## Notes on hidden folders

Some file managers hide dot-directories by default. If you do not see `/.notebox`, check your file manager hidden-files setting. In-app save/read behavior is the source of truth.

## Known limitations

- Android-only MVP.
- Single settings file and one demo field (`displayName`).
- No sync, backend, authentication, or multi-device coordination.
- SAF behavior can vary slightly between OEM Android picker implementations.

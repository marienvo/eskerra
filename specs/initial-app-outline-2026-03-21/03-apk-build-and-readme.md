# Notebox MVP: APK Build Plan and README Outline

## APK build plan (smallest practical path)

For this hobby MVP, use a debug APK first. It avoids keystore setup and proves end-to-end Android installation quickly.

### Script: `scripts/build-apk.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/android"
./gradlew assembleDebug

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
echo "APK ready: $APK"
```

### Script: `scripts/install-apk.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"

adb install -r "$APK"
echo "Installed: $APK"
```

### `package.json` scripts

```json
{
  "scripts": {
    "android": "react-native run-android",
    "build:apk": "bash scripts/build-apk.sh",
    "install:apk": "bash scripts/install-apk.sh",
    "apk": "npm run build:apk && npm run install:apk"
  }
}
```

### One-command install path

- `npm run apk`

This is the concrete "generate and install APK with one command" flow requested.

## Build prerequisites

- Node.js LTS (recommended: latest active LTS)
- Java 17
- Android SDK + platform/build-tools required by the initialized RN version
- `ANDROID_HOME` configured
- `adb` on PATH
- Android phone with USB debugging enabled and authorized

## README outline

### 1) Project goal

One short paragraph:

- Android-only MVP
- Select Notes directory
- Read/write app settings in `/.notebox`
- Prove APK build/install works

### 2) Prerequisites

Explicit list:

- Node + npm versions
- Java version
- Android SDK and `adb`
- USB debugging setup

### 3) Setup

Commands:

1. `npm install`
2. `npm run android` (optional dev run check)

### 4) Build and install APK

Commands:

1. `npm run build:apk`
2. `npm run install:apk`
3. or single command: `npm run apk`

Include expected APK output path.

### 5) First launch flow

Explain exactly what user sees:

1. Tap "Choose Notes Directory"
2. Select existing Notes folder in Android picker
3. App creates `/.notebox/settings.json`
4. Change demo setting and save
5. Relaunch app to confirm persistence

### 6) Known MVP limitations

- Android only
- Single demo setting
- No sync logic, no backend, no auth
- SAF permissions can be revoked by OS/user and may require re-selecting folder

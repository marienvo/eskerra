#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="$ROOT/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk"

adb install -r "$APK"
echo "Installed: $APK"

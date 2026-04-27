#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

node "$ROOT/scripts/bump-release-version.mjs"

# Prefer a full JDK with jmods so Gradle's toolchain probe can detect JAVA_COMPILER.
# The Red Hat openjdk packages on Fedora/RHEL ship without jmods by default, which
# causes Gradle 8 to report "does not provide the required capabilities: [JAVA_COMPILER]".
# Try known good locations in priority order: project-local provisioned JDK first,
# then any Adoptium JDK already downloaded by Gradle, then the system default.
_pick_java_home() {
  local candidates=(
    "$ROOT/.local-jdk/jdk-21.0.10+7"
    "$HOME/.gradle/jdks/eclipse_adoptium-21"*
    "$HOME/.gradle/jdks/eclipse_adoptium-17"*
  )
  for c in "${candidates[@]}"; do
    if [[ -d "$c" && -x "$c/bin/javac" ]]; then
      echo "$c"
      return
    fi
  done
}
_jdk="$(_pick_java_home || true)"
if [[ -n "$_jdk" ]]; then
  export JAVA_HOME="$_jdk"
fi
unset _jdk _pick_java_home

# Export vars from `.env` so Gradle / sentry-cli see SENTRY_AUTH_TOKEN (and similar).
_ENV_FILE="$ROOT/apps/mobile/.env"
if [[ ! -f "$_ENV_FILE" && -f "$ROOT/.env" ]]; then
  _ENV_FILE="$ROOT/.env"
fi
if [[ -f "$_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$_ENV_FILE"
  set +a
fi
unset _ENV_FILE

cd "$ROOT/apps/mobile/android"

# Clear Gradle's cached JS bundle so a version bump always triggers a fresh Hermes compile.
# Without this, `assembleRelease` can reuse a stale bundle from a previous build and the
# app reports the old version number even after `bump-release-version.mjs` increments it.
_BUNDLE_CACHE=(
  "app/build/generated/assets/react/release"
  "app/build/tmp/createBundleReleaseJsAndAssets"
  "app/build/intermediates/assets/release"
)
for _dir in "${_BUNDLE_CACHE[@]}"; do
  if [[ -d "$_dir" ]]; then
    rm -rf "$_dir"
  fi
done
unset _BUNDLE_CACHE _dir

./gradlew assembleRelease

APK="$ROOT/apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
echo "APK ready: $APK"

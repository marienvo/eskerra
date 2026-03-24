#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

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

# Export vars from repo root `.env` so Gradle / sentry-cli see SENTRY_AUTH_TOKEN (and similar).
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

cd "$ROOT/android"
./gradlew assembleRelease

APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
echo "APK ready: $APK"

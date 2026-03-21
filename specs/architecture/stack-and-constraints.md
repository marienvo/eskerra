# Notebox MVP: Recommendation and Stack

## Recommendation summary

Stay with bare React Native CLI for this MVP.

Expo with development builds is technically viable and supports custom native modules. This decision is not an Expo Go limitation argument.

The choice is pragmatic: this app already relies on native modules for SAF-based file access, and bare CLI is the most direct, lowest-friction foundation with the current codebase and build scripts.

## Technical constraints

### Central Android constraint: SAF, not file paths

On Android 11+ (API 30+), scoped storage is enforced. For shared/external directories:

- You do not get broad path access like `/storage/emulated/0/Notes`.
- The user must pick a directory through the system picker (`ACTION_OPEN_DOCUMENT_TREE`).
- The app receives a tree URI (`content://...`), not a normal file path.
- Read/write to that directory must happen through SAF-aware APIs.

### Reusing directory access across app restarts

Two separate things are required:

1. Persist permission with `takePersistableUriPermission` (triggered when choosing with persistence enabled).
2. Persist the chosen URI string in app-owned storage so the app knows which directory to reopen on next launch.

Practical MVP approach:

- Store only `notesDirectoryUri` in AsyncStorage.
- Store all app settings/state in `.notebox` inside the selected Notes directory.

### Permissions and what not to do

- SAF flow does not require legacy storage permissions like `READ_EXTERNAL_STORAGE` or `WRITE_EXTERNAL_STORAGE`.
- Avoid `MANAGE_EXTERNAL_STORAGE` ("All files access") for this MVP.
- Avoid path-based libraries (`react-native-fs`, `react-native-blob-util`) for the selected Notes directory, because they are path-oriented and not SAF tree URI oriented.

### Practical caveat

`react-native-saf-x` has uncertainty with newest RN new architecture combinations. For MVP reliability, explicitly set:

- `newArchEnabled=false` in `android/gradle.properties`

This lowers integration risk and keeps the implementation simple.

## Recommended stack

- React Native CLI + TypeScript (Android-first, bare project)
- `react-native-saf-x` (SAF directory selection + URI file operations)
- `@react-native-async-storage/async-storage` (persist selected URI only)
- `@react-navigation/native` + `@react-navigation/stack` + `@react-navigation/bottom-tabs` (setup gate + 5-tab shell)
- `react-native-screens` + `react-native-safe-area-context` + `react-native-gesture-handler` (navigation peer deps)
- `react-native-markdown-display` (read-only markdown rendering in Vault detail)
- `react-native-track-player` (podcast playback spike via native module)

No backend, no cloud, no sync engine, no global state library.

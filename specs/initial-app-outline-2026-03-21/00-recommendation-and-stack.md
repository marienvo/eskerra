# Notebox MVP: Recommendation and Stack

## Recommendation summary

Use bare React Native CLI (not Expo managed) for this MVP.

Reason: the core requirement is user-selected directory access on Android, which means using the Storage Access Framework (SAF) with `content://` URIs and persistable URI permissions. A bare React Native app with a SAF-focused native module is the most boring and reliable path for this.

Expo managed can work for some filesystem tasks, but it is a worse fit for this specific SAF-heavy workflow and has had SAF edge-case limitations around directory/subdirectory operations.

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
- `@react-navigation/native` + `@react-navigation/stack` (minimal 2-screen flow)
- `react-native-screens` + `react-native-safe-area-context` (navigation peer deps)

No backend, no cloud, no sync engine, no global state library.

# Notebox MVP: Architecture

## Simplest architecture

Keep architecture intentionally small and explicit:

- `App.tsx` decides whether setup is needed.
- `SetupScreen` handles directory selection only.
- `HomeScreen` proves read/write by editing one setting.
- `appStorage.ts` stores only selected directory URI in AsyncStorage.
- `noteboxStorage.ts` handles `.notebox/settings.json` through SAF.

No service layer abstraction beyond these two storage modules.

## App flow

```text
App launch
  -> read "notesDirectoryUri" from AsyncStorage
    -> missing: SetupScreen
    -> present: hasPermission(uri)?
        -> false: SetupScreen
        -> true: init .notebox + load settings -> HomeScreen
```

```text
SetupScreen
  -> Choose Notes Directory
  -> openDocumentTree(true)
  -> save URI in AsyncStorage
  -> init .notebox/settings.json
  -> navigate HomeScreen
```

```text
HomeScreen
  -> read settings.json
  -> edit demo setting
  -> save settings.json
  -> optional "Change directory" clears saved URI and returns to SetupScreen
```

## Source layout (minimal)

```text
src/
├── App.tsx
├── screens/
│   ├── SetupScreen.tsx
│   └── HomeScreen.tsx
├── storage/
│   ├── appStorage.ts
│   └── noteboxStorage.ts
└── types.ts
```

## Android directory ownership model

- The selected Notes directory is user-owned external/shared storage.
- App-owned files for this MVP must live in `/.notebox` under that directory.
- App sandbox storage (AsyncStorage) only stores the pointer (`notesDirectoryUri`) needed to re-open that external location.

This matches your requirement: after setup, app settings/state live inside the selected Notes directory dot folder whenever possible.

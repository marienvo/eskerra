# Notebox MVP: Implementation Phases

## Phase 1: Scaffold Android-first RN app

1. Initialize project:
   - `npx @react-native-community/cli@latest init notebox --template react-native-template-typescript`
2. Install dependencies:
   - `react-native-saf-x`
   - `@react-native-async-storage/async-storage`
   - `@react-navigation/native`
   - `@react-navigation/stack`
   - `react-native-screens`
   - `react-native-safe-area-context`
3. Set `newArchEnabled=false` in `android/gradle.properties` for SAF module stability.
4. Verify baseline run:
   - `npx react-native run-android`

Exit criteria:

- App launches on Android device/emulator.
- No build/linking issues with SAF dependency.

## Phase 2: App bootstrap + route shell

1. Add stack navigation with two screens:
   - `SetupScreen`
   - `HomeScreen`
2. In bootstrap logic:
   - Read `notesDirectoryUri` from AsyncStorage.
   - If missing, route to setup.
   - If present, check SAF permission (`hasPermission`).
   - If permission invalid, clear URI and route to setup.

Exit criteria:

- App starts into setup on fresh install.
- App skips setup when URI exists and permission is valid.

## Phase 3: Directory selection + persistence

1. Implement `appStorage.ts`:
   - `getSavedUri()`
   - `saveUri(uri)`
   - `clearUri()`
2. Implement `SetupScreen`:
   - Button: "Choose Notes Directory"
   - Call `openDocumentTree(true)` (persist permission)
   - On success, save URI and proceed
3. Handle cancellation/errors with simple inline status text.

Exit criteria:

- User can choose Notes directory.
- URI survives app restart via AsyncStorage.

## Phase 4: Dot folder + settings file I/O

1. Implement `noteboxStorage.ts` with:
   - `initNotebox(baseUri)`
   - `readSettings(baseUri)`
   - `writeSettings(baseUri, settings)`
2. `initNotebox` behavior:
   - Ensure `/.notebox` exists (`mkdir`).
   - Ensure `/.notebox/settings.json` exists with defaults.
3. Defaults:

```json
{
  "displayName": "My Notebox"
}
```

4. Ensure all operations use SAF URI methods, not path APIs.

Exit criteria:

- `.notebox/settings.json` is created in selected Notes directory.
- Read/write operations round-trip correctly.

## Phase 5: Minimal demo UI flow

1. `HomeScreen` displays:
   - Selected directory label
   - One input: `displayName`
   - Save button
   - "Change directory" action
2. On mount:
   - Load URI
   - Run `initNotebox`
   - Load `settings.json`
3. On save:
   - Validate non-empty string (simple trim check)
   - Write JSON
   - Show success/error text
4. On "Change directory":
   - Clear URI in AsyncStorage
   - Return to setup

Exit criteria:

- Editing `displayName` persists across relaunch.
- Setup -> Home -> Save -> Relaunch flow is stable.

## Phase 6: Validate on physical phone

1. Install debug build to actual phone.
2. Run first-launch setup using real file picker.
3. Confirm `.notebox/settings.json` exists and updates when saving.
4. Force-close app and relaunch to verify URI reuse and setting persistence.
5. Revoke/alter directory permission scenario:
   - App should detect invalid permission and route back to setup.

Exit criteria:

- MVP workflow works on target Android phone, not only emulator.

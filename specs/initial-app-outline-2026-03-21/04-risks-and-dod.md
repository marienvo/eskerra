# Notebox MVP: Risks, Open Questions, Definition of Done

## Risks / uncertainty areas

## 1) SAF library compatibility with latest RN defaults (High)

Risk:

- `react-native-saf-x` may have compatibility issues depending on RN version and new architecture defaults.

Mitigation:

- Start with `newArchEnabled=false`.
- Validate on real device early (before polishing UI).
- Keep fallback option: test maintained fork if primary package blocks progress.

## 2) URI handling assumptions (High)

Risk:

- Incorrect URI composition for nested files can break create/read/write.

Mitigation:

- Keep URI joining logic centralized in `noteboxStorage.ts`.
- Validate by creating `.notebox/settings.json` and reading it back in one flow test.
- Avoid ad-hoc URI string manipulation across screens.

## 3) Persisted permission may disappear (Medium)

Risk:

- User clears app data, changes storage state, or OS revokes permission.

Mitigation:

- On launch, always re-check `hasPermission(savedUri)`.
- If invalid, clear saved URI and route to setup with clear message.

## 4) OEM picker differences (Medium)

Risk:

- Some devices (Samsung/Xiaomi/etc.) behave differently in folder picker UI.

Mitigation:

- Test on your target physical phone early.
- Keep setup interaction minimal: one button, straightforward error text.

## 5) Dot folder visibility confusion (Low)

Risk:

- User may not see `.notebox` in some file managers and think it was not created.

Mitigation:

- Mention hidden-folder behavior in README.
- Rely on in-app read/write confirmation as ground truth.

## Open questions

1. Confirm exact dot folder name: `.notebox` (assumed final).
2. Confirm demo setting key/value:
   - proposed key: `displayName`
   - default value: `"My Notebox"`
3. Confirm target minimum Android API (plan assumes modern Android + scoped storage behavior, typically API 30+ target).

## Definition of done

- [ ] Fresh install opens setup screen.
- [ ] User can select existing Notes directory using Android picker.
- [ ] App persists selected directory URI in AsyncStorage.
- [ ] App creates `/.notebox/settings.json` in selected directory.
- [ ] Home screen reads and displays `displayName` from settings.
- [ ] Editing and saving `displayName` updates `settings.json`.
- [ ] After force-close/relaunch, app reuses saved directory and displays persisted setting.
- [ ] If permission is invalid/revoked, app routes back to setup safely.
- [ ] `npm run apk` builds and installs a debug APK on connected Android device.
- [ ] README includes exact prerequisites and commands for build/install and first-run verification.

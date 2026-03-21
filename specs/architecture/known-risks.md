# Notebox: Known Risks and Mitigations

## 1) SAF library compatibility with latest RN defaults (High)

Risk:

- `react-native-saf-x` may have compatibility issues depending on RN version and new architecture defaults.

Mitigation:

- Start with `newArchEnabled=false`.
- Validate on real device early (before polishing UI).
- Keep fallback option: test maintained fork if primary package blocks progress.
- Before RN upgrades or new native module adoption, explicitly validate New Architecture support on a real Android device.

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

## 6) Podcast native playback integration risk (Medium)

Risk:

- `react-native-track-player` setup differs across Android devices/ROMs, and emulator behavior does not fully represent device playback/background behavior.

Mitigation:

- Keep Podcasts as a spike in MVP and verify on a physical Android device.
- Register playback service early and validate setup before investing in player UI.

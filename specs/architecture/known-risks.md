# Notebox: Known Risks and Mitigations

## 1) SAF library compatibility with New Architecture (High)

Risk:

- `react-native-saf-x` is a Paper (old-arch) module. Since RN 0.82, `newArchEnabled` in `gradle.properties` is ignored and New Architecture is always active in this project (RN 0.84). The obsolete property was removed to avoid misleading configuration.
- However, RN 0.84's interop layer has allowed `react-native-saf-x` to load successfully so far (no `TurboModuleInteropUtils$ParsingException` observed for it). This should be validated before relying on it in production.

Mitigation:

- Validate SAF read/write on a real device before shipping.
- If `react-native-saf-x` fails under the interop layer in a future RN upgrade, evaluate a fork or replacement (e.g., `expo-file-system` with bare workflow, or a custom native module).
- Before any RN version bump, explicitly test file-picker and read/write flows on a physical Android device.

## 2) URI handling assumptions (High)

Risk:

- Incorrect URI composition for nested files can break create/read/write.

Mitigation:

- Keep URI joining logic centralized in `noteboxStorage.ts`.
- Validate by creating `.notebox/settings-shared.json` and reading it back in one flow test.
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

## 6) react-native-track-player on New Architecture (Medium — mitigated with alpha)

Risk:

- `react-native-track-player@5.0.0-alpha0` resolves the New Architecture parsing crash from v4, but it is still an alpha release.
- Alpha-specific regressions are possible, especially around remote controls and notification actions.

Mitigation:

- Audio calls are isolated behind an adapter layer: `AudioPlayer` interface in `src/features/podcasts/services/audioPlayer.ts` and `TrackPlayerAdapter` in `src/features/podcasts/services/trackPlayerAdapter.ts`.
- If a future release regresses, only the adapter needs to change and the hooks/UI remain untouched.
- Keep smoke-testing background play, lock screen controls, and pause/resume on a physical Android device before releases.

Contingency:

- If track-player alpha becomes unstable on target devices, switch the adapter implementation to a temporary in-app-only backend (for example `react-native-video`) while preserving app-level APIs.

## 7) Android native vault listing (`NoteboxVaultListing`) (Medium)

### Why this exists (rationale)

- React Native handles interaction and React updates on a **single JavaScript thread**. Listing a large SAF folder via `react-native-saf-x` is async at the native I/O layer, but when results arrive the bridge still delivers a large payload to JS, where **filtering, sorting, and building state** run synchronously and can stack with other startup work (for example podcast refresh). That showed up as **jank or short freezes** when switching to Vault or Podcasts soon after cold boot.
- The Kotlin module [`VaultListingModule`](../../apps/mobile/android/app/src/main/java/com/notebox/VaultListingModule.kt) was added to move **directory enumeration plus markdown filtering and sorting** onto a **background executor** and return a **small, already-filtered** list to JS when the Android `DocumentFile` APIs cooperate with our directory URIs. The goal is to **reduce long synchronous bursts on the JS thread** after listing, not to replace SAF or duplicate all app logic in native.
- **Important:** `androidx.documentfile.provider.DocumentFile` and `react-native-saf-x` do not always agree on the same URI strings (tree vs document URIs, OEM quirks). So native listing is **best-effort**; correctness for listing always remains available through the existing JS path (`exists`, `listFiles`, same filters as in [`noteboxStorage.ts`](../../apps/mobile/src/core/storage/noteboxStorage.ts)).

### Risk

- Wrong URI handling or `DocumentFile` behavior on some OEMs can return empty lists or diverge from the JS/`react-native-saf-x` path.

### Mitigation

- JavaScript falls back to `exists` + `listFiles` + filter in [`noteboxStorage.ts`](../../apps/mobile/src/core/storage/noteboxStorage.ts) when `tryListMarkdownFilesNative` returns `null` (non-Android, missing module, or thrown error from native).
- If native resolves with an **empty array** but `exists(directoryUri)` is still **true** for the SAF path, the app **does not** trust the empty native result and runs the same JS listing path (native and `react-native-saf-x` can disagree on visibility).
- Kotlin throws instead of returning an empty array when `DocumentFile` reports the directory missing, so JS can fall back when native cannot open the tree URI reliably.
- Keep listing rules aligned: markdown suffix, exclude filenames containing `sync-conflict`, sort by `lastModified` descending (see Kotlin `VaultListingModule`).
- Session prepare avoids `DocumentFile.findFile` for `General/Inbox.md` when a **composed child URI** (same string pattern as JS: parent General URI + `/Inbox.md`) resolves to the file, because `findFile` on a very large `General/` directory can enumerate thousands of entries. A **slow fallback** to `findFile` remains for providers where the composed URI does not work.
- Validate on a physical Android device after changes; iOS is unchanged and always uses the JS path.

## 8) Podcast artwork `content://` and main-thread ANRs (Medium — mitigated)

### Risk

- Showing vault podcast artwork via React Native `Image` using SAF **`content://`** URIs can cause **ANRs**: the stack may show the main thread blocked in `ContentResolver` (for example `getType`) under Fresco while `ReactImageView` lays out.

### Mitigation

- New downloads store artwork under app-internal `filesDir` as **`file://`** (`writeArtworkFile` in [`PodcastArtworkCacheModule`](../../apps/mobile/android/app/src/main/java/com/notebox/PodcastArtworkCacheModule.kt)); **`Image` uses those URIs directly.** Legacy cached vault **`content://`** artwork is still copied to app cache on a **background native thread** via `ensureLocalArtworkFile` before display (see [`androidPodcastArtworkCache.ts`](../../apps/mobile/src/core/storage/androidPodcastArtworkCache.ts) and [`usePodcastArtworkDisplayUri.ts`](../../apps/mobile/src/features/podcasts/hooks/usePodcastArtworkDisplayUri.ts)).

## 9) Cloudflare R2 credentials in `settings-shared.json` (Medium — accepted for private vaults)

Risk:

- Optional R2 fields (`endpoint`, `bucket`, `accessKeyId`, `secretAccessKey`) are stored as **plain JSON inside the Notes vault**. Any copy of the vault (backup, sync to another machine, accidental commit to a shared Git remote, malware with file access) can expose those credentials.

Current stance:

- The product treats the Notes vault as **private and user-controlled**, like the markdown notes themselves. Keeping secrets in the vault avoids a separate secrets store for the current single-user, local-first model.

Future direction:

- If the app must support **multi-user**, **published/shared vaults**, or stricter security requirements, R2 (and similar) access should move to **short-lived or server-mediated credentials** via an authenticated backend, not long-lived keys in vault JSON.

Mitigation (today):

- Settings UI calls out that credentials live in the vault folder and should not be shared widely.
- Do not treat `mock-vault` or developer samples as a pattern for production secrets in a public repo (use placeholders only).

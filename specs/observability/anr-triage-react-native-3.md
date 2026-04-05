# ANR triage: REACT-NATIVE-3 (`ApplicationNotResponding`)

This note records the **triage decision** and **developer workflow** for Android ANRs that lack a Java stacktrace (for example, events captured via **AppExitInfo**).

## Triage decision (Phase A)

- **Issue:** [REACT-NATIVE-3](https://personal-133.sentry.io/issues/REACT-NATIVE-3) — single occurrence (`n = 1`), **no stacktrace**, mechanism **AppExitInfo**, **super_low** Seer actionability.
- **Default posture:** Treat as **monitoring-only** until recurrence (`n > 1`) or until a **local repro** with Android Studio profiling exists.
- **Escalate immediately** if ANRs repeat, user-reported freezes align in time, or Play vitals show ANR spikes for the same release.

## Reproduction and profiling (Phase B)

1. Install a build matching the reported **release** (for example `eskerra@0.0.1` from `package.json` / Gradle `versionName`).
2. Use a **physical** Android device when possible (especially lower-RAM ARM devices).
3. Exercise **cold start** and **resume** with a **saved vault** (`session` present), matching Sentry tags when available.
4. **Android Studio:** CPU Profiler / **System Trace** during launch and first navigation after vault restore; inspect the **main thread** for long stalls.
5. **Debug builds:** `StrictMode` is enabled in [`MainApplication.kt`](../../apps/mobile/android/app/src/main/java/com/eskerra/MainApplication.kt) (`penaltyLog` only). Watch **Logcat** for `StrictMode` violations (main-thread disk/network).

## Observability (Phase C)

- **Sentry:** `attachThreads: true` is set in [`registerSentry.ts`](../../apps/mobile/src/core/observability/registerSentry.ts) so **Android** events include **thread snapshots** where the SDK supports it, without turning on performance transactions (`tracesSampleRate` remains `0` per Phase 1).
- **Bootstrap / vault:** Breadcrumbs follow [`phase-1-implementation-spec.md`](phase-1-implementation-spec.md) (`app.bootstrap.*`, `vault.session.restore.*`); [`startupTiming.ts`](../../apps/mobile/src/core/observability/startupTiming.ts) adds `elapsed_ms` fields for correlation with ANR timelines.
- **Phase 1 spec** still defers dedicated **App Hang / ANR** product toggles that duplicate freeze detection; thread attachment is **error-context enrichment**, not a second hang detector.

## Code changes (Phase D)

Only after a **hotspot** is identified (profiler, repeated Sentry events with thread state, or clear breadcrumb correlation):

- Prefer **deferring work**, **async I/O**, and **lazy tab / feature loading** per [`.cursor/rules/performance.mdc`](.cursor/rules/performance.mdc).
- Add **regression tests** or **timing logs** for the specific path changed.

## Issue workflow

- Do **not** close REACT-NATIVE-3 from a speculative refactor.
- When fixing a confirmed root cause, reference `Fixes REACT-NATIVE-3` in the merge commit message if your Sentry/Git integration uses it.

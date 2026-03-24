# Phase 1 observability slice — implemented

This documents what was shipped in the minimal Sentry + ring buffer slice (see also [observability-phase1-slice-deferred.md](./observability-phase1-slice-deferred.md)).

## What was added

- **`@sentry/react-native`** dependency with JS init in [`src/core/observability/registerSentry.ts`](../../src/core/observability/registerSentry.ts) (imported first from [`index.js`](../../index.js)).
- **Disabled** for this slice: performance tracing (`tracesSampleRate: 0`), profiling, replays, app hang tracking, failed-request capture, screenshots, view hierarchy.
- **Unhandled promise rejections:** `patchGlobalPromise: true` (Sentry default behavior).
- **Global errors:** Sentry’s default React Native error pipeline (no custom `ErrorUtils` wrapper to avoid duplicate capture).
- **Wrappers:** [`appBreadcrumb`](../../src/core/observability/appBreadcrumb.ts), [`reportUnexpectedError`](../../src/core/observability/reportUnexpectedError.ts), [`syncVaultSessionContext`](../../src/core/observability/syncVaultContext.ts).
- **Ring buffer v1:** AsyncStorage-backed JSON array in [`ringBuffer.ts`](../../src/core/observability/ringBuffer.ts); mirrored breadcrumbs; tail attached once per cold start (rate-limited 4h) as `notebox.ring_buffer.tail` with `extra.ring_tail`.
- **Navigation:** [`RootNavigator.tsx`](../../src/navigation/RootNavigator.tsx) — `onStateChange` breadcrumbs with `name` + `params_keys` only (no param values).
- **Vault:** [`VaultContext.tsx`](../../src/core/vault/VaultContext.tsx) — restore/apply breadcrumbs; `reportUnexpectedError` for `init_notebox`, `read_settings`, and `get_saved_uri` failures.
- **Privacy:** [`redact.ts`](../../src/core/observability/redact.ts) scrubs URI-like substrings in `beforeSend` and `beforeBreadcrumb`.
- **Android:** [`android/app/build.gradle`](../../android/app/build.gradle) applies `sentry.gradle`; [`android/sentry.properties`](../../android/sentry.properties) has org/project (no auth token).
- **Jest:** [`__mocks__/sentry-react-native.ts`](../../__mocks__/sentry-react-native.ts) + [`jest.config.js`](../../jest.config.js) mapper so tests do not load the native SDK.
- **TypeScript:** [`tsconfig.json`](../../tsconfig.json) `resolveJsonModule` for `package.json` release string.

## Android release builds and Sentry upload

Release builds apply `sentry.gradle`, which registers source map upload tasks. Upload is **skipped** unless:

- `SENTRY_AUTH_TOKEN` is set in the environment (recommended for CI), or  
- `auth.token=...` is present in `android/sentry.properties` (local only; **never commit** tokens).

Override: `SENTRY_DISABLE_AUTO_UPLOAD=true` forces skip. This is implemented in [`android/app/build.gradle`](../../android/app/build.gradle) by replacing `shouldSentryAutoUploadGeneral` after the Sentry script is applied.

## Intentionally deferred

- Full **Sentry wizard** pass if native/Metro differs from manual Gradle apply.
- **`pod install`** on iOS (run locally after pulling): `cd ios && pod install`.
- **CI** `SENTRY_AUTH_TOKEN` for debug files / source maps on release builds (set the env var in CI so uploads run).
- Podcasts, RSS, audio, markdown screens, Kotlin vault listing, bootstrap breadcrumbs in `App.tsx`.

## Manual verification

1. **Release or dev with DSN:** Launch the app, navigate between tabs; confirm Sentry shows breadcrumbs on a manually thrown test (temporarily add `throw new Error('sentry test')` behind a dev-only button, then remove).
2. **Unhandled rejection:** Temporarily add `Promise.reject(new Error('rej test'))` after mount; confirm one issue in Sentry.
3. **Vault:** With a valid vault, cold start; confirm `vault.session.restore.*` and `session.apply.*` breadcrumbs. Revoke SAF permission and reopen to force restore failure path; confirm `vault.session.restore.fail` breadcrumb (non-fatal only if an unexpected error is thrown from storage).
4. **Ring buffer:** After navigation, force-quit and relaunch; within 4 hours you should **not** get a second `ring_buffer.tail` message (rate limit). Clear `AsyncStorage` key `notebox.observability.ring.lastSentAt` (or wait 4h) to see tail upload again.
5. **Jest:** `npm test` — no Sentry network calls (mocked).

## Client DSN

Configured in [`src/core/observability/sentryDsn.ts`](../../src/core/observability/sentryDsn.ts). Clear or rotate in Sentry if the repo is shared publicly.

# Phase 1 observability implementation spec (Sentry + ring buffer)

This document is the **executable Phase 1 spec** for Notebox. It derives from the repository observability plan: **one backbone (Sentry)** plus a **small local ring buffer**. It does **not** replace that plan; it narrows Phase 1 to a minimal, high-signal slice.

**Out of scope for this document:** implementation code, Phase 2+ features.

---

## A. Phase 1 scope summary

### In scope (Phase 1)

1. **Fatal and non-fatal error reporting to Sentry** from JS and native (via `@sentry/react-native` and wizard-aligned native wiring).
2. **Breadcrumbs** for navigation and a **short list of high-risk flows** so post-mortems show *where the user was* and *what long-running work had started*.
3. **Global scope defaults:** environment, release, dist, coarse app state tags (no PII).
4. **Unhandled JS errors and unhandled promise rejections** routed to Sentry **once** (no duplicate events from the same root cause).
5. **Ring buffer v1:** persisted JSONL, bounded size, mirrored breadcrumbs + a few explicit lifecycle lines; **recovery on next launch** and **attach to Sentry** (rate-limited).
6. **Hermes + release builds:** source maps / debug files upload path defined (wizard + CI token), so stack traces are readable.

### Explicitly deferred

| Item | Deferred to |
|------|-------------|
| Performance **transactions** and **spans** for slow flows | Phase 2 |
| JS thread **stall / heartbeat** heuristic (`perf.js_thread_stall_suspected`) | Phase 2 |
| FPS / frame metrics | Phase 2 |
| Native module **per-operation** timing spans (e.g. Kotlin listing) | Phase 2 |
| Session Replay | Phase 3 or never (high overhead) |
| Profiling (continuous) | Phase 3 |
| Broad `beforeBreadcrumb` capture of **all** console / XHR bodies | Never (too noisy) |
| “Log every catch” or automatic non-fatal on all rejections | Never (policy; see guardrails) |

### Phase 1 definition of “enough context for unresponsiveness”

Phase 1 does **not** prove a freeze occurred or measure its duration. It provides **correlation context**: last visible screen, recent flow start/end breadcrumbs, and ring-buffer tail so support can narrow *which area* to investigate. **Quantified** stall detection waits for Phase 2.

---

## B. Exact Sentry configuration spec (Phase 1)

### SDK capabilities

| Capability | Phase 1 | Notes |
|------------|---------|--------|
| Error / exception capture (`captureException`) | **On** | Core |
| Native crash reporting (iOS/Android) | **On** | Wizard-linked native SDK |
| Automatic session tracking | **On** | Default; acceptable overhead |
| **Performance monitoring** (transactions, spans, `startTransaction`) | **Off** | Phase 2 |
| **Profiling** | **Off** | Phase 3 |
| **Session Replay** | **Off** | Heavy; not Phase 1 |
| **App Hang / ANR** (if exposed as separate toggles in your SDK version) | **Off for Phase 1** unless the team confirms a single stable flag with negligible overhead; otherwise **defer to Phase 2** with heartbeat + spans | Avoid duplicating “freeze” story with two noisy mechanisms in v1 |
| **Android `attachThreads`** (thread list on **errors**, not performance transactions) | **On** when supported | Enriches ANR/error triage without enabling `tracesSampleRate`; see [anr-triage-react-native-3.md](anr-triage-react-native-3.md) |
| React Navigation integration (breadcrumbs) | **On** | Primary correlation signal |
| `console` integration logging every log as breadcrumb | **Off or minimal** | Enable only `error` level if available; avoid spam |
| `HttpClient` / fetch breadcrumbs with bodies | **Off** | No URLs with tokens; no large payloads |

Implementers must **read the installed `@sentry/react-native` version’s options** and map the table above to the actual init flags (names differ by version).

### Release / dist / environment

- **`environment`:** `development` | `production` (and `test` when `JEST_WORKER_ID` is set—**disable Sentry init** in Jest, see below).
- **`release`:** Single string tying JS bundle + native binary, e.g. `notebox@<app_version>+<build_number>` from `app.json` / Gradle `versionName`+`versionCode` / Xcode `CFBundleShortVersionString`+`CFBundleVersion`. **Same `release` must be used** for uploaded source maps / debug files.
- **`dist`:** Build number only (Android `versionCode`, iOS build number), if your Sentry project uses `dist` for symbol resolution; otherwise omit if wizard uses release-only.
- **Development:** `debug: true` acceptable locally; **lower sample rate** or **disable** upload in dev if noisy (optional: `enabled: !__DEV__` for Sentry entirely in dev—**acceptance criteria** should include at least one **staging/production-like** build that verifies Sentry).

**Recommendation:** Keep **one** “internal release” build flavor that sends to Sentry with `environment: production` or `staging` for validation without relying on `__DEV__`.

### Source maps and Hermes

- Use the **Sentry React Native wizard** output (Gradle/Xcode/Metro) so Hermes **debug files** and **source maps** upload for release builds.
- **CI:** `SENTRY_AUTH_TOKEN` with scope for **releases** and **debug files upload**; run the upload step on **release** builds only.
- **Acceptance:** A **thrown** error in a release build shows **demangled file names** (not only `index.bundle` line 1).

### Global handlers

1. **Unhandled JS errors:** Rely on Sentry’s default React Native handler **or** explicitly forward `ErrorUtils.getGlobalHandler` after chaining to Sentry—**one path**, not both duplicating capture.
2. **Unhandled promise rejections:** Register **one** handler via `Promise` rejection tracking API that Sentry RN documents for your version; ensure it calls `Sentry.captureException` (or Sentry’s helper) **once**.

### Deduplication rules

- **Do not** call `captureException` in a flow **and** rethrow for the global handler to catch **unless** `Sentry.captureException` is skipped on rethrow (prefer: **either** global **or** local capture for the same `Error` instance).
- Use **`beforeSend`** to drop known noise in dev (e.g. optional filter for Metro reconnect errors) **sparingly**—document each filter.
- **Fingerprinting:** Phase 1 uses Sentry defaults; only add custom fingerprints if two distinct bugs collapse (defer until observed).

### Development vs production behavior

| Mode | Sentry init | Events |
|------|-------------|--------|
| Jest / tests | **Do not init** | Zero |
| `__DEV__` local | Init optional; if init, `environment: development`, consider `tracesSampleRate: 0` | May be noisy; ring buffer can stay on for local debugging |
| Release / APK | **Init**, `environment: production` (or `staging`) | Full crash + breadcrumb + ring recovery |

---

## C. Exact event and breadcrumb model (Phase 1)

### Naming

- Breadcrumbs: `category` = stable domain (`app`, `nav`, `vault`, `storage`, `podcasts`, `rss`, `audio`, `note`).
- `message`: short, fixed vocabulary below.

### Events introduced in Phase 1

**All of the following are implemented as Sentry breadcrumbs** in Phase 1 unless marked **non-fatal**.

| Message / pattern | Type | Non-fatal? |
|-------------------|------|------------|
| `app.bootstrap.start` | breadcrumb | No |
| `app.bootstrap.complete` | breadcrumb | No |
| `app.bootstrap.fail` | breadcrumb + **optional** `captureException` if unexpected | Only if thrown error |
| `vault.session.restore.start` | breadcrumb | No |
| `vault.session.restore.complete` | breadcrumb | No |
| `vault.session.restore.fail` | breadcrumb + `captureException` | **Yes** (unexpected) |
| `nav.screen` | breadcrumb (from React Navigation integration) | No |
| `storage.op` | breadcrumb start/end for selected ops | No |
| `storage.op.fail` | breadcrumb + `captureException` | **Yes** (only listed ops) |
| `podcasts.refresh.start` | breadcrumb | No |
| `podcasts.refresh.complete` | breadcrumb | No |
| `podcasts.refresh.fail` | breadcrumb + `captureException` | **Yes** (if error not user-cancel) |
| `rss.fetch.start` / `rss.fetch.complete` / `rss.fetch.fail` | breadcrumb; **fail** + `captureException` if exceptional | **Yes** on fail only if not network-offline noise |
| `note.load.start` / `note.load.complete` / `note.load.fail` | breadcrumb; **fail** + `captureException` for read failures | **Yes** on unexpected read failure |
| `audio.remote.*` | breadcrumb (command enum only) | No |
| `audio.remote.error` | breadcrumb + `captureException` | **Yes** if unexpected |

**Non-fatal policy:** `captureException` only when the error is **unexpected** (not permission denied by user cancel, not “offline” for RSS). Use `data: { reason: 'user_cancel' }` on breadcrumb only, no capture.

### Global context (`Sentry.setContext` / default scope)

Set once after init (and update when vault state changes):

| Key | Value |
|-----|--------|
| `app` | `{ name: 'notebox' }` |
| `vault` | `{ has_session: boolean }` — **never** raw URI |
| `device` | Use Sentry defaults; do not add custom serial numbers |

### Tags (use sparingly)

| Tag | When |
|-----|------|
| `flow` | e.g. `bootstrap`, `vault_restore`, `podcasts_refresh`, `note_load` — only on **non-fatal** events |
| `screen` | Current route name — if easy from navigation ref; else rely on nav breadcrumbs |

### Sensitive data rules

| Data | Rule |
|------|------|
| SAF URI / file paths | **Exclude** or **hash** (first 8 chars of SHA-256 of URI) for correlation only |
| Note title/body | **Never** in breadcrumbs or extra |
| RSS URL | Truncate to origin + path prefix max 80 chars, or hash |
| User display name from settings | **Exclude** in Phase 1 |
| Params on navigation | Log **route name** + **param keys only** (`noteUri` → key `noteUri` present, value omitted) |

---

## D. Ring buffer v1 spec

### Persistence

- **Persisted** to disk (survive process death) **plus** a small in-memory write queue to avoid blocking the JS thread.

### File

- **Path:** Cache directory (e.g. `CachesDirectoryPath` / Android `cacheDir`), filename `notebox-observability.ring.jsonl`.
- **Format:** JSON Lines: one JSON object per line, UTF-8.

### Schema (each line)

```json
{
  "ts": 1710000000000,
  "level": "info",
  "event": "vault.session.restore.complete",
  "data": { "has_session": true }
}
```

`data` must obey the same redaction rules as Sentry breadcrumbs.

### Limits

- **Max file size:** 512 KiB (hard cap).
- **Max lines:** 400 lines (whichever triggers first triggers rotation).
- **Rotation:** When over cap, **truncate from the start** (drop oldest lines) to stay under limits; prefer **line-count** check after append batch.

### Write strategy

- Append-only; **async** I/O (queue microtask or small debounce batch).
- **Never** synchronous `writeFile` on hot paths.
- Mirror **every** Sentry breadcrumb the app adds in Phase 1 (single hook: `addAppBreadcrumb` writes both Sentry + ring).

### Startup recovery

1. On app boot **after** Sentry init, read **last 80 lines** (or last 32 KiB) from the ring file.
2. **Once per cold start**, attach to Sentry: either `Sentry.captureMessage` with level `info` and **fingerprint** `ring-buffer-tail`, or `scope.addAttachment` with **text** payload (prefer message + truncated body to avoid huge attachments)—**one** event max per launch, **rate-limited** (if last attach was &lt; 4 hours ago on same install, skip).

### When ring data is attached to Sentry

- **Primary:** next cold start after a session (diagnostic context).
- **Optional:** on first `captureException` in a session, merge **last N** ring lines into `extra` (cap 2 KiB)—**only if** implementer can avoid duplicate noise; otherwise **defer** to cold-start only.

### Must never enter the ring buffer

- Full note content, full markdown, full RSS XML, full file paths, passwords, tokens, raw `noteUri` strings (use hashed or `present: true` only).

---

## E. Priority flows to instrument first (short list)

Only these in Phase 1; everything else waits.

### 1. App bootstrap (`resolveInitialRoute`)

| Field | Spec |
|-------|------|
| **Begin** | First line inside `resolveInitialRoute` (after mock check). |
| **End** | Immediately before each `return` with outcome. |
| **Breadcrumbs** | `app.bootstrap.start` (data: `{ mock: boolean }`); `app.bootstrap.complete` (data: `{ route: 'MainTabs' \| 'Setup' }`). |
| **Non-fatal** | If `resolveInitialRoute` **throws** (today unlikely): `captureException` from caller in `App.tsx` bootstrap—**one** place. |
| **Metadata** | `route` outcome only; no URI. |

### 2. Vault session restore (`VaultContext`)

| Field | Spec |
|-------|------|
| **Begin** | Start of `refreshSession`. |
| **End** | After successful `setSessionUri` or early exit (no saved URI). |
| **Breadcrumbs** | `vault.session.restore.start` (`has_saved_uri` boolean); `vault.session.restore.complete` (`has_session` boolean). |
| **Non-fatal** | On **any** thrown error in `refreshSession` / `setSessionUri` path: `captureException` + tag `flow=vault_restore`. |
| **Metadata** | Booleans only. |

### 3. SAF / core storage (`noteboxStorage` — subset)

| Field | Spec |
|-------|------|
| **Scope** | Phase 1: **`initNotebox`**, **`readSettings`**, **`listNotes`** (or the single list entry used by vault)—**not** every helper. |
| **Begin / end** | One breadcrumb pair per **top-level** async call from feature code (implement at exported function boundary). |
| **Failure** | `storage.op.fail` + `captureException` with `op` tag (`initNotebox`, `readSettings`, `listNotes`). |
| **Metadata** | `duration_ms` optional in Phase 1—**omit** if it requires wrapping every call in timers (**defer timing to Phase 2**); breadcrumb without duration is OK. |

### 4. Markdown note load (`NoteDetailScreen` + `useNotes.read`)

| Field | Spec |
|-------|------|
| **Begin** | When load effect runs (`note.load.start`, data: `{ note_uri_key: 'present' }` hashed id if implemented). |
| **End** | After successful read or error path. |
| **Breadcrumbs** | `note.load.complete` / `note.load.fail`. |
| **Non-fatal** | `captureException` on read failure (unexpected). |
| **Metadata** | No title/body. |

### 5. Podcast refresh (`usePodcasts` → `refresh`)

| Field | Spec |
|-------|------|
| **Begin** | Start of `refresh` (user or effect). |
| **End** | After episodes/sections set or determined error. |
| **Breadcrumbs** | `podcasts.refresh.start` / `complete` / `fail`. |
| **Non-fatal** | `captureException` on failure **unless** clearly user-cancel or empty vault. |
| **Metadata** | `episode_count_bucket`: `0`, `1-10`, `10+` (no exact counts if avoidable). |

### 6. RSS fetch / parse (`fetchRssArtworkUrl` or single entry wrapper)

| Field | Spec |
|-------|------|
| **Begin / end** | Wrap **network entry** only (one function). |
| **Breadcrumbs** | `rss.fetch.*` with `outcome`. |
| **Non-fatal** | Only on **exception** after timeout/network (not on expected null artwork). |
| **Metadata** | Truncated feed URL per redaction rules. |

### 7. Audio playback service (`playbackService`)

| Field | Spec |
|-------|------|
| **Begin / end** | N/A (event-driven). |
| **Breadcrumbs** | On each remote event: `audio.remote` + `command` enum (`play`, `pause`, …). |
| **Non-fatal** | `captureException` on **TrackPlayer** promise rejection where today `.catch(() => undefined)`—**only** if error is not “not initialized”. |
| **Metadata** | Command name only. |

### 8. Navigation (React Navigation)

| Field | Spec |
|-------|------|
| **Integration** | Sentry React Navigation tracing/integration per docs—**breadcrumbs only** in Phase 1 (no performance). |
| **Sanitize** | Strip param values; log route names. |

### Native vault listing (`VaultListingModule.kt`)

**Phase 1:** **No Kotlin changes required** unless trivial `Sentry` breadcrumb from native (optional). Prefer **JS-side** breadcrumb around the bridge call if listing is invoked from TS. **Defer** native Sentry SDK calls to Phase 2 unless bridge boundary is one file.

---

## F. UI unresponsiveness handling in Phase 1

### What Phase 1 can measure

- **Sequence of screens and flow breadcrumbs** before a user-reported “freeze” (post hoc).
- **Whether** the user was mid-flow (`podcasts.refresh.start` without `complete`) via ring + Sentry breadcrumbs.
- **Crashes** that terminate the process (native + JS).

### What Phase 1 cannot measure

- **Duration** of a freeze or JS main-thread blockage.
- **Native main-thread** stalls from JS (no substitute for Performance / native tools).
- **True** Android ANR rate or iOS hang rate **without** enabling Sentry’s hang features (deferred) or Instruments/Android Studio.

### What is heuristic only (defer to Phase 2)

- Any “JS thread was delayed X ms” claim—**not** in Phase 1.
- Inferring “unresponsive” from **breadcrumb gaps**—weak; do not document as reliable.

### Deferred to Phase 2

- `startSpan` / transactions around bootstrap, refresh, note open.
- Heartbeat / rAF drift detector.
- Optional Sentry App Hang / ANR with explicit sampling policy.

---

## G. File-by-file rollout proposal

Order respects dependencies: **observability core → init → navigation → bootstrap → vault → features**.

| Order | File / module | Change type |
|-------|----------------|-------------|
| 1 | `package.json` / wizard artifacts | Sentry dependency + native config (already partially done via wizard). |
| 2 | **`src/core/observability/`** (new) | `initSentry.ts`, `breadcrumbs.ts`, `ringBuffer.ts`, `types.ts` — **single API** `appBreadcrumb()`, `reportUnexpectedError()`. |
| 3 | [`index.js`](index.js) | Initialize Sentry **immediately** after polyfills / `gesture-handler`, **before** `App` import if required by SDK; keep `TrackPlayer` registration order valid. |
| 4 | [`App.tsx`](App.tsx) | Wrap bootstrap: breadcrumbs; single `captureException` for bootstrap failure; optional ErrorBoundary **if** minimal (defer boundary to sub-release if risky). |
| 5 | [`src/core/bootstrap/resolveInitialRoute.ts`](src/core/bootstrap/resolveInitialRoute.ts) | Bootstrap breadcrumbs only. |
| 6 | [`src/navigation/RootNavigator.tsx`](src/navigation/RootNavigator.tsx) | `NavigationContainer` + Sentry integration; `onReady` optional. |
| 7 | [`src/core/vault/VaultContext.tsx`](src/core/vault/VaultContext.tsx) | Vault restore breadcrumbs + non-fatal on failure. |
| 8 | [`src/core/storage/noteboxStorage.ts`](src/core/storage/noteboxStorage.ts) | Selected function boundaries: breadcrumbs + failures. |
| 9 | [`src/features/vault/hooks/useNotes.ts`](src/features/vault/hooks/useNotes.ts) or note read path | Note load breadcrumbs (if cleaner than screen-only). |
| 10 | [`src/features/vault/screens/NoteDetailScreen.tsx`](src/features/vault/screens/NoteDetailScreen.tsx) | Note load lifecycle breadcrumbs. |
| 11 | [`src/features/podcasts/hooks/usePodcasts.ts`](src/features/podcasts/hooks/usePodcasts.ts) | Refresh breadcrumbs + non-fatal. |
| 12 | [`src/features/podcasts/services/rssArtwork.ts`](src/features/podcasts/services/rssArtwork.ts) | RSS fetch breadcrumb wrapper at `fetchRssArtworkUrl`. |
| 13 | [`src/features/podcasts/services/playbackService.ts`](src/features/podcasts/services/playbackService.ts) | Remote event breadcrumbs; selective non-fatal. |

**Dependencies:** `core/observability` has **no** imports from features. Features import observability. `index.js` depends on observability init. Navigation depends on observability after init.

---

## H. Acceptance criteria (testable)

1. **Intentional JS error (release build):** Throw in a dev-only button or hidden gesture in a **release** build → Sentry shows **one** issue, **symbolicated** stack (Hermes + source maps), `release` matches app version.
2. **Unhandled rejection:** Trigger a rejected Promise without catch → appears in Sentry **once** with clear message.
3. **Vault restore failure (simulated):** Force `getSavedUri` or downstream to reject in a test build → `vault.session.restore.fail` breadcrumb trail + **one** `captureException` with tag `flow=vault_restore`.
4. **Navigation:** Navigate Setup → MainTabs → open Vault note → Sentry issue (from step 1) shows **nav breadcrumbs** with route names, **no** raw param values.
5. **Ring buffer:** Cause several breadcrumbs, kill process (or restart app) → next launch sends **at most one** “ring tail” diagnostic (or scoped context) and file still bounded ≤ 512 KiB.
6. **Redaction:** Inspect payload: **no** full note body, **no** full SAF path string.
7. **Jest:** `npm test` runs with **no** Sentry network calls (init disabled).

---

## I. Guardrails / non-goals

1. **No log spam:** No `console` integration at `info` for all logs; no breadcrumb inside render.
2. **No full note contents** in Sentry or ring buffer.
3. **No per-render instrumentation**—only flow boundaries listed in section E.
4. **No duplicate capture**—global handler OR local `captureException`, not both for the same error instance.
5. **No noticeable UI overhead:** No synchronous disk I/O on hot path; ring writes batched/async.
6. **No policy of “capture every catch”**—only **unexpected** errors per section C; user-cancel and expected offline **breadcrumb only**.
7. **No Phase 2 features** in Phase 1 PR: no transactions, no stall detector, no Kotlin timing spans.

---

## Document history

- **v1:** Phase 1 implementation spec derived from the repository observability plan.

# Desktop Sentry Alert: `vault_watch_coarse_invalidation` rate

This runbook defines the alert that catches desktop vault watcher degradation within minutes.

## Signal

Event name:

- `eskerra.desktop.vault_watch_coarse_invalidation`

Emission path:

- [`apps/desktop/src/hooks/useMainWindowWorkspace.ts`](../../apps/desktop/src/hooks/useMainWindowWorkspace.ts)

Expected Sentry tags on this message event:

- `obs_surface=vault_watch`
- `watch_session_id=<uuid>` (new value each watcher lifecycle / vault-open session)
- `vault_root_hash=<non-PII hash>`
- `coarse_reason=<reason-or-unknown>`

Related diagnostic events:

- `eskerra.desktop.vault_watch_start_failed` — watcher setup failed after vault selection/hydration.
- `eskerra.desktop.vault_watch_backend_error` — one watcher backend (`recommended` or `poll`) reported a native notify error.
- `eskerra.desktop.vault_watch_open_tab_probe_reload` — the focus/interval open-tab probe found active-note disk drift that was not already reflected in `lastPersistedRef`; emission is suppressed when a real watcher event or another save/reload path mutates `lastPersistedRef` during the probe window.

Expected tags on related events:

- `obs_surface=vault_watch`
- `watch_session_id=<uuid-or-start>`
- `vault_root_hash=<non-PII hash>`
- `backend=<recommended|poll|startup|open_tab_probe>`
- `reason=<normalized-reason-or-trigger>` (`vault_watch_start_failed` keeps the raw error message in event extras only)

## Alert Rules

Create **Metric Alerts** in Sentry project `eskerra-desktop` using dataset **Errors**.

### Rule 1 (critical): sustained burst in one watch session

- Query:
  - `event.type:default level:warning message:"eskerra.desktop.vault_watch_coarse_invalidation" obs_surface:vault_watch`
- Aggregate:
  - `count()`
- Group by:
  - `tags[watch_session_id]`
- Threshold:
  - `> 12` in `5 minutes`
- Action:
  - Page / critical notification channel.

Rationale: the desktop now runs two watcher backends (`recommended` and stat-based `poll`), so low-volume backend flakes can appear twice as often as the original single-backend baseline. Page only on sustained degradation.

### Rule 2 (warning): repeated degradation in one watch session

- Query:
  - `event.type:default level:warning message:"eskerra.desktop.vault_watch_coarse_invalidation" obs_surface:vault_watch`
- Aggregate:
  - `count()`
- Group by:
  - `tags[watch_session_id]`
- Threshold:
  - `> 4` in `5 minutes`
- Action:
  - Team warning channel (non-paging).

Rationale: catches real repeated watcher fallback while avoiding noise from one-off empty-path or poll/backend transients.

## Client-side throttling

The renderer still records every coarse event for Sentry, but heavy local refresh work is throttled: repeated coarse events within a short window do not repeatedly invalidate markdown caches, refresh notes, bump filesystem nonces, reread settings, refresh podcasts, or run full open-tab reconcile. This prevents a recurring poll/backend flake from hammering the UI while preserving the alert signal.

## Triage checklist

For the firing group (`watch_session_id`):

1. Inspect `coarse_reason` tag distribution.
2. Check if one `vault_root_hash` dominates (single-vault pathology) or many hashes fire (systemic regression).
3. Correlate with recent changes in:
   - `apps/desktop/src-tauri/src/vault_watch.rs`
   - `apps/desktop/src/hooks/useMainWindowWorkspace.ts`
   - `apps/desktop/src/lib/vaultFilesChanged*`
4. If `vault_watch_open_tab_probe_reload` appears, treat it as a missed watcher signal until proven otherwise: verify whether the native watcher or poll fallback emitted any event for the same `watch_session_id`.
5. If event volume is sustained, create incident and mark as **sync-critical**.

## Guardrail

Any change to message name, tags, fingerprint, or emit location must update this file in the same PR.

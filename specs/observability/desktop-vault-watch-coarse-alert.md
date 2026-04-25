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

## Alert Rules

Create **Metric Alerts** in Sentry project `eskerra-desktop` using dataset **Errors**.

### Rule 1 (critical): burst in one watch session

- Query:
  - `event.type:default level:warning message:"eskerra.desktop.vault_watch_coarse_invalidation" obs_surface:vault_watch`
- Aggregate:
  - `count()`
- Group by:
  - `tags[watch_session_id]`
- Threshold:
  - `> 4` in `5 minutes`
- Action:
  - Page / critical notification channel.

Rationale: this indicates repeated watcher degradation while one vault session is active, which risks sustained UI-vs-disk drift.

### Rule 2 (warning): early degradation in one watch session

- Query:
  - `event.type:default level:warning message:"eskerra.desktop.vault_watch_coarse_invalidation" obs_surface:vault_watch`
- Aggregate:
  - `count()`
- Group by:
  - `tags[watch_session_id]`
- Threshold:
  - `> 1` in `5 minutes`
- Action:
  - Team warning channel (non-paging).

Rationale: catches regressions quickly while keeping false positives tolerable.

## Triage checklist

For the firing group (`watch_session_id`):

1. Inspect `coarse_reason` tag distribution.
2. Check if one `vault_root_hash` dominates (single-vault pathology) or many hashes fire (systemic regression).
3. Correlate with recent changes in:
   - `apps/desktop/src-tauri/src/vault_watch.rs`
   - `apps/desktop/src/hooks/useMainWindowWorkspace.ts`
   - `apps/desktop/src/lib/vaultFilesChanged*`
4. If event volume is sustained, create incident and mark as **sync-critical**.

## Guardrail

Any change to message name, tags, fingerprint, or emit location must update this file in the same PR.

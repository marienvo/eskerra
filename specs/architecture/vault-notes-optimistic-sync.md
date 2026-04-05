# Vault Notes Optimistic Sync

## Scope

This document defines how the app updates the Inbox notes list after note mutations on Android.

The same pattern applies to:

- create (implemented)
- edit (planned)
- delete (planned)

## Source of truth and projection

- The source of truth is the markdown files currently present in `Inbox/` under the selected vault directory.
- The in-app notes list is a projection of that file system state.
- `General/Inbox.md` remains a generated index file and not user-authored source of truth.

## Mutation flow

For every mutation, the app follows a two-step process:

1. Perform the storage mutation in `eskerraStorage`.
2. Update UI state optimistically from the mutation result, then reconcile in the background.

For create specifically:

1. `createNote(baseUri, title, content, occupiedNames?)` picks a unique markdown basename before write:
   - first try `stem.md`
   - then `stem-2.md`, `stem-3.md`, ...
   - never chain suffixes like `stem-1-1.md`
2. The notes list adds or replaces the created `NoteSummary` in memory and sorts by `lastModified` descending.
3. A silent background refresh calls `listInboxNotesAndSyncIndex(baseUri)` to reconcile with disk.

## Create collision strategy

- The default path uses already-loaded notes as the occupied-name set, so common collisions are solved without an extra SAF directory scan.
- Before writing, storage checks whether the chosen target URI already exists.
- If it exists (projection stale vs disk), storage does one Inbox listing, rebuilds occupied names from disk, picks the next unique name, and writes.
- This keeps overwrite protection deterministic while avoiding extra SAF work in the normal case.

## Why this exists

- Avoid immediate duplicate SAF directory listings right after create.
- Keep UI responsive and consistent while still converging to disk truth.
- Preserve periodic reconciliation for external file changes or ordering drift.

## Silent refresh behavior

- Silent refresh updates notes data but does not set loading UI for the Vault list.
- Errors are still captured in notes state so the app can show failure text when relevant.

## Future edit/delete behavior

Edit and delete should follow the same contract:

- Apply a deterministic optimistic update to the in-memory list.
- Trigger a silent background reconciliation with `listInboxNotesAndSyncIndex(baseUri)`.
- Keep mutation behavior Android-specific with SAF constraints in mind.

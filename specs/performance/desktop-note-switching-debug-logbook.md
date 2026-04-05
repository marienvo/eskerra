# Desktop Note Switching Debug Logbook

This document records which desktop note-switching performance hypotheses were tested, what code changes were used to test them, and whether they made a meaningful difference. The goal is to avoid re-running the same dead ends without context, while still making it clear when a previously weak hypothesis may be worth revisiting.

## Test baseline

- Date: 2026-04-05
- Branch during investigation: `bugfixes-and-small-improvements`
- Last tested base commit: `c5469484c525e56f5960b53f31960bfa263dbb6c`
- Important caveat: the measurements below were taken on a dirty worktree, not on the base commit alone
- Dirty-worktree files at the time of writing:
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/components/EditorPaneOpenNoteTabs.tsx`
  - `apps/desktop/src/components/VaultPaneTree.tsx`
  - `apps/desktop/src/components/VaultTab.tsx`
  - `apps/desktop/src/editor/noteEditor/NoteMarkdownEditor.tsx`
  - `apps/desktop/src/editor/noteEditor/markdownActivatableRelativeMdLinkAtPosition.ts`
  - `apps/desktop/src/hooks/useMainWindowWorkspace.ts`
  - `localhost-recording.json`
- Dirty-worktree diff summary at the time of writing: `1492 insertions`, `198 deletions` across the seven source files above
- Runtime debug log session: `c7b39a`
- Runtime debug log file: `.cursor/debug-c7b39a.log`
- Baseline capture used during the investigation: `localhost-recording.json`

## How to read this

- `Significant`: a change clearly removed or materially reduced a measured bottleneck.
- `Limited`: a change helped one measurable sub-problem, but did not remove the user-visible slowness by itself.
- `No significant difference`: the hypothesis was tested and did not meaningfully change the main complaint.
- `Pending`: implemented or isolated, but not yet proven with a post-change reproduction run.

## Significant hypotheses

| IDs | Hypothesis | Change tested | Result | Retest when |
| --- | --- | --- | --- | --- |
| `H1`-`H5` | React scheduling around note switch was adding avoidable latency before the new editor view became visible. | Removed the `startTransition`-based switch path so note activation happened eagerly. | Significant. Commit latency dropped from roughly `206-417ms` to roughly `51-139ms` in the earlier runs summarized in the investigation transcript. This was a real win, but not the final fix. | Retest only if note selection is moved back behind React transitions or another deferred scheduling layer. |
| `H15`, `H17`, `H19`, `H20` | The file tree was re-rendering more often than necessary because of unstable props, repeated ancestor expansion work, and internal tree churn. | Re-applied `memo`, stabilized callbacks passed into `VaultPaneTree`, added snapshot instrumentation, and guarded ancestor `expand()` so already-expanded nodes are not expanded again. | Significant. Tree-side work became measurably cleaner and the duplicate expand path stopped being a recurring source of churn. | Retest if tree props become less stable again, if drag-and-drop code changes, or if tree virtualization logic is rewritten. |
| `H21` | Tree clicks were paying extra intent-to-open latency before the actual note switch started. | Added a direct tree-click open path so primary interaction can open the markdown note immediately instead of waiting on the slower action path. | Significant. Tree click `intentLagMs` dropped into the low single digits and this removed one clear source of sluggishness. | Retest if tree item interaction semantics change or a new action abstraction is inserted between pointer input and `openMarkdownInEditor`. |
| `H31`, `H32` | A late backlinks defer prop flip from the workspace was forcing a late `VaultTab` re-render even after the note was already visible. | Replaced workspace-owned `inboxBacklinksDeferFirstPaint` with `inboxBacklinksDeferNonce`; moved the actual defer-on / defer-off DOM work into a local `InboxBacklinksSection` so the one-frame visual defer no longer needed a parent React state flip. | Significant. The old warm-switch pattern where a late `VaultTab` commit tracked the backlinks defer prop flip was removed. Later logs show the defer happening locally through `H32`, while `H31` no longer showed a late prop change for that path. | Retest if backlinks rendering moves back into parent React state, or if a future UI change needs more than local DOM toggling. |

## Limited or partial wins

| IDs | Hypothesis | Change tested | Result | Retest when |
| --- | --- | --- | --- | --- |
| `H22` | Backlink computation was causing large, late follow-up work after a switch. | Added equality guards so `setSelectedNoteBacklinkUris` only updates when the backlink result is actually different. | Limited. This removed pointless updates when backlink output was unchanged, but backlink computation still legitimately causes late updates when the result truly changes. In the current logs, backlink updates still arrive later for some notes, for example a `~410ms` update or an `~1817ms` update when real backlink data arrives. | Retest if backlink indexing strategy changes, if cached bodies become cheaper to hydrate, or if backlinks move off the critical interaction path entirely. |
| `H23` | Debounced active-body or backlink-related follow-up work was causing extra churn after note selection. | Added a guard to avoid redundant updates in the debounced path. | Limited but worthwhile. This cleaned up one class of redundant post-switch work, but it was not the root cause of the main remaining slowness. | Retest if debounce intervals, editor cache semantics, or active-body synchronization logic change. |
| `H26` | Backlinks first-paint deferral was being scheduled twice per switch and creating extra work. | Removed the duplicate `scheduleBacklinksDeferOneFrameAfterLoad()` call from the eager-skip path. | Limited. The duplicate log pattern disappeared, which made the behavior more predictable and reduced unnecessary work, but the main late commit was still present afterward for a different reason. | Retest if note-switch orchestration adds another path that can schedule defer more than once. |

## No significant difference or rejected as primary cause

| IDs | Hypothesis | Change tested or analysis | Result | Retest when |
| --- | --- | --- | --- | --- |
| "single living editor/view" idea | Reusing one editor view instead of rebuilding on note switch might be the main missing optimization. | The investigation did not need to pursue this as the first-order cause because runtime logs kept pointing to parent React commits, tree churn, backlinks defer, and fold-state propagation instead. | No evidence yet that a single persistent editor view is required to address the current bottlenecks. This idea should be treated as a larger architectural option, not as the current proven fix. | Retest only after the proven React-level bottlenecks are exhausted and the remaining lag is clearly dominated by editor reconfiguration itself. |
| Early fold callbacks as the explanation for the first large improvement gap | The editor's fold-state callbacks were initially suspected to explain the warm-switch late commit. | Logs showed some early `H27` / `H28` events around `~43-77ms`, but those did not line up with the earlier warm-switch late commit pattern that was then under investigation. | No significant difference for that earlier phase of the investigation. Fold-state signals existed, but they did not explain the backlinks-prop-driven late commit that was active at that time. | Retest only in the context of parent re-render analysis; fold-state later became relevant again for a different reason. |
| `H30` tree internal state at the late warm-switch commit | The tree's own internal state change was suspected to be the source of the late `~250-300ms` commit. | Snapshot logs showed late commits where `H30 changedKeys:[]`, meaning the tree was being dragged through a parent commit without changing its own relevant state. | Rejected as the primary cause of that specific late warm-switch phase. The tree was often a victim of a parent update rather than the originator. | Retest if future logs show late commits with real `H30` state deltas again. |

## Pending hypothesis

| IDs | Hypothesis | Change tested | Current status | Next proof needed |
| --- | --- | --- | --- | --- |
| `H27`, `H28`, later `H29` correlation | Foldability state still lives high enough in the React tree that a late editor foldability update can force `VaultTab` and `VaultPaneTree` through another commit even after the note is visible. | Moved fold-presence state and the bulk fold button out of `VaultTab` into a local `EditorPaneBody`, while keeping the existing runtime logs active. | Pending. This refactor was implemented after logs showed the remaining late commit lining up with foldability transitions. However, there is not yet a post-change reproduction run proving that the late parent commit disappeared. | Reproduce note switching again and confirm that the old late `VaultTab` commit no longer correlates with foldability updates at the parent level. |

## Most useful runtime evidence so far

### Why the backlinks defer fix counted as significant

Before the local backlinks defer refactor, warm-switch logs showed a late `VaultTab` commit that correlated with the backlinks defer prop changing on the parent. After the refactor, the defer still happened, but it moved into local `H32` logs in `InboxBacklinksSection`, which is the intended design.

### Why the fold-state refactor became the next target

The most recent pre-refactor run still showed a late commit pattern tied to foldability:

- In `switch-mnlxg4f6-2vrko2`, `H27` reported `next:true` for foldable ranges at `~249ms`.
- In the same run, late profiler commits for `VaultPaneTree` and `EditorPane` landed at `~254ms`.
- The matching `H30` tree snapshot had `changedKeys:[]`, which means the tree itself was not the source.
- This is why fold-state propagation was promoted from "not the cause of the previous issue" to "current remaining suspect".

### What the latest warm-switch runs looked like before the pending retest

Later warm runs in `.cursor/debug-c7b39a.log` already looked much better on the initial visible switch:

- `switch-mnlxg6ga-fe1d7c`: first visible tree/editor commit around `~54-57ms`
- `switch-mnlxg6y3-w5c8ka`: first visible tree/editor commit around `~20-23ms`
- `switch-mnlxg7k7-iy3jws`: first visible tree/editor commit around `~38-41ms`

Those runs still had later work, but the largest remaining user-facing question was whether the fold-state refactor removed the late parent-level commit pattern.

## Guidance for future retesting

- Re-test a `No significant difference` item only when the surrounding architecture has changed enough that the old measurement may no longer apply.
- Re-test a `Limited` item when chasing second-order polish after the main bottleneck is solved.
- Re-test a `Significant` item after regressions in the same subsystem, especially tree interaction, workspace-level note switching, or backlinks rendering.
- Keep the debug log file for this session unless there is an intentional reason to clear it during a new measurement run.
- If this investigation resumes later, prefer starting from the `Pending` fold-state hypothesis before reopening bigger architectural ideas.

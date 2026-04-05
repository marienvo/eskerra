# Desktop Note Switching Debug Logbook

This document records which desktop note-switching performance hypotheses were tested, what code changes were used to test them, and whether they made a meaningful difference. The goal is to avoid re-running the same dead ends without context, while still making it clear when a previously weak hypothesis may be worth revisiting.

## Current best understanding

- Warm path is much healthier after H37.
- Remaining user-visible lag is concentrated in slow cache-miss switches.
- The dominant slow-path window is H42 → H55.
- App already renders with the new selectedUri before H55 on slow runs.
- The remaining issue currently looks like main-thread work / cascading commits, not file I/O, not CodeMirror setup, and not a hidden parent render above VaultTab.

## Test baseline

- Date: 2026-04-05
- Branch during investigation: `bugfixes-and-small-improvements`
- Last tested base commit: `aecb17eb2c181dc5973ed630e14c919286c77332` (dirty: second `switch-mnlzw*` repro + `PerformanceObserver` **`H58` `longtask`**)
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
| `H37` | On warm runs where the target row already exists, synchronizing tree selection during layout should remove the passive-effect lag. | Added a `useLayoutEffect` sync that selects the target row immediately when it is already present in `items` but the tree still highlights the previous row. The older async selection effect remains as cold-path fallback. | Significant for warm path. New runs show `H37` firing early on warm tree and tab switches, for example `~34ms`, `~46ms`, and `~29ms`, eliminating the old gap between `H36 targetPresentInItems:true` and actual tree selection. | Retest if tree library semantics change, if row availability timing changes, or if the selection model is refactored. |

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
| `H60` | Deferring `setEditorDocumentHistory` with `startTransition` would shorten `H42`→`H55` (`H59`). | Wrapped history append in `startTransition` + open-generation guard; measured post-change. | **No significant difference** on the worst cold path; `switch-mnm0amto-obe8rh` still **`scheduleToH55MeasureMs` 383** with **`H16` `loadChildrenIds` 119ms** dominating that window. Code **reverted**. | Unlikely to revisit unless profiling shows history updates on the critical slice. |

## Latest verified findings

- Post-refactor verification showed that moving fold state out of `VaultTab` did remove fold keys from the parent `H29` snapshot during the former late-commit window, so the parent-level fold propagation issue was real.
- That same verification also showed that the user-visible problem was not solved by this change alone.
- In the same run (`switch-mnlxngfb-wojl7k`), a late `VaultPaneTree` / `EditorPane` nested update still landed around `~297ms` while `H29` did not report fold-related parent state changes.
- Warm cached switches looked much healthier on the first visible commit, often around `~20-52ms`, but some tree-initiated runs still showed late tree-internal synchronization afterward.
- New tree-selection logs now show that the main remaining delay is usually before the tree selection effect even starts, not inside `setSelectedItems(...)`.
- New `H36` evidence splits the problem into two paths:
  - cold / first-load path: the target row is not yet present in `items`, so early selection is not possible yet
  - warm path: the target row is already present in `items`, but the tree still waits for the later passive selection effect before selecting it
- Post-fix verification now confirms that the warm-path selection lag has been removed by `H37`.
- The remaining visible lag is now concentrated in some cache-miss note switches, where the first visible commit still lands much later than the tiny prefetch-read cost would suggest.
- New cache-miss timing logs show that `loadMarkdown(...)` itself is not the main remaining bottleneck.
- The newest cache-miss run (`switch-mnly8d8b-jv9wxp`) shows `H41` and `H42` both at `~23ms`, while the first visible `VaultPaneTree` / `EditorPane` / `selectedCommit` work still does not land until `~133-136ms`.
- That means the remaining cache-miss gap is not inside the synchronous state-publication tail of `openMarkdownInEditor`, and not after the first post-state microtask either.
- New frame-checkpoint verification shows the browser's next frame can also arrive late on slow cache-miss runs, which points to main-thread blocking before the first available frame rather than a simple multi-frame React deferral.
- App-level inbox profiler data now shows the slow gap is not above `VaultTab`: `H45` tracks `H15` closely, and `H46` lands alongside the visible selected-note commit instead of much earlier or much later.
- A follow-up safety verification showed that the `H47` `flushSync` experiment introduced a note-integrity regression: notes could open as empty and then be persisted back to disk as empty files.
- After reverting `H47`, note integrity returned, but the remaining performance variance still differs sharply by switch: for example `switch-mnlyyusz-uc8bbb` still landed its first visible commit around `~157-169ms`, while `switch-mnlyyvko-azs7gj` landed around `~51-55ms`.
- New editor-substep timings now show that the synchronous CodeMirror load path itself is small and relatively stable across both slow and faster runs.
- `H55` verification (`switch-mnlzl85f-6bhxc6` vs `switch-mnlzl8mp-l3p4nc`) shows the variable cache-miss cost concentrates in the `H42`→`H55` window (macrotask delayed ~104ms vs ~25ms), while the `H55`→`H36` tail stays ~17ms in both cases.
- **`H56` / ordering caveat (2026-04-05):** `H56` **`timestamp` order vs `H55` is path-dependent.** Earlier slow runs (`switch-mnlzs44z-056jvy`) showed first `H56` **after** `H55` (macrotask before those render logs). Later slow runs (`switch-mnlzung7-0eemub`, `switch-mnlzum0g-18k8de`) show **`H57`/`H56` immediately after `H42`** and **additional `H56` commits hundreds of ms later in wall time still before `H55`** (`H55` ts `1775407610525` vs last pre-`H55` `H56` on share1 at `0325` — hundreds of ms gap). Prefer interpreting **`performance.now`-based `elapsedSinceSwitchStartMs`** on `H42`/`H55` together with **NDJSON `timestamp` deltas**, not ingest order alone.
- **`H57` evidence (2026-04-05):** **Rejected.** On slow `switch-mnlzung7-0eemub`, `H42` ts `1775407610204` then `H57` `renderIndex` `1–2` at `0205–0206` (**before** `H55` at `0525`, `elapsedSinceSwitchStartMs` `358`). Same pattern on `switch-mnlzum0g-18k8de` (`H42` `8324`, `H57` `8325`, `H55` `8661`). Fast `switch-mnlzuny8-5kmbhi`: `H42` `0828`, `H55` `0850`, **then** `H57` `0851`. So **`App` already sees the new `selectedUri` at the start of the long window** on slow paths; the stall is **not** “hook state hasn’t reached `App` yet.”
- **`H58` (provisional, 2026-04-05):** Long `H42`→`H55` (`~320ms` `elapsed` on `switch-mnlzung7`) happens **while** React is already committing (`H57`/`H56`, `H30`, profilers, tree effects). **`setTimeout(0)` does not run until** that churn clears enough for the macrotask queue — consistent with **microtask / cascading commit** work (or a long synchronous slice) **starving** the timer callback, not with “waiting for the first paint of the new note in `App`.”
- **`H57`/`H55` ordering (2026-04-05, second repro):** Slow cache-miss `switch-mnlzwuev-7dsk1m` (`blocks.md`): `H42` ts `1775407712528`, `H57` `2528–2529`, `H55` `2918` (`elapsedSinceSwitchStartMs` **415**). Slow `switch-mnlzwvzq-ssglf6` (`app-onder-share1.md`): `H42` `4588`, `H57` `4589`, `H55` `4944` (**394** `elapsed`). Fast `switch-mnlzwwnz-l9s72n` (`audio-rec.md`): `H42` `5430`, **`H55` `5450` then `H57` `5450`** (`elapsed` **27** vs **7**). Confirms **`H58`** correlation again.
- **Instrumentation:** `PerformanceObserver` (`longtask`, hypothesis **`H58`**) in `useMainWindowWorkspace` logs tasks **≥50ms** only while `__eskerraActiveSwitchDebug` exists and **≤3s** after `startedAt` (guards stale `runId`). Lifecycle lines use `runId: h58-observer-lifecycle` (`observe() ok` / failures).
- **`H58` longtask (2026-04-05, post-observer repro):** Full log grep shows **zero** `PerformanceObserver:longtask` entries, including slow `switch-mnlzz9s6-kurr1k` (`blocks.md`: `H42` ts `1775407825753`, `H55` `1775407826088`, **`elapsedSinceSwitchStartMs` 354 vs 19** ≈ **335ms wall** between checkpoints). **Interpretation:** **`H58` neither confirms nor denies long tasks** from this instrument alone: plausible causes are (a) WebKitGTK/WPE **does not emit** `longtask` to `PerformanceObserver`, (b) `observe()` failed silently before lifecycle logging (now fixed), (c) stall is **accumulated work under 50ms** per browser “long task” threshold. Next run must include **`H58` lifecycle** line to prove `observe()` succeeded.
- **`H58` lifecycle + second repro (2026-04-05):** NDJSON lines **`runId":"h58-observer-lifecycle"`**, message **`Long task observer observe() ok`**, **`data.mode":"type:longtask"`** at ts **`1775407905990`** and **`5996`** (duplicate consistent with **Strict Mode** double `useEffect`). **Same log** slow `switch-mnm00zv6-7nghoi`: `H42` **`1775407906215`**, `H55` **`1775407906561`** (**346ms** wall; **`elapsedSinceSwitchStartMs` 20 → 366**). **Still zero** `useMainWindowWorkspace.ts:PerformanceObserver:longtask` lines. **Conclusion:** `observe()` **succeeds**; absence of `longtask` entries is **not** from a failed subscription. Remaining explanations: **no task exceeds the long-task threshold** during that window (many shorter slices / microtasks), or **engine does not surface** those tasks as `longtask` entries in this WebView.
- **Third repro (2026-04-05):** `switch-mnm023bg-vpexrb` (`blocks.md`): lifecycle **`1775407957120`/`7126`**, `H42` **`1775407957344`**, `H55` **`1775407957698`** (**354ms** wall; `elapsed` **19 → 373**). Again **no** `longtask` lines. **`H59` added:** `performance.mark` after state batch + `measure` in `H55` callback → NDJSON **`scheduleToH55MeasureMs`** should track the same gap **independently** of `longtask` (next run).
- **`H59` verified (2026-04-05):** `switch-mnm059f5-89yi1u` slow cold `blocks.md`: **`H59` `scheduleToH55MeasureMs` 331** matches **`H55` `elapsedSinceSwitchStartMs` 350 − `H42` 19 = 331** (`H42` ts **`1775408105220`**, `H55`/`H59` **`1775408105551`**). Medium `switch-mnm05bjo-5yg5fx` (`app-onder-share1.md`): **`H59` 92** = **116 − 24**. Fast `switch-mnm05c32-iew0xi` (`audio-rec.md`): **`H59` 20** = **27 − 7**. **Conclusion:** User Timing **confirms ~331ms of main-thread time** between the post-schedule mark and the `H55` macrotask on the slow path, **without** any `longtask` PerformanceEntry — consistent with **sub-50ms slices** and/or **engine not emitting `longtask`**, not with “no real stall.”
- **`H59` re-check (2026-04-05):** `switch-mnm06eil-5kyhxm` slow cold `blocks.md`: **`H59` 342** = **360 − 18**; `H42` ts **`1775408158479`**, `H55` **`1775408158821`** (**342ms** wall). Fast `switch-mnm06gd2-fwlaow` `audio-rec`: **`H59` 21** = **39 − 18**. Instrumentation is **stable** across sessions.
- **`H59` variance (2026-04-05):** `switch-mnm07hhs-9y3neu` slow cold `blocks.md`: **`scheduleToH55MeasureMs` 364** (worse than ~331–342 class); warm repeats in same session drop (e.g. `switch-mnm07lfs` **`H59` 77**). Confirms **metric is usable for A/B**; no code change in that run.
- **`H60` (2026-04-05):** **Rejected.** `setEditorDocumentHistory(pushEditorHistoryEntry)` was briefly moved into **`startTransition`** with an **`historyOpenGen`** guard, then **reverted**. Post-change cold cache-miss `blocks.md` (`switch-mnm0amto-obe8rh`, tree `itemsLength:0` → `loadChildrenIds` **119ms**) still logged **`H59` `scheduleToH55MeasureMs` 383**, in the same band as pre-experiment cold runs (~331–364) and **not** a reduction. Document-history scheduling is **not** the H42→H55 bottleneck.
- **`H61` (2026-04-05):** **Rejected timing.** Post-change repro `switch-mnm0dz6a-o5hy1l`: **`H61` `inboxPrefetchSchedule`** (from `onLoadedChildren`) landed at **ts `1775408512184`**, **after** **`H43`** first RAF (**`1775408512097`**) and **in the same ms** as **`H16` `loadChildrenIds`** **121** ms for Inbox — **`inboxPrefetchDone`** **`durationMs` 4** ran **after** the slow selection load started. **Conclusion:** root **`onLoadedChildren`** fires **too late** on first open to hide **`listFiles(Inbox)`** inside the selection effect; prefetch must run **earlier** (mount / pre-click).
- **`H62` + race (2026-04-05):** Repro `switch-mnm0gkvp-m3wtil`: **`H62` `mountInboxWarmup:done`** (**`totalMs` 409**) at **ts `1775408633669`** coincides with first **`H16` `loadChildrenIds` Inbox** **`durationMs` 127** (**ts `1775408633668`**). Note switch started **~16 ms** after **`H62` start** — **two concurrent** Inbox loads.**`H59`** still **381**. **Conclusion:** mount warmup alone is insufficient; the selection effect must **await the same warmup promise** before **`loadChildrenIds`** ( **`H63`** ).
- **`H63` (2026-04-05):** **Verified** `switch-mnm0iufy-86o2wm`: **`H63` `awaitMs` 118**; **`H16` Inbox `loadChildrenIds` `durationMs` 0** (duplicate **~127 ms** cold path removed vs `switch-mnm0gkvp`); **`H62` `mountInboxWarmup:done` `totalMs` 377**; **`H59` 353** vs **`~381`** on pre-H63 instant-click repro (**small** gain; remaining **`H59`** mostly non-`listFiles` work).
- **Instrumentation cleanup (2026-04-05):** After the second repro confirmation (`switch-mnm0k6e5`-class runs), temporary desktop **runtime debug logging** (`fetch` ingest + `PerformanceObserver` longtasks + React `Profiler` correlation + global switch-intent plumbing) was **removed**; **production behavior kept** includes inbox warmup + shared promise + selection `await` (**H63**).

## Pending hypotheses

| IDs | Hypothesis | Change tested | Current status | Next proof needed |
| --- | --- | --- | --- | --- |
| `H52` | Stale foldability callbacks correlate with slower cache-miss runs. | Logging only: emit `H52` when a fold callback would change state while `selectedUri` is still the previous note during an active switch. | Correlation confirmed; not the primary `~110ms` gap. | Retest only if fold plumbing or `loadMarkdown` ordering changes; do not treat correlation as proof of causation. |
| `H53` | After the new note commits, the editor fold snapshot should match the value implied by the pre-commit stale fold callback for the slow path. | `H53` fold snapshot in `NoteMarkdownEditor` `activeNotePath` layout effect. | Confirmed for the slow path comparison runs. | Retest if fold detection or note load ordering changes. |
| `H56` | Where does `VaultTab` / `VaultPaneTree` work sit relative to `H55`? | `H56` + `H57` render logs. | **Path-dependent.** Some runs: first `H56` only after `H55`; others: many `H56` **before** `H55`. Do **not** treat one run’s ordering as universal. | Use `timestamp` + `elapsedSinceSwitchStartMs`; attribute cost to **cascading commits** when `H56` precedes `H55`. |
| `H57` | The `H42`→`H55` gap may be **before** `App` ever renders with `selectedUri === target`. | `H57` on `App` when inbox + URI match. | **Rejected** (see latest verified bullet: `switch-mnlzung7`, `switch-mnlzum0g`). | N/A. |
| `H58` | `PerformanceObserver` **`longtask`** explains the `H42`→`H55` gap. | `longtask` + lifecycle. | **`longtask` list empty** with working `observe()`; **stall still ~331ms** per **`H59`**. | Treat **`longtask`** as **optional** telemetry here; optimize using **`H59` + React profilers**, not Long Task alone. |
| `H61` | Root **`onLoadedChildren`** prefetch can hide cold Inbox **`listFiles`**. | Microtask **`loadChildrenIds(Inbox)`** from **`onLoadedChildren(root, …)`**. | **Rejected (too late)** | `switch-mnm0dz6a-o5hy1l`: prefetch schedule **same ms** as **121** ms **`H16`**; **`H59`** **343** (no win vs ~361). |
| `H62` | Mount-time warmup removes cold Inbox listing. | **`warmTopLevelInboxChildren`** on mount + after **`fsRefresh`** chain. | **Partial** | `switch-mnm0gkvp`: **127 ms** **`H16`** still with **`H59` 381** when user opens note during warmup — **parallel duplicate load**. |
| `H63` | **Serialize** selection with shared warmup **`Promise`**. | **`topLevelInboxWarmupPromiseRef`** + **`await`** in selection effect (+ ref on fs-refresh warmup). | **Confirmed (I/O path)** | `switch-mnm0iufy`: **`H16` Inbox `durationMs` 0**, **`H63` `awaitMs` 118**; **`H59` 353** vs ~381 prior (small). |

## Confirmed and rejected tree-selection findings

| IDs | Finding | Status | Evidence summary |
| --- | --- | --- | --- |
| `H33` | Tree selection synchronization often starts much later than the first visible note switch commit. | Confirmed | In `switch-mnlxs3ze-ial5ff`, the editor/tree first visible commit landed around `~45-46ms`, but `H33` did not start until `~259ms`. In `switch-mnlxs6x1-izejv1`, first visible commit was around `~147ms`, while `H33` started at `~338ms`. |
| `H34` | The main remaining delay is inside ancestor loading before `setSelectedItems(...)`. | Rejected as primary cause | Once `H33` starts, the remaining work is small on warm runs: in `switch-mnlxs6x1-izejv1`, `H34` was already reached by `~342ms`, only about `4ms` after `H33`. |
| `H35` | `setSelectedItems(...)` itself is delayed or fails to update tree state immediately. | Rejected as primary cause | In both `switch-mnlxs3ze-ial5ff` and `switch-mnlxs6x1-izejv1`, `H35` immediately showed the correct selected item right after the setter call. |
| `H36` | The target row is already present at the first visible commit on warm runs, so an earlier selection sync is technically possible there. | Confirmed for warm path; rejected for cold path | In `switch-mnlxw830-b7r2f9`, `H36` at `~23ms` showed `targetPresentInItems:true` while the old note was still selected. In contrast, `switch-mnlxw5au-ffb79c` showed `targetPresentInItems:false` at `~34ms`, so the first cold-path render still lacked the target row. |
| `H37` | Layout-timed selection sync removes the warm-path gap between row presence and row selection. | Confirmed | In `switch-mnly0tpg-yug8st`, `H37` fired at `~34ms`; in `switch-mnly0uf1-g23mao`, at `~46ms`; in `switch-mnly0uwg-th6u7t`, at `~29ms`; and in `switch-mnly0ves-h79jps`, at `~36ms`. |
| `H38` | The remaining cache-miss delay happens before `loadMarkdown(...)` starts. | Rejected as primary cause | In `switch-mnly52xz-johphe`, `H21` completed at `~5ms` and `H38` was at `~6ms`, so almost no time was lost before entering editor load. |
| `H39` | `loadMarkdown(...)` itself is the dominant source of the remaining cache-miss delay. | Rejected as primary cause | In `switch-mnly52xz-johphe`, `H39` was at `~24ms`, so synchronous editor load took roughly `18ms`, which is real but far smaller than the later `~139-143ms` first visible commit. |
| `H40` | The dominant remaining cache-miss delay happens after the synchronous editor load and before the first visible React commit. | Confirmed | In `switch-mnly52xz-johphe`, `H40` happened at `~25ms`, but the first visible `VaultPaneTree`/`EditorPane` profiler commits did not start until `~128-151ms`. |
| `H41` | `openMarkdownInEditor` still spends meaningful time after scheduling the React state updates, before the task actually completes. | Rejected as primary cause | In `switch-mnly8d8b-jv9wxp`, `H40`, `H41`, and `H42` all landed at `~23ms`, so there was no meaningful extra tail inside the async function after state publication. |
| `H42` | React render start is delayed only after the first post-state microtask. | Rejected as primary cause | In `switch-mnly8d8b-jv9wxp`, `H42` still landed at `~23ms`, but the first visible tree/editor/selected-note commit logs did not appear until `~133-136ms`. |
| `H43` | The browser may already reach the next frame quickly after the state batch, so React is the layer intentionally deferring the first visible commit across otherwise-available frames. | Rejected as primary cause | In the slow cold cache-miss run `switch-mnlycx40-fv82gc`, `H43` itself did not arrive until `~266ms`, and in `switch-mnlycysp-cmzg72` it did not arrive until `~189ms`. The browser's first post-batch frame callback was already late. |
| `H44` | A second frame becomes available quickly, so the remaining lag is mostly React choosing not to commit during the first two frames. | Rejected as primary cause | On the same runs, `H44` was also late (`~401ms` in `switch-mnlycx40-fv82gc`, `~376ms` in `switch-mnlycysp-cmzg72`), which is consistent with prolonged main-thread occupation rather than simple deliberate frame skipping by React. |
| `H45` | The `VaultTab` subtree itself may not even begin rendering until very late, meaning the black-gap time is above the currently instrumented tree/editor profilers. | Rejected as primary cause | In `switch-mnlyj0r7-we9fvu`, `H45 profilerStartLagMs` was `~109ms` while `H15` was `~110ms`; in `switch-mnlyj18q-2b6u4p`, `H45` was `~52ms` while `H15` was `~53ms`. The subtree start tracks the existing subtree profilers rather than revealing an earlier hidden bottleneck above them. |
| `H46` | The App-level selected-note commit is much later than the `VaultTab` / editor commit, indicating a parent/root commit bottleneck. | Rejected as primary cause | In `switch-mnlyj0r7-we9fvu`, `H46` landed at `~133ms`, effectively alongside the visible `VaultTab` commit (`H6 ~124ms`, eager-skip `~133ms`). In `switch-mnlyj18q-2b6u4p`, `H46` landed at `~68ms`, again matching the visible commit window. |
| `H54` | Deferring fold state publication until after `selectedUri` commit removes the extra parent update from the critical path without hurting correctness. | Implemented then reverted after verification. | **No significant difference** on the main metric, plus a ref-timing bug made the approach unreliable. | In `switch-mnlzhg14-wktcmv` (cache-miss to `app-onder-share1.md`), `H42` was `~41ms` but `H36` / `H6` still landed at `~151-152ms`, matching the pre-change `~124-130ms` class of runs within variance; skipping stale `setState` did not shrink the `H42`→`H36` gap. `H54` never logged because `onCommittedFoldSnapshotRef` was only assigned in `useEffect`, which runs after `useLayoutEffect`, so the callback still closed over the previous note's `selectedUri`. **`H53` `foldablePresent:false` at `~152ms` vs `H28` `editorHasFoldableRanges:true` at `~167ms`** also showed fold UI could still change shortly after the snapshot, so the "single snapshot" story was incomplete. |
| `H47` | The remaining cache-miss lag can be fixed safely by `flushSync`-publishing the visible note-switch state while leaving cache/history updates async. | Rejected as unsafe | Runtime logs showed that the sync-selected note commit could render before the cache state caught up. The subsequent fallback/cache-sync effects then treated the note as uncached and propagated empty content. Evidence: `switch-mnlyn00z-vkbd6g` reopened `app-onder-share1.md` with `hasPrefetchBody:false` and `bodyChars:0`, while earlier in `switch-mnlymy96-69kutr` the same note had opened with `bodyChars:205` before later cache-related logs showed missing cached content. This regression could lead to empty-file persistence and is therefore not shippable. |
| `H55` | The `~110ms` cache-miss gap is mostly **before** the first `setTimeout(0)` macrotask after `H42`, not after it. | `setTimeout(0)` immediately after scheduling the note-switch state batch (`H55`). | Confirmed (ordering). | Slow cache-miss `switch-mnlzl85f-6bhxc6`: `H42 ~43ms`, `H55 ~147ms`, then `H36`/`H6`/`H45 ~162-165ms` (~17ms tail). Fast cache-miss `switch-mnlzl8mp-l3p4nc`: `H42 ~11ms`, `H55 ~36ms`, `H36`/`H6 ~53ms`. **Interpretation:** the intermittent cost lives in synchronous / microtask work that prevents the macrotask from running (~104ms vs ~25ms), consistent with a long React render/commit phase or other main-thread work on the slow path; the interval **after** `H55` until layout is small in both runs. **Note:** warm/tab cache-hit runs can show `H36` before `H42` because `loadMarkdown` and state publish happen in a different order than cold tree cache-miss; compare `H55` only on comparable paths. |
| `H56` | Slow `H42`→`H55` is dominated by `VaultTab` / `VaultPaneTree` renders that already see the new `selectedUri`. | Render-sequence logs `H56` when subtree props match active target. | **Path-dependent; not universally rejected** | **A:** `switch-mnlzs44z-056jvy` / `switch-mnlzs4o2-5vu4jj`: first `H56` **after** `H55` by ts. **B:** `switch-mnlzung7-0eemub`: `H57`/`H56` at `0205+` vs `H55` at `0525` (~320ms later); multiple `VaultPaneTree` `H56` **before** `H55`. |
| `H57` | The `H42`→`H55` gap is **before** `App` renders inbox with `selectedUri === target`. | `App.tsx` `H57` render logs. | **Rejected** | `switch-mnlzung7`: `H42` ts `0204`, `H57` `0205–0206`, `H55` `0525`. `switch-mnlzum0g`: `H42` `8324`, `H57` `8325`, `H55` `8661`. |
| `H58` | Long `H42`→`H55` = main thread busy so `setTimeout(0)` runs late. | `H55` `elapsed`; **`H58` lifecycle** proves **`observe(type:longtask)` ok**. | **`longtask` list still empty** on slow path | `switch-mnm00zv6`: lifecycle **`5990`/`5996`**, `H42` **`6215`**, `H55` **`6561`**; **no** `PerformanceObserver:longtask`. Fast `switch-mnm017u4`: `H42` **`6546`**, `H55` **`6571`** (**25ms** `elapsed`). |
| `H59` | User Timing **`measure`** (post-schedule mark → `H55`) equals **`H55 elapsed − H42 elapsed`**. | `performance.mark` / `measure` in `openMarkdownInEditor`. | **Confirmed** | `switch-mnm059f5`: **`scheduleToH55MeasureMs` 331** = **350 − 19**; `switch-mnm05bjo`: **92** = **116 − 24**; `switch-mnm05c32`: **20** = **27 − 7**. |

## Most useful runtime evidence so far

### Why the backlinks defer fix counted as significant

Before the local backlinks defer refactor, warm-switch logs showed a late `VaultTab` commit that correlated with the backlinks defer prop changing on the parent. After the refactor, the defer still happened, but it moved into local `H32` logs in `InboxBacklinksSection`, which is the intended design.

### Why the fold-state refactor became the next target

The most recent pre-refactor run still showed a late commit pattern tied to foldability:

- In `switch-mnlxg4f6-2vrko2`, `H27` reported `next:true` for foldable ranges at `~249ms`.
- In the same run, late profiler commits for `VaultPaneTree` and `EditorPane` landed at `~254ms`.
- The matching `H30` tree snapshot had `changedKeys:[]`, which means the tree itself was not the source.
- This is why fold-state propagation was promoted from "not the cause of the previous issue" to "current remaining suspect".

### What changed after the fold-state refactor

Post-refactor logs changed the interpretation:

- The late parent commit no longer showed fold keys in `H29`, so the parent-level propagation issue was reduced as intended.
- However, `switch-mnlxngfb-wojl7k` still showed a late nested update around `~297ms`, which means the remaining problem moved below the `VaultTab` parent layer.
- Warm cached runs such as `switch-mnlxnn3z-xs6tl3` showed fast initial content commits (`~20ms`) but still later backlink or tree-selection follow-up work.
- A tree-driven run such as `switch-mnlxnm40-clbsox` showed `selectedMarkdownUri` changing at `~151-152ms`, while the tree's own selected item state did not settle until roughly `~369-392ms`, which is why tree selection synchronization is now the main pending focus.

### What the new tree-selection logs proved

- In `switch-mnlxs3ze-ial5ff`, `H33` started at `~259ms`, `H34`/`H35` followed immediately at `~388ms`, and the setter already produced the correct selected item. This means the first large delay was before the effect began, not after the setter.
- In `switch-mnlxs6x1-izejv1`, the same pattern appeared again on a tree-driven warm run: first visible tree/editor commit around `~147ms`, but `H33` did not start until `~338ms`.
- In `switch-mnlxs7z4-4f0yfy`, a warmer cached tree run behaved much better: `H33` started around `~60ms` and completed in `~2ms`. This shows the remaining issue is intermittent or path-dependent, not a universal fixed cost of `setSelectedItems(...)`.

### What `H36` added

- In the first cold-ish run `switch-mnlxw5au-ffb79c`, `H36` showed `itemsLength:0` and `targetPresentInItems:false` at `~34ms`. That means the tree could not have selected the target row yet because it did not exist in the flattened item list.
- In the warm tree run `switch-mnlxw830-b7r2f9`, `H36` showed `targetPresentInItems:true` at `~23ms`, while `selectedItemsNow` still pointed to the previous note. The passive `H33` effect only started at `~45ms`.
- In the tree run `switch-mnlxw75a-b9mi0a`, the same warm-path pattern appeared again: `H36 targetPresentInItems:true` at `~192ms`, but `H33` only started around `~397ms`.
- This is the direct runtime basis for trying a layout-timed selection sync only when the row is already present.

### What the `H37` verification proved

- Warm tree and tab switches now show immediate layout-time tree selection when the row already exists.
- Example: `switch-mnly0tpg-yug8st` logged `H36` and `H37` together at `~34ms`, with `selectedItemsAfter` already pointing to the new note.
- Example: `switch-mnly0uf1-g23mao` did the same at `~46ms` on a tab switch.
- This means the old warm-path tree-selection lag is no longer the main remaining issue.

### What remains after the warm-path tree fix

- Some cache-miss switches still do not reach their first visible tree/editor commit until roughly `~155ms`.
- In `switch-mnly0shv-zl0nyv`, `prefetchRead` completed at `~4ms`, but the first visible commit was still around `~155-156ms`.
- That remaining gap now points away from tree selection and toward the cache-miss note-open pipeline in `openMarkdownInEditor`.

### What `H38` / `H39` / `H40` proved

- In `switch-mnly52xz-johphe`, `prefetchRead` finished at `~5ms`, `H38` ran at `~6ms`, `H39` at `~24ms`, and `H40` at `~25ms`.
- The first visible profiler work for that same switch did not start until roughly `~128-151ms`.
- That means the dominant remaining gap is after synchronous editor preparation and after state publication begins, not in filesystem prefetch and not primarily in `loadMarkdown(...)`.

### What `H41` / `H42` proved

- In `switch-mnly8d8b-jv9wxp`, `H39`, `H40`, `H41`, and `H42` all clustered at `~23ms`.
- The first visible `VaultPaneTree` / `EditorPane` profiler work for that same switch still did not start until roughly `~133ms`, and `NoteMarkdownEditor activeNotePath` / `VaultTab selectedCommit` still did not land until `~136ms`.
- So the remaining `~110ms` cache-miss gap is not inside the post-state tail of `openMarkdownInEditor`, and not after the first microtask either.
- The next question is whether the browser had earlier frame opportunities during that gap (`H43` / `H44`) or whether the main thread was blocked until near the first visible commit.

### What `H43` / `H44` proved

- In the slow cold cache-miss run `switch-mnlycx40-fv82gc`, `H40` / `H42` were already at `~18ms`, but `H43` did not arrive until `~266ms` and `H44` until `~401ms`.
- In another slow cache-miss run `switch-mnlycysp-cmzg72`, `H42` was at `~43ms`, the first visible commit was around `~151-154ms`, and `H43` still did not arrive until `~189ms`.
- In a faster cache-miss run `switch-mnlyczaa-uadqcw`, `H43` improved to `~87ms`, matching the healthier first visible commit around `~56-59ms`.
- This is strong evidence that the remaining intermittent lag is tied to late frame availability / main-thread occupation, not just React intentionally spreading the commit over already-available frames.

### What `H45` / `H46` proved

- In `switch-mnlyj0r7-we9fvu`, `H45` started at `~109ms`, `H15` started at `~110-121ms`, and `H46` landed at `~133ms`.
- In `switch-mnlyj18q-2b6u4p`, `H45` started at `~52ms`, `H15` at `~53-63ms`, and `H46` at `~68ms`.
- So the remaining variable gap is not an unmeasured render phase above `VaultTab`, and not a separate parent commit far away from the visible subtree commit.
- The next hypothesis is that the async note-switch state publication itself still needs an explicit synchronous flush for the visible note-switch state.

### What `H47` proved

- The `flushSync` experiment did improve the measured first visible commit timing on some runs.
- But the same experiment also introduced a correctness regression in the note-body cache / fallback interaction, which is more important than the performance win.
- In `switch-mnlymy96-69kutr`, `app-onder-share1.md` first opened with `bodyChars:205`, but later cache-related logs still showed `nextChars:0`.
- In the later tab-switch run `switch-mnlyn00z-vkbd6g`, that same note reopened from cache with `bodyChars:0`.
- Subsequent runs repeated the same pattern for other notes, and `snapshotChars:0` then appeared at the start of later switches, proving that empty editor state was being carried forward into persistence paths.
- Conclusion: `H47` identified a real scheduling lever, but this particular implementation is unsafe and has been reverted.

### What remains after reverting `H47`

- The note-integrity regression is gone in the latest safety run: reopened notes again report the expected cached sizes (`blocks.md` `117`, `app-onder-share1.md` `205`, `audio-rec.md` `92`).
- But the safe baseline still shows large performance variance on cache-miss switches.
- Example slow run: `switch-mnlyyusz-uc8bbb` opened `app-onder-share1.md` with `H39 ~47ms`, first visible App/VaultTab commit around `~157-169ms`, and first post-state frame around `~200ms`.
- Example healthier run: `switch-mnlyyvko-azs7gj` opened `audio-rec.md` with `H39 ~10ms`, first visible App/VaultTab commit around `~51-55ms`, and first post-state frame around `~83ms`.
- The next question is whether that variance is already inside the synchronous CodeMirror load path or only after it.

### What `H48` / `H49` / `H50` / `H51` proved

- In the slower cache-miss run `switch-mnlz2q5d-yils14`, the editor load sub-steps were still small: `H48 ~2ms`, `H49 ~4ms`, `H50 ~8ms`, `H51 ~16ms`, and `H39 ~16ms`.
- In the healthier run `switch-mnlz2qnm-pbao4d`, they were similarly small: `H48 ~3ms`, `H49 ~6ms`, `H50 ~12ms`, `H51 ~17ms`, and `H39 ~18ms`.
- That means the big variance is not in `EditorState.create`, not in `view.setState`, and not primarily in the synchronous post-load reconfigure/fold callback work itself.
- One remaining difference between the runs is that the slower run still showed `onFoldableRangesPresentChange changed:true` while `selectedUri` was the previous note, whereas the healthier run did not.

### What `H52` proved so far

- In the slower cache-miss run `switch-mnlz7prp-37vgu7`, `H52` fired at `~22ms` while `selectedUri` still pointed at `blocks.md`, but the active switch already targeted `app-onder-share1.md`; the first visible selected-note commit then did not land until `~130-139ms`.
- In the healthier cache-miss run `switch-mnlz7qax-tx1ndw`, no `H52` log appeared; the first visible selected-note commit landed much earlier at `~64-67ms`.
- Follow-up verification (`switch-mnlzhg14-wktcmv`) still showed `H52` at `~40ms` with `H42` at `~41ms` and `H36` / `H6` at `~151-152ms`, so **the stale callback correlates with the slow path but is not sufficient to explain the full `~110ms` `H42`→`H36` gap** when it is present.

### What `H53` proved

- In the slower cache-miss run `switch-mnlzc59s-3mzsi4`, the early stale callback `H52` reported `foldable=false` at `~14ms`, and the later post-commit editor snapshot `H53` for `app-onder-share1.md` also reported `foldablePresent=false` at `~124ms`.
- In the healthier cache-miss run `switch-mnlzc5rj-9y6lt0`, there was no stale foldability change and the post-commit snapshot still reported the expected final state `foldablePresent=false` at `~40ms`.
- That proves the **post-commit** editor state matches the stale-path fold signal for those runs, but it does **not** imply that skipping the stale `setState` will fix the overall switch latency.

### What the `H54` attempt proved (post-verification, 2026-04-05)

- Post-change slow cache-miss run `switch-mnlzhg14-wktcmv` still had `H36` / `H6` at `~151-152ms` while `H42` was `~41ms`, so the attempted "remove extra fold `setState` during stale selection" change did not remove the dominant gap.
- The implementation also wired `onCommittedFoldSnapshotRef` through `useEffect`, which runs after `useLayoutEffect`. That meant the snapshot callback could still be the **previous** render's function during the `activeNotePath` layout effect, which is why `H54` did not appear even though `H53` did for the same note commit.
- **Reverted:** `getFoldSnapshot`, `H54`, and the early-return fold `setState` suppression were removed after this verification. (Earlier `H52` stale-fold logs were later removed with the rest of desktop switch debug instrumentation.)

### What `H55` proved (2026-04-05)

- On the slow tree cache-miss run `switch-mnlzl85f-6bhxc6` (`app-onder-share1.md`), `H42` landed at `~43ms` and `H55` at `~147ms`, while `H36` / `H6` / `H45` landed at `~162-165ms`.
- That means roughly `~104ms` elapses **after** the post-state microtask but **before** the first `setTimeout(0)` runs; only `~17ms` elapses between `H55` and the first `VaultPaneTree` layout checkpoint.
- On the faster tree cache-miss run `switch-mnlzl8mp-l3p4nc` (`audio-rec.md`), the same ordering holds with a much shorter `H42`→`H55` span (`~11ms` → `~36ms`, ~25ms) and `H36`/`H6` at `~53ms`.
- Conclusion: the intermittent slowness is dominated by **main-thread work that delays the macrotask**, not by a long idle gap after the macrotask. The next investigation step is to attribute that work (most likely a large synchronous React update on the slow path — see pending `H56`).

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
- If this investigation resumes later, prefer starting from pending `H56` (what consumes the long `H42`→`H55` window on slow cache-miss runs) before reopening bigger architectural ideas.

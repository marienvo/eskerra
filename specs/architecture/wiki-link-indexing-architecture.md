# Wiki link indexing architecture

**Status:** Directional architecture note for wiki link indexing and rename-adjacent read paths. This document sets boundaries and decision gates; it is not an implementation commitment.

Related plans: [desktop-shell-wiki-backlog.md](../plans/desktop-shell-wiki-backlog.md), [extension-readiness.md](./extension-readiness.md).

## Scope and non-scope

- **In scope:** seam boundaries for backlinks/read indexing, rename planning support, and benchmark-gated acceleration decisions.
- **Out of scope:** full-text search product, global ranked search platform, plugin host design.

## Ownership boundaries

- **`@eskerra/core` owns semantics**
  - wiki link parsing
  - normalization and identity rules
  - ambiguity behavior
  - rewrite policy
- **Shell/workspace owns lifecycle**
  - when indexing runs
  - refresh and invalidation policy
  - feature wiring for backlinks and rename flows
- **Indexing seam owns mechanics**
  - file discovery
  - batched reads
  - invalidation helpers
  - optional runtime caching

Native implementations behind the seam (Rust/Kotlin) must remain mechanics-only and must not own business rules.

## Runtime-first storage posture

- Default: runtime or app-owned cache for link/index state.
- Durable `.eskerra` index artifacts are deferred until explicit productization with named ownership, retention, migration, and user-facing behavior.

## Measurement gates

Native acceleration is considered only after a TypeScript-first implementation misses targets after basic optimization.

- **Cold start impact:** no more than 50 ms main-thread blocking before first render; no more than 200 ms added before first-screen interactive (10k-file reference vault).
- **Initial background build:** backlink-capable runtime index build completes within 5 s on reference hardware.
- **Incremental backlink update:** single-file change reflected within 150 ms p95 and 500 ms p99.
- **Rename planning:** affected-reference discovery completes within:
  - 500 ms for 500 touched files
  - 2 s for 2k touched files
  - 8 s for 10k touched files
- **Rename planning—touched content:** total touched bytes must be measured and reported; file-count targets must be evaluated alongside that byte volume. Meeting file-count targets alone is not enough if large-content workloads produce disproportionately poor performance or UX.
- **Memory ceiling:** steady-state link-index memory under 128 MB on the reference vault unless explicitly approved.

All benchmark results must record reference hardware and reference vault composition. Rename planning must account for total touched bytes (no fixed byte limits at this stage).

## Sequencing constraints

- Wiki authoring features (gestures, highlights, target autocomplete) stay intentionally non-native.
- Backlinks and rename maintenance may introduce or extend a seam boundary; do not commit to a full indexing subsystem without benchmark evidence.
- Rename propagation builds on the same link semantics and read patterns as backlinks; do not expand into broad architectural rewrites without new product approval.

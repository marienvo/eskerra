# Wiki link indexing architecture

**Status:** Directional architecture note for WL-4 and WL-5. This document sets boundaries and decision gates; it is not an implementation commitment.

Related plans: [wiki-links-phased-roadmap.md](../plans/wiki-links-phased-roadmap.md), [plugin-readiness-masterplan.md](../plans/plugin-readiness-masterplan.md), [extension-readiness.md](./extension-readiness.md).

## Scope and non-scope

- **In scope:** seam boundaries for backlinks/read indexing (WL-4), rename planning support (WL-5), and benchmark-gated acceleration decisions.
- **Out of scope:** full-text search product, global ranked search platform, plugin host design.

## Ownership boundaries

- **`@notebox/core` owns semantics**
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
- Durable `.notebox` index artifacts are deferred until explicit productization with named ownership, retention, migration, and user-facing behavior.

## Measurement gates

Native acceleration is considered only after a TypeScript-first implementation misses targets after basic optimization.

- **Cold start impact:** no more than 50 ms main-thread blocking before first render; no more than 200 ms added before first-screen interactive (10k-file reference vault).
- **Initial background build:** backlink-capable runtime index build completes within 5 s on reference hardware.
- **Incremental backlink update:** single-file change reflected within 150 ms p95 and 500 ms p99.
- **Rename planning:** affected-reference discovery completes within:
  - 500 ms for 500 touched files
  - 2 s for 2k touched files
  - 8 s for 10k touched files
- **Memory ceiling:** steady-state link-index memory under 128 MB on the reference vault unless explicitly approved.

All benchmark results must record reference hardware and reference vault composition, including touched files and touched bytes for rename measurements.

## Sequencing constraints

- WL-1 to WL-3 remain intentionally non-native.
- WL-4 introduces a seam boundary, not a full indexing subsystem commitment.
- WL-5 is an incremental extension of WL-4; do not expand into broad architectural rewrites without new product approval.

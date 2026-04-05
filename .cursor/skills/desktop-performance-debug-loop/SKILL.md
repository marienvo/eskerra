---
name: desktop-performance-debug-loop
description: >-
  Guides systematic performance debugging for the desktop React app: analyze
  logs and timings, rank hypotheses, test one isolated change at a time, compare
  before/after measurements, and persist conclusions under specs/performance.
  Use when debugging desktop slowness, UI jank, note switching, editor
  performance, or when the user asks for measured desktop performance
  investigation.
---

# Desktop performance debug loop

Use this workflow for **desktop React** performance work in this repo. Follow the loop in order; do not skip the logbook step before starting the next hypothesis.

## Loop (strict)

1. **Analyze** current logs and measurements (existing traces, timings, profiler output, user steps).
2. **Propose** at most **3 hypotheses**, ranked by **likelihood** and **impact**. Use ids `H01`, `H02`, `H03`.
3. **Select** exactly **one** hypothesis to test next.
4. **Implement** a **minimal** change that targets **only** that hypothesis.
5. **Measure** with clear **before** and **after** timings (same scenario, same instrumentation where possible).
6. **Persist** results under `specs/performance/` **before** moving on:
   - Append to an existing logbook in that folder, or create one if none fits.
   - Record:
     - hypothesis id (`Hxx`)
     - short description
     - change made (what changed, file-level if helpful)
     - before / after timings (raw numbers)
     - classification: one of **Significant**, **Limited**, **No significant difference**, **Pending**
     - clear **conclusion** (what was learned, what to try or avoid next)

## Rules

- **One hypothesis per step** — do not combine multiple optimizations or unrelated fixes in the same change.
- **No unrelated refactors** — keep diffs scoped to the measurement.
- **Preserve measurement clarity** — same test procedure, note conditions (build, data size, etc.).
- **Isolate variables** — prefer narrow experiments over broad “cleanup” passes.
- **Write the logbook entry before** proposing or testing the next hypothesis.
- **Do not re-propose** a hypothesis that was already tested and marked **No significant difference**, unless **architecture or the relevant code path materially changed** (then state why it is fair to retry).

## Logbook conventions

- Prefer a dedicated markdown file per investigation thread (e.g. `specs/performance/desktop-note-switching-debug-logbook.md`) or append to the existing file if the user already started one there.
- Use a consistent heading or dated section per hypothesis so results stay scannable.

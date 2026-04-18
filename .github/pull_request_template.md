## Summary

<!-- What changed and why -->

## Test checklist (Vitest / desktop)

- [ ] No new `describe` / `it` relies on module-scoped mutable variables in the test file without resetting via the shared harness or a local factory.
- [ ] Any `render` / `renderHook` is covered by `apps/desktop/vitest.setup.ts` (do not skip global setup for convenience).
- [ ] Any `vi.useFakeTimers()` is only inside a test or that file’s `beforeEach` — never at module top level.
- [ ] New `apps/desktop/src/**` module with mutable module-scoped state exports `__resetForTests`. Wire it into `vitest.setup.ts` **only if** the module does not import `@tauri-apps/*` at top level (otherwise tests that `vi.mock('@tauri-apps/...')` break); otherwise call `__resetForTests` from the relevant test files’ `afterEach` / `beforeEach`.
- [ ] No new import-time side effects that mutate globals or persisted storage (no top-level `hydrate()`, `subscribe()`, `setInterval`, `addEventListener` in lib code without lazy init + ADR).
- [ ] Any `vi.mock` factory returns fresh state per invocation, or the file’s `beforeEach` resets shared mock state. (Repo default is `restoreMocks: false` — do not enable global `restoreMocks: true` without updating this ADR and fixing module mocks.)
- [ ] No `vitest` config changes that set `isolate: false` or use `pool: 'threads'` without isolation unless this PR updates `specs/adrs/adr-vitest-desktop-test-isolation.md`.
- [ ] CodeMirror `EditorView` (or similar) created in a test is destroyed in that test; global setup clears the DOM but does not call `destroy()`.
- [ ] New node package tests use `include: ['src/**/*.test.{ts,tsx}']` in that package’s `vitest.config.ts`.
- [ ] Optional: run `npx vitest run --sequence.shuffle` in `apps/desktop` once before review.

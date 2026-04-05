# PR review: extension-readiness guardrails

Use for changes that touch the vault, editor, desktop shell, podcast/playlist, or new persistent files.

## Editor vs shell

- [ ] Does this add **vault writes**, **path resolution policy**, or **Tauri/native APIs** under `apps/desktop/src/editor/`? If yes, reroute through `lib/` and inject (unless this PR is explicitly the seam refactor).
- [ ] Are Markdown or attachment transforms **explicit** (user gesture or documented setting)?
- [ ] Could this register **global shortcuts** without going through a future central command owner?

## Vault and `.eskerra`

- [ ] Are new vault files **durable and justified** (settings, defined indexes, product artifacts)—not UI session or caches?
- [ ] Could this data live in **app store** instead? If it is ephemeral or high-churn, it should not land in `.eskerra`.

## Coupling

- [ ] Does this couple unrelated features (for example inbox listing ↔ podcast playlist) without a crisp, documented reason?
- [ ] Does it introduce a **global revision** or invalidation flag that many hooks will misuse?

## Performance

- [ ] Any new **startup** I/O, parsing, or indexing? If yes: deferrable and measured per performance rules?

## Ownership

- [ ] If touching wiki links, search, or indexes: is there a clear owner—or is this labeled temporary scaffolding?

## Tests

- [ ] Pure logic changes include tests in the owning package (`@eskerra/core` or targeted `lib` tests) where feasible.

## Authority

Principles and layers: [extension-readiness.md](../architecture/extension-readiness.md).  
Phased follow-ups: [desktop-shell-wiki-backlog.md](../plans/desktop-shell-wiki-backlog.md).

# Frontmatter editor (desktop vault)

The vault editor keeps YAML frontmatter **outside** CodeMirror (see [`splitYamlFrontmatter`](../../packages/eskerra-core/src/markdown/splitYamlFrontmatter.ts)). The shell stores **YAML inner** text (between fences) in `inboxYamlFrontmatterInner` and merges on save via [`inboxYamlFrontmatterEditor`](../../apps/desktop/src/lib/inboxYamlFrontmatterEditor.ts) → [`mergeYamlFrontmatterBody`](../../packages/eskerra-core/src/markdown/mergeYamlFrontmatterBody.ts).

## Value model

Property values are [`FrontmatterValue`](../../packages/eskerra-core/src/markdown/frontmatterTypes.ts): scalars (including ISO strings / epoch numbers for timestamps), arrays, or plain objects. **No JavaScript `Date` instances** are stored in the model.

## Property types (`FrontmatterPropertyType`)

- **`date`**: `YYYY-MM-DD` string.
- **`datetime`**: local wall-clock, `YYYY-MM-DDTHH:mm` string (no timezone field).
- **`timestamp`**: ISO instant with offset/`Z`, **or** numeric Unix epoch. The editor preserves the backing representation (ISO vs epoch) and does **not** silently convert between them. It never emits a bare date for a timestamp.
- **`list` / `tags`**: arrays of scalar items (autocomplete indexes **individual** list items).
- **`object`**: mapping; v1 supports nested keys with a JSON textarea fallback for deep trees.

Inference and statistical rules live in `@eskerra/core` (`inferPropertyTypeFromVaultSamples`, `resolveEffectiveFrontmatterPropertyType`). Settings may override per key via `vaultSettings.frontmatterProperties` (`Properties` tab).

## Rust index

`vault_frontmatter_index.rs` maintains per-file snapshots, top-level keys only, incremental updates from `vault-files-changed`, and skips files with duplicate top-level YAML keys (`skippedDuplicateKeyFiles`).

- Commands: `vault_frontmatter_index_schedule`, `vault_frontmatter_index_snapshot`, `vault_frontmatter_index_values_for_key`.
- Events: `vault-frontmatter-index-ready`, `vault-frontmatter-index-updated`.

The renderer hook is [`useVaultFrontmatterIndex`](../../apps/desktop/src/hooks/useVaultFrontmatterIndex.ts) (loads snapshot, listens for the events, merges settings overrides).

## Duplicate keys

If `parseFrontmatterInner` reports duplicate top-level keys, the UI shows a read-only banner. The vault index excludes that file until fixed.

## Performance

The index schedule runs after first paint (same discipline as search index). The frontmatter editor is mounted **outside** `.cm-editor` and uses **padding** (not margin) so CodeMirror measurement is unaffected.

## v1 boundaries

Indexed paths are **top-level keys** only; nested paths are not inferred for autocomplete. Arrays of objects, anchors/aliases, and custom YAML tags are out of scope for v1.

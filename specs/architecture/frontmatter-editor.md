# Frontmatter editor (desktop vault)

The vault editor keeps YAML frontmatter **outside** CodeMirror (see [`splitYamlFrontmatter`](../../packages/eskerra-core/src/markdown/splitYamlFrontmatter.ts)). The shell stores **YAML inner** text (between fences) in `inboxYamlFrontmatterInner` and merges on save via [`inboxYamlFrontmatterEditor`](../../apps/desktop/src/lib/inboxYamlFrontmatterEditor.ts) → [`mergeYamlFrontmatterBody`](../../packages/eskerra-core/src/markdown/mergeYamlFrontmatterBody.ts).

## Value model

Property values are [`FrontmatterValue`](../../packages/eskerra-core/src/markdown/frontmatterTypes.ts): scalars (including ISO strings / epoch numbers for timestamps), arrays, or plain objects. **No JavaScript `Date` instances** are stored in the model.

## Property types (`FrontmatterPropertyType`)

- **`date`**: `YYYY-MM-DD` string.
- **`datetime`**: local wall-clock, `YYYY-MM-DDTHH:mm` string (no timezone field).
- **`timestamp`**: ISO instant with offset/`Z`, **or** numeric Unix epoch. The editor preserves the backing representation (ISO vs epoch) and does **not** silently convert between them. It never emits a bare date for a timestamp.
- **`url`**: string values that look like `http://` or `https://` web URLs. Typed as **`url`** in YAML (still a plain string); the desktop editor uses a URL field **without** vault-wide enum autocomplete (other free-text keys still use suggestions when applicable).
- **`list` / `tags`**: arrays of scalar items (autocomplete indexes **individual** list items). The list add field supports **Enter** to commit, and **comma / semicolon / tab** to commit one or more items; **paste** with newlines or separators splits into multiple items. For the `tags` key, the same list model is shown with tag affordances (`#` in the UI). New or empty lists use a dashed “add” area so users are not expected to type `[` / `]` in YAML.
- **`object`**: mapping; v1 supports nested keys with a JSON textarea fallback for deep trees.

## Effective type (desktop)

The row “Type” control and settings overrides still win, but the following **shape-first** rules apply so the UI never shows a text field with `JSON.stringify` of an array when the value in the current note is already a list:

- If the value is a **web URL** string (`http://` / `https://`) → treat as **`url`** (before applying vault index inference for that key).
- If the value is a **scalar array** (including `[]`) → use **`list`**, except the top-level key `tags` (case-insensitive) which uses the **`tags`** row affordance. This runs **before** `useVaultFrontmatterIndex`’s `inferredType` for that key, so a note with a list is never downgraded to “text” just because the vault’s samples for that key are mostly strings.

**Assisted “Convert to list”** (text fields only): if the current string value contains a separator (`,`, `;`, tab, or newline), the editor may show a **Convert to list** action. The value is only changed to a YAML array when the user clicks it (no automatic conversion on typing).

**Add property** row: a **Type** selector with **Auto** (vault-inferred type for known keys, otherwise `text`) and every explicit `FrontmatterPropertyType`, so new properties can be created as a list (or any other type) without first adding a `text` key and changing the type.

**Serialized lists on disk:** `serializeFrontmatterInner` forces **block**-style sequences for top-level lists of scalars (avoids flow style like `[a, b]` in saved files) so diffs and other tools see standard list syntax.

Inference and statistical rules for the **index** still live in `@eskerra/core` (`inferPropertyTypeFromVaultSamples`, `resolveEffectiveFrontmatterPropertyType`). Settings may override per key via `vaultSettings.frontmatterProperties` (`Properties` tab).

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

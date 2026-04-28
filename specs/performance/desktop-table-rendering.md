# Desktop: Markdown table shell performance

This note records **why** Eskerra v1 pipe tables felt slow and **what** we changed. For editor architecture, see [desktop-editor.md](../architecture/desktop-editor.md).

## Main costs (historical)

1. **Decoration rebuild on every caret move** — `transactionAffectsTableDecorations` used to treat selection changes like document changes, so `findEskerraTableDocBlocks` ran on the full document for every selection update. **Fix:** cache blocks in `eskerraTableDocBlocksField` (recompute only on `docChanged`) and do not rebuild the replace decorations on selection-only transactions ([eskerraTableV1Codemirror.tsx](../../apps/desktop/src/editor/noteEditor/eskerraTableV1/eskerraTableV1Codemirror.tsx)).

2. **Per-cell Lezer work** — Each inactive cell ran `buildCellStaticSegments` plus a second `EditorState` for link hit-tests. **Fix:** return a single `EditorState` from `buildCellStaticSegments`; share with Today Hub static view ([eskerraTableCellStaticSegments.ts](../../apps/desktop/src/editor/noteEditor/eskerraTableV1/eskerraTableCellStaticSegments.ts)).

3. **Interval merge** — `mergeStyledIntervals` used an O(gaps × intervals) filter loop. **Fix:** sweep-line active set ([eskerraTableCellStaticSegments.ts](../../apps/desktop/src/editor/noteEditor/eskerraTableV1/eskerraTableCellStaticSegments.ts)).

4. **React remount on every table markdown flush** — Widget `eq` compared `baselineText`, so CodeMirror destroyed the shell DOM whenever the serialized table changed. **Fix:** `eq` only on `headerLineFrom`; shell syncs from the document via `registerShellDocSyncListener` ([eskerraTableShellDocSyncRegistry.ts](../../apps/desktop/src/editor/noteEditor/eskerraTableV1/eskerraTableShellDocSyncRegistry.ts), [EskerraTableShell.tsx](../../apps/desktop/src/editor/noteEditor/eskerraTableV1/EskerraTableShell.tsx)).

5. **Static preview storms** — `dispatchEskerraTableNestedCellEditors` called `bumpTableShellStaticPreview` after each parent wiki/relative compartment reconfigure; React effects could fire several times per frame and reparse **every** static cell repeatedly. **Fix:** coalesce bumps with `queueMicrotask` ([tableShellStaticPreviewStore.ts](../../apps/desktop/src/editor/noteEditor/eskerraTableV1/tableShellStaticPreviewStore.ts)).

6. **Repeated full-document scans in flush paths** — `findEskerraTableDocBlockByLineFrom` scanned the whole doc. **Fix:** `eskerraTableDocBlockAtHeaderLine(state, …)` reads the cached field ([eskerraTableDocBlocksField.ts](../../apps/desktop/src/editor/noteEditor/eskerraTableV1/eskerraTableDocBlocksField.ts)).

## Additional mitigations

- **Per-shell segment cache** keyed by cell text (cleared when `staticRichPaintKey` changes) via `EskerraCellStaticCacheContext`.
- **`prefetchStaticForHover`** on inactive cells to parse before click.
- **`memo` on shell cells** to skip re-renders when only unrelated shell UI state (e.g. drag overlay) updates.

## Dev checks

- Coalescing: [tableShellStaticPreviewStore.test.ts](../../apps/desktop/src/editor/noteEditor/eskerraTableV1/tableShellStaticPreviewStore.test.ts).
- Flush ordering still requires `eskerraTableDocBlocksField` on the `EditorState` used in tests (see [eskerraTableDraftFlush.test.ts](../../apps/desktop/src/editor/noteEditor/eskerraTableV1/eskerraTableDraftFlush.test.ts)).

## Scroll Stability Mitigations

- Row-handle geometry is no longer measured by a `ResizeObserver` during passive table mount. It is invalidated on content, notice, and shape changes, then measured lazily on table pointer entry/move or row-drag start, keeping the left drag handles available without paying the layout cost while simply scrolling through many tables.
- Table shell replace widgets now provide a conservative row/column/content based `estimatedHeight`, so CodeMirror can reserve space for lazily mounted tables above the viewport and avoid large upward scroll corrections.
- The replace-widget wrapper gets a `min-height` from the best available estimate during React mount, preventing a transient 0px DOM height from collapsing the scrollbar while the shell tree is filling in.
- Once a shell has had a real non-zero rendered child height, that height is cached in the editor state's table field and reused by `estimatedHeight` and wrapper reservation for the same table while scrolling back through the note. The per-editor cache is cleared on document edits to avoid stale heights after table content or line positions change.

## Not done (future)

- **Warm hidden nested CodeMirror** per cell (Today Hub–style LRU) — high complexity; measure before building.
- **Virtualize rows** for very large tables — not in scope for current shell UX.
- **More exact table height estimates** — possible with font/layout heuristics, but only worth doing if the logged actual-vs-estimated gap remains the dominant cause.

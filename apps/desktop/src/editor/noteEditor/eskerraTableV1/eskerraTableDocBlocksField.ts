import {StateField, type EditorState} from '@codemirror/state';

import {
  findEskerraTableDocBlocks,
  type EskerraTableDocBlock,
} from './eskerraTableV1DocBlocks';

/** Valid Eskerra v1 table blocks in document order; recomputed only on doc changes. */
export const eskerraTableDocBlocksField = StateField.define<EskerraTableDocBlock[]>({
  create(state) {
    return findEskerraTableDocBlocks(state.doc);
  },
  update(value, tr) {
    if (tr.docChanged) {
      return findEskerraTableDocBlocks(tr.state.doc);
    }
    return value;
  },
});

/** O(1) lookup when `eskerraTableDocBlocksField` is present on the state (vault table editor). */
export function eskerraTableDocBlockAtHeaderLine(
  state: EditorState,
  headerLineFrom: number,
): EskerraTableDocBlock | null {
  return (
    state.field(eskerraTableDocBlocksField).find(b => b.lineFrom === headerLineFrom)
    ?? null
  );
}

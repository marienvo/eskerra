import {Facet} from '@codemirror/state';
import type {Extension} from '@codemirror/state';

import type {
  EskerraCellBundleFactory,
  EskerraTableCellBundlePartial,
} from '../noteMarkdownCellEditor';

export type {EskerraCellBundleFactory, EskerraTableCellBundlePartial} from '../noteMarkdownCellEditor';

/**
 * Parent note editor registers this facet so the table shell can build a matching mini CodeMirror.
 */
export const eskerraTableCellBundleFacet = Facet.define<
  EskerraCellBundleFactory,
  EskerraCellBundleFactory | null
>({
  combine: xs => (xs.length > 0 ? xs[xs.length - 1]! : null),
});

export function resolveEskerraTableCellExtensions(
  partial: EskerraTableCellBundlePartial,
  parentFacet: EskerraCellBundleFactory | null,
): readonly Extension[] {
  const ext = parentFacet?.(partial);
  if (!ext || ext.length === 0) {
    throw new Error(
      'eskerraTableCellBundleFacet is missing: NoteMarkdownEditor must register the table cell bundle facet.',
    );
  }
  return ext;
}

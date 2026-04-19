import {
  parseFrontmatterInner,
  serializeFrontmatterInner,
} from '@eskerra/core';
import type {Document, ParsedNode} from 'yaml';

/** Serialized YAML inner (`null` removes the fenced frontmatter block entirely). */
export function serializeFrontmatterInnerOrDropEmpty(
  doc: Document<ParsedNode>,
): string | null {
  const inner = serializeFrontmatterInner(doc);
  const parsed = parseFrontmatterInner(inner);
  if (parsed.duplicateKeys.length > 0) {
    return inner;
  }
  const rec = parsed.record;
  if (rec == null) {
    return null;
  }
  if (
    typeof rec === 'object' &&
    !Array.isArray(rec) &&
    Object.keys(rec).length === 0
  ) {
    return null;
  }
  return inner;
}

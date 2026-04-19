import {isMap, isSeq, isScalar, Scalar, YAMLMap, YAMLSeq} from 'yaml';
import type {Document, ParsedNode} from 'yaml';

import type {FrontmatterScalar, FrontmatterValue} from './frontmatterTypes';

/** Convert YAML node tree to runtime values (no `Date` retained — Dates become ISO strings). */
export function yamlDocToFrontmatterRecord(
  doc: Document<ParsedNode>,
): FrontmatterValue | null {
  const root = doc.contents;
  if (root == null) {
    return null;
  }
  return nodeToValue(root);
}

function nodeToValue(node: ParsedNode): FrontmatterValue {
  if (isScalar(node)) {
    return scalarToFrontmatterScalar(node);
  }
  if (isSeq(node)) {
    return seqToArray(node);
  }
  if (isMap(node)) {
    return mapToRecord(node);
  }
  return '';
}

function seqToArray(seq: YAMLSeq<ParsedNode>): FrontmatterValue[] {
  const out: FrontmatterValue[] = [];
  for (const item of seq.items) {
    if (item == null) {
      continue;
    }
    out.push(nodeToValue(item as ParsedNode));
  }
  return out;
}

function mapToRecord(map: YAMLMap<ParsedNode, ParsedNode | null>): {
  [key: string]: FrontmatterValue;
} {
  const out: {[key: string]: FrontmatterValue} = {};
  for (const pair of map.items) {
    const keyNode = pair.key;
    if (!isScalar(keyNode)) {
      continue;
    }
    const rawKey =
      typeof keyNode.value === 'string'
        ? keyNode.value
        : String(keyNode.value);
    if (pair.value == null) {
      out[rawKey] = null;
    } else {
      out[rawKey] = nodeToValue(pair.value as ParsedNode);
    }
  }
  return out;
}

function scalarToFrontmatterScalar(node: Scalar): FrontmatterScalar {
  const v = node.value as unknown;
  if (v === null || v === undefined) {
    return null;
  }
  if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') {
    return v;
  }
  if (typeof BigInt !== 'undefined' && typeof v === 'bigint') {
    return Number(v);
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  return String(v);
}

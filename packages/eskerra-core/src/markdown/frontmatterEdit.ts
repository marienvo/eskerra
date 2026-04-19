import {Document, isMap, isScalar, Pair, parseDocument, YAMLMap} from 'yaml';
import type {ParsedNode} from 'yaml';

import {scanDuplicateTopLevelKeys} from './frontmatterDuplicateKeys';
import {FrontmatterEditCollisionError, FrontmatterPathError} from './frontmatterEditErrors';
import type {FrontmatterPath, FrontmatterValue} from './frontmatterTypes';
import {yamlDocToFrontmatterRecord} from './frontmatterYamlNodes';

export type ParseFrontmatterInnerResult = {
  doc: Document<ParsedNode>;
  record: FrontmatterValue | null;
  duplicateKeys: string[];
};

const PARSE_OPTS = {
  uniqueKeys: false,
  version: '1.2' as const,
  strict: false,
};

/**
 * Parse YAML between the opening and closing `---` delimiters (caller strips delimiters).
 * Duplicate top-level keys are detected but not auto-repaired; `duplicateKeys` is populated.
 */
export function parseFrontmatterInner(inner: string): ParseFrontmatterInnerResult {
  const duplicateKeys = scanDuplicateTopLevelKeys(inner);
  const src = inner.trim() === '' ? '{}' : inner.replace(/\r\n/g, '\n');
  const doc = parseDocument<ParsedNode>(src, PARSE_OPTS);
  if (doc.contents == null) {
    doc.contents = new YAMLMap() as NonNullable<typeof doc.contents>;
  }
  if (!isMap(doc.contents)) {
    throw new FrontmatterPathError(
      'parse',
      [],
      'Frontmatter root must be a YAML mapping.',
    );
  }

  const record = yamlDocToFrontmatterRecord(doc);
  return {doc, record, duplicateKeys};
}

export function serializeFrontmatterInner(doc: Document<ParsedNode>): string {
  const s = String(doc.toString({lineWidth: 0}));
  return s.endsWith('\n') ? s.slice(0, -1) : s;
}

/** User edit: set value at path (creates intermediate maps as needed). */
export function setFrontmatterValue(
  doc: Document<ParsedNode>,
  path: FrontmatterPath,
  value: FrontmatterValue,
): void {
  const node = doc.createNode(frontmatterValueToPlain(value));
  doc.setIn(path as string[], node);
}

/**
 * Add key under parent; throws if sibling `key` already exists.
 */
export function addFrontmatterKey(
  doc: Document<ParsedNode>,
  parentPath: FrontmatterPath,
  key: string,
  value: FrontmatterValue,
): void {
  if (doc.hasIn([...parentPath, key])) {
    throw new FrontmatterEditCollisionError('add', parentPath, key);
  }
  doc.setIn([...parentPath, key], doc.createNode(frontmatterValueToPlain(value)));
}

/** Rename leaf at `path` to `nextKey` under the same parent. */
export function renameFrontmatterKey(
  doc: Document<ParsedNode>,
  path: FrontmatterPath,
  nextKey: string,
): void {
  if (path.length === 0) {
    throw new FrontmatterPathError('rename', path, 'Cannot rename an empty path.');
  }
  const parentPath = path.slice(0, -1);
  if (doc.hasIn([...parentPath, nextKey])) {
    throw new FrontmatterEditCollisionError('rename', parentPath, nextKey);
  }
  const existing = doc.getIn(path as Iterable<unknown>, true);
  if (existing == null) {
    const leaf = path[path.length - 1] ?? '';
    throw new FrontmatterPathError(
      'rename',
      path,
      `Key "${String(leaf)}" not found.`,
    );
  }
  doc.deleteIn(path as Iterable<unknown>);
  doc.setIn([...parentPath, nextKey], existing as ParsedNode);
}

export function deleteFrontmatterKey(
  doc: Document<ParsedNode>,
  path: FrontmatterPath,
): boolean {
  return doc.deleteIn(path as Iterable<unknown>);
}

/**
 * Reorder mapping keys under `parentPath`. Keys present in `nextOrder` appear first in that order;
 * any remaining sibling keys keep their relative order after.
 */
export function reorderFrontmatterKeys(
  doc: Document<ParsedNode>,
  parentPath: FrontmatterPath,
  nextOrder: readonly string[],
): void {
  const map = getYamlMapAtParent(doc, parentPath);
  const seen = new Set(nextOrder);
  const pairByKey = new Map<string, Pair<ParsedNode, ParsedNode | null>>();
  for (const pair of map.items) {
    const kn = pair.key;
    const keyStr = scalarKeyToString(kn as ParsedNode);
    pairByKey.set(keyStr, pair as Pair<ParsedNode, ParsedNode | null>);
  }
  const nextItems: Pair<ParsedNode, ParsedNode | null>[] = [];
  for (const k of nextOrder) {
    const p = pairByKey.get(k);
    if (p) {
      nextItems.push(p);
    }
  }
  for (const pair of map.items) {
    const keyStr = scalarKeyToString(pair.key as ParsedNode);
    if (!seen.has(keyStr)) {
      nextItems.push(pair as Pair<ParsedNode, ParsedNode | null>);
    }
  }
  map.items = nextItems;
}

function getYamlMapAtParent(
  doc: Document<ParsedNode>,
  parentPath: FrontmatterPath,
): YAMLMap<ParsedNode, ParsedNode | null> {
  if (parentPath.length === 0) {
    const root = doc.contents;
    if (root == null || !isMap(root)) {
      throw new FrontmatterPathError(
        'reorder',
        parentPath,
        'Frontmatter root must be a mapping.',
      );
    }
    return root as YAMLMap<ParsedNode, ParsedNode | null>;
  }
  const node = doc.getIn(parentPath as Iterable<unknown>, true);
  if (node == null || !isMap(node)) {
    throw new FrontmatterPathError(
      'reorder',
      parentPath,
      'Parent path must resolve to a mapping.',
    );
  }
  return node as YAMLMap<ParsedNode, ParsedNode | null>;
}

function scalarKeyToString(node: ParsedNode): string {
  if (isScalar(node)) {
    return String(node.value);
  }
  return String(node);
}

/** Serialize value for `doc.createNode` without leaking YAML tags into unexpected shapes. */
export function frontmatterValueToPlain(value: FrontmatterValue): unknown {
  if (value === null) {
    return null;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(frontmatterValueToPlain);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = frontmatterValueToPlain(v);
  }
  return out;
}

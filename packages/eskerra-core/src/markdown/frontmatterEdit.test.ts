import {describe, expect, it} from 'vitest';

import {scanDuplicateTopLevelKeys} from './frontmatterDuplicateKeys';
import {
  addFrontmatterKey,
  deleteFrontmatterKey,
  frontmatterValueToPlain,
  parseFrontmatterInner,
  renameFrontmatterKey,
  reorderFrontmatterKeys,
  serializeFrontmatterInner,
  setFrontmatterValue,
} from './frontmatterEdit';
import {FrontmatterEditCollisionError} from './frontmatterEditErrors';

describe('parseFrontmatterInner', () => {
  it('keeps plain date-like scalars as strings in the plain JS projection', () => {
    const {doc, duplicateKeys} = parseFrontmatterInner('d: 2026-04-19\n');
    expect(duplicateKeys).toEqual([]);
    const plain = doc.toJS() as Record<string, unknown>;
    expect(plain.d).toBe('2026-04-19');
  });

  it('detects duplicate top-level keys', () => {
    const {duplicateKeys} = parseFrontmatterInner('a: 1\nb: 2\na: 3\n');
    expect(duplicateKeys).toContain('a');
  });

  it('preserves a comment when editing a sibling key', () => {
    const inner = `# header comment\nfoo: 1\nbar: 2\n`;
    const {doc} = parseFrontmatterInner(inner);
    setFrontmatterValue(doc, ['foo'], '99');
    const out = serializeFrontmatterInner(doc);
    expect(out).toContain('# header comment');
    expect(out).toContain('foo');
  });

  it('round-trips ISO timestamp string unchanged when untouched', () => {
    const inner = `updatedAt: 2026-04-19T12:30:00Z\n`;
    const {doc} = parseFrontmatterInner(inner);
    const out = serializeFrontmatterInner(doc);
    expect(out).toContain('2026-04-19T12:30:00Z');
  });

  it('round-trips numeric epoch when untouched', () => {
    const inner = `ts: 1716123456789\n`;
    const {doc} = parseFrontmatterInner(inner);
    const plain = doc.toJS() as Record<string, unknown>;
    expect(plain.ts).toBe(1716123456789);
    const out = serializeFrontmatterInner(doc);
    expect(out).toMatch(/1716123456789/);
  });
});

describe('renameFrontmatterKey / collisions', () => {
  it('throws when rename target exists', () => {
    const {doc} = parseFrontmatterInner('a: 1\nb: 2\n');
    expect(() => renameFrontmatterKey(doc, ['a'], 'b')).toThrow(
      FrontmatterEditCollisionError,
    );
  });
});

describe('addFrontmatterKey collision', () => {
  it('throws when key exists', () => {
    const {doc} = parseFrontmatterInner('x: 1\n');
    expect(() => addFrontmatterKey(doc, [], 'x', '2')).toThrow(
      FrontmatterEditCollisionError,
    );
  });
});

describe('reorderFrontmatterKeys', () => {
  it('reorders root keys without dropping body-related concerns', () => {
    const {doc} = parseFrontmatterInner('z: 1\ny: 2\nx: 3\n');
    reorderFrontmatterKeys(doc, [], ['x', 'y', 'z']);
    const out = serializeFrontmatterInner(doc);
    const zi = out.indexOf('z:');
    const yi = out.indexOf('y:');
    const xi = out.indexOf('x:');
    expect(xi).toBeLessThan(yi);
    expect(yi).toBeLessThan(zi);
  });
});

describe('scanDuplicateTopLevelKeys', () => {
  it('flags duplicate unquoted keys', () => {
    expect(scanDuplicateTopLevelKeys('a: 1\na: 2\n').sort()).toEqual(['a']);
  });
});

describe('frontmatterValueToPlain', () => {
  it('recurses nested objects', () => {
    expect(
      frontmatterValueToPlain({seo: {title: 'Hi'}}),
    ).toEqual({seo: {title: 'Hi'}});
  });
});

describe('deleteFrontmatterKey', () => {
  it('removes nested path', () => {
    const {doc} = parseFrontmatterInner('seo:\n  title: x\n');
    deleteFrontmatterKey(doc, ['seo', 'title']);
    const plain = doc.toJS() as Record<string, unknown>;
    expect(plain.seo).toEqual({});
  });
});

describe('serializeFrontmatterInner (list block style)', () => {
  it('emits top-level scalar lists as YAML block sequences', () => {
    const {doc} = parseFrontmatterInner('authors: []\n');
    setFrontmatterValue(doc, ['authors'], ['Alice', 'Bob']);
    const out = serializeFrontmatterInner(doc);
    expect(out).toContain('Alice');
    expect(out).toContain('Bob');
    expect(out).not.toContain('[');
    expect(out).toMatch(/\n\s+-\s+Alice[\s\S]*\n\s+-\s+Bob/);
  });
});

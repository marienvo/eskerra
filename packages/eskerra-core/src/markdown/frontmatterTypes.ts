/** Serializable YAML runtime values — never JavaScript `Date` instances. */
export type FrontmatterScalar = string | number | boolean | null;

export type FrontmatterValue =
  | FrontmatterScalar
  | FrontmatterValue[]
  | {[key: string]: FrontmatterValue};

export type FrontmatterPropertyType =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'datetime'
  | 'timestamp'
  | 'list'
  | 'tags'
  | 'object';

/** Logical path inside the frontmatter mapping (root = []). */
export type FrontmatterPath = readonly string[];

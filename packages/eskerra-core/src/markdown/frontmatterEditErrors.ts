import type {FrontmatterPath} from './frontmatterTypes';

export class FrontmatterEditCollisionError extends Error {
  readonly op: 'add' | 'rename';
  readonly path: FrontmatterPath;
  readonly key: string;

  constructor(op: 'add' | 'rename', path: FrontmatterPath, key: string) {
    super(
      `Frontmatter key "${key}" already exists at the same path; use an explicit delete+add flow to replace it.`,
    );
    this.name = 'FrontmatterEditCollisionError';
    this.op = op;
    this.path = path;
    this.key = key;
  }
}

export class FrontmatterPathError extends Error {
  readonly op: string;
  readonly path: FrontmatterPath;

  constructor(op: string, path: FrontmatterPath, message: string) {
    super(message);
    this.name = 'FrontmatterPathError';
    this.op = op;
    this.path = path;
  }
}

import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

import {buildDesktopRootCss} from './buildDesktopRootCss';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('buildDesktopRootCss', () => {
  it('matches committed generated/desktop-root.css (drift guard)', () => {
    const root = join(__dirname, '..', '..');
    const committed = readFileSync(join(root, 'generated', 'desktop-root.css'), 'utf8');
    expect(`${buildDesktopRootCss().trim()}\n`).toBe(committed);
  });
});

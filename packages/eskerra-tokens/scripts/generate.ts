import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {buildDesktopRootCss} from '../src/generators/buildDesktopRootCss.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'generated', 'desktop-root.css');

const next = `${buildDesktopRootCss().trim()}\n`;

mkdirSync(join(root, 'generated'), {recursive: true});

const check = process.argv.includes('--check');
if (check) {
  const existing = readFileSync(outPath, 'utf8');
  if (existing !== next) {
    console.error(
      'generated/desktop-root.css is out of date. Run: npm run generate -w @eskerra/tokens',
    );
    process.exit(1);
  }
  console.log('generated/desktop-root.css is up to date.');
} else {
  writeFileSync(outPath, next, 'utf8');
  console.log('Wrote', outPath);
}

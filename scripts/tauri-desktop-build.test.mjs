import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'tauri-desktop-build.mjs');

test('--print-rpm-release outputs count.unixStamp', () => {
  const out = execFileSync(process.execPath, [SCRIPT, '--print-rpm-release'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  assert.match(out, /^\d+\.\d+$/, `got: ${out}`);
});

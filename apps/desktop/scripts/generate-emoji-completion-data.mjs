/**
 * Builds a compact emoji search index for CodeMirror completion.
 * Data source: emojibase-data (MIT) — see package license in node_modules/emojibase-data.
 *
 * Run from apps/desktop: node scripts/generate-emoji-completion-data.mjs
 */
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(__dirname, '..');
const repoRoot = join(desktopRoot, '../..');

function firstExisting(paths) {
  const hit = paths.find(p => existsSync(p));
  if (!hit) {
    throw new Error(`None of these paths exist:\n${paths.join('\n')}`);
  }
  return hit;
}

const dataPath = firstExisting([
  join(desktopRoot, 'node_modules/emojibase-data/en/data.json'),
  join(repoRoot, 'node_modules/emojibase-data/en/data.json'),
]);
const shortPath = firstExisting([
  join(desktopRoot, 'node_modules/emojibase-data/en/shortcodes/github.json'),
  join(repoRoot, 'node_modules/emojibase-data/en/shortcodes/github.json'),
]);

const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const githubShortcodes = JSON.parse(readFileSync(shortPath, 'utf8'));

/** @type {{ e: string; p: string; b: string }[]} */
const out = [];

for (const item of data) {
  if (!item.emoji || typeof item.emoji !== 'string') {
    continue;
  }
  if (String(item.label).startsWith('regional indicator')) {
    continue;
  }

  const hex = item.hexcode;
  const raw = githubShortcodes[hex];
  /** @type {string[]} */
  const shorts = [];
  if (typeof raw === 'string') {
    shorts.push(raw);
  } else if (Array.isArray(raw)) {
    shorts.push(...raw);
  }

  const terms = new Set();
  for (const part of String(item.label).toLowerCase().split(/[\s_/-]+/)) {
    if (part.length > 0) {
      terms.add(part);
    }
  }
  for (const t of item.tags ?? []) {
    if (typeof t === 'string' && t.length > 0) {
      terms.add(t.toLowerCase());
    }
  }
  for (const s of shorts) {
    terms.add(String(s).toLowerCase());
    terms.add(String(s).toLowerCase().replace(/_/g, ''));
  }

  const primary = shorts[0] ?? String(item.label).toLowerCase().replace(/\s+/g, '_');
  const blob = [...terms].join(' ');

  out.push({e: item.emoji, p: primary, b: blob});
}

const dest = join(
  desktopRoot,
  'src/editor/noteEditor/data/emojiColonCompletionData.json',
);
writeFileSync(dest, `${JSON.stringify(out)}\n`, 'utf8');
console.log(`Wrote ${out.length} rows to ${dest}`);

/**
 * Parses Unicode emoji-variation-sequences.txt and writes
 * `src/lib/emojiVariationBases.generated.ts`.
 *
 * Run from repo root: `node apps/desktop/scripts/generate-emoji-variation-bases.mjs`
 * or `pnpm --filter @eskerra/desktop generate-emoji-variation-bases`.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, 'data', 'emoji-variation-sequences.txt');
const outPath = path.join(__dirname, '..', 'src', 'lib', 'emojiVariationBases.generated.ts');

const data = fs.readFileSync(dataPath, 'utf8');
const EXCLUDED = new Set(['#', '*', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const cps = new Set();
for (const line of data.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const m = t.match(/^([0-9A-F]{4,6})\s+FE0F\s*;/);
  if (!m) continue;
  const cp = Number.parseInt(m[1], 16);
  if (!Number.isInteger(cp)) continue;
  const base = String.fromCodePoint(cp);
  if (EXCLUDED.has(base)) continue;
  cps.add(cp);
}
cps.add(0x274c); // ❌ — matches original emojiVariation.ts EXTRA_VS16_BASES
const arr = [...cps].sort((a, b) => a - b);

const header = `/**
 * Auto-generated from Unicode emoji-variation-sequences.txt (UTS #51).
 * Regenerate: node apps/desktop/scripts/generate-emoji-variation-bases.mjs
 */
export const EMOJI_VS16_BASE_CODE_POINTS: readonly number[] = [
`;

const body = arr.map(n => `  ${n}`).join(',\n');
const file = `${header}${body},\n];\n`;
fs.writeFileSync(outPath, file, 'utf8');
console.log(`Wrote ${arr.length} code points to ${outPath}`);

#!/usr/bin/env node
/**
 * Ensures eslint-disable usage carries rationales and sonarjs suppressions match the baseline.
 */
import fs, {globSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'eslint-disable-baseline.json');

const RATIONALE_RE = /--[\s\u00a0]+\S/;
const DISABLE_RE =
  /eslint-disable(?:-next-line|-line)?(?![\w-])\s*([\s\S]*?)(?:\s*--|\*\/\s*$|$)/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stripRuleNoise(ruleToken) {
  return ruleToken.replace(/[\s*/]+$/g, '').trim();
}

function parseDisabledRuleIds(disableBody) {
  const body = disableBody.replace(/\*\/\s*$/g, '').trim();
  if (!body) {
    return [];
  }
  return body
    .split(',')
    .map(s => stripRuleNoise(s))
    .filter(Boolean);
}

function isFileScopedDisable(line) {
  if (/eslint-disable-next-line/.test(line)) {
    return false;
  }
  if (/eslint-disable-line/.test(line)) {
    return false;
  }
  return /eslint-disable/.test(line);
}

function collectGlob(relPatterns) {
  const out = new Set();
  for (const pattern of relPatterns) {
    for (const abs of globSync(pattern, {
      cwd: REPO_ROOT,
      nodir: true,
      posix: true,
    })) {
      const rel = abs.split(path.sep).join('/');
      if (rel.endsWith('.d.ts')) {
        continue;
      }
      out.add(rel);
    }
  }
  return [...out].sort();
}

function main() {
  const baseline = readJson(BASELINE_PATH);
  const allowedFileLevel = new Set(baseline.allowedFileLevelEslintDisablePaths ?? []);
  const allowedSonar = new Set(baseline.allowedSonarjsEslintDisableFingerprints ?? []);

  const files = collectGlob([
    'apps/desktop/src/**/*.{ts,tsx}',
    'apps/mobile/src/**/*.{ts,tsx}',
    'apps/mobile/__tests__/**/*.{ts,tsx}',
  ]);

  const errors = [];

  for (const rel of files) {
    const abs = path.join(REPO_ROOT, rel);
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      if (!/eslint-disable/.test(line)) {
        return;
      }
      if (!RATIONALE_RE.test(line)) {
        errors.push(`${rel}:${lineNo}: eslint-disable without "-- rationale" text on the same line.`);
      }
      if (isFileScopedDisable(line) && !allowedFileLevel.has(rel)) {
        errors.push(
          `${rel}:${lineNo}: file-level eslint-disable is only allowed for paths listed in eslint-disable-baseline.json (allowedFileLevelEslintDisablePaths).`,
        );
      }
      const m = line.match(DISABLE_RE);
      if (!m) {
        return;
      }
      const rules = parseDisabledRuleIds(m[1] ?? '');
      for (const rule of rules) {
        if (rule.startsWith('sonarjs/')) {
          const fp = `${rel}:${lineNo}:${rule}`;
          if (!allowedSonar.has(fp)) {
            errors.push(
              `${rel}:${lineNo}: sonarjs suppression "${rule}" is not listed in eslint-disable-baseline.json (allowedSonarjsEslintDisableFingerprints). Add a rationale on the line and register the fingerprint, or remove the disable.`,
            );
          }
        }
      }
    });
  }

  if (errors.length) {
    console.error('[check-eslint-suppressions] Failed:\n' + errors.join('\n'));
    process.exit(1);
  }
}

main();

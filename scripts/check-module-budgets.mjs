#!/usr/bin/env node
/**
 * Fails when TS/TSX modules grow beyond agreed budgets (see .me/plans lint hardening).
 * Uses scripts/module-budget-baseline.json for known megamodules and git for new/growth checks.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'module-budget-baseline.json');

const NEW_FILE_MAX_LINES = 400;
const GROWTH_TRACK_MIN_LINES = 800;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function countLines(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  if (raw.length === 0) {
    return 0;
  }
  return raw.split(/\r?\n/).length;
}

function gitOk(args, cwd) {
  try {
    execFileSync('git', args, {cwd, stdio: ['ignore', 'pipe', 'ignore']});
    return true;
  } catch {
    return false;
  }
}

function gitOut(args, cwd) {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim();
}

function resolveMergeBase(cwd) {
  const prefer = process.env.MODULE_BUDGET_MERGE_BASE?.trim();
  if (prefer) {
    return prefer;
  }
  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    if (gitOk(['rev-parse', '--verify', ref], cwd)) {
      try {
        return gitOut(['merge-base', 'HEAD', ref], cwd);
      } catch {
        // continue
      }
    }
  }
  return null;
}

function isScopedSource(rel) {
  if (!rel || rel.endsWith('.d.ts')) {
    return false;
  }
  if (!rel.endsWith('.ts') && !rel.endsWith('.tsx')) {
    return false;
  }
  return (
    rel.startsWith('apps/desktop/') ||
    rel.startsWith('apps/mobile/') ||
    rel.startsWith('packages/')
  );
}

function existsAtRevision(cwd, rev, relPath) {
  try {
    execFileSync('git', ['cat-file', '-e', `${rev}:${relPath}`], {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function countLinesAtRevision(cwd, rev, relPath) {
  const raw = execFileSync('git', ['show', `${rev}:${relPath}`], {
    cwd,
    encoding: 'utf8',
  });
  if (raw.length === 0) {
    return 0;
  }
  return raw.split(/\r?\n/).length;
}

function main() {
  const baseline = readJson(BASELINE_PATH);
  const maxByPath = baseline.maxLinesByPath ?? {};
  const errors = [];

  for (const [rel, cap] of Object.entries(maxByPath)) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      errors.push(`Baseline path missing on disk: ${rel}`);
      continue;
    }
    const n = countLines(abs);
    if (n > cap) {
      errors.push(
        `${rel}: ${n} lines exceeds baseline cap ${cap}. Shrink the module or raise the baseline deliberately.`,
      );
    }
  }

  const mergeBase = resolveMergeBase(REPO_ROOT);
  if (!mergeBase) {
    console.warn(
      '[check-module-budgets] No merge base (no origin/main or main). Skipping git-based new/growth checks.',
    );
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exit(1);
    }
    return;
  }

  let branchChangedRaw = '';
  try {
    branchChangedRaw = gitOut(['diff', '--name-only', `${mergeBase}...HEAD`], REPO_ROOT);
  } catch {
    console.warn('[check-module-budgets] git diff ...HEAD failed; skipping branch change checks.');
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exit(1);
    }
    return;
  }

  let dirtyRaw = '';
  try {
    dirtyRaw = [
      gitOut(['diff', '--name-only', 'HEAD'], REPO_ROOT),
      gitOut(['diff', '--name-only', '--cached', 'HEAD'], REPO_ROOT),
    ]
      .filter(Boolean)
      .join('\n');
  } catch {
    dirtyRaw = '';
  }

  const changed = new Set(
    [branchChangedRaw, dirtyRaw]
      .join('\n')
      .split(/\n/)
      .map(s => s.trim())
      .filter(Boolean),
  );

  for (const rel of changed) {
    if (!isScopedSource(rel)) {
      continue;
    }
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const current = countLines(abs);
    if (Object.hasOwn(maxByPath, rel)) {
      continue;
    }
    const wasNew = !existsAtRevision(REPO_ROOT, mergeBase, rel);
    if (wasNew && current > NEW_FILE_MAX_LINES) {
      errors.push(
        `${rel}: new file has ${current} lines (max ${NEW_FILE_MAX_LINES} without baseline entry). Split or add an explicit baseline bump.`,
      );
      continue;
    }
    if (wasNew) {
      continue;
    }
    const prev = countLinesAtRevision(REPO_ROOT, mergeBase, rel);
    if (prev >= GROWTH_TRACK_MIN_LINES && current > prev) {
      errors.push(
        `${rel}: grew from ${prev} to ${current} lines (files ≥${GROWTH_TRACK_MIN_LINES} lines may not grow without intentional refactor/split).`,
      );
    }
  }

  if (errors.length) {
    console.error('[check-module-budgets] Failed:\n' + errors.join('\n'));
    process.exit(1);
  }
}

main();

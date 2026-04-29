#!/usr/bin/env node
/**
 * Reports size and public-contract metrics for the April 2026 desktop audit cluster.
 *
 * This script is intentionally read-only: it measures the current center files so
 * monthly reports can track whether decomposition is reducing coupling.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const TARGET_FILES = [
  'apps/desktop/src/hooks/useMainWindowWorkspace.ts',
  'apps/desktop/src/components/VaultTab.tsx',
  'apps/desktop/src/App.tsx',
  'apps/desktop/src/App.css',
];

function readUtf8(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

function countLines(raw) {
  if (raw.length === 0) {
    return 0;
  }
  return raw.split(/\r?\n/).length;
}

function stripComments(raw) {
  let out = '';
  let i = 0;
  let state = 'code';
  while (i < raw.length) {
    const ch = raw[i];
    const next = raw[i + 1] ?? '';

    if (state === 'line-comment') {
      if (ch === '\n' || ch === '\r') {
        out += ch;
        state = 'code';
      } else {
        out += ' ';
      }
      i += 1;
      continue;
    }

    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        out += '  ';
        i += 2;
        state = 'code';
      } else {
        out += ch === '\n' || ch === '\r' ? ch : ' ';
        i += 1;
      }
      continue;
    }

    if (state === 'single-quote' || state === 'double-quote' || state === 'template') {
      out += ch;
      if (ch === '\\') {
        out += next;
        i += 2;
        continue;
      }
      if (
        (state === 'single-quote' && ch === "'")
        || (state === 'double-quote' && ch === '"')
        || (state === 'template' && ch === '`')
      ) {
        state = 'code';
      }
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      out += '  ';
      i += 2;
      state = 'line-comment';
      continue;
    }
    if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      state = 'block-comment';
      continue;
    }
    if (ch === "'") {
      state = 'single-quote';
    } else if (ch === '"') {
      state = 'double-quote';
    } else if (ch === '`') {
      state = 'template';
    }
    out += ch;
    i += 1;
  }
  return out;
}

function findMatchingBrace(raw, openIndex) {
  let depth = 0;
  let state = 'code';
  for (let i = openIndex; i < raw.length; i += 1) {
    const ch = raw[i];
    const next = raw[i + 1] ?? '';

    if (state === 'line-comment') {
      if (ch === '\n' || ch === '\r') {
        state = 'code';
      }
      continue;
    }
    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        i += 1;
        state = 'code';
      }
      continue;
    }
    if (state === 'single-quote' || state === 'double-quote' || state === 'template') {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (
        (state === 'single-quote' && ch === "'")
        || (state === 'double-quote' && ch === '"')
        || (state === 'template' && ch === '`')
      ) {
        state = 'code';
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      i += 1;
      state = 'line-comment';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 1;
      state = 'block-comment';
      continue;
    }
    if (ch === "'") {
      state = 'single-quote';
      continue;
    }
    if (ch === '"') {
      state = 'double-quote';
      continue;
    }
    if (ch === '`') {
      state = 'template';
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  throw new Error(`No matching closing brace found for index ${openIndex}.`);
}

function extractTypeBody(raw, typeName) {
  const pattern = new RegExp(`\\btype\\s+${typeName}\\s*=\\s*\\{`, 'm');
  const match = pattern.exec(raw);
  if (match == null || match.index == null) {
    throw new Error(`Could not find type literal ${typeName}.`);
  }
  const openIndex = raw.indexOf('{', match.index);
  const closeIndex = findMatchingBrace(raw, openIndex);
  return raw.slice(openIndex + 1, closeIndex);
}

function countTopLevelTypeMembers(raw, typeName) {
  const body = stripComments(extractTypeBody(raw, typeName));
  let count = 0;
  let curlyDepth = 1;
  let parenDepth = 0;
  let bracketDepth = 0;
  let angleDepth = 0;
  let state = 'code';

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    const next = body[i + 1] ?? '';

    if (state === 'single-quote' || state === 'double-quote' || state === 'template') {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (
        (state === 'single-quote' && ch === "'")
        || (state === 'double-quote' && ch === '"')
        || (state === 'template' && ch === '`')
      ) {
        state = 'code';
      }
      continue;
    }

    if (ch === "'") {
      state = 'single-quote';
      continue;
    }
    if (ch === '"') {
      state = 'double-quote';
      continue;
    }
    if (ch === '`') {
      state = 'template';
      continue;
    }

    if (ch === '{') {
      curlyDepth += 1;
    } else if (ch === '}') {
      curlyDepth -= 1;
    } else if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (ch === '[') {
      bracketDepth += 1;
    } else if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (ch === '<') {
      angleDepth += 1;
    } else if (ch === '>') {
      angleDepth = Math.max(0, angleDepth - 1);
    } else if (
      ch === ';'
      && curlyDepth === 1
      && parenDepth === 0
      && bracketDepth === 0
      && angleDepth === 0
    ) {
      count += 1;
    } else if (ch === '=' && next === '>') {
      i += 1;
    }
  }

  return count;
}

function main() {
  const locRows = TARGET_FILES.map(relPath => ({
    path: relPath,
    loc: countLines(readUtf8(relPath)),
  }));
  const workspaceRaw = readUtf8('apps/desktop/src/hooks/useMainWindowWorkspace.ts');
  const vaultTabRaw = readUtf8('apps/desktop/src/components/VaultTab.tsx');
  const workspaceReturnFields = countTopLevelTypeMembers(
    workspaceRaw,
    'UseMainWindowWorkspaceResult',
  );
  const vaultTabTopLevelProps = countTopLevelTypeMembers(vaultTabRaw, 'VaultTabProps');

  console.log('# April 2026 Audit Center Metrics');
  console.log('');
  console.log('| Metric | Value |');
  console.log('|---|---:|');
  for (const row of locRows) {
    console.log(`| LOC: \`${row.path}\` | ${row.loc} |`);
  }
  console.log(`| Fields: \`UseMainWindowWorkspaceResult\` | ${workspaceReturnFields} |`);
  console.log(`| Top-level props: \`VaultTabProps\` | ${vaultTabTopLevelProps} |`);
}

main();

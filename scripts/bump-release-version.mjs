#!/usr/bin/env node
/**
 * Before release APK: bump semver from package.json based on git branch/commit history
 * stored in .local/build-version-state.json (gitignored).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  decideBump,
  mergeState,
  parseSemver,
} from './bump-release-version-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_DIR = join(ROOT, '.local');
const STATE_FILE = join(STATE_DIR, 'build-version-state.json');
const PACKAGE_JSON = join(ROOT, 'apps', 'mobile', 'package.json');
const BUILD_GRADLE = join(
  ROOT,
  'apps',
  'mobile',
  'android',
  'app',
  'build.gradle',
);

function git(...args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

function readState() {
  if (!existsSync(STATE_FILE)) {
    return {
      exists: false,
      data: { branchesBuilt: [], commitsBuilt: [] },
    };
  }
  const raw = readFileSync(STATE_FILE, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${STATE_FILE}`);
  }
  return {
    exists: true,
    data: {
      branchesBuilt: Array.isArray(parsed.branchesBuilt)
        ? parsed.branchesBuilt.map(String)
        : [],
      commitsBuilt: Array.isArray(parsed.commitsBuilt)
        ? parsed.commitsBuilt.map(String)
        : [],
    },
  };
}

function writeState(data) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(
    STATE_FILE,
    `${JSON.stringify(
      {
        branchesBuilt: data.branchesBuilt,
        commitsBuilt: data.commitsBuilt,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function resolveBranchId() {
  const ref = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (ref === 'HEAD') {
    const short = git('rev-parse', '--short', 'HEAD');
    return `detached:${short}`;
  }
  return ref;
}

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const v = pkg.version;
  if (typeof v !== 'string' || !parseSemver(v)) {
    throw new Error(`package.json "version" must be MAJOR.MINOR.PATCH, got: ${v}`);
  }
  return { pkg, version: v };
}

function writePackageVersion(pkg, version) {
  pkg.version = version;
  writeFileSync(
    PACKAGE_JSON,
    `${JSON.stringify(pkg, null, 2)}\n`,
    'utf8',
  );
}

/** @returns {{ versionCode: number; versionName: string }} */
function readGradleVersions() {
  const gradle = readFileSync(BUILD_GRADLE, 'utf8');
  const codeM = /versionCode\s+(\d+)/.exec(gradle);
  const nameM = /versionName\s+"([^"]*)"/.exec(gradle);
  if (!codeM || !nameM) {
    throw new Error(
      `Could not parse versionCode/versionName in ${BUILD_GRADLE}`,
    );
  }
  return {
    versionCode: Number(codeM[1]),
    versionName: nameM[1],
  };
}

function writeGradleVersions(versionCode, versionName) {
  let gradle = readFileSync(BUILD_GRADLE, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(
    /versionName\s+"[^"]*"/,
    `versionName "${versionName}"`,
  );
  writeFileSync(BUILD_GRADLE, gradle, 'utf8');
}

function main() {
  const branchId = resolveBranchId();
  const commitSha = git('rev-parse', 'HEAD');

  const { exists, data: state } = readState();
  const { pkg, version: currentSemver } = readPackageVersion();

  const decision = decideBump(
    exists,
    state,
    branchId,
    commitSha,
    currentSemver,
  );

  let nextState = state;
  if (decision.registerBranch || decision.registerCommit) {
    nextState = mergeState(
      state,
      decision.registerBranch,
      decision.registerCommit,
    );
  }

  if (decision.kind === 'baseline') {
    writeState(nextState);
    console.log(
      `[bump-release-version] Baseline: recorded branch "${branchId}" and commit ${commitSha.slice(0, 7)} (no version change).`,
    );
    return;
  }

  if (decision.kind === 'noop') {
    writeState(nextState);
    console.log(
      `[bump-release-version] No bump (branch and commit already built). Version ${decision.newVersion}.`,
    );
    return;
  }

  const gradle = readGradleVersions();
  const nextCode = gradle.versionCode + decision.versionCodeDelta;

  writePackageVersion(pkg, decision.newVersion);
  writeGradleVersions(nextCode, decision.newVersion);
  writeState(nextState);

  console.log(
    `[bump-release-version] ${decision.kind}: ${currentSemver} → ${decision.newVersion} (versionCode ${gradle.versionCode} → ${nextCode}).`,
  );
}

main();

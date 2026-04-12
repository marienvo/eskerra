import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  bumpMinor,
  bumpPatch,
  decideBump,
  mergeState,
  parseSemver,
  releaseBumpBranchId,
} from './bump-release-version-lib.mjs';

describe('releaseBumpBranchId', () => {
  it('uses a stable id for detached HEAD', () => {
    assert.equal(releaseBumpBranchId('HEAD'), 'detached');
  });

  it('passes through named branches', () => {
    assert.equal(releaseBumpBranchId('main'), 'main');
    assert.equal(releaseBumpBranchId('feature/x'), 'feature/x');
  });
});

describe('parseSemver', () => {
  it('parses valid versions', () => {
    assert.deepEqual(parseSemver('0.0.1'), { major: 0, minor: 0, patch: 1 });
    assert.deepEqual(parseSemver('12.34.56'), {
      major: 12,
      minor: 34,
      patch: 56,
    });
  });

  it('rejects invalid input', () => {
    assert.equal(parseSemver('1.0'), null);
    assert.equal(parseSemver('v1.0.0'), null);
    assert.equal(parseSemver(''), null);
  });
});

describe('bumpMinor', () => {
  it('increments minor and resets patch', () => {
    assert.equal(bumpMinor('0.1.2'), '0.2.0');
    assert.equal(bumpMinor('0.0.1'), '0.1.0');
  });
});

describe('bumpPatch', () => {
  it('increments patch', () => {
    assert.equal(bumpPatch('0.2.0'), '0.2.1');
    assert.equal(bumpPatch('0.0.0'), '0.0.1');
  });
});

describe('decideBump', () => {
  const empty = { branchesBuilt: [], commitsBuilt: [] };

  it('baseline when state file did not exist', () => {
    const d = decideBump(false, empty, 'main', 'abc', '0.0.1');
    assert.equal(d.kind, 'baseline');
    assert.equal(d.newVersion, '0.0.1');
    assert.equal(d.versionCodeDelta, 0);
    assert.equal(d.registerBranch, 'main');
    assert.equal(d.registerCommit, 'abc');
  });

  it('ignores state contents when file did not exist', () => {
    const seeded = { branchesBuilt: ['main'], commitsBuilt: ['abc'] };
    const d = decideBump(false, seeded, 'main', 'abc', '0.0.1');
    assert.equal(d.kind, 'baseline');
  });

  it('minor when branch is new', () => {
    const s = { branchesBuilt: ['main'], commitsBuilt: ['x'] };
    const d = decideBump(true, s, 'feature', 'y', '0.1.0');
    assert.equal(d.kind, 'minor');
    assert.equal(d.newVersion, '0.2.0');
    assert.equal(d.versionCodeDelta, 1);
  });

  it('patch when branch known but commit is new', () => {
    const s = { branchesBuilt: ['main'], commitsBuilt: ['old'] };
    const d = decideBump(true, s, 'main', 'newsha', '0.2.0');
    assert.equal(d.kind, 'patch');
    assert.equal(d.newVersion, '0.2.1');
    assert.equal(d.versionCodeDelta, 1);
  });

  it('noop when branch and commit seen', () => {
    const s = { branchesBuilt: ['main'], commitsBuilt: ['sha1'] };
    const d = decideBump(true, s, 'main', 'sha1', '0.2.1');
    assert.equal(d.kind, 'noop');
    assert.equal(d.versionCodeDelta, 0);
  });

  it('minor takes precedence over unseen commit on new branch', () => {
    const s = { branchesBuilt: ['main'], commitsBuilt: ['same'] };
    const d = decideBump(true, s, 'feature', 'same', '0.3.0');
    assert.equal(d.kind, 'minor');
    assert.equal(d.newVersion, '0.4.0');
  });

  it('patch on stable detached id when commit is new', () => {
    const s = { branchesBuilt: ['detached'], commitsBuilt: ['old'] };
    const d = decideBump(true, s, 'detached', 'newsha', '0.5.0');
    assert.equal(d.kind, 'patch');
    assert.equal(d.newVersion, '0.5.1');
  });
});

describe('mergeState', () => {
  it('appends unique branch and commit', () => {
    const s = mergeState(
      { branchesBuilt: ['a'], commitsBuilt: ['1'] },
      'b',
      '2',
    );
    assert.deepEqual(s, { branchesBuilt: ['a', 'b'], commitsBuilt: ['1', '2'] });
  });

  it('skips undefined ids', () => {
    const s = mergeState({ branchesBuilt: [], commitsBuilt: [] }, undefined, 'x');
    assert.deepEqual(s, { branchesBuilt: [], commitsBuilt: ['x'] });
  });
});

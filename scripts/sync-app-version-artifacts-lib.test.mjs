import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySemverToCargoLockPackageVersion,
  applySemverToCargoTomlPackageVersion,
  applySemverToDesktopPackageJson,
  getFirstMetainfoReleaseVersion,
  prependMetainfoReleaseIfNew,
} from './sync-app-version-artifacts-lib.mjs';

test('applySemverToDesktopPackageJson sets version and trailing newline', () => {
  const out = applySemverToDesktopPackageJson(
    `${JSON.stringify({ name: 'x', version: '0.1.0' }, null, 2)}\n`,
    '0.7.13',
  );
  assert.equal(JSON.parse(out).version, '0.7.13');
  assert.ok(out.endsWith('\n'));
});

test('applySemverToCargoTomlPackageVersion replaces package version line', () => {
  const toml = `[package]
name = "app"
version = "0.1.0"
edition = "2021"
`;
  const out = applySemverToCargoTomlPackageVersion(toml, '0.7.13');
  assert.match(out, /^version = "0.7.13"/m);
});

test('applySemverToCargoTomlPackageVersion throws when no version line', () => {
  assert.throws(
    () => applySemverToCargoTomlPackageVersion('[package]\nname = "app"\n', '1.0.0'),
    /Could not find/,
  );
});

test('prependMetainfoReleaseIfNew inserts newest first', () => {
  const xml = `  <releases>
    <release version="0.1.0" date="2026-03-30"/>
  </releases>
`;
  const out = prependMetainfoReleaseIfNew(xml, '0.7.13', '2026-04-09');
  assert.match(out, /<release version="0.7.13" date="2026-04-09"/);
  assert.ok(out.indexOf('0.7.13') < out.indexOf('0.1.0'));
});

test('prependMetainfoReleaseIfNew is idempotent for same top version', () => {
  const xml = `  <releases>
    <release version="0.7.13" date="2026-04-09"/>
    <release version="0.1.0" date="2026-03-30"/>
  </releases>
`;
  const out = prependMetainfoReleaseIfNew(xml, '0.7.13', '2026-04-09');
  assert.equal(out, xml);
});

test('getFirstMetainfoReleaseVersion reads first release', () => {
  const xml = `  <releases>
    <release version="0.8.0" date="2026-05-01"/>
  </releases>
`;
  assert.equal(getFirstMetainfoReleaseVersion(xml), '0.8.0');
});

test('applySemverToCargoLockPackageVersion updates root package stanza', () => {
  const lock = `[[package]]
name = "app"
version = "0.1.0"
dependencies = []

[[package]]
name = "serde"
version = "1.0.0"
`;
  const out = applySemverToCargoLockPackageVersion(lock, 'app', '0.7.13');
  assert.match(out, /name = "app"\s*\nversion = "0.7.13"/);
  assert.match(out, /name = "serde"\s*\nversion = "1.0.0"/);
});

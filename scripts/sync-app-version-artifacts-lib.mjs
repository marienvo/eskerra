/**
 * Pure helpers: keep desktop npm package, Cargo [package] version, and AppStream
 * metainfo releases aligned with the canonical mobile semver (see bump-release-version.mjs).
 */

/**
 * @param {string} text full apps/desktop/package.json
 * @param {string} version MAJOR.MINOR.PATCH
 */
export function applySemverToDesktopPackageJson(text, version) {
  const pkg = JSON.parse(text);
  pkg.version = version;
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Sets [package].version in Cargo.toml (first top-level `version = "…"` line only).
 * @param {string} text
 * @param {string} version
 */
export function applySemverToCargoTomlPackageVersion(text, version) {
  const replaced = text.replace(
    /^version\s*=\s*"[^"]*"/m,
    `version = "${version}"`,
  );
  if (replaced === text) {
    throw new Error('Could not find [package] version = "…" line in Cargo.toml');
  }
  return replaced;
}

/**
 * Inserts a <release> row immediately after <releases>, newest first.
 * If the first release already has the same version, returns xml unchanged.
 * @param {string} xml
 * @param {string} version
 * @param {string} date YYYY-MM-DD (UTC)
 */
export function prependMetainfoReleaseIfNew(xml, version, date) {
  const first = /<releases>\s*\n\s*<release\s+version="([^"]*)"/.exec(xml);
  if (first && first[1] === version) {
    return xml;
  }
  return xml.replace(
    /(<releases>\s*\n)/,
    `$1    <release version="${version}" date="${date}"/>\n`,
  );
}

/**
 * @param {string} xml metainfo component XML
 * @returns {string | null}
 */
export function getFirstMetainfoReleaseVersion(xml) {
  const m = /<releases>\s*\n\s*<release\s+version="([^"]*)"/.exec(xml);
  return m ? m[1] : null;
}

/**
 * Updates the workspace root package stanza in Cargo.lock (first `[[package]]` block for name).
 * @param {string} text
 * @param {string} crateName e.g. "app"
 * @param {string} version
 */
export function applySemverToCargoLockPackageVersion(text, crateName, version) {
  const re = new RegExp(
    `(\\[\\[package\\]\\]\\s*\\nname = "${crateName}"\\s*\\n)version = "[^"]*"`,
  );
  const out = text.replace(re, `$1version = "${version}"`);
  if (out === text) {
    throw new Error(
      `Could not find [[package]] stanza for name = "${crateName}" in Cargo.lock`,
    );
  }
  return out;
}

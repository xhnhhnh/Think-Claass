/**
 * Minimal semantic-version range matching.
 *
 * Deliberately hand-written: the repository has no network access, and the plugin
 * dependency resolver needs only these operators. Anything outside the supported
 * grammar is a validation error rather than a silent "no match", so a typo in a
 * manifest is reported instead of quietly blocking a plugin.
 *
 * Supported: `*`, `1.2.3`, `=1.2.3`, `^1.2.3`, `~1.2.3`, `>=1.2.3`, `>1.2.3`,
 * `<=1.2.3`, `<1.2.3`, and space-separated conjunctions such as `>=1.2.3 <2.0.0`.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
/** Ranges allow partial versions: `1` and `1.2` are standard shorthand. */
const PARTIAL_VERSION_RE = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/;

/** Parse a strict semantic version. Used to validate a plugin's own `version`. */
export function parseVersion(input: string): Version | null {
  const match = VERSION_RE.exec(String(input ?? '').trim().replace(/^v/i, ''));
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

/**
 * Parse a version as it may appear inside a range, where missing components default
 * to zero: `^1` means `^1.0.0` and `>=1.2` means `>=1.2.0`.
 */
export function parseRangeVersion(input: string): Version | null {
  const text = String(input ?? '').trim().replace(/^v/i, '');
  const match = PARTIAL_VERSION_RE.exec(text);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    prerelease: match[4] ?? null,
  };
}

export function formatVersion(version: Version): string {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease ? `${base}-${version.prerelease}` : base;
}

/** Numeric comparison; a prerelease sorts below its release. */
export function compareVersions(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

export interface RangeCheck {
  ok: boolean;
  /** Human-readable reason when `ok` is false. */
  reason?: string;
}

/** Expand a single comparator into a predicate. */
function comparatorPredicate(raw: string): ((v: Version) => boolean) | { error: string } {
  const token = raw.trim();
  if (token === '' || token === '*') return () => true;

  const operatorMatch = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(token);
  if (!operatorMatch) return { error: `unparsable range token "${token}"` };

  const operator = operatorMatch[1] ?? '=';
  // Range operands may be partial (`^1`), unlike the `version` field itself.
  const version = parseRangeVersion(operatorMatch[2]);
  if (!version) return { error: `unparsable version "${operatorMatch[2]}" in range token "${token}"` };

  switch (operator) {
    case '=':
      return (v) => compareVersions(v, version) === 0;
    case '>':
      return (v) => compareVersions(v, version) > 0;
    case '>=':
      return (v) => compareVersions(v, version) >= 0;
    case '<':
      return (v) => compareVersions(v, version) < 0;
    case '<=':
      return (v) => compareVersions(v, version) <= 0;
    case '^':
      // ^1.2.3 -> >=1.2.3 <2.0.0 ; ^0.2.3 -> >=0.2.3 <0.3.0
      return (v) => {
        if (compareVersions(v, version) < 0) return false;
        const upper: Version =
          version.major > 0
            ? { major: version.major + 1, minor: 0, patch: 0, prerelease: null }
            : version.minor > 0
              ? { major: 0, minor: version.minor + 1, patch: 0, prerelease: null }
              : { major: 0, minor: 0, patch: version.patch + 1, prerelease: null };
        return compareVersions(v, upper) < 0;
      };
    case '~':
      // ~1.2.3 -> >=1.2.3 <1.3.0
      return (v) =>
        compareVersions(v, version) >= 0 &&
        compareVersions(v, { major: version.major, minor: version.minor + 1, patch: 0, prerelease: null }) < 0;
    default:
      return { error: `unsupported operator "${operator}"` };
  }
}

/**
 * Does `version` satisfy `range`?
 *
 * Returns a structured result so callers can report *why* a plugin was rejected
 * instead of just "unmet dependency".
 */
export function satisfies(version: string, range: string): RangeCheck {
  const parsed = parseVersion(version);
  if (!parsed) return { ok: false, reason: `"${version}" is not a valid version` };

  const tokens = String(range ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, reason: 'empty version range' };

  for (const token of tokens) {
    const predicate = comparatorPredicate(token);
    if (typeof predicate !== 'function') return { ok: false, reason: predicate.error };
    if (!predicate(parsed)) {
      return { ok: false, reason: `${version} does not satisfy "${token}" in range "${range}"` };
    }
  }
  return { ok: true };
}

/** Validate a range without applying it, for manifest validation. */
export function isValidRange(range: string): RangeCheck {
  const tokens = String(range ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, reason: 'empty version range' };
  for (const token of tokens) {
    const predicate = comparatorPredicate(token);
    if (typeof predicate !== 'function') return { ok: false, reason: predicate.error };
  }
  return { ok: true };
}

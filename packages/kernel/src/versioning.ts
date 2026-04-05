/**
 * versioning.ts
 * Semantic versioning checks for kernel ↔ wasm4pm compatibility
 * Ensures runtime version matches expected contract version
 */

/** Parsed semantic version */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/** Version compatibility result */
export interface CompatibilityResult {
  compatible: boolean;
  current: string;
  required: string;
  reason?: string;
}

/** The kernel's own version — kept in sync with package.json */
export const KERNEL_VERSION = '26.4.5';

/** Minimum wasm4pm version the kernel requires */
export const MIN_WASM4PM_VERSION = '26.0.0';

/**
 * Parse a semver string into components
 * Supports: "1.2.3", "1.2.3-beta.1", "26.4.5"
 */
export function parseSemVer(version: string): SemVer | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/**
 * Compare two semver versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareSemVer(a: SemVer, b: SemVer): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;

  // Pre-release versions have lower precedence than release
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;

  return 0;
}

/**
 * Check if a version satisfies a minimum version requirement
 * Uses major version for breaking change boundary
 */
export function satisfiesMinimum(version: string, minimum: string): boolean {
  const v = parseSemVer(version);
  const m = parseSemVer(minimum);
  if (!v || !m) return false;

  return compareSemVer(v, m) >= 0;
}

/**
 * Check if two versions are compatible (same major version)
 * Following semver: same major = backward compatible
 */
export function isMajorCompatible(version: string, target: string): boolean {
  const v = parseSemVer(version);
  const t = parseSemVer(target);
  if (!v || !t) return false;

  return v.major === t.major;
}

/**
 * Full compatibility check: kernel version vs required version
 *
 * Rules:
 * 1. Must be same major version (breaking change boundary)
 * 2. Must meet minimum minor.patch
 *
 * @param requiredVersion - The version string the caller requires
 * @returns CompatibilityResult with details
 */
export function checkCompatibility(requiredVersion: string): CompatibilityResult {
  const current = parseSemVer(KERNEL_VERSION);
  const required = parseSemVer(requiredVersion);

  if (!current) {
    return {
      compatible: false,
      current: KERNEL_VERSION,
      required: requiredVersion,
      reason: `Invalid kernel version: ${KERNEL_VERSION}`,
    };
  }

  if (!required) {
    return {
      compatible: false,
      current: KERNEL_VERSION,
      required: requiredVersion,
      reason: `Invalid required version: ${requiredVersion}`,
    };
  }

  // Major version mismatch = breaking change
  if (current.major !== required.major) {
    return {
      compatible: false,
      current: KERNEL_VERSION,
      required: requiredVersion,
      reason: `Major version mismatch: kernel is v${current.major}.x, required v${required.major}.x`,
    };
  }

  // Current must be >= required
  if (compareSemVer(current, required) < 0) {
    return {
      compatible: false,
      current: KERNEL_VERSION,
      required: requiredVersion,
      reason: `Kernel version ${KERNEL_VERSION} is older than required ${requiredVersion}`,
    };
  }

  return {
    compatible: true,
    current: KERNEL_VERSION,
    required: requiredVersion,
  };
}

/**
 * Assert compatibility — throws if incompatible
 * Use at startup to fail fast on version mismatches
 */
export function assertCompatibility(requiredVersion: string): void {
  const result = checkCompatibility(requiredVersion);
  if (!result.compatible) {
    throw new Error(
      `Kernel version incompatible: ${result.reason} ` +
        `(current: ${result.current}, required: ${result.required})`
    );
  }
}

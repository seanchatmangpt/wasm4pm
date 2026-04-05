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
export declare const KERNEL_VERSION = "26.4.5";
/** Minimum wasm4pm version the kernel requires */
export declare const MIN_WASM4PM_VERSION = "26.0.0";
/**
 * Parse a semver string into components
 * Supports: "1.2.3", "1.2.3-beta.1", "26.4.5"
 */
export declare function parseSemVer(version: string): SemVer | null;
/**
 * Compare two semver versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export declare function compareSemVer(a: SemVer, b: SemVer): -1 | 0 | 1;
/**
 * Check if a version satisfies a minimum version requirement
 * Uses major version for breaking change boundary
 */
export declare function satisfiesMinimum(version: string, minimum: string): boolean;
/**
 * Check if two versions are compatible (same major version)
 * Following semver: same major = backward compatible
 */
export declare function isMajorCompatible(version: string, target: string): boolean;
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
export declare function checkCompatibility(requiredVersion: string): CompatibilityResult;
/**
 * Assert compatibility — throws if incompatible
 * Use at startup to fail fast on version mismatches
 */
export declare function assertCompatibility(requiredVersion: string): void;
//# sourceMappingURL=versioning.d.ts.map
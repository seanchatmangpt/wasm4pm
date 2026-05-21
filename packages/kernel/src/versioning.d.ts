/**
 * versioning.ts
 * Semantic versioning checks for kernel ↔ wasm4pm compatibility
 * Ensures runtime version matches expected contract version
 *
 * Version is read from package.json at runtime — never hardcoded here.
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
/** The kernel's own version — derived from package.json */
export declare const KERNEL_VERSION: string;
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
//# sourceMappingURL=versioning.d.ts.map
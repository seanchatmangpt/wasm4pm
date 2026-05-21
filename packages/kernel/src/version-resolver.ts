/**
 * version-resolver.ts
 *
 * Resolves per-algorithm semver versions from the algorithm-versions.json
 * manifest, filling Gap 1 of the manifest-bridge analysis.
 *
 * All algorithms default to the kernel package version. Individual algorithms
 * can be pinned to a different version by editing algorithm-versions.json.
 */

import versions from './algorithm-versions.json' with { type: 'json' };

/** The wasm4pm package version (source of truth: package.json). */
const PACKAGE_VERSION = '26.5.21';

/**
 * Returns the semver version for the given algorithm id.
 *
 * Lookup order:
 *   1. algorithm-versions.json entry for the id
 *   2. PACKAGE_VERSION fallback (when id is absent from the JSON)
 */
export function resolveAlgorithmVersion(algorithmId: string): string {
  const map = versions as Record<string, string>;
  return map[algorithmId] ?? PACKAGE_VERSION;
}

/**
 * Returns the kernel package version string.
 * Use this when you need the shared package version rather than a
 * per-algorithm version.
 */
export function getPackageVersion(): string {
  return PACKAGE_VERSION;
}

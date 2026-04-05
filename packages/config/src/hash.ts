import { hash as blake3 } from 'blake3';
import type { BaseConfig } from './config.js';

/**
 * Normalize configuration for hashing.
 * Removes fields that vary with each load (e.g., timestamps).
 * Creates a canonical representation for determinism verification.
 *
 * @param config Configuration to normalize
 * @returns Normalized configuration suitable for hashing
 */
function normalizeConfig(config: BaseConfig): string {
  // Create a copy with only the fields that matter for determinism
  const normalized = {
    version: config.version,
    execution: config.execution,
    observability: config.observability,
    watch: config.watch,
    output: config.output
  };

  // Convert to JSON with stable key ordering
  return JSON.stringify(normalized, Object.keys(normalized).sort());
}

/**
 * Compute BLAKE3 hash of configuration.
 * Used for determinism verification and config fingerprinting.
 *
 * The hash includes:
 * - version
 * - execution profile and settings
 * - observability configuration
 * - watch configuration
 * - output configuration
 *
 * The hash excludes:
 * - source information (file path, kind)
 * - metadata (timestamps, provenance)
 * - CLI overrides that are temporary
 *
 * @param config Configuration to hash
 * @returns BLAKE3 hash as hex string
 */
export function hashConfig(config: BaseConfig): string {
  const normalized = normalizeConfig(config);
  const digest = blake3(normalized);
  return digest.toString('hex');
}

/**
 * Verify configuration hash for determinism.
 * Useful for checking if configuration has changed.
 *
 * @param config Configuration to hash
 * @param expectedHash Hash to compare against
 * @returns true if hashes match
 */
export function verifyConfigHash(config: BaseConfig, expectedHash: string): boolean {
  return hashConfig(config) === expectedHash;
}

/**
 * Create a fingerprint of the configuration.
 * Shorter than full hash, suitable for logging/UI.
 *
 * @param config Configuration to fingerprint
 * @returns Short 8-character fingerprint
 */
export function fingerprintConfig(config: BaseConfig): string {
  const fullHash = hashConfig(config);
  return fullHash.slice(0, 8);
}

/**
 * Compute hash of specific config section.
 * Useful for checking if a particular setting has changed.
 *
 * @param section Configuration section to hash
 * @returns BLAKE3 hash as hex string
 */
export function hashConfigSection(section: unknown): string {
  const normalized = JSON.stringify(section);
  const digest = blake3(normalized);
  return digest.toString('hex');
}

/**
 * Compare two configurations and report differences.
 * Useful for debugging config changes.
 *
 * @param config1 First configuration
 * @param config2 Second configuration
 * @returns Detailed diff information
 */
export interface ConfigDiff {
  changed: boolean;
  hash1: string;
  hash2: string;
  differences: Array<{
    path: string;
    before: unknown;
    after: unknown;
  }>;
}

export function diffConfigs(config1: BaseConfig, config2: BaseConfig): ConfigDiff {
  const hash1 = hashConfig(config1);
  const hash2 = hashConfig(config2);
  const differences: ConfigDiff['differences'] = [];

  function walkDiff(obj1: any, obj2: any, prefix = '') {
    const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    for (const key of keys) {
      const path = prefix ? `${prefix}.${key}` : key;
      const val1 = obj1[key];
      const val2 = obj2[key];

      if (typeof val1 === 'object' && val1 !== null &&
          typeof val2 === 'object' && val2 !== null) {
        walkDiff(val1, val2, path);
      } else if (val1 !== val2) {
        differences.push({ path, before: val1, after: val2 });
      }
    }
  }

  walkDiff(config1, config2);

  return {
    changed: hash1 !== hash2,
    hash1,
    hash2,
    differences
  };
}

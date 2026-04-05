import { hash as blake3 } from 'blake3';
import type { BaseConfig } from './types.js';

/**
 * Normalize configuration for hashing.
 * Excludes source/metadata — only hashes semantic config values.
 */
function normalizeConfig(config: BaseConfig): string {
  const normalized: Record<string, unknown> = {
    schemaVersion: config.schemaVersion,
    version: config.version,
    sink: config.sink,
    algorithm: config.algorithm,
    execution: config.execution,
    observability: config.observability,
    watch: config.watch,
    output: config.output,
  };
  return stableStringify(normalized);
}

/**
 * Deterministic JSON.stringify with sorted keys at all levels.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const parts = sorted
    .filter(k => (obj as Record<string, unknown>)[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k]));
  return '{' + parts.join(',') + '}';
}

/**
 * Compute BLAKE3 hash of configuration.
 */
export function hashConfig(config: BaseConfig): string {
  const normalized = normalizeConfig(config);
  const digest = blake3(normalized);
  return digest.toString('hex');
}

/**
 * Verify configuration hash for determinism checking.
 */
export function verifyConfigHash(config: BaseConfig, expectedHash: string): boolean {
  return hashConfig(config) === expectedHash;
}

/**
 * Short 8-char fingerprint suitable for logging/UI.
 */
export function fingerprintConfig(config: BaseConfig): string {
  return hashConfig(config).slice(0, 8);
}

/**
 * Hash an arbitrary config section.
 */
export function hashConfigSection(section: unknown): string {
  const normalized = stableStringify(section);
  const digest = blake3(normalized);
  return digest.toString('hex');
}

/**
 * Diff two configs and report changes.
 */
export interface ConfigDiff {
  changed: boolean;
  hash1: string;
  hash2: string;
  differences: Array<{ path: string; before: unknown; after: unknown }>;
}

export function diffConfigs(config1: BaseConfig, config2: BaseConfig): ConfigDiff {
  const hash1 = hashConfig(config1);
  const hash2 = hashConfig(config2);
  const differences: ConfigDiff['differences'] = [];

  function walk(a: unknown, b: unknown, prefix = '') {
    if (a === b) return;
    const aObj = typeof a === 'object' && a !== null && !Array.isArray(a);
    const bObj = typeof b === 'object' && b !== null && !Array.isArray(b);
    if (aObj && bObj) {
      const keys = new Set([...Object.keys(a as any), ...Object.keys(b as any)]);
      for (const key of keys) {
        walk((a as any)[key], (b as any)[key], prefix ? `${prefix}.${key}` : key);
      }
    } else if (a !== b) {
      differences.push({ path: prefix, before: a, after: b });
    }
  }

  walk(config1, config2);
  return { changed: hash1 !== hash2, hash1, hash2, differences };
}

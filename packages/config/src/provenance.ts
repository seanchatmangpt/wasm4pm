/**
 * Provenance tracking for configuration values.
 * Every resolved config value records where it came from.
 */

export type ProvenanceSource = 'cli' | 'toml' | 'json' | 'env' | 'default';

export interface Provenance {
  value: unknown;
  source: ProvenanceSource;
  path?: string; // file path when source is 'toml' or 'json'
}

/**
 * Provenance map: dot-separated config path → provenance record.
 * Example: "algorithm.name" → { value: "alpha", source: "toml", path: "./wasm4pm.toml" }
 */
export type ProvenanceMap = Record<string, Provenance>;

/**
 * Create a provenance map from a flat or nested config object,
 * assigning the given source to every leaf value.
 */
export function trackProvenance(
  obj: Record<string, unknown>,
  source: ProvenanceSource,
  filePath?: string,
  prefix = '',
): ProvenanceMap {
  const map: ProvenanceMap = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(map, trackProvenance(value as Record<string, unknown>, source, filePath, fullKey));
    } else {
      const entry: Provenance = { value, source };
      if (filePath) entry.path = filePath;
      map[fullKey] = entry;
    }
  }
  return map;
}

/**
 * Merge multiple provenance maps. Later maps override earlier ones
 * for the same key (matching resolution order).
 */
export function mergeProvenance(...maps: ProvenanceMap[]): ProvenanceMap {
  const merged: ProvenanceMap = {};
  for (const map of maps) {
    Object.assign(merged, map);
  }
  return merged;
}

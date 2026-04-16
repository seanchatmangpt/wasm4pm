/**
 * Provenance tracking for configuration values.
 * Every resolved config value records where it came from.
 */
export type ProvenanceSource = 'cli' | 'toml' | 'json' | 'env' | 'default';
export interface Provenance {
    value: unknown;
    source: ProvenanceSource;
    path?: string;
}
/**
 * Provenance map: dot-separated config path → provenance record.
 * Example: "algorithm.name" → { value: "alpha", source: "toml", path: "./pictl.toml" }
 */
export type ProvenanceMap = Record<string, Provenance>;
/**
 * Create a provenance map from a flat or nested config object,
 * assigning the given source to every leaf value.
 */
export declare function trackProvenance(obj: Record<string, unknown>, source: ProvenanceSource, filePath?: string, prefix?: string): ProvenanceMap;
/**
 * Merge multiple provenance maps. Later maps override earlier ones
 * for the same key (matching resolution order).
 */
export declare function mergeProvenance(...maps: ProvenanceMap[]): ProvenanceMap;
//# sourceMappingURL=provenance.d.ts.map
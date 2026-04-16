import { hash as blake3 } from 'blake3';
/**
 * Normalize configuration for hashing.
 * Excludes source/metadata — only hashes semantic config values.
 */
function normalizeConfig(config) {
    const normalized = {
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
function stableStringify(obj) {
    if (obj === null || obj === undefined)
        return 'null';
    if (typeof obj !== 'object')
        return JSON.stringify(obj);
    if (Array.isArray(obj))
        return '[' + obj.map(stableStringify).join(',') + ']';
    const sorted = Object.keys(obj).sort();
    const parts = sorted
        .filter(k => obj[k] !== undefined)
        .map(k => JSON.stringify(k) + ':' + stableStringify(obj[k]));
    return '{' + parts.join(',') + '}';
}
/**
 * Compute BLAKE3 hash of configuration.
 */
export function hashConfig(config) {
    const normalized = normalizeConfig(config);
    const digest = blake3(normalized);
    return digest.toString('hex');
}
/**
 * Verify configuration hash for determinism checking.
 * @internal
 */
function verifyConfigHash(config, expectedHash) {
    return hashConfig(config) === expectedHash;
}
/**
 * Short 8-char fingerprint suitable for logging/UI.
 * @internal
 */
function fingerprintConfig(config) {
    return hashConfig(config).slice(0, 8);
}
/**
 * Hash an arbitrary config section.
 * @internal
 */
function hashConfigSection(section) {
    const normalized = stableStringify(section);
    const digest = blake3(normalized);
    return digest.toString('hex');
}
function diffConfigs(config1, config2) {
    const hash1 = hashConfig(config1);
    const hash2 = hashConfig(config2);
    const differences = [];
    function walk(a, b, prefix = '') {
        if (a === b)
            return;
        const aObj = typeof a === 'object' && a !== null && !Array.isArray(a);
        const bObj = typeof b === 'object' && b !== null && !Array.isArray(b);
        if (aObj && bObj) {
            const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
            for (const key of keys) {
                walk(a[key], b[key], prefix ? `${prefix}.${key}` : key);
            }
        }
        else if (a !== b) {
            differences.push({ path: prefix, before: a, after: b });
        }
    }
    walk(config1, config2);
    return { changed: hash1 !== hash2, hash1, hash2, differences };
}
//# sourceMappingURL=hash.js.map
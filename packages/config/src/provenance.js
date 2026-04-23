/**
 * Provenance tracking for configuration values.
 * Every resolved config value records where it came from.
 */
/**
 * Create a provenance map from a flat or nested config object,
 * assigning the given source to every leaf value.
 */
export function trackProvenance(obj, source, filePath, prefix = '') {
    const map = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null)
            continue;
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(map, trackProvenance(value, source, filePath, fullKey));
        }
        else {
            const entry = { value, source };
            if (filePath)
                entry.path = filePath;
            map[fullKey] = entry;
        }
    }
    return map;
}
/**
 * Merge multiple provenance maps. Later maps override earlier ones
 * for the same key (matching resolution order).
 */
export function mergeProvenance(...maps) {
    const merged = {};
    for (const map of maps) {
        Object.assign(merged, map);
    }
    return merged;
}
//# sourceMappingURL=provenance.js.map
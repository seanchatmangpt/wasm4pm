/**
 * JCS-OCEL canonical serialization — TypeScript port of
 * `crates/wasm4pm-algos/src/truex/canonicalize.rs` (must stay in sync).
 */
export function canonicalStringify(value) {
    if (value === null)
        return 'null';
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    if (typeof value === 'number')
        return String(value);
    if (typeof value === 'string') {
        const escaped = value
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
        return `"${escaped}"`;
    }
    if (Array.isArray(value)) {
        if (value.length === 0)
            return '[]';
        const clone = [...value];
        const first = clone[0];
        if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
            const row = first;
            if ('ocel:id' in row) {
                clone.sort((a, b) => String(a['ocel:id'] ?? '').localeCompare(String(b['ocel:id'] ?? '')));
            }
            else if ('ocel:event-id' in row && 'ocel:object-id' in row) {
                clone.sort((a, b) => eventObjectSortKey(a).localeCompare(eventObjectSortKey(b)));
            }
            else if ('ocel:object-id' in row && 'ocel:field' in row) {
                clone.sort((a, b) => objectChangeSortKey(a).localeCompare(objectChangeSortKey(b)));
            }
        }
        return `[${clone.map(canonicalStringify).join(',')}]`;
    }
    if (typeof value === 'object') {
        const map = value;
        const keys = Object.keys(map).sort();
        return `{${keys.map((k) => `"${k}":${canonicalStringify(map[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function eventObjectSortKey(row) {
    const r = row;
    return `${String(r['ocel:event-id'] ?? '')}|${String(r['ocel:object-id'] ?? '')}|${String(r['ocel:qualifier'] ?? '')}`;
}
function objectChangeSortKey(row) {
    const r = row;
    const time = r['ocel:timestamp'] ?? r['ocel:time'] ?? '';
    return `${String(r['ocel:object-id'] ?? '')}|${String(time)}|${String(r['ocel:field'] ?? '')}`;
}
//# sourceMappingURL=canonical.js.map
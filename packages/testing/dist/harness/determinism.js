/**
 * Receipt determinism test harness.
 *
 * Invariant: given identical input (config + event log), the receipt must be
 * byte-identical (modulo timestamps and run_id). This harness runs the same
 * input N times and compares the stable fields.
 */
/** Fields expected to change between runs (non-deterministic) */
const UNSTABLE_FIELDS = new Set([
    'run_id', 'runId',
    'start_time', 'startTime', 'startedAt',
    'end_time', 'endTime', 'finishedAt',
    'duration_ms', 'durationMs',
    'timestamp',
]);
/**
 * Compute a stable hash of a receipt by zeroing out non-deterministic fields.
 */
export function stableReceiptHash(receipt) {
    const stable = stripUnstableFields(receipt);
    const json = canonicalize(stable);
    return simpleHash(json);
}
/**
 * Run a producer function N times and verify deterministic output.
 */
export async function checkDeterminism(producer, iterations = 5) {
    const receipts = [];
    const hashes = [];
    for (let i = 0; i < iterations; i++) {
        const receipt = await producer();
        receipts.push(receipt);
        hashes.push(stableReceiptHash(receipt));
    }
    const uniqueHashes = new Set(hashes);
    const passed = uniqueHashes.size === 1;
    const stableFields = [];
    const unstableFields = [];
    if (receipts.length >= 2) {
        const allKeys = new Set();
        for (const r of receipts) {
            for (const k of Object.keys(r))
                allKeys.add(k);
        }
        for (const key of allKeys) {
            if (UNSTABLE_FIELDS.has(key)) {
                unstableFields.push(key);
                continue;
            }
            const values = receipts.map(r => canonicalize(r[key]));
            const unique = new Set(values);
            if (unique.size === 1) {
                stableFields.push(key);
            }
            else {
                unstableFields.push(key);
            }
        }
    }
    const details = passed
        ? `Determinism verified: ${iterations} iterations, hash=${hashes[0]}`
        : `Non-deterministic: ${uniqueHashes.size} unique hashes from ${iterations} iterations. Hashes: [${hashes.join(', ')}]`;
    return { passed, iterations, stableFields, unstableFields, hashes, details };
}
/**
 * Compare two receipts for determinism (ignoring unstable fields).
 */
export function receiptsMatch(a, b) {
    return stableReceiptHash(a) === stableReceiptHash(b);
}
/**
 * Strip non-deterministic fields from a receipt, recursively.
 */
function stripUnstableFields(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (typeof obj !== 'object')
        return obj;
    if (Array.isArray(obj))
        return obj.map(stripUnstableFields);
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (UNSTABLE_FIELDS.has(key))
            continue;
        result[key] = stripUnstableFields(value);
    }
    return result;
}
/**
 * Canonical JSON serialization (sorted keys) for deterministic hashing.
 */
function canonicalize(value) {
    return JSON.stringify(value, (_, v) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            const sorted = {};
            for (const key of Object.keys(v).sort()) {
                sorted[key] = v[key];
            }
            return sorted;
        }
        return v;
    });
}
/**
 * Simple string hash (FNV-1a 32-bit) — not cryptographic, just for comparison.
 */
function simpleHash(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
//# sourceMappingURL=determinism.js.map
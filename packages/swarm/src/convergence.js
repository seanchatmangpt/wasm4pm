/**
 * convergence.ts
 *
 * SHA-256 based convergence detection for the wasm4pm swarm.
 * Reuses hashOutput from @wasm4pm/kernel for consistent hashing.
 */
import { createHash } from 'node:crypto';
/**
 * Compute SHA-256 hash of any JSON-serializable value (sorted keys).
 * Mirrors hashOutput() from @wasm4pm/kernel/src/hashing.ts.
 */
export function hashOutput(data) {
    const normalized = JSON.stringify(sortKeys(data));
    return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}
function sortKeys(value) {
    if (value === null || typeof value !== 'object')
        return value;
    if (Array.isArray(value))
        return value.map(sortKeys);
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
        sorted[key] = sortKeys(value[key]);
    }
    return sorted;
}
/**
 * Check whether all workers have produced the same hash for a given algorithm.
 *
 * @param results - WorkerResult[] from the latest swarm run
 * @param algorithm - algorithm ID to check
 * @param threshold - fraction that must agree (1.0 = unanimous, 0.8 = 80% quorum)
 * @param workerIds - optional subset of workers to check
 */
export function checkConvergence(results, algorithm, threshold = 1.0, workerIds) {
    const relevant = results.filter(r => r.algorithmId === algorithm && (!workerIds || workerIds.includes(r.workerId)));
    if (relevant.length === 0) {
        return {
            algorithm,
            converged: false,
            consensusRatio: 0,
            dominantHash: null,
            dissentingWorkers: [],
            totalChecked: 0,
        };
    }
    // Count hash frequencies
    const hashCounts = new Map();
    for (const r of relevant) {
        hashCounts.set(r.resultHash, (hashCounts.get(r.resultHash) ?? 0) + 1);
    }
    // Find dominant hash
    let dominantHash = null;
    let maxCount = 0;
    for (const [h, count] of hashCounts) {
        if (count > maxCount) {
            maxCount = count;
            dominantHash = h;
        }
    }
    const consensusRatio = maxCount / relevant.length;
    const converged = consensusRatio >= threshold;
    const dissentingWorkers = converged
        ? relevant.filter(r => r.resultHash !== dominantHash).map(r => r.workerId)
        : relevant.map(r => r.workerId);
    return {
        algorithm,
        converged,
        consensusRatio,
        dominantHash,
        dissentingWorkers,
        totalChecked: relevant.length,
    };
}
/**
 * Check swarm-level convergence across all workers and algorithms in the latest round.
 * Uses ring-buffer history for inter-episode stability detection.
 *
 * @param results - Latest worker results
 * @param hashHistory - Map<workerKey, string[]> ring buffer of recent hashes
 * @param convergenceRuns - Number of identical runs required (from ostar.toml)
 */
export function checkSwarmConvergence(results, hashHistory, convergenceRuns = 2) {
    const workerAlgoPairs = results.map(r => `${r.workerId}/${r.algorithmId}`);
    const stableWorkers = [];
    const unstableWorkers = [];
    for (const r of results) {
        const key = `${r.workerId}/${r.algorithmId}`;
        const hist = hashHistory.get(key) ?? [];
        hist.push(r.resultHash);
        if (hist.length > convergenceRuns)
            hist.shift();
        hashHistory.set(key, hist);
        const isStable = hist.length >= convergenceRuns && new Set(hist).size === 1;
        if (isStable)
            stableWorkers.push(key);
        else
            unstableWorkers.push(key);
    }
    const total = workerAlgoPairs.length;
    const agreementRate = total > 0 ? stableWorkers.length / total : 0;
    const converged = unstableWorkers.length === 0 && stableWorkers.length === total && total > 0;
    return { converged, stableWorkers, unstableWorkers, agreementRate };
}
/**
 * Check convergence for ML results using epsilon-tolerance on numeric fields.
 * ML outputs (confidence, regression coefficients, etc.) may vary slightly
 * between workers due to floating-point nondeterminism.
 *
 * @param results - WorkerResult[] from the latest swarm run
 * @param algorithm - algorithm ID to check
 * @param epsilon - Maximum allowed difference for numeric fields (default 0.01)
 * @param threshold - fraction that must agree (default 1.0)
 */
export function checkMlConvergence(results, algorithm, epsilon = 0.01, threshold = 1.0) {
    const relevant = results.filter(r => r.algorithmId === algorithm);
    if (relevant.length === 0) {
        return {
            algorithm,
            converged: false,
            consensusRatio: 0,
            dominantHash: null,
            dissentingWorkers: [],
            totalChecked: 0,
        };
    }
    // Group results by epsilon-equivalence class
    const groups = [];
    for (let i = 0; i < relevant.length; i++) {
        let placed = false;
        for (const group of groups) {
            const representative = relevant[group[0]];
            if (mlResultsEquivalent(representative.result, relevant[i].result, epsilon)) {
                group.push(i);
                placed = true;
                break;
            }
        }
        if (!placed)
            groups.push([i]);
    }
    // Find dominant group
    let maxGroupSize = 0;
    let dominantGroupIdx = 0;
    for (let g = 0; g < groups.length; g++) {
        if (groups[g].length > maxGroupSize) {
            maxGroupSize = groups[g].length;
            dominantGroupIdx = g;
        }
    }
    const consensusRatio = maxGroupSize / relevant.length;
    const converged = consensusRatio >= threshold;
    const dominantHash = relevant[groups[dominantGroupIdx][0]]?.resultHash ?? null;
    const dissentingWorkers = converged
        ? groups
            .filter((_, g) => g !== dominantGroupIdx)
            .flat()
            .map(i => relevant[i].workerId)
        : relevant.map(r => r.workerId);
    return {
        algorithm,
        converged,
        consensusRatio,
        dominantHash,
        dissentingWorkers,
        totalChecked: relevant.length,
    };
}
/**
 * Compare two ML results for equivalence within epsilon tolerance.
 * Recursively compares all numeric fields; non-numeric fields must match exactly.
 */
function mlResultsEquivalent(a, b, epsilon) {
    if (a === b)
        return true;
    if (typeof a === 'number' && typeof b === 'number') {
        return Math.abs(a - b) <= epsilon;
    }
    if (typeof a !== typeof b)
        return false;
    if (a === null || b === null)
        return a === b;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length)
            return false;
        return a.every((v, i) => mlResultsEquivalent(v, b[i], epsilon));
    }
    if (typeof a === 'object' && typeof b === 'object') {
        const keysA = Object.keys(a).sort();
        const keysB = Object.keys(b).sort();
        if (keysA.length !== keysB.length)
            return false;
        return keysA.every((k, i) => k === keysB[i] &&
            mlResultsEquivalent(a[k], b[k], epsilon));
    }
    return false;
}
//# sourceMappingURL=convergence.js.map
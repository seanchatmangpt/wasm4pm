/**
 * convergence.ts
 *
 * SHA-256 based convergence detection for the wasm4pm swarm.
 * Reuses hashOutput from @wasm4pm/kernel for consistent hashing.
 */
import type { WorkerResult, SwarmConvergenceReport } from './types.js';
/**
 * Compute SHA-256 hash of any JSON-serializable value (sorted keys).
 * Mirrors hashOutput() from @wasm4pm/kernel/src/hashing.ts.
 */
export declare function hashOutput(data: unknown): string;
/**
 * Check whether all workers have produced the same hash for a given algorithm.
 *
 * @param results - WorkerResult[] from the latest swarm run
 * @param algorithm - algorithm ID to check
 * @param threshold - fraction that must agree (1.0 = unanimous, 0.8 = 80% quorum)
 * @param workerIds - optional subset of workers to check
 */
export declare function checkConvergence(results: WorkerResult[], algorithm: string, threshold?: number, workerIds?: string[]): SwarmConvergenceReport;
/**
 * Check swarm-level convergence across all workers and algorithms in the latest round.
 * Uses ring-buffer history for inter-episode stability detection.
 *
 * @param results - Latest worker results
 * @param hashHistory - Map<workerKey, string[]> ring buffer of recent hashes
 * @param convergenceRuns - Number of identical runs required (from ostar.toml)
 */
export declare function checkSwarmConvergence(results: WorkerResult[], hashHistory: Map<string, string[]>, convergenceRuns?: number): {
    converged: boolean;
    stableWorkers: string[];
    unstableWorkers: string[];
    agreementRate: number;
};
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
export declare function checkMlConvergence(results: WorkerResult[], algorithm: string, epsilon?: number, threshold?: number): SwarmConvergenceReport;
//# sourceMappingURL=convergence.d.ts.map
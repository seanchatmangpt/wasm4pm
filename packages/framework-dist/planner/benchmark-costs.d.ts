/**
 * benchmark-costs.ts
 *
 * Single source of truth for algorithm cost measurements.
 * Replaces three independent hand-authored tables across planner.ts,
 * suggestions.ts, and registry.ts with calibrated, evidence-backed numbers.
 *
 * Data provenance:
 *   dispatchUs      — vitest bench, packages/kernel/src/__benchmarks__/kernel-dispatch.bench.ts
 *                     dataset: bpi2020_domestic_declarations.xes (56,437 events), 2026-06-10
 *   nativeEventsPerSec — criterion bench, wasm4pm/benches/native_api_bench.rs
 *                        dataset: bpi2020_domestic_declarations.xes (56,437 events), 2026-06-10
 */
export interface AlgoBenchCost {
    /** µs per Kernel.run() call, measured in TS vitest bench on BPI2020 */
    dispatchUs: number;
    /** Rust _from_log throughput in events/s (criterion bench, BPI2020). Undefined = not yet measured. */
    nativeEventsPerSec?: number;
    /** Dataset used for measurement */
    dataset: 'bpi2020' | 'roadtraffic';
    /** ISO date the measurement was taken */
    measuredAt: string;
}
/**
 * Measured algorithm costs. Keys are canonical algorithm IDs from the kernel registry.
 * Ordered by ascending dispatchUs (fastest first).
 */
export declare const ALGO_BENCH_COSTS: Readonly<Record<string, AlgoBenchCost>>;
/**
 * Estimated wall-clock milliseconds for one Kernel.run() call on a log with
 * `eventCount` events.
 *
 * When `nativeEventsPerSec` is known, the algorithm portion is proportional to
 * log size. When it is unknown, the estimate collapses to dispatch overhead only.
 *
 * Returns `undefined` for unmeasured algorithms — callers fall back to existing
 * hand-authored estimates.
 */
export declare function estimateDurationMs(algoId: string, eventCount: number): number | undefined;
/**
 * Normalize `dispatchUs` to a 0–100 speed score:
 *   fastest measured algo (inductive_miner, 1.61µs)  → 100
 *   slowest measured algo (heuristic_miner, 3.19µs)  → 0
 *
 * Returns `undefined` for unmeasured algorithms.
 */
export declare function benchSpeedScore(algoId: string): number | undefined;
/**
 * Derive a speed tier (1–80 scale used by ALT_SPEED_TIER) from dispatch rank.
 * Fastest measured algo → tier 5; slowest → tier 70. Unmeasured → undefined.
 *
 * The 5–70 range intentionally leaves room below 5 for streaming variants
 * (simd_streaming_dfg, process_skeleton) and above 70 for metaheuristics
 * (genetic, pso, aco, ilp) that are not yet benchmarked at TS layer.
 */
export declare function benchSpeedTier(algoId: string): number | undefined;
//# sourceMappingURL=benchmark-costs.d.ts.map
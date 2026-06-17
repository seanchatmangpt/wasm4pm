/**
 * benchmark-costs.ts
 *
 * Single source of truth for algorithm cost measurements.
 * Replaces three independent hand-authored tables across planner.ts,
 * suggestions.ts, and registry.ts with calibrated, evidence-backed numbers.
 *
 * Data provenance:
 *   dispatchUs      — vitest bench, packages/kernel/src/__benchmarks__/kernel-dispatch.bench.ts
 *                     dataset: bpi2020_travel.xes (56,437 events), 2026-06-10
 *   nativeEventsPerSec — criterion bench, wasm4pm/benches/native_api_bench.rs
 *                        dataset: bpi2020_travel.xes (56,437 events), 2026-06-10
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
export const ALGO_BENCH_COSTS: Readonly<Record<string, AlgoBenchCost>> = {
  inductive_miner:     { dispatchUs: 1.61, dataset: 'bpi2020', measuredAt: '2026-06-10' },
  dfg:                 { dispatchUs: 1.69, nativeEventsPerSec: 11_981_919, dataset: 'bpi2020', measuredAt: '2026-06-10' },
  simulated_annealing: { dispatchUs: 1.72, dataset: 'bpi2020', measuredAt: '2026-06-10' },
  batches:             { dispatchUs: 1.72, dataset: 'bpi2020', measuredAt: '2026-06-10' },
  correlation_miner:   { dispatchUs: 1.76, dataset: 'bpi2020', measuredAt: '2026-06-10' },
  transition_system:   { dispatchUs: 1.76, dataset: 'bpi2020', measuredAt: '2026-06-10' },
  log_to_trie:         { dispatchUs: 1.79, dataset: 'bpi2020', measuredAt: '2026-06-10' },
  hill_climbing:       { dispatchUs: 1.82, dataset: 'bpi2020', measuredAt: '2026-06-10' },
  ilp:                 { dispatchUs: 2.56, dataset: 'bpi2020', measuredAt: '2026-06-10' },
  heuristic_miner:     { dispatchUs: 3.19, nativeEventsPerSec: 12_099_276, dataset: 'bpi2020', measuredAt: '2026-06-10' },
} as const;

// Normalization bounds derived from the data above (computed once at module load)
const _dispatchValues = Object.values(ALGO_BENCH_COSTS).map((c) => c.dispatchUs);
const _MIN_US = Math.min(..._dispatchValues); // 1.61 (inductive_miner)
const _MAX_US = Math.max(..._dispatchValues); // 3.19 (heuristic_miner)

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
export function estimateDurationMs(algoId: string, eventCount: number): number | undefined {
  const cost = ALGO_BENCH_COSTS[algoId];
  if (!cost) return undefined;

  const algoMs = cost.nativeEventsPerSec
    ? (eventCount / cost.nativeEventsPerSec) * 1000
    : cost.dispatchUs / 1000; // dispatch-only fallback

  return algoMs + cost.dispatchUs / 1000;
}

/**
 * Normalize `dispatchUs` to a 0–100 speed score:
 *   fastest measured algo (inductive_miner, 1.61µs)  → 100
 *   slowest measured algo (heuristic_miner, 3.19µs)  → 0
 *
 * Returns `undefined` for unmeasured algorithms.
 */
export function benchSpeedScore(algoId: string): number | undefined {
  const cost = ALGO_BENCH_COSTS[algoId];
  if (!cost) return undefined;
  if (_MAX_US === _MIN_US) return 100;
  return Math.round(100 * (1 - (cost.dispatchUs - _MIN_US) / (_MAX_US - _MIN_US)));
}

/**
 * Derive a speed tier (1–80 scale used by ALT_SPEED_TIER) from dispatch rank.
 * Fastest measured algo → tier 5; slowest → tier 70. Unmeasured → undefined.
 *
 * The 5–70 range intentionally leaves room below 5 for streaming variants
 * (simd_streaming_dfg, process_skeleton) and above 70 for metaheuristics
 * (genetic, pso, aco, ilp) that are not yet benchmarked at TS layer.
 */
export function benchSpeedTier(algoId: string): number | undefined {
  const cost = ALGO_BENCH_COSTS[algoId];
  if (!cost) return undefined;
  if (_MAX_US === _MIN_US) return 5;
  const norm = (cost.dispatchUs - _MIN_US) / (_MAX_US - _MIN_US); // 0=fastest, 1=slowest
  return Math.round(5 + 65 * norm); // maps to [5, 70]
}

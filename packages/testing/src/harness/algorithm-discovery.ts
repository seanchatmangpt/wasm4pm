/**
 * Agent 2: Algorithm Discovery (TESTING HARNESS — SIMULATED METRICS)
 *
 * This class orchestrates 15 discovery algorithms against the same OCEL event log
 * and ranks results by the four van der Aalst quality dimensions:
 *   fitness, precision, simplicity, generalization.
 *
 * WARNING — SIMULATED QUALITY METRICS:
 *   The quality values returned by `discoverWithAllAlgorithms` (fitness, precision,
 *   simplicity, generalization) are APPROXIMATIONS derived from log size and random
 *   variance, NOT measurements produced by real token-replay or alignment computation.
 *   They exist so the test harness can exercise the ranking and reporting pipeline
 *   without requiring a live WASM instance.
 *
 *   Do NOT use these values as ground truth in production conformance decisions.
 *   For real quality measurement, call the WASM kernel directly via `@wasm4pm/kernel`
 *   and use the `alignments` or `etconformance_precision` algorithms.
 *
 *   Fields affected: `AlgorithmResult.fitness`, `.precision`, `.simplicity`,
 *   `.generalization`.  The `executionTimeMs` field is also synthetic — it includes
 *   a `Math.random()` component and is not wall-clock accurate.
 */

import type { OcelEventLog } from './ocel-harvester';

export interface AlgorithmResult {
  name: string;
  fitness: number;
  precision: number;
  simplicity: number;
  generalization: number;
  executionTimeMs: number;
  edgeCount: number;
  transitionCount: number;
  /**
   * True when quality metrics (fitness, precision, simplicity, generalization)
   * were computed by the simulation approximation rather than by actual WASM
   * token-replay or alignment.  Always true for results from this harness.
   * Check this flag before using quality values in conformance decisions.
   */
  simulated: boolean;
}

export interface DiscoveryResults {
  algorithms: AlgorithmResult[];
  fastest: AlgorithmResult | null;
  highestQuality: AlgorithmResult | null;
}

/**
 * Deterministic stub quality profiles derived from the kernel registry speed/quality
 * scores (packages/kernel/src/registry.ts).  These are NOT measured values — they
 * are the registry's declared quality integers normalised to [0,1] so that ordering
 * comparisons (highestQuality, fastest) are stable across test runs.
 *
 * IMPORTANT: do not replace these with Math.random() — the harness is used to test
 * that ranking logic works correctly. Non-deterministic quality values make ranking
 * tests trivially untrustworthy: a test that passes today may fail tomorrow on the
 * same code simply because the random draw changed.
 */
export const ALGORITHM_PROFILES: Record<
  string,
  { qualityNorm: number; precisionNorm: number; simplicityNorm: number; speedMs: number }
> = {
  dfg: { qualityNorm: 0.30, precisionNorm: 0.55, simplicityNorm: 0.90, speedMs: 1 },
  process_skeleton: { qualityNorm: 0.25, precisionNorm: 0.50, simplicityNorm: 0.95, speedMs: 1 },
  alpha_plus_plus: { qualityNorm: 0.45, precisionNorm: 0.60, simplicityNorm: 0.75, speedMs: 5 },
  heuristic_miner: { qualityNorm: 0.50, precisionNorm: 0.65, simplicityNorm: 0.70, speedMs: 8 },
  inductive_miner: { qualityNorm: 0.55, precisionNorm: 0.70, simplicityNorm: 0.65, speedMs: 12 },
  hill_climbing: { qualityNorm: 0.55, precisionNorm: 0.68, simplicityNorm: 0.60, speedMs: 18 },
  declare: { qualityNorm: 0.50, precisionNorm: 0.62, simplicityNorm: 0.55, speedMs: 15 },
  simulated_annealing: { qualityNorm: 0.65, precisionNorm: 0.72, simplicityNorm: 0.50, speedMs: 30 },
  a_star: { qualityNorm: 0.70, precisionNorm: 0.75, simplicityNorm: 0.48, speedMs: 40 },
  aco: { qualityNorm: 0.75, precisionNorm: 0.78, simplicityNorm: 0.45, speedMs: 55 },
  pso: { qualityNorm: 0.75, precisionNorm: 0.78, simplicityNorm: 0.44, speedMs: 60 },
  genetic_algorithm: { qualityNorm: 0.80, precisionNorm: 0.82, simplicityNorm: 0.40, speedMs: 80 },
  optimized_dfg: { qualityNorm: 0.85, precisionNorm: 0.80, simplicityNorm: 0.42, speedMs: 65 },
  ilp: { qualityNorm: 0.90, precisionNorm: 0.88, simplicityNorm: 0.38, speedMs: 95 },
  powl: { qualityNorm: 0.78, precisionNorm: 0.80, simplicityNorm: 0.50, speedMs: 45 },
};

const ALGORITHM_NAMES = Object.keys(ALGORITHM_PROFILES);

export class AlgorithmDiscovery {
  async discoverWithAllAlgorithms(ocel: OcelEventLog): Promise<DiscoveryResults> {
    const results: AlgorithmResult[] = [];

    // Extract structural log properties used for deterministic edge/transition counts.
    // These counts are derived from the log, not from Math.random(), so they are
    // stable across runs on the same input.
    const activities = new Set(ocel.events.map((e) => e.activity));
    const traces = new Set(ocel.events.filter((e) => e.objects.length > 0).map((e) => e.objects[0]));

    for (const algoName of ALGORITHM_NAMES) {
      const startTime = performance.now();

      const profile = ALGORITHM_PROFILES[algoName];
      // generalization is the mean of fitness and precision, a defensible approximation
      // consistent with van der Aalst's observation that precision and fitness trade off.
      const generalization = (profile.qualityNorm + profile.precisionNorm) / 2;

      const endTime = performance.now();

      const result: AlgorithmResult = {
        name: algoName,
        fitness: profile.qualityNorm,
        precision: profile.precisionNorm,
        simplicity: profile.simplicityNorm,
        generalization,
        executionTimeMs: Math.max(1, endTime - startTime),
        edgeCount: Math.floor(activities.size * (profile.qualityNorm + 0.5)),
        transitionCount: Math.floor(traces.size * profile.qualityNorm),
        simulated: true, // Metrics are approximations — not real token-replay values
      };

      results.push(result);
    }

    // Sort by fitness (descending)
    results.sort((a, b) => b.fitness - a.fitness);

    return {
      algorithms: results,
      fastest:
        results.reduce((prev, curr) =>
          curr.executionTimeMs < prev.executionTimeMs ? curr : prev
        ) || null,
      highestQuality: results[0] || null,
    };
  }
}

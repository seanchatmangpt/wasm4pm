/**
 * Discovery Algorithm Benchmarks
 *
 * Measures:
 * 1. Execution latency (ms)
 * 2. Fitness (token-based replay)
 * 3. Output correctness
 *
 * Test datasets:
 * - BPI 2020 (100K events) — large, real-world process
 * - Synthetic simple (100 events) — known ground truth
 * - BPI 2012 (13K events) — medium, complex process
 */

import { describe, it, expect } from 'vitest';
import { pictl } from '@pictl/cli';
import {
  measureFitness,
  measureFitnessBatch,
  formatFitnessReport,
} from '../validators/fitness-validator';

interface DiscoveryBenchmark {
  algorithm: string;
  dataset: string;
  expectedLatencyMs: [number, number]; // [min, max]
  expectedFitness: number; // >0.85 is acceptable
  expectedOutput: string; // 'dfg' | 'petri_net' | 'process_tree' | 'declare'
  timeout?: number;
}

const DISCOVERY_BENCHMARKS: DiscoveryBenchmark[] = [
  // Tier 1: Fast (Speed 0-30)
  {
    algorithm: 'dfg',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [0.5, 5],
    expectedFitness: 0.95, // DFG is based on directly-observed behavior
    expectedOutput: 'dfg',
  },
  {
    algorithm: 'simd_streaming_dfg',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [0.3, 3],
    expectedFitness: 0.94, // Streaming variant, slightly lower
    expectedOutput: 'dfg',
  },
  {
    algorithm: 'process_skeleton',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [0.5, 5],
    expectedFitness: 0.90, // Simplified structure
    expectedOutput: 'dfg',
  },

  // Tier 2: Balanced (Speed 20-55)
  {
    algorithm: 'alpha_plus_plus',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [5, 50],
    expectedFitness: 0.88, // Adds Petri net structure
    expectedOutput: 'petri_net',
  },
  {
    algorithm: 'heuristic_miner',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [10, 100],
    expectedFitness: 0.85, // Filters noise, may miss rare paths
    expectedOutput: 'dfg',
  },
  {
    algorithm: 'inductive_miner',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [20, 150],
    expectedFitness: 0.88, // Process tree discovery
    expectedOutput: 'process_tree',
  },
  {
    algorithm: 'hill_climbing',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [30, 200],
    expectedFitness: 0.87, // Iterative improvement
    expectedOutput: 'petri_net',
  },
  {
    algorithm: 'declare',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [25, 150],
    expectedFitness: 0.80, // Constraint-based, looser fitting
    expectedOutput: 'declare',
  },

  // Tier 3: Quality (Speed 55-90)
  {
    algorithm: 'simulated_annealing',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [100, 1000],
    expectedFitness: 0.90, // Optimization-based
    expectedOutput: 'petri_net',
  },
  {
    algorithm: 'a_star',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [150, 1500],
    expectedFitness: 0.92, // Heuristic search
    expectedOutput: 'petri_net',
  },
  {
    algorithm: 'aco',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [200, 2000],
    expectedFitness: 0.91, // Ant colony optimization
    expectedOutput: 'petri_net',
  },
  {
    algorithm: 'pso',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [200, 2000],
    expectedFitness: 0.91, // Particle swarm optimization
    expectedOutput: 'petri_net',
  },
  {
    algorithm: 'genetic_algorithm',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [300, 2000],
    expectedFitness: 0.94, // Evolutionary, high quality
    expectedOutput: 'petri_net',
  },
  {
    algorithm: 'optimized_dfg',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [100, 500],
    expectedFitness: 0.93, // Enhanced DFG
    expectedOutput: 'dfg',
  },
  {
    algorithm: 'ilp',
    dataset: 'bpi_2020_100k.xes',
    expectedLatencyMs: [500, 30000], // Can be very slow
    expectedFitness: 0.96, // Near-perfect, optimization-based
    expectedOutput: 'petri_net',
    timeout: 35000, // 35s timeout for ILP
  },
];

describe('Discovery Algorithm Benchmarks', () => {
  it('should run all discovery algorithms and measure fitness', async () => {
    const results = [];

    for (const bench of DISCOVERY_BENCHMARKS) {
      const start = performance.now();

      try {
        const receipt = await pictl.run({
          algorithm: bench.algorithm,
          source: { kind: 'file', path: `./benchmarks/datasets/${bench.dataset}` },
          execution: { timeout: bench.timeout || 10000 },
        });

        const latency = performance.now() - start;

        // Measure fitness via token-based replay
        const fitnessResult = await measureFitness(
          bench.algorithm,
          `./benchmarks/datasets/${bench.dataset}`,
          bench.expectedFitness
        );

        const latencyOk = latency >= bench.expectedLatencyMs[0] && latency <= bench.expectedLatencyMs[1];
        const fitnessOk = fitnessResult.fitness >= bench.expectedFitness;
        const outputOk = receipt.algorithm.output === bench.expectedOutput;

        const pass = latencyOk && fitnessOk && outputOk;

        results.push({
          algorithm: bench.algorithm,
          latencyMs: latency,
          fitness: fitnessResult.fitness,
          output: receipt.algorithm.output,
          pass,
          reason:
            !pass &&
            [
              !latencyOk &&
                `latency ${latency.toFixed(2)}ms (expect ${bench.expectedLatencyMs[0]}-${bench.expectedLatencyMs[1]}ms)`,
              !fitnessOk &&
                `fitness ${fitnessResult.fitness.toFixed(2)} (expect >=${bench.expectedFitness})`,
              !outputOk && `output ${receipt.algorithm.output} (expect ${bench.expectedOutput})`,
            ].filter(Boolean),
        });
      } catch (e) {
        results.push({
          algorithm: bench.algorithm,
          latencyMs: null,
          fitness: null,
          output: null,
          pass: false,
          reason: [`CRASH: ${e instanceof Error ? e.message : String(e)}`],
        });
      }
    }

    // Print report
    console.log(formatDiscoveryReport(results));

    // Assertion: all must pass
    const failures = results.filter((r) => !r.pass);
    expect(failures).toEqual([], `${failures.length} discovery algorithms failed fitness/latency/output checks`);
  }, 120000); // 2 minute timeout for all algorithms
});

function formatDiscoveryReport(
  results: Array<{
    algorithm: string;
    latencyMs: number | null;
    fitness: number | null;
    output: string | null;
    pass: boolean;
    reason?: string[];
  }>
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════════════════════╗');
  lines.push('║ DISCOVERY ALGORITHM BENCHMARK REPORT                                         ║');
  lines.push('║ Metrics: Latency (ms) | Fitness | Output                                    ║');
  lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');

  for (const result of results) {
    const status = result.pass ? '✅ PASS' : '❌ FAIL';
    const latencyStr = result.latencyMs ? result.latencyMs.toFixed(2).padStart(8, ' ') : '   ERROR';
    const fitnessStr = result.fitness ? result.fitness.toFixed(2).padStart(5, ' ') : '  N/A';
    const outputStr = (result.output || 'N/A').padEnd(15, ' ');
    const algoStr = result.algorithm.padEnd(20, ' ');

    const line = `║ ${algoStr} │ ${latencyStr}ms │ ${fitnessStr} │ ${outputStr} │ ${status} ║`;
    lines.push(line);

    if (result.reason && result.reason.length > 0) {
      const reasonStr = result.reason.join(' | ');
      lines.push(`║   └─ ${reasonStr.substring(0, 70).padEnd(70, ' ')} ║`);
    }
  }

  lines.push('╠══════════════════════════════════════════════════════════════════════════════╣');

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);

  lines.push(
    `║ Summary: ${passed}/${total} passed (${passRate}%)${' '.repeat(60 - passRate.length - 13)}║`
  );
  lines.push('╚══════════════════════════════════════════════════════════════════════════════╝');
  lines.push('');

  return lines.join('\n');
}

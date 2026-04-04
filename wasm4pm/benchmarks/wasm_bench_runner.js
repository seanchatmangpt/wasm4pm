/**
 * wasm4pm WASM benchmark runner.
 *
 * Spawns one Node.js Worker per algorithm group so all groups run simultaneously.
 * Each worker owns its own WASM linear memory — true parallelism.
 *
 * Usage:
 *   node benchmarks/wasm_bench_runner.js            # full run
 *   node benchmarks/wasm_bench_runner.js --ci       # reduced iterations for CI
 *
 * Prerequisites: `npm run build:nodejs` must have been run first.
 */
'use strict';

const { Worker } = require('worker_threads');
const { writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const CI_MODE = process.argv.includes('--ci');

// ── Algorithm groups — each runs in a separate Worker ───────────────────────

const ALGORITHM_GROUPS = [
  {
    name: 'fast_discovery',
    tasks: [
      { algorithm: 'discover_dfg', sizes: [100, 1_000, 5_000, 10_000], params: {} },
      { algorithm: 'discover_declare', sizes: [100, 1_000, 5_000], params: {} },
      {
        algorithm: 'discover_heuristic_miner',
        sizes: [100, 1_000, 5_000, 10_000],
        params: { threshold: 0.5 },
      },
      {
        algorithm: 'discover_alpha_plus_plus',
        sizes: [100, 1_000, 5_000, 10_000],
        params: { minSupport: 0.1 },
      },
      { algorithm: 'discover_inductive_miner', sizes: [100, 1_000, 5_000, 10_000], params: {} },
      { algorithm: 'discover_hill_climbing', sizes: [100, 1_000, 5_000, 10_000], params: {} },
      {
        algorithm: 'extract_process_skeleton',
        sizes: [100, 1_000, 5_000, 10_000],
        params: { minFreq: 2 },
      },
      { algorithm: 'analyze_event_statistics', sizes: [100, 1_000, 5_000, 10_000], params: {} },
    ],
  },
  {
    name: 'medium_discovery',
    tasks: [
      { algorithm: 'discover_astar', sizes: [100, 1_000, 5_000], params: { maxIter: 500 } },
      {
        algorithm: 'discover_simulated_annealing',
        sizes: [100, 1_000, 5_000],
        params: { temp: 100.0, cooling: 0.95 },
      },
      {
        algorithm: 'discover_ant_colony',
        sizes: [100, 1_000, 5_000],
        params: { ants: 20, iterations: 10 },
      },
      { algorithm: 'analyze_trace_variants', sizes: [100, 1_000, 5_000, 10_000], params: {} },
      {
        algorithm: 'mine_sequential_patterns',
        sizes: [100, 1_000, 5_000],
        params: { minSupport: 0.1, patternLen: 3 },
      },
      { algorithm: 'detect_concept_drift', sizes: [100, 1_000, 5_000], params: { windowSize: 50 } },
      { algorithm: 'cluster_traces', sizes: [100, 1_000, 5_000], params: { numClusters: 5 } },
    ],
  },
  {
    name: 'slow_discovery',
    tasks: [
      {
        algorithm: 'discover_genetic_algorithm',
        sizes: [100, 500, 1_000],
        params: { popSize: 10, generations: 5 },
      },
      {
        algorithm: 'discover_pso_algorithm',
        sizes: [100, 500, 1_000],
        params: { swarm: 10, iterations: 10 },
      },
      { algorithm: 'discover_ilp_petri_net', sizes: [100, 500, 1_000], params: {} },
    ],
  },
  {
    name: 'analytics',
    tasks: [
      { algorithm: 'analyze_variant_complexity', sizes: [100, 1_000, 5_000, 10_000], params: {} },
      {
        algorithm: 'compute_activity_transition_matrix',
        sizes: [100, 1_000, 5_000, 10_000],
        params: {},
      },
      { algorithm: 'detect_rework', sizes: [100, 1_000, 5_000, 10_000], params: {} },
    ],
  },
];

// ── Worker management ────────────────────────────────────────────────────────

function runGroup(group) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, 'wasm_bench_worker.js'), {
      workerData: { tasks: group.tasks, ciMode: CI_MODE },
    });
    worker.on('message', (results) => {
      if (results.error) {
        reject(new Error(`Worker ${group.name}: ${results.error}`));
      } else {
        resolve({ group: group.name, results });
      }
    });
    worker.on('error', (err) => reject(new Error(`Worker ${group.name} error: ${err.message}`)));
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker ${group.name} exited with code ${code}`));
    });
  });
}

// ── Report output ─────────────────────────────────────────────────────────────

function printTable(results) {
  const COL = { algo: 44, size: 10, median: 12, p95: 10 };
  const header = [
    'Algorithm'.padEnd(COL.algo),
    'Cases'.padEnd(COL.size),
    'Median ms'.padEnd(COL.median),
    'p95 ms',
  ].join('');
  console.log('\n' + header);
  console.log('-'.repeat(header.length));

  const sorted = [...results].sort(
    (a, b) => a.algorithm.localeCompare(b.algorithm) || a.size - b.size
  );
  for (const r of sorted) {
    console.log(
      [
        r.algorithm.padEnd(COL.algo),
        String(r.size).padEnd(COL.size),
        r.medianMs.toFixed(2).padEnd(COL.median),
        r.p95Ms.toFixed(2),
      ].join('')
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`wasm4pm WASM Benchmark Runner`);
  console.log(`Mode: ${CI_MODE ? 'CI (reduced iterations)' : 'Full'}`);
  console.log(`Workers: ${ALGORITHM_GROUPS.length} parallel groups`);
  console.log('Starting...\n');

  const startMs = Date.now();

  // All groups run simultaneously
  const groupResults = await Promise.all(ALGORITHM_GROUPS.map(runGroup));

  const totalMs = Date.now() - startMs;
  const allResults = groupResults.flatMap((g) => g.results);

  // Print summary
  printTable(allResults);
  console.log(`\nCompleted ${allResults.length} measurements in ${(totalMs / 1000).toFixed(1)}s`);

  // Write JSON report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsDir = join(__dirname, '..', '..', 'results');
  try {
    mkdirSync(resultsDir, { recursive: true });
  } catch (_) {}

  const report = {
    timestamp: new Date().toISOString(),
    ciMode: CI_MODE,
    totalWallMs: totalMs,
    groups: groupResults.map((g) => g.group),
    results: allResults,
  };

  const reportPath = join(resultsDir, `wasm_bench_${timestamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${reportPath}`);

  // Also write CSV for easy import
  const csvPath = join(resultsDir, `wasm_bench_${timestamp}.csv`);
  const csvHeader = 'algorithm,size,median_ms,min_ms,max_ms,p95_ms,iterations';
  const csvRows = allResults.map((r) =>
    [
      r.algorithm,
      r.size,
      r.medianMs.toFixed(3),
      r.minMs.toFixed(3),
      r.maxMs.toFixed(3),
      r.p95Ms.toFixed(3),
      r.iterations,
    ].join(',')
  );
  writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n') + '\n');
  console.log(`CSV written to:    ${csvPath}`);
}

main().catch((err) => {
  console.error('Benchmark runner failed:', err.message);
  process.exit(1);
});

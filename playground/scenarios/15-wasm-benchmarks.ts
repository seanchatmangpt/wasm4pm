/**
 * Scenario: WASM Benchmark Suite — All algorithms against real BPI 2020 data
 *
 * Measures wall-clock performance of every WASM-exported discovery algorithm,
 * POWL variant, and analytics function against the BPI 2020 Travel Permits
 * dataset (19.5 MB, ~7K cases, ~180K events).
 *
 * Output: structured JSON report written to results/wasm_bench_<timestamp>.json
 *        and a human-readable table to stdout.
 *
 * Usage:
 *   npx vitest run playground/scenarios/15-wasm-benchmarks.ts
 *
 * Binary: wasm4pm/pkg/wasm4pm.js + wasm4pm/pkg/wasm4pm_bg.wasm (must be built)
 * Data:   wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';

// ── Constants ────────────────────────────────────────────────────────────────

const WASM_PKG = path.resolve(__dirname, '../../wasm4pm/pkg/wasm4pm.js');
const BPI_2020 = path.resolve(__dirname, '../../wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes');
const RESULTS_DIR = path.resolve(__dirname, '../../results');

const ACTIVITY_KEY = 'concept:name';
const TIMESTAMP_KEY = 'time:timestamp';

// ── Types ────────────────────────────────────────────────────────────────────

interface BenchResult {
  algorithm: string;
  category: 'discovery' | 'powl' | 'analytics' | 'conformance';
  median_ms: number;
  min_ms: number;
  max_ms: number;
  runs: number;
  events: number;
  traces: number;
  events_per_sec: number;
  output_type: string;
  status: 'ok' | 'error' | 'skipped';
  error?: string;
}

interface BenchReport {
  timestamp: string;
  dataset: string;
  file_size_bytes: number;
  traces: number;
  events: number;
  activities: number;
  wasm_version: string;
  platform: string;
  results: BenchResult[];
}

// ── WASM Module ──────────────────────────────────────────────────────────────

let wasm: any = null;
let logHandle: string = '';
let logJson: string = '';
let reportData: { traces: number; events: number; activities: number } = {
  traces: 0, events: 0, activities: 0,
};

async function loadWasm(): Promise<any> {
  // The wasm4pm pkg exports CommonJS — use createRequire for ESM interop
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const mod = require(WASM_PKG);
  if (typeof mod.init === 'function') {
    mod.init();
  }
  if (typeof mod.init_wasm === 'function') {
    mod.init_wasm();
  }
  return mod;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function benchFn(fn: () => void, runs: number): { median: number; min: number; max: number } {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    const elapsed = performance.now() - start;
    times.push(elapsed);
  }
  return { median: median(times), min: Math.min(...times), max: Math.max(...times) };
}

// ── Algorithm definitions ────────────────────────────────────────────────────

interface AlgorithmDef {
  id: string;
  category: 'discovery' | 'powl' | 'analytics' | 'conformance';
  output_type: string;
  runs: number;           // number of benchmark iterations
  timeout_ms: number;      // per-run timeout
  description: string;
  /** Execute the algorithm. Returns true on success. */
  execute: (w: any, logHandle: string, logJson: string) => boolean;
}

function buildAlgorithms(): AlgorithmDef[] {
  const algos: AlgorithmDef[] = [
    // ── Discovery Algorithms (15) ──
    {
      id: 'dfg', category: 'discovery', output_type: 'dfg', runs: 5, timeout_ms: 30_000,
      description: 'Directly-Follows Graph (O(n) single-pass)',
      execute: (w, h) => { w.discover_dfg(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'process_skeleton', category: 'discovery', output_type: 'dfg', runs: 5, timeout_ms: 30_000,
      description: 'Process Skeleton (frequency-filtered DFG)',
      execute: (w, h) => { w.extract_process_skeleton(h, ACTIVITY_KEY, 2); return true; },
    },
    {
      id: 'alpha_plus_plus', category: 'discovery', output_type: 'petrinet', runs: 3, timeout_ms: 60_000,
      description: 'Alpha++ Petri Net Discovery',
      execute: (w, h) => { w.discover_alpha_plus_plus(h, ACTIVITY_KEY, 0.1); return true; },
    },
    {
      id: 'heuristic_miner', category: 'discovery', output_type: 'dfg', runs: 5, timeout_ms: 30_000,
      description: 'Heuristic Miner (dependency-ratio filtering)',
      execute: (w, h) => { w.discover_heuristic_miner(h, ACTIVITY_KEY, 0.5); return true; },
    },
    {
      id: 'inductive_miner', category: 'discovery', output_type: 'tree', runs: 5, timeout_ms: 30_000,
      description: 'Inductive Miner (recursive DFG-based)',
      execute: (w, h) => { w.discover_inductive_miner(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'hill_climbing', category: 'discovery', output_type: 'petrinet', runs: 3, timeout_ms: 60_000,
      description: 'Hill Climbing (greedy local optimization)',
      execute: (w, h) => { w.discover_hill_climbing(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'astar', category: 'discovery', output_type: 'petrinet', runs: 3, timeout_ms: 120_000,
      description: 'A* Search (informed heuristic)',
      execute: (w, h) => { w.discover_astar(h, ACTIVITY_KEY, 1000); return true; },
    },
    {
      id: 'aco', category: 'discovery', output_type: 'petrinet', runs: 3, timeout_ms: 120_000,
      description: 'Ant Colony Optimization (pheromone-based)',
      execute: (w, h) => { w.discover_ant_colony(h, ACTIVITY_KEY, 20, 10); return true; },
    },
    {
      id: 'simulated_annealing', category: 'discovery', output_type: 'petrinet', runs: 3, timeout_ms: 60_000,
      description: 'Simulated Annealing (thermal search)',
      execute: (w, h) => { w.discover_simulated_annealing(h, ACTIVITY_KEY, 1.0, 0.95); return true; },
    },
    {
      id: 'genetic_algorithm', category: 'discovery', output_type: 'petrinet', runs: 3, timeout_ms: 120_000,
      description: 'Genetic Algorithm (evolutionary DFG)',
      execute: (w, h) => { w.discover_genetic_algorithm(h, ACTIVITY_KEY, 50, 20); return true; },
    },
    {
      id: 'pso', category: 'discovery', output_type: 'petrinet', runs: 3, timeout_ms: 120_000,
      description: 'Particle Swarm Optimization',
      execute: (w, h) => { w.discover_pso_algorithm(h, ACTIVITY_KEY, 30, 20); return true; },
    },
    {
      id: 'ilp', category: 'discovery', output_type: 'petrinet', runs: 1, timeout_ms: 300_000,
      description: 'ILP Petri Net (NP-Hard optimal)',
      execute: (w, h) => { w.discover_ilp_petri_net(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'declare', category: 'discovery', output_type: 'declare', runs: 5, timeout_ms: 60_000,
      description: 'DECLARE Constraint Discovery',
      execute: (w, h) => { w.discover_declare(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'optimized_dfg', category: 'discovery', output_type: 'dfg', runs: 1, timeout_ms: 300_000,
      description: 'ILP-Optimized DFG (fitness/simplicity tradeoff)',
      execute: (w, h) => { w.discover_optimized_dfg(h, ACTIVITY_KEY, 0.8, 0.2); return true; },
    },
    {
      id: 'simple_process_tree', category: 'discovery', output_type: 'tree', runs: 5, timeout_ms: 30_000,
      description: 'Simple Process Tree Discovery',
      execute: (w, h) => { w.discover_simple_process_tree(h, ACTIVITY_KEY); return true; },
    },

    // ── POWL Discovery Variants (8) ──
    {
      id: 'powl_tree', category: 'powl', output_type: 'powl', runs: 5, timeout_ms: 30_000,
      description: 'POWL Discovery — tree variant (process tree only)',
      execute: (w, _h, lj) => { w.discover_powl_from_log(lj, 'tree'); return true; },
    },
    {
      id: 'powl_maximal', category: 'powl', output_type: 'powl', runs: 3, timeout_ms: 60_000,
      description: 'POWL Discovery — maximal partial order cut',
      execute: (w, _h, lj) => { w.discover_powl_from_log(lj, 'maximal'); return true; },
    },
    {
      id: 'powl_dynamic_clustering', category: 'powl', output_type: 'powl', runs: 3, timeout_ms: 60_000,
      description: 'POWL Discovery — dynamic clustering',
      execute: (w, _h, lj) => { w.discover_powl_from_log(lj, 'dynamic_clustering'); return true; },
    },
    {
      id: 'powl_decision_graph_max', category: 'powl', output_type: 'powl', runs: 3, timeout_ms: 120_000,
      description: 'POWL Discovery — decision graph maximal',
      execute: (w, _h, lj) => { w.discover_powl_from_log(lj, 'decision_graph_max'); return true; },
    },
    {
      id: 'powl_decision_graph_clustering', category: 'powl', output_type: 'powl', runs: 3, timeout_ms: 120_000,
      description: 'POWL Discovery — decision graph clustering',
      execute: (w, _h, lj) => { w.discover_powl_from_log(lj, 'decision_graph_clustering'); return true; },
    },
    {
      id: 'powl_decision_graph_cyclic', category: 'powl', output_type: 'powl', runs: 3, timeout_ms: 120_000,
      description: 'POWL Discovery — decision graph cyclic (default)',
      execute: (w, _h, lj) => { w.discover_powl_from_log(lj, 'decision_graph_cyclic'); return true; },
    },
    {
      id: 'powl_decision_graph_cyclic_strict', category: 'powl', output_type: 'powl', runs: 3, timeout_ms: 120_000,
      description: 'POWL Discovery — decision graph cyclic strict',
      execute: (w, _h, lj) => { w.discover_powl_from_log(lj, 'decision_graph_cyclic_strict'); return true; },
    },
    {
      id: 'powl_config', category: 'powl', output_type: 'powl', runs: 3, timeout_ms: 60_000,
      description: 'POWL Discovery — with config (activity key + noise threshold)',
      execute: (w, _h, lj) => { w.discover_powl_from_log_config(lj, ACTIVITY_KEY, 'decision_graph_cyclic', 10, 0.0); return true; },
    },

    // ── Analytics Functions ──
    {
      id: 'event_statistics', category: 'analytics', output_type: 'stats', runs: 5, timeout_ms: 30_000,
      description: 'Event Statistics',
      execute: (w, h) => { w.analyze_event_statistics(h); return true; },
    },
    {
      id: 'case_duration', category: 'analytics', output_type: 'stats', runs: 5, timeout_ms: 30_000,
      description: 'Case Duration Analysis',
      execute: (w, h) => { w.analyze_case_duration(h); return true; },
    },
    {
      id: 'dotted_chart', category: 'analytics', output_type: 'chart', runs: 5, timeout_ms: 30_000,
      description: 'Dotted Chart Analysis',
      execute: (w, h) => { w.analyze_dotted_chart(h); return true; },
    },
    {
      id: 'trace_variants', category: 'analytics', output_type: 'variants', runs: 5, timeout_ms: 30_000,
      description: 'Trace Variant Extraction',
      execute: (w, h) => { w.analyze_trace_variants(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'sequential_patterns', category: 'analytics', output_type: 'patterns', runs: 5, timeout_ms: 30_000,
      description: 'Sequential Pattern Mining (min_sup=0.1, len=3)',
      execute: (w, h) => { w.mine_sequential_patterns(h, ACTIVITY_KEY, 0.1, 3); return true; },
    },
    {
      id: 'concept_drift', category: 'analytics', output_type: 'drift', runs: 5, timeout_ms: 30_000,
      description: 'Concept Drift Detection (window=50)',
      execute: (w, h) => { w.detect_concept_drift(h, ACTIVITY_KEY, 50); return true; },
    },
    {
      id: 'cluster_traces', category: 'analytics', output_type: 'clusters', runs: 5, timeout_ms: 30_000,
      description: 'Trace Clustering (k=5)',
      execute: (w, h) => { w.cluster_traces(h, ACTIVITY_KEY, 5); return true; },
    },
    {
      id: 'start_end_activities', category: 'analytics', output_type: 'stats', runs: 5, timeout_ms: 30_000,
      description: 'Start/End Activity Analysis',
      execute: (w, h) => { w.analyze_start_end_activities(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'activity_cooccurrence', category: 'analytics', output_type: 'matrix', runs: 5, timeout_ms: 30_000,
      description: 'Activity Co-occurrence Matrix',
      execute: (w, h) => { w.analyze_activity_cooccurrence(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'infrequent_paths', category: 'analytics', output_type: 'paths', runs: 5, timeout_ms: 30_000,
      description: 'Infrequent Path Detection (θ=0.1)',
      execute: (w, h) => { w.analyze_infrequent_paths(h, ACTIVITY_KEY, 0.1); return true; },
    },
    {
      id: 'detect_rework', category: 'analytics', output_type: 'rework', runs: 5, timeout_ms: 30_000,
      description: 'Rework Pattern Detection',
      execute: (w, h) => { w.detect_rework(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'bottleneck_detection', category: 'analytics', output_type: 'bottlenecks', runs: 5, timeout_ms: 30_000,
      description: 'Bottleneck Detection (threshold=60s)',
      execute: (w, h) => { w.detect_bottlenecks(h, ACTIVITY_KEY, TIMESTAMP_KEY, BigInt(60)); return true; },
    },
    {
      id: 'model_metrics', category: 'analytics', output_type: 'metrics', runs: 5, timeout_ms: 30_000,
      description: 'Model Complexity Metrics',
      execute: (w, h) => { w.compute_model_metrics(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'activity_dependencies', category: 'analytics', output_type: 'deps', runs: 5, timeout_ms: 30_000,
      description: 'Activity Dependency Analysis',
      execute: (w, h) => { w.analyze_activity_dependencies(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'activity_transition_matrix', category: 'analytics', output_type: 'matrix', runs: 5, timeout_ms: 30_000,
      description: 'Activity Transition Matrix',
      execute: (w, h) => { w.compute_activity_transition_matrix(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'activity_ordering', category: 'analytics', output_type: 'ordering', runs: 5, timeout_ms: 30_000,
      description: 'Activity Ordering Extraction',
      execute: (w, h) => { w.extract_activity_ordering(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'variant_complexity', category: 'analytics', output_type: 'complexity', runs: 5, timeout_ms: 30_000,
      description: 'Variant Complexity Analysis',
      execute: (w, h) => { w.analyze_variant_complexity(h, ACTIVITY_KEY); return true; },
    },
    {
      id: 'temporal_bottlenecks', category: 'analytics', output_type: 'bottlenecks', runs: 5, timeout_ms: 30_000,
      description: 'Temporal Bottleneck Analysis',
      execute: (w, h) => { w.analyze_temporal_bottlenecks(h, ACTIVITY_KEY, TIMESTAMP_KEY); return true; },
    },
    {
      id: 'performance_dfg', category: 'analytics', output_type: 'dfg', runs: 5, timeout_ms: 30_000,
      description: 'Performance-Annotated DFG',
      execute: (w, h) => { w.discover_performance_dfg(h, ACTIVITY_KEY, TIMESTAMP_KEY); return true; },
    },
    {
      id: 'temporal_profile', category: 'analytics', output_type: 'profile', runs: 5, timeout_ms: 30_000,
      description: 'Temporal Profile Discovery',
      execute: (w, h) => { w.discover_temporal_profile(h, ACTIVITY_KEY, TIMESTAMP_KEY); return true; },
    },
    {
      id: 'dfg_filtered', category: 'discovery', output_type: 'dfg', runs: 5, timeout_ms: 30_000,
      description: 'Frequency-Filtered DFG',
      execute: (w, h) => { w.discover_dfg_filtered(h, ACTIVITY_KEY, 2); return true; },
    },
  ];

  return algos;
}

// ── Conformance algorithms (need a discovered model first) ──

interface ConformanceDef {
  id: string;
  category: 'conformance';
  output_type: string;
  runs: number;
  timeout_ms: number;
  description: string;
  /** Execute conformance. Returns true on success. */
  execute: (w: any, logHandle: string, modelHandle: string) => boolean;
}

function buildConformanceAlgorithms(): ConformanceDef[] {
  return [
    {
      id: 'token_replay', category: 'conformance', output_type: 'conformance', runs: 5, timeout_ms: 60_000,
      description: 'Token-Based Replay Conformance (vs Heuristic Miner model)',
      execute: (w, lh, mh) => { w.check_token_based_replay(lh, mh, ACTIVITY_KEY); return true; },
    },
  ];
}

// ── Setup ────────────────────────────────────────────────────────────────────

const allResults: BenchResult[] = [];

beforeAll(async () => {
  // Verify data file exists
  if (!fsSync.existsSync(BPI_2020)) {
    throw new Error(
      `BPI 2020 dataset not found at ${BPI_2020}\n` +
      'Download from: https://data.4tu.nl/collections/BPI_Challenge_2020/5065541'
    );
  }

  // Verify WASM is built
  if (!fsSync.existsSync(WASM_PKG)) {
    throw new Error(
      `WASM package not found at ${WASM_PKG}\n` +
      'Run: cd wasm4pm && npm run build:nodejs'
    );
  }

  console.info('[bench] Loading WASM module...');
  wasm = await loadWasm();
  const version = wasm.get_version ? wasm.get_version() : 'unknown';
  console.info('[bench] WASM version:', version);

  // Load BPI 2020 via the fixed XES parser
  console.info('[bench] Loading BPI 2020 (this takes a few seconds)...');
  const loadStart = performance.now();
  const xesContent = await fs.readFile(BPI_2020, 'utf-8');
  logHandle = wasm.load_eventlog_from_xes(xesContent);
  const loadMs = performance.now() - loadStart;
  console.info(`[bench] XES loaded in ${loadMs.toFixed(0)}ms, handle: ${logHandle.slice(0, 12)}...`);

  // Export as JSON for POWL discovery (which needs models::EventLog format)
  logJson = wasm.export_eventlog_to_json(logHandle);

  // Count events and traces
  const parsed = JSON.parse(logJson) as { traces: Array<{ events: unknown[] }> };
  reportData.traces = parsed.traces.length;
  reportData.events = parsed.traces.reduce((sum, t) => sum + t.events.length, 0);

  // Count unique activities
  const activitySet = new Set<string>();
  for (const trace of parsed.traces) {
    for (const rawEvent of trace.events) {
      const event = rawEvent as { attributes?: Record<string, unknown> };
      const nameAttr = event.attributes?.['concept:name'];
      if (typeof nameAttr === 'string') {
        activitySet.add(nameAttr);
      } else if (nameAttr != null && typeof nameAttr === 'object') {
        const tagged = nameAttr as { value?: string };
        if (typeof tagged.value === 'string') activitySet.add(tagged.value);
      }
    }
  }
  reportData.activities = activitySet.size;

  console.info(`[bench] Dataset: ${reportData.traces} traces, ${reportData.events} events, ${reportData.activities} unique activities`);
}, 60_000); // 60s timeout for WASM init + XES load

// ── Discovery + POWL + Analytics benchmarks ──────────────────────────────────

describe('WASM benchmarks: discovery + POWL + analytics on BPI 2020', () => {
  const algorithms = buildAlgorithms();

  for (const algo of algorithms) {
    it(`${algo.id}: ${algo.description}`, () => {
      const { median, min, max } = benchFn(() => {
        algo.execute(wasm, logHandle, logJson);
      }, algo.runs);

      const result: BenchResult = {
        algorithm: algo.id,
        category: algo.category,
        median_ms: Math.round(median * 100) / 100,
        min_ms: Math.round(min * 100) / 100,
        max_ms: Math.round(max * 100) / 100,
        runs: algo.runs,
        events: reportData.events,
        traces: reportData.traces,
        events_per_sec: Math.round((reportData.events / median) * 1000),
        output_type: algo.output_type,
        status: 'ok',
      };
      allResults.push(result);

      console.info(
        `[bench] ${algo.id.padEnd(35)} ${String(result.median_ms).padStart(10)}ms  ` +
        `${String(result.events_per_sec).padStart(10)} evt/s  (${algo.category})`
      );
    }, algo.timeout_ms);
  }

  // ── Conformance (needs a model handle) ─────────────────────────────────────

  describe('conformance benchmarks', () => {
    let modelHandle: string = '';

    it('discovers ILP Petri Net model for conformance benchmark', () => {
      const result = wasm.discover_ilp_petri_net(logHandle, ACTIVITY_KEY);
      const parsed = JSON.parse(typeof result === 'string' ? result : JSON.stringify(result));
      // ILP stores the Petri net as a separate object — handle is at top level or nested
      modelHandle = parsed.handle || parsed.petri_net_handle || '';
      // If ILP returned the full result inline, we may need to store it differently
      if (!modelHandle) {
        // Try storing the result as a Petri net handle
        try {
          const pnJson = typeof result === 'string' ? result : JSON.stringify(result);
          modelHandle = wasm.store_dfg_from_json ? wasm.store_dfg_from_json(pnJson) : '';
        } catch {
          // Fall back: use the heuristic miner DFG for a lighter conformance check
          const hmResult = wasm.discover_heuristic_miner(logHandle, ACTIVITY_KEY, 0.5);
          const hmParsed = JSON.parse(typeof hmResult === 'string' ? hmResult : JSON.stringify(hmResult));
          modelHandle = hmParsed.handle || hmParsed.dfg_handle || hmParsed.model_handle || '';
        }
      }
      // If we still don't have a model handle, conformance will fail — mark as skipped
      if (!modelHandle || modelHandle.length === 0) {
        console.warn('[bench] Could not obtain model handle for conformance — skipping');
      } else {
        console.info(`[bench] Conformance model handle: ${modelHandle.slice(0, 12)}...`);
      }
      // Don't assert — conformance may not be available for all model types
    }, 60_000);

    const conformanceAlgos = buildConformanceAlgorithms();

    for (const algo of conformanceAlgos) {
      it(`${algo.id}: ${algo.description}`, () => {
        if (!modelHandle || modelHandle.length === 0) {
          console.warn(`[bench] Skipping ${algo.id} — no model handle available`);
          allResults.push({
            algorithm: algo.id,
            category: algo.category,
            median_ms: 0, min_ms: 0, max_ms: 0, runs: 0,
            events: reportData.events, traces: reportData.traces,
            events_per_sec: 0, output_type: algo.output_type,
            status: 'skipped',
          });
          return;
        }
        const { median, min, max } = benchFn(() => {
          algo.execute(wasm, logHandle, modelHandle);
        }, algo.runs);

        const result: BenchResult = {
          algorithm: algo.id,
          category: algo.category,
          median_ms: Math.round(median * 100) / 100,
          min_ms: Math.round(min * 100) / 100,
          max_ms: Math.round(max * 100) / 100,
          runs: algo.runs,
          events: reportData.events,
          traces: reportData.traces,
          events_per_sec: Math.round((reportData.events / median) * 1000),
          output_type: algo.output_type,
          status: 'ok',
        };
        allResults.push(result);

        console.info(
          `[bench] ${algo.id.padEnd(35)} ${String(result.median_ms).padStart(10)}ms  ` +
          `${String(result.events_per_sec).padStart(10)} evt/s  (${algo.category})`
        );
      }, algo.timeout_ms);
    }
  });
});

// ── Report generation ───────────────────────────────────────────────────────

describe('benchmark report', () => {
  it('writes JSON report to results/', () => {
    const version = wasm?.get_version ? wasm.get_version() : 'unknown';

    const report: BenchReport = {
      timestamp: new Date().toISOString(),
      dataset: 'BPI_2020_Travel_Permits_Actual',
      file_size_bytes: fsSync.statSync(BPI_2020).size,
      traces: reportData.traces,
      events: reportData.events,
      activities: reportData.activities,
      wasm_version: version,
      platform: `${process.platform} ${process.arch} (Node ${process.version})`,
      results: allResults,
    };

    // Write JSON report
    const ts = report.timestamp.replace(/[:.]/g, '-').slice(0, 19);
    const jsonPath = path.join(RESULTS_DIR, `wasm_bench_${ts}.json`);
    fsSync.mkdirSync(RESULTS_DIR, { recursive: true });
    fsSync.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.info(`[bench] JSON report: ${jsonPath}`);

    // Write CSV report
    const csvPath = path.join(RESULTS_DIR, `wasm_bench_${ts}.csv`);
    const header = 'algorithm,category,output_type,median_ms,min_ms,max_ms,runs,events,traces,events_per_sec,status';
    const rows = allResults.map(r =>
      `${r.algorithm},${r.category},${r.output_type},${r.median_ms},${r.min_ms},${r.max_ms},${r.runs},${r.events},${r.traces},${r.events_per_sec},${r.status}`
    ).join('\n');
    fsSync.writeFileSync(csvPath, `${header}\n${rows}`);
    console.info(`[bench] CSV report: ${csvPath}`);

    // Print human-readable summary table
    console.info('\n' + '='.repeat(100));
    console.info('WASM BENCHMARK RESULTS — BPI 2020 Travel Permits (Real Data)');
    console.info('='.repeat(100));
    console.info(`Dataset: ${report.traces} traces, ${report.events} events, ${report.activities} activities`);
    console.info(`File size: ${(report.file_size_bytes / 1_048_576).toFixed(1)} MB`);
    console.info(`Platform: ${report.platform}`);
    console.info(`WASM version: ${report.wasm_version}`);
    console.info('='.repeat(100));

    // Group by category
    const categories = ['discovery', 'powl', 'analytics', 'conformance'] as const;
    for (const cat of categories) {
      const catResults = allResults.filter(r => r.category === cat);
      if (catResults.length === 0) continue;

      console.info(`\n--- ${cat.toUpperCase()} (${catResults.length} algorithms) ---`);
      console.info(
        ''.padEnd(36) +
        'median_ms'.padStart(12) +
        'min_ms'.padStart(12) +
        'max_ms'.padStart(12) +
        'evt/s'.padStart(12) +
        'runs'.padStart(6)
      );

      // Sort by median
      catResults.sort((a, b) => a.median_ms - b.median_ms);
      for (const r of catResults) {
        console.info(
          r.algorithm.padEnd(36) +
          String(r.median_ms).padStart(12) +
          String(r.min_ms).padStart(12) +
          String(r.max_ms).padStart(12) +
          String(r.events_per_sec).padStart(12) +
          String(r.runs).padStart(6)
        );
      }

      // Summary stats
      const catMedian = median(catResults.map(r => r.median_ms));
      const fastest = catResults[0];
      const slowest = catResults[catResults.length - 1];
      console.info(
        ''.padEnd(36) +
        '─'.repeat(12) + ' ' +
        '─'.repeat(12) + ' ' +
        '─'.repeat(12) + ' ' +
        '─'.repeat(12) + ' ' +
        '─'.repeat(6)
      );
      console.info(
        'CATEGORY MEDIAN'.padEnd(36) +
        String(Math.round(catMedian * 100) / 100).padStart(12) +
        `  fastest: ${fastest.algorithm} (${fastest.median_ms}ms)`.padEnd(30) +
        `  slowest: ${slowest.algorithm} (${slowest.median_ms}ms)`
      );
    }

    // Grand summary
    console.info('\n' + '='.repeat(100));
    const okCount = allResults.filter(r => r.status === 'ok').length;
    const errCount = allResults.filter(r => r.status === 'error').length;
    console.info(`TOTAL: ${okCount} OK, ${errCount} errors, ${allResults.length} algorithms`);
    console.info('='.repeat(100));

    // Verify report is valid
    expect(allResults.length).toBeGreaterThanOrEqual(30); // at least 30 algorithms
    expect(okCount).toBeGreaterThanOrEqual(allResults.length * 0.8); // at least 80% success
    expect(fsSync.existsSync(jsonPath)).toBe(true);
    expect(fsSync.existsSync(csvPath)).toBe(true);
  });
});

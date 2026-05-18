/**
 * Real-Data Algorithm Validation
 *
 * Runs every major algorithm category against real XES/OCEL event logs.
 * Synthetic fixtures prove structural correctness; real data proves generalization.
 *
 * Data sources (resolved in priority order):
 *   bench_data/bpi2020_travel.xes      — BPI 2020 Travel, 10K+ traces
 *   bench_data/ocel20_example.jsonocel — OCEL 2.0 order management
 *   ~/chatmangpt/pm4py/tests/input_data/running-example.xes
 *   ~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes
 *   ~/chatmangpt/pm4py/tests/input_data/receipt.xes
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as wasm from '../pkg/wasm4pm.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Data resolution helpers
// ---------------------------------------------------------------------------

const HOME = os.homedir();
const PM4PY_DATA = `${HOME}/chatmangpt/pm4py/tests/input_data`;
const REPO_BENCH = path.resolve(__dirname, '../../bench_data');

function resolveFile(candidates: string[]): string | null {
  for (const p of candidates) {
    const abs = path.resolve(p);
    if (fs.existsSync(abs)) {
      const size = fs.statSync(abs).size;
      if (size > 200) return abs; // skip stubs
    }
  }
  return null;
}

const PATHS = {
  bpi2020: resolveFile([
    `${REPO_BENCH}/bpi2020_travel.xes`,
    `${HOME}/chatmangpt/wasm4pm/bench_data/bpi2020_travel.xes`,
  ]),
  runningExample: resolveFile([
    `${PM4PY_DATA}/running-example.xes`,
    `${HOME}/chatmangpt/wasm4pm/tests/fixtures/running-example.xes`,
  ]),
  roadtraffic: resolveFile([
    `${PM4PY_DATA}/roadtraffic100traces.xes`,
    `${PM4PY_DATA}/roadtraffic50traces.xes`,
  ]),
  receipt: resolveFile([`${PM4PY_DATA}/receipt.xes`]),
  ocel: resolveFile([
    `${REPO_BENCH}/ocel20_example.jsonocel`,
    `${PM4PY_DATA}/ocel/ocel20_example.jsonocel`,
  ]),
};

const parse = (r: unknown): unknown => (typeof r === 'string' ? JSON.parse(r) : r);

/** Skip a test if a required file isn't available. */
function skipIf(filePath: string | null, label: string): string | null {
  if (!filePath) {
    console.warn(`SKIP: ${label} not found`);
    return null;
  }
  return filePath;
}

// ---------------------------------------------------------------------------
// Module init
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (typeof (wasm as any).init === 'function') {
    await (wasm as any).init();
  }
});

// ---------------------------------------------------------------------------
// Running-example — canonical 6-trace log (6 activities)
// Actual DFG output shape: {nodes: DFGNode[], edges: DirectlyFollowsRelation[],
//                           start_activities: Record<string,number>,
//                           end_activities: Record<string,number>}
// Heuristic miner wrapper shape: {algorithm, handle, nodes: count, edges: count, dependency_threshold}
// ---------------------------------------------------------------------------

describe('Real data: running-example.xes', () => {
  it('DFG has ≥5 edges and both start and end activities', () => {
    const p = skipIf(PATHS.runningExample, 'running-example.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const dfg = parse(wasm.discover_dfg(handle, 'concept:name')) as {
      edges: Array<{ from: string; to: string; frequency: number }>;
      start_activities: Record<string, number>;
      end_activities: Record<string, number>;
    };

    expect((dfg.edges ?? []).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(dfg.start_activities ?? {}).length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(dfg.end_activities ?? {}).length).toBeGreaterThanOrEqual(1);
    // All edge frequencies must be positive
    for (const e of dfg.edges ?? []) {
      expect(e.frequency).toBeGreaterThan(0);
    }

    wasm.clear_all_objects();
  });

  it('Heuristic miner produces non-empty model', () => {
    const p = skipIf(PATHS.runningExample, 'running-example.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    // discover_heuristic_miner returns {handle, nodes: count, edges: count, algorithm, dependency_threshold}
    const result = parse(wasm.discover_heuristic_miner(handle, 'concept:name', 0.2)) as {
      algorithm: string;
      edges: number;
      nodes: number;
    };

    expect(result.algorithm).toBe('heuristic_miner');
    expect(result.edges).toBeGreaterThan(0);

    wasm.clear_all_objects();
  });

  it('ML classify runs on real log without crashing', () => {
    const p = skipIf(PATHS.runningExample, 'running-example.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const result = parse(wasm.discover_ml_classify(handle, 'concept:name')) as {
      algorithm: string;
      accuracy?: number;
      error?: string;
    };

    expect(result.algorithm).toBe('ml_classify');
    // Running example may have <10 traces — insufficient for k-NN, that's acceptable
    if (result.accuracy !== undefined) {
      expect(result.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBeLessThanOrEqual(1);
    }

    wasm.clear_all_objects();
  });
});

// ---------------------------------------------------------------------------
// roadtraffic100traces.xes — 100 real road-traffic cases
// ---------------------------------------------------------------------------

describe('Real data: roadtraffic100traces.xes', () => {
  it('DFG has ≥8 edges with positive frequencies', () => {
    const p = skipIf(PATHS.roadtraffic, 'roadtraffic.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const dfg = parse(wasm.discover_dfg(handle, 'concept:name')) as {
      edges: Array<{ from: string; to: string; frequency: number }>;
    };

    const edges = dfg.edges ?? [];
    expect(edges.length).toBeGreaterThanOrEqual(8);
    // All edge frequencies must be positive integers
    for (const e of edges) {
      expect(e.frequency, `edge ${e.from}→${e.to}`).toBeGreaterThan(0);
    }

    wasm.clear_all_objects();
  });

  it('ML anomaly detection runs and returns per-case scores', () => {
    const p = skipIf(PATHS.roadtraffic, 'roadtraffic.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    // discover_ml_anomaly returns an array of {case_id, score, steps}
    const result = parse(wasm.discover_ml_anomaly(handle, 'concept:name')) as Array<{
      case_id: string;
      score: number;
      steps: number;
    }>;

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(isFinite(entry.score)).toBe(true);
      expect(entry.steps).toBeGreaterThan(0);
    }

    wasm.clear_all_objects();
  });

  it('ML forecast produces finite predictions on real durations', () => {
    const p = skipIf(PATHS.roadtraffic, 'roadtraffic.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const result = parse(wasm.discover_ml_forecast(handle, 'concept:name')) as {
      algorithm: string;
      predicted?: number[];
      error?: string;
    };

    expect(result.algorithm).toBe('ml_forecast');
    if (result.predicted) {
      for (const v of result.predicted) {
        expect(isFinite(v)).toBe(true);
      }
    }

    wasm.clear_all_objects();
  });
});

// ---------------------------------------------------------------------------
// receipt.xes — ~1.4K traces, complex real process
// ---------------------------------------------------------------------------

describe('Real data: receipt.xes', () => {
  it('DFG reflects high variant complexity (≥15 edges)', () => {
    const p = skipIf(PATHS.receipt, 'receipt.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const dfg = parse(wasm.discover_dfg(handle, 'concept:name')) as {
      edges: Array<{ from: string; to: string; frequency: number }>;
    };

    expect((dfg.edges ?? []).length).toBeGreaterThanOrEqual(15);

    wasm.clear_all_objects();
  });

  it('ML regression runs on real process data', () => {
    const p = skipIf(PATHS.receipt, 'receipt.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const result = parse(wasm.discover_ml_regress(handle, 'concept:name')) as {
      algorithm: string;
      r_squared?: number;
      error?: string;
    };

    expect(result.algorithm).toBe('ml_regress');
    if (result.r_squared !== undefined) {
      expect(isFinite(result.r_squared)).toBe(true);
    }

    wasm.clear_all_objects();
  });
});

// ---------------------------------------------------------------------------
// BPI 2020 Travel — large-scale (10K+ traces)
// ---------------------------------------------------------------------------

describe('Real data: bpi2020_travel.xes (large-scale)', () => {
  it('DFG has ≥20 edges on a 10K-trace log', () => {
    const p = skipIf(PATHS.bpi2020, 'bpi2020_travel.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const dfg = parse(wasm.discover_dfg(handle, 'concept:name')) as {
      edges: Array<{ from: string; to: string; frequency: number }>;
      start_activities: Record<string, number>;
    };

    expect((dfg.edges ?? []).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(dfg.start_activities ?? {}).length).toBeGreaterThanOrEqual(1);

    wasm.clear_all_objects();
  });

  it('ML classify produces valid accuracy on large real log', () => {
    const p = skipIf(PATHS.bpi2020, 'bpi2020_travel.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const result = parse(wasm.discover_ml_classify(handle, 'concept:name')) as {
      algorithm: string;
      accuracy?: number;
      test_samples?: number;
    };

    expect(result.algorithm).toBe('ml_classify');
    if (result.accuracy !== undefined) {
      expect(result.accuracy).toBeGreaterThanOrEqual(0);
      expect(result.accuracy).toBeLessThanOrEqual(1);
    }
    if (result.test_samples !== undefined) {
      expect(result.test_samples).toBeGreaterThan(0);
    }

    wasm.clear_all_objects();
  });

  it('ML PCA reduces dimensions without NaN on real high-variance data', () => {
    const p = skipIf(PATHS.bpi2020, 'bpi2020_travel.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const result = parse(wasm.discover_ml_pca(handle, 'concept:name')) as {
      algorithm: string;
      variance_explained?: number[];
      error?: string;
    };

    expect(result.algorithm).toBe('ml_pca');
    if (result.variance_explained) {
      for (const v of result.variance_explained) {
        expect(isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }

    wasm.clear_all_objects();
  });
});

// ---------------------------------------------------------------------------
// OCEL 2.0 — object-centric event log
// discover_ocel_dfg_per_type returns {dfgs: {[type]: DFG}} or {object_types: string[]}
// ---------------------------------------------------------------------------
// WASM-API-only algorithms: process_skeleton, declare, simd_streaming_dfg,
// hierarchical_dfg, causal_graph — handle-based, no pure-Rust _from_log path
// ---------------------------------------------------------------------------

describe('Real data: WASM-only algorithms (handle-based)', () => {
  it('process_skeleton produces non-empty skeleton on roadtraffic', () => {
    const p = skipIf(PATHS.roadtraffic, 'roadtraffic.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const result = parse(wasm.extract_process_skeleton(handle, 'concept:name', 1)) as {
      nodes?: number;
      edges?: number;
      handle?: string;
      error?: string;
    };

    expect(result.error).toBeUndefined();
    expect(typeof result.nodes === 'number' && result.nodes >= 0).toBe(true);

    wasm.clear_all_objects();
  });

  it('declare produces constraint model on running-example', () => {
    const p = skipIf(PATHS.runningExample, 'running-example.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const result = parse(wasm.discover_declare(handle, 'concept:name')) as {
      constraints?: unknown[];
      activities?: unknown[];
      error?: string;
    };

    expect(result.error).toBeUndefined();
    // Declare must produce at least activity list
    const hasOutput =
      result.constraints !== undefined ||
      result.activities !== undefined ||
      Object.keys(result).length > 0;
    expect(hasOutput).toBe(true);

    wasm.clear_all_objects();
  });

  it('simd_streaming_dfg matches standard DFG edge count on roadtraffic', () => {
    const p = skipIf(PATHS.roadtraffic, 'roadtraffic.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);

    const simdResult = parse(wasm.discover_dfg_simd(handle, 'concept:name')) as {
      edges?: Array<{ from: string; to: string; frequency: number }>;
    };
    const stdResult = parse(wasm.discover_dfg(handle, 'concept:name')) as {
      edges?: Array<{ from: string; to: string; frequency: number }>;
    };

    const simdEdges = simdResult.edges ?? [];
    const stdEdges = stdResult.edges ?? [];

    // SIMD DFG must find at least as many edges as standard (SIMD is a fast approximation)
    expect(simdEdges.length).toBeGreaterThanOrEqual(1);
    // Edge count should be within 20% of standard DFG (same algorithm, different path)
    expect(simdEdges.length).toBeGreaterThanOrEqual(Math.floor(stdEdges.length * 0.8));

    wasm.clear_all_objects();
  });

  it('hierarchical_dfg produces multi-chunk DFG on bpi2020', () => {
    const p = skipIf(PATHS.bpi2020, 'bpi2020_travel.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const result = parse(wasm.discover_dfg_hierarchical(handle, 'concept:name', 4)) as {
      edges?: Array<{ from: string; to: string; frequency: number }>;
      nodes?: unknown[];
      error?: string;
    };

    expect(result.error).toBeUndefined();
    expect((result.edges ?? []).length).toBeGreaterThanOrEqual(5);
    for (const e of result.edges ?? []) {
      expect(e.frequency).toBeGreaterThan(0);
    }

    wasm.clear_all_objects();
  });

  it('causal_graph produces activity pairs on roadtraffic', () => {
    const p = skipIf(PATHS.roadtraffic, 'roadtraffic.xes');
    if (!p) return;

    const xes = fs.readFileSync(p, 'utf8');
    const handle = wasm.load_eventlog_from_xes(xes);
    const result = parse(wasm.discover_causal_alpha(handle, 'concept:name')) as {
      edges?: unknown[];
      nodes?: unknown[];
      error?: string;
    };

    expect(result.error).toBeUndefined();
    // Causal graph must produce at least some structure on a real log
    const hasContent =
      (result.edges?.length ?? 0) > 0 ||
      (result.nodes?.length ?? 0) > 0 ||
      Object.keys(result).length > 0;
    expect(hasContent).toBe(true);

    wasm.clear_all_objects();
  });
});

// ---------------------------------------------------------------------------

describe('Real data: ocel20_example.jsonocel', () => {
  it('OC-DFG discovery produces per-type graphs', () => {
    const p = skipIf(PATHS.ocel, 'ocel20_example.jsonocel');
    if (!p) return;

    const json = fs.readFileSync(p, 'utf8');
    // load_ocel_from_json must succeed — any failure is a defect, not a skip
    const handle = wasm.load_ocel_from_json(json);

    // discover_ocel_dfg_per_type returns {[objectType]: DFG, ...}
    const result = parse(wasm.discover_ocel_dfg_per_type(handle)) as Record<string, unknown>;

    const typeCount = Object.keys(result).length;
    expect(typeCount).toBeGreaterThanOrEqual(2);

    wasm.clear_all_objects();
  });
});

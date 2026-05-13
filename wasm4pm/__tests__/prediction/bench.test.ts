/**
 * Consolidated Prediction Benchmark Tests
 *
 * Covers all 6 Van der Aalst prediction perspectives:
 *   - Next Activity  ("What happens next?")
 *   - Score / Likelihood  (sub-perspective of Next Activity)
 *   - Remaining Time  ("When will this case complete?")
 *   - Outcome  ("Does this case complete normally?")
 *   - Drift  ("Has the process changed?")
 *   - Features  ("What describes this case?")
 *   - Resource  ("What should we do?")
 *
 * All WASM state is loaded once in beforeAll. XES fixtures are read
 * synchronously at module level.  Handles are rebuilt per describe block
 * so that clear_all_objects() between tests does not invalidate them.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  readXes,
  countTraces,
  printTable,
  BenchRow,
  SAMPLE_XES,
  BPI_XES,
} from './bench-helpers.js';

// ─── Module-level fixtures (sync FS reads, not WASM handles) ─────────────────

const SAMPLE = readXes(SAMPLE_XES);
const SAMPLE_TRACES = countTraces(SAMPLE);
let BPI: string, BPI_TRACES: number;
try {
  BPI = readXes(BPI_XES);
  BPI_TRACES = countTraces(BPI);
} catch {
  BPI = '';
  BPI_TRACES = 0;
}

// ─── Shared WASM module ───────────────────────────────────────────────────────

let wasm: any;
const rows: BenchRow[] = [];

beforeAll(async () => {
  wasm = await import('../../pkg/wasm4pm.js');
  wasm.init();
});

afterAll(() => printTable(rows));

// ═══════════════════════════════════════════════════════════════════════════════
// Next Activity — predict_next_activity
// ═══════════════════════════════════════════════════════════════════════════════

describe('predict_next_activity', () => {
  it('sample — structure, probability sum ≤1, and 1k latency', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);

    // structure check
    const t1 = performance.now();
    const result = JSON.parse(wasm.predict_next_activity(model, JSON.stringify(['Request'])));
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('activity');
    expect(result[0]).toHaveProperty('probability');
    rows.push({
      algorithm: 'predict_next_activity',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur1,
      note: `top=${result[0]?.activity}`,
    });

    // probability sum
    const total = result.reduce((s: number, r: any) => s + r.probability, 0);
    expect(total).toBeCloseTo(1.0, 5);

    // 1k latency
    const prefix = JSON.stringify(['Request', 'Review']);
    const t2 = performance.now();
    for (let i = 0; i < 1000; i++) wasm.predict_next_activity(model, prefix);
    const perCall = Number(((performance.now() - t2) / 1000).toFixed(4));
    rows.push({
      algorithm: 'predict_next_activity(1k)',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: perCall,
      note: 'ms/call',
    });
    expect(perCall).toBeLessThan(5);
  });

  it('BPI 2020 — single-step prediction', () => {
    if (!BPI) return;
    const log = wasm.load_eventlog_from_xes(BPI);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const prefix = JSON.stringify(['Declaration SUBMITTED by EMPLOYEE']);
    const t = performance.now();
    const result = JSON.parse(wasm.predict_next_activity(model, prefix));
    const dur = Number((performance.now() - t).toFixed(3));
    rows.push({
      algorithm: 'predict_next_activity',
      dataset: 'BPI2020',
      traces: BPI_TRACES,
      durationMs: dur,
      note: `top=${result[0]?.activity}`,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Next Activity — score_trace_likelihood
// ═══════════════════════════════════════════════════════════════════════════════

describe('score_trace_likelihood', () => {
  it('sample — negative log-probability, normal > anomalous, and 1k latency', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const normalTrace = JSON.stringify(['Request', 'Review', 'Approve', 'Complete']);

    // type and sign
    const t1 = performance.now();
    const score = wasm.score_trace_likelihood(model, normalTrace);
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(typeof score).toBe('number');
    expect(score).toBeLessThan(0);
    rows.push({
      algorithm: 'score_trace_likelihood',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur1,
      note: `ll=${score?.toFixed(3)}`,
    });

    // normal vs anomalous
    const anomal = wasm.score_trace_likelihood(
      model,
      JSON.stringify(['Complete', 'Approve', 'Review', 'Request'])
    );
    expect(score).toBeGreaterThan(anomal);

    // 1k latency
    const t2 = performance.now();
    for (let i = 0; i < 1000; i++) wasm.score_trace_likelihood(model, normalTrace);
    const perCall = Number(((performance.now() - t2) / 1000).toFixed(4));
    rows.push({
      algorithm: 'score_trace_likelihood(1k)',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: perCall,
      note: 'ms/call',
    });
    expect(perCall).toBeLessThan(5);
  });

  it('BPI 2020 — score a known process sequence', () => {
    if (!BPI) return;
    const log = wasm.load_eventlog_from_xes(BPI);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const trace = JSON.stringify([
      'Declaration SUBMITTED by EMPLOYEE',
      'Declaration APPROVED by ADMINISTRATION',
      'Declaration FINAL_APPROVED by SUPERVISOR',
    ]);
    const t = performance.now();
    const score = wasm.score_trace_likelihood(model, trace);
    const dur = Number((performance.now() - t).toFixed(3));
    rows.push({
      algorithm: 'score_trace_likelihood',
      dataset: 'BPI2020',
      traces: BPI_TRACES,
      durationMs: dur,
      note: `ll=${score?.toFixed(3)}`,
    });
    expect(typeof score).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Next Activity — predict_next_k
// ═══════════════════════════════════════════════════════════════════════════════

describe('predict_next_k', () => {
  it('sample — top-3 structure and 1k latency', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);

    const t1 = performance.now();
    const result = JSON.parse(wasm.predict_next_k(model, JSON.stringify(['Request']), 3));
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(result.activities.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result).toHaveProperty('entropy');
    rows.push({
      algorithm: 'predict_next_k(k=3)',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur1,
      note: `top=${result.activities[0]}`,
    });

    const prefix = JSON.stringify(['Request', 'Review']);
    const t2 = performance.now();
    for (let i = 0; i < 1000; i++) wasm.predict_next_k(model, prefix, 3);
    const perCall = Number(((performance.now() - t2) / 1000).toFixed(4));
    rows.push({
      algorithm: 'predict_next_k(1k)',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: perCall,
      note: 'ms/call',
    });
    expect(perCall).toBeLessThan(5);
  });

  it('BPI 2020 — 1 000 calls throughput', () => {
    if (!BPI) return;
    const log = wasm.load_eventlog_from_xes(BPI);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const prefix = JSON.stringify(['Declaration SUBMITTED by EMPLOYEE']);
    const t = performance.now();
    for (let i = 0; i < 1000; i++) wasm.predict_next_k(model, prefix, 3);
    const perCall = Number(((performance.now() - t) / 1000).toFixed(4));
    rows.push({
      algorithm: 'predict_next_k(1k)',
      dataset: 'BPI2020',
      traces: BPI_TRACES,
      durationMs: perCall,
      note: 'ms/call',
    });
    expect(perCall).toBeLessThan(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Next Activity — predict_beam_paths
// ═══════════════════════════════════════════════════════════════════════════════

describe('predict_beam_paths', () => {
  it('sample — beam=3 steps=4, paths sorted by probability', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const t = performance.now();
    const result = JSON.parse(wasm.predict_beam_paths(model, JSON.stringify(['Request']), 3, 4));
    const dur = Number((performance.now() - t).toFixed(3));
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 1) {
      expect(result[0].probability).toBeGreaterThanOrEqual(result[1].probability);
    }
    rows.push({
      algorithm: 'predict_beam_paths(w=3,s=4)',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur,
      note: `${result.length} paths`,
    });
  });

  it('BPI 2020 — beam=5 steps=5', () => {
    if (!BPI) return;
    const log = wasm.load_eventlog_from_xes(BPI);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const prefix = JSON.stringify(['Declaration SUBMITTED by EMPLOYEE']);
    const t = performance.now();
    const result = JSON.parse(wasm.predict_beam_paths(model, prefix, 5, 5));
    const dur = Number((performance.now() - t).toFixed(3));
    rows.push({
      algorithm: 'predict_beam_paths(w=5,s=5)',
      dataset: 'BPI2020',
      traces: BPI_TRACES,
      durationMs: dur,
      note: `${result.length} paths`,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Remaining Time — build_remaining_time_model
// ═══════════════════════════════════════════════════════════════════════════════

describe('build_remaining_time_model', () => {
  it('sample — build latency', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const t = performance.now();
    wasm.build_remaining_time_model(log, 'concept:name', 'time:timestamp');
    const dur = Number((performance.now() - t).toFixed(3));
    rows.push({
      algorithm: 'build_remaining_time_model',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur,
    });
    expect(dur).toBeLessThan(1000);
  });

  it('BPI 2020 — build latency', () => {
    if (!BPI) return;
    const log = wasm.load_eventlog_from_xes(BPI);
    const t = performance.now();
    wasm.build_remaining_time_model(log, 'concept:name', 'time:timestamp');
    const dur = Number((performance.now() - t).toFixed(3));
    rows.push({
      algorithm: 'build_remaining_time_model',
      dataset: 'BPI2020',
      traces: BPI_TRACES,
      durationMs: dur,
    });
    expect(dur).toBeLessThan(30000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Remaining Time — predict_case_duration
// ═══════════════════════════════════════════════════════════════════════════════

describe('predict_case_duration', () => {
  it('sample — two-activity prefix and 1k latency', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const model = wasm.build_remaining_time_model(log, 'concept:name', 'time:timestamp');

    const t1 = performance.now();
    const result = JSON.parse(
      wasm.predict_case_duration(model, JSON.stringify(['Request', 'Review']))
    );
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(result).toHaveProperty('remaining_ms');
    expect(result).toHaveProperty('confidence');
    expect(result.remaining_ms).toBeGreaterThanOrEqual(0);
    rows.push({
      algorithm: 'predict_case_duration',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur1,
      note: `method=${result.method}`,
    });

    const prefix = JSON.stringify(['Request']);
    const t2 = performance.now();
    for (let i = 0; i < 1000; i++) wasm.predict_case_duration(model, prefix);
    const perCall = Number(((performance.now() - t2) / 1000).toFixed(4));
    rows.push({
      algorithm: 'predict_case_duration(1k)',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: perCall,
      note: 'ms/call',
    });
    expect(perCall).toBeLessThan(5);
  });

  it('BPI 2020 — real prefix remaining time', () => {
    if (!BPI) return;
    const log = wasm.load_eventlog_from_xes(BPI);
    const model = wasm.build_remaining_time_model(log, 'concept:name', 'time:timestamp');
    const prefix = JSON.stringify([
      'Declaration SUBMITTED by EMPLOYEE',
      'Declaration APPROVED by ADMINISTRATION',
    ]);
    const t = performance.now();
    const result = JSON.parse(wasm.predict_case_duration(model, prefix));
    const dur = Number((performance.now() - t).toFixed(3));
    const remainingH = (result.remaining_ms ?? 0) / 3_600_000;
    rows.push({
      algorithm: 'predict_case_duration',
      dataset: 'BPI2020',
      traces: BPI_TRACES,
      durationMs: dur,
      note: `${remainingH.toFixed(1)}h remaining`,
    });
    expect(result.remaining_ms).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Remaining Time — predict_hazard_rate
// ═══════════════════════════════════════════════════════════════════════════════

describe('predict_hazard_rate', () => {
  it('sample — Weibull h(t) at 2h elapsed and 1k latency', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const model = wasm.build_remaining_time_model(log, 'concept:name', 'time:timestamp');

    const t1 = performance.now();
    const result = JSON.parse(wasm.predict_hazard_rate(model, 7_200_000));
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(result).toHaveProperty('hazard_rate');
    expect(result).toHaveProperty('survival_probability');
    expect(result.survival_probability).toBeGreaterThanOrEqual(0);
    expect(result.survival_probability).toBeLessThanOrEqual(1);
    rows.push({
      algorithm: 'predict_hazard_rate',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur1,
      note: `h(2h)=${result.hazard_rate?.toFixed(6)}`,
    });

    const t2 = performance.now();
    for (let i = 0; i < 1000; i++) wasm.predict_hazard_rate(model, i * 3_600_000);
    const perCall = Number(((performance.now() - t2) / 1000).toFixed(4));
    rows.push({
      algorithm: 'predict_hazard_rate(1k)',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: perCall,
      note: 'ms/call',
    });
    expect(perCall).toBeLessThan(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome — score_anomaly
// ═══════════════════════════════════════════════════════════════════════════════

describe('score_anomaly', () => {
  it('sample — normal trace [0,1], all-missing-edges trace is anomalous, and 1k latency', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const dfg = wasm.discover_dfg_simd_handle(log, 'concept:name');

    // normal trace
    const t1 = performance.now();
    const result = JSON.parse(
      wasm.score_anomaly(dfg, JSON.stringify(['Request', 'Review', 'Approve', 'Complete']))
    );
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result).toHaveProperty('is_anomalous');
    rows.push({
      algorithm: 'score_anomaly',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur1,
      note: `score=${result.score?.toFixed(3)} anomalous=${result.is_anomalous}`,
    });

    // all-missing-edges trace
    const anomResult = JSON.parse(
      wasm.score_anomaly(dfg, JSON.stringify(['ZZZ_X', 'ZZZ_Y', 'ZZZ_Z']))
    );
    expect(anomResult.is_anomalous).toBe(true);
    expect(anomResult.score).toBeGreaterThan(0.7);

    // 1k latency
    const trace = JSON.stringify(['Request', 'Review', 'Approve', 'Complete']);
    const t2 = performance.now();
    for (let i = 0; i < 1000; i++) wasm.score_anomaly(dfg, trace);
    const perCall = Number(((performance.now() - t2) / 1000).toFixed(4));
    rows.push({
      algorithm: 'score_anomaly(1k)',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: perCall,
      note: 'ms/call',
    });
    expect(perCall).toBeLessThan(5);
  });

  it('BPI 2020 — known good sequence scores in [0,1]', () => {
    if (!BPI) return;
    const log = wasm.load_eventlog_from_xes(BPI);
    const dfg = wasm.discover_dfg_simd_handle(log, 'concept:name');
    const prefix = JSON.stringify([
      'Declaration SUBMITTED by EMPLOYEE',
      'Declaration APPROVED by ADMINISTRATION',
    ]);
    const t = performance.now();
    const result = JSON.parse(wasm.score_anomaly(dfg, prefix));
    const dur = Number((performance.now() - t).toFixed(3));
    rows.push({
      algorithm: 'score_anomaly',
      dataset: 'BPI2020',
      traces: BPI_TRACES,
      durationMs: dur,
      note: `score=${result.score?.toFixed(3)}`,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome — compute_boundary_coverage
// ═══════════════════════════════════════════════════════════════════════════════

describe('compute_boundary_coverage', () => {
  it('sample — prefix [Request, Review], empty prefix, and no-match prefix', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);

    // normal prefix
    const t1 = performance.now();
    const result = JSON.parse(
      wasm.compute_boundary_coverage(log, JSON.stringify(['Request', 'Review']), 'concept:name')
    );
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(result.coverage).toBeGreaterThanOrEqual(0);
    expect(result.coverage).toBeLessThanOrEqual(1);
    rows.push({
      algorithm: 'compute_boundary_coverage',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur1,
      note: `coverage=${result.coverage?.toFixed(3)}`,
    });

    // empty prefix
    const emptyResult = JSON.parse(
      wasm.compute_boundary_coverage(log, JSON.stringify([]), 'concept:name')
    );
    expect(emptyResult).toHaveProperty('coverage');
    expect(emptyResult).toHaveProperty('matching_traces');

    // no-match prefix
    const noMatch = JSON.parse(
      wasm.compute_boundary_coverage(log, JSON.stringify(['ZZZ_NONEXISTENT']), 'concept:name')
    );
    expect(noMatch.coverage).toBe(0);
    expect(noMatch.matching_traces).toBe(0);
  });

  it('BPI 2020 — single-activity prefix', () => {
    if (!BPI) return;
    const log = wasm.load_eventlog_from_xes(BPI);
    const t = performance.now();
    const result = JSON.parse(
      wasm.compute_boundary_coverage(
        log,
        JSON.stringify(['Declaration SUBMITTED by EMPLOYEE']),
        'concept:name'
      )
    );
    const dur = Number((performance.now() - t).toFixed(3));
    rows.push({
      algorithm: 'compute_boundary_coverage',
      dataset: 'BPI2020',
      traces: BPI_TRACES,
      durationMs: dur,
      note: `coverage=${result.coverage?.toFixed(3)} matching=${result.matching_traces}`,
    });
    expect(result.coverage).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome — compute_trace_likelihood
// ═══════════════════════════════════════════════════════════════════════════════

describe('compute_trace_likelihood', () => {
  it('sample — negative ll, normal > anomalous, and 1k latency', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const ngram = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const normalTrace = JSON.stringify(['Request', 'Review', 'Approve', 'Complete']);

    const t1 = performance.now();
    const normal = JSON.parse(wasm.compute_trace_likelihood(ngram, normalTrace));
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(normal.log_likelihood).toBeLessThan(0);
    expect(normal).toHaveProperty('normalized');
    rows.push({
      algorithm: 'compute_trace_likelihood',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur1,
      note: `ll=${normal.log_likelihood?.toFixed(3)}`,
    });

    // normal vs anomalous ordering
    const anomal = JSON.parse(
      wasm.compute_trace_likelihood(
        ngram,
        JSON.stringify(['Complete', 'Approve', 'Review', 'Request'])
      )
    );
    expect(normal.log_likelihood).toBeGreaterThan(anomal.log_likelihood);

    // 1k latency
    const t2 = performance.now();
    for (let i = 0; i < 1000; i++) wasm.compute_trace_likelihood(ngram, normalTrace);
    const perCall = Number(((performance.now() - t2) / 1000).toFixed(4));
    rows.push({
      algorithm: 'compute_trace_likelihood(1k)',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: perCall,
      note: 'ms/call',
    });
    expect(perCall).toBeLessThan(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Drift — detect_drift
// ═══════════════════════════════════════════════════════════════════════════════

describe('detect_drift', () => {
  it('sample — window=2 has required properties', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const t = performance.now();
    const result = JSON.parse(wasm.detect_drift(log, 'concept:name', 2));
    const dur = Number((performance.now() - t).toFixed(3));
    expect(result).toHaveProperty('drifts_detected');
    expect(result).toHaveProperty('method');
    rows.push({
      algorithm: 'detect_drift(w=2)',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur,
      note: `${result.drifts_detected} drifts`,
    });
  });

  it('BPI 2020 — window=50 and window=100', () => {
    if (!BPI) return;
    const log = wasm.load_eventlog_from_xes(BPI);

    const t1 = performance.now();
    const r50 = JSON.parse(wasm.detect_drift(log, 'concept:name', 50));
    const dur1 = Number((performance.now() - t1).toFixed(3));
    rows.push({
      algorithm: 'detect_drift(w=50)',
      dataset: 'BPI2020',
      traces: BPI_TRACES,
      durationMs: dur1,
      note: `${r50.drifts_detected} drifts`,
    });
    expect(r50.drifts_detected).toBeGreaterThanOrEqual(0);

    const t2 = performance.now();
    const r100 = JSON.parse(wasm.detect_drift(log, 'concept:name', 100));
    const dur2 = Number((performance.now() - t2).toFixed(3));
    rows.push({
      algorithm: 'detect_drift(w=100)',
      dataset: 'BPI2020',
      traces: BPI_TRACES,
      durationMs: dur2,
      note: `${r100.drifts_detected} drifts`,
    });
    expect(r100.drifts_detected).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Drift — compute_ewma
// ═══════════════════════════════════════════════════════════════════════════════

describe('compute_ewma', () => {
  it('stable series — trend property, spike series — EWMA reacts at index 3, and 10k throughput', () => {
    // stable series
    const stable = [100, 102, 98, 101, 99, 100];
    const t1 = performance.now();
    const stableResult = JSON.parse(wasm.compute_ewma(JSON.stringify(stable), 0.3));
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(stableResult.smoothed.length).toBe(stable.length);
    expect(stableResult).toHaveProperty('trend');
    rows.push({
      algorithm: 'compute_ewma(stable)',
      dataset: 'synthetic',
      traces: 0,
      durationMs: dur1,
      note: `trend=${stableResult.trend}`,
    });

    // spike series
    const spike = [100, 105, 102, 500, 510, 490, 150, 110];
    const spikeResult = JSON.parse(wasm.compute_ewma(JSON.stringify(spike), 0.5));
    expect(spikeResult.smoothed[3]).toBeGreaterThan(spikeResult.smoothed[2] * 1.5);

    // 10k throughput
    const bigValues = Array.from({ length: 10_000 }, (_, i) => 100 + Math.sin(i) * 10);
    const t2 = performance.now();
    JSON.parse(wasm.compute_ewma(JSON.stringify(bigValues), 0.3));
    const dur2 = Number((performance.now() - t2).toFixed(3));
    rows.push({
      algorithm: 'compute_ewma(10k)',
      dataset: 'synthetic',
      traces: 0,
      durationMs: dur2,
    });
    expect(dur2).toBeLessThan(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Features — extract_prefix_features_wasm
// ═══════════════════════════════════════════════════════════════════════════════

describe('extract_prefix_features_wasm', () => {
  it('4-activity prefix — correct feature values and 10k latency', () => {
    const prefix = ['Request', 'Review', 'Request', 'Approve'];

    const t1 = performance.now();
    const result = JSON.parse(wasm.extract_prefix_features_wasm(JSON.stringify(prefix)));
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(result.length).toBe(4);
    expect(result.unique_activities).toBe(3);
    expect(result.rework_count).toBe(0);
    expect(result.last_activity).toBe('Approve');
    expect(result.activity_frequency_entropy).toBeGreaterThan(0);
    rows.push({
      algorithm: 'extract_prefix_features',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur1,
      note: `unique=${result.unique_activities}`,
    });

    const p = JSON.stringify(['Request', 'Review', 'Approve']);
    const t2 = performance.now();
    for (let i = 0; i < 10_000; i++) wasm.extract_prefix_features_wasm(p);
    const perCall = Number(((performance.now() - t2) / 10_000).toFixed(5));
    rows.push({
      algorithm: 'extract_prefix_features(10k)',
      dataset: 'synthetic',
      traces: 0,
      durationMs: perCall,
      note: 'ms/call',
    });
    expect(perCall).toBeLessThan(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Features — compute_rework_score
// ═══════════════════════════════════════════════════════════════════════════════

describe('compute_rework_score', () => {
  it('three consecutive repeats and no-rework case', () => {
    // rework present
    const reworkTrace = [
      'Request',
      'Review',
      'Review',
      'Approve',
      'Approve',
      'Approve',
      'Complete',
    ];
    const t = performance.now();
    const rework = JSON.parse(wasm.compute_rework_score(JSON.stringify(reworkTrace)));
    const dur = Number((performance.now() - t).toFixed(3));
    expect(rework.rework_count).toBe(3);
    expect(rework.rework_ratio).toBeGreaterThan(0);
    rows.push({
      algorithm: 'compute_rework_score',
      dataset: 'synthetic',
      traces: 0,
      durationMs: dur,
      note: `rework=${rework.rework_count}`,
    });

    // no rework
    const cleanTrace = ['Request', 'Review', 'Approve', 'Complete'];
    const clean = JSON.parse(wasm.compute_rework_score(JSON.stringify(cleanTrace)));
    expect(clean.rework_count).toBe(0);
    expect(clean.repeated_pairs).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Features — build_transition_probabilities
// ═══════════════════════════════════════════════════════════════════════════════

describe('build_transition_probabilities', () => {
  it('sample — probabilities sum to 1 per source', () => {
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const t = performance.now();
    const result = JSON.parse(wasm.build_transition_probabilities(log, 'concept:name'));
    const dur = Number((performance.now() - t).toFixed(3));
    expect(result.edges.length).toBeGreaterThan(0);
    const bySource = new Map<string, number>();
    for (const e of result.edges) bySource.set(e.from, (bySource.get(e.from) ?? 0) + e.probability);
    for (const [src, total] of bySource)
      expect(total, `from '${src}': sum=${total}`).toBeCloseTo(1.0, 1);
    rows.push({
      algorithm: 'build_transition_probabilities',
      dataset: 'sample',
      traces: SAMPLE_TRACES,
      durationMs: dur,
      note: `${result.edges.length} edges`,
    });
  });

  it('BPI 2020 — large graph', () => {
    if (!BPI) return;
    const log = wasm.load_eventlog_from_xes(BPI);
    const t = performance.now();
    const result = JSON.parse(wasm.build_transition_probabilities(log, 'concept:name'));
    const dur = Number((performance.now() - t).toFixed(3));
    expect(result.edges.length).toBeGreaterThan(10);
    rows.push({
      algorithm: 'build_transition_probabilities',
      dataset: 'BPI2020',
      traces: BPI_TRACES,
      durationMs: dur,
      note: `${result.edges.length} edges, ${result.activities.length} activities`,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Resource — estimate_queue_delay (M/M/1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('estimate_queue_delay', () => {
  it('stable λ=0.5 μ=1.0, high-utilization λ=0.9, unstable λ≥μ, and 1M latency', () => {
    // stable queue
    const t1 = performance.now();
    const stable = JSON.parse(wasm.estimate_queue_delay(0.5, 1.0));
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(stable.wait_time).toBeCloseTo(2.0, 1);
    expect(stable.utilization).toBeCloseTo(0.5, 2);
    expect(stable.is_stable).toBe(true);
    rows.push({
      algorithm: 'estimate_queue_delay(stable)',
      dataset: 'n/a',
      traces: 0,
      durationMs: dur1,
      note: `W=${stable.wait_time}s ρ=${stable.utilization}`,
    });

    // high utilization
    const highUtil = JSON.parse(wasm.estimate_queue_delay(0.9, 1.0));
    expect(highUtil.wait_time).toBeCloseTo(10.0, 0);
    expect(highUtil.is_stable).toBe(true);

    // unstable
    const unstable = JSON.parse(wasm.estimate_queue_delay(1.0, 1.0));
    expect(unstable.is_stable).toBe(false);

    // 1M latency
    const t2 = performance.now();
    for (let i = 0; i < 1_000_000; i++) wasm.estimate_queue_delay(0.5, 1.0);
    const perCall = Number(((performance.now() - t2) / 1_000_000).toFixed(6));
    rows.push({
      algorithm: 'estimate_queue_delay (1M)',
      dataset: 'n/a',
      traces: 0,
      durationMs: perCall,
      note: 'ms/call (O(1))',
    });
    expect(perCall).toBeLessThan(0.1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Resource — rank_interventions
// ═══════════════════════════════════════════════════════════════════════════════

describe('rank_interventions', () => {
  const interventions = [
    { name: 'escalate', utility: 0.9 },
    { name: 'reassign', utility: 0.6 },
    { name: 'notify', utility: 0.4 },
    { name: 'wait', utility: 0.2 },
  ];

  it('exploit-dominant (w=0.9) top is highest, balanced (w=0.5) stable ordering, fields present, and 100k latency', () => {
    // exploit-dominant
    const t1 = performance.now();
    const exploit = JSON.parse(wasm.rank_interventions(JSON.stringify(interventions), 0.9));
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(Array.isArray(exploit)).toBe(true);
    expect(exploit[0].name).toBe('escalate');
    rows.push({
      algorithm: 'rank_interventions(w=0.9)',
      dataset: 'n/a',
      traces: 0,
      durationMs: dur1,
      note: `top=${exploit[0].name}`,
    });

    // balanced ordering — all items present
    const balanced = JSON.parse(wasm.rank_interventions(JSON.stringify(interventions), 0.5));
    expect(balanced).toHaveLength(interventions.length);
    const names = balanced.map((r: any) => r.name);
    for (const i of interventions) expect(names).toContain(i.name);

    // required fields
    const ranked = JSON.parse(wasm.rank_interventions(JSON.stringify(interventions), 0.7));
    for (let i = 0; i < ranked.length; i++) {
      expect(ranked[i]).toHaveProperty('name');
      expect(ranked[i]).toHaveProperty('score');
      expect(ranked[i]).toHaveProperty('rank');
      expect(ranked[i].rank).toBe(i + 1);
    }

    // 100k latency
    const t2 = performance.now();
    for (let i = 0; i < 100_000; i++) wasm.rank_interventions(JSON.stringify(interventions), 0.7);
    const perCall = Number(((performance.now() - t2) / 100_000).toFixed(5));
    rows.push({
      algorithm: 'rank_interventions (100k)',
      dataset: 'n/a',
      traces: 0,
      durationMs: perCall,
      note: 'ms/call',
    });
    expect(perCall).toBeLessThan(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Resource — select_intervention (UCB1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('select_intervention (UCB1)', () => {
  it('zero-pull arm first, high-performer dominates, required fields, and 1M latency', () => {
    const banditWithZero = {
      arms: [
        { name: 'A', total_reward: 8.0, pull_count: 10 },
        { name: 'B', total_reward: 3.0, pull_count: 5 },
        { name: 'C', total_reward: 0.0, pull_count: 0 },
      ],
      total_pulls: 15,
    };

    // zero-pull forced exploration
    const t1 = performance.now();
    const zeroResult = JSON.parse(
      wasm.select_intervention(JSON.stringify(banditWithZero), Math.SQRT2)
    );
    const dur1 = Number((performance.now() - t1).toFixed(3));
    expect(zeroResult.selected).toBe('C');
    rows.push({
      algorithm: 'select_intervention(UCB1)',
      dataset: 'n/a',
      traces: 0,
      durationMs: dur1,
      note: `selected=${zeroResult.selected}`,
    });

    // high-performer dominance
    const banditHigh = {
      arms: [
        { name: 'A', total_reward: 90.0, pull_count: 100 },
        { name: 'B', total_reward: 20.0, pull_count: 100 },
      ],
      total_pulls: 200,
    };
    const highResult = JSON.parse(wasm.select_intervention(JSON.stringify(banditHigh), 0.01));
    expect(highResult.selected).toBe('A');

    // required fields
    const singleArm = {
      arms: [{ name: 'X', total_reward: 5.0, pull_count: 10 }],
      total_pulls: 10,
    };
    const fieldResult = JSON.parse(wasm.select_intervention(JSON.stringify(singleArm), Math.SQRT2));
    expect(fieldResult).toHaveProperty('selected');
    expect(fieldResult).toHaveProperty('arm_index');
    expect(fieldResult).toHaveProperty('ucb_score');
    expect(fieldResult).toHaveProperty('mean_reward');
    expect(fieldResult).toHaveProperty('exploration_bonus');

    // 1M latency
    const banditPerf = {
      arms: [
        { name: 'A', total_reward: 8.0, pull_count: 10 },
        { name: 'B', total_reward: 5.0, pull_count: 10 },
        { name: 'C', total_reward: 2.0, pull_count: 10 },
      ],
      total_pulls: 30,
    };
    const s = JSON.stringify(banditPerf);
    const t2 = performance.now();
    for (let i = 0; i < 1_000_000; i++) wasm.select_intervention(s, Math.SQRT2);
    const perCall = Number(((performance.now() - t2) / 1_000_000).toFixed(6));
    rows.push({
      algorithm: 'select_intervention (1M)',
      dataset: 'n/a',
      traces: 0,
      durationMs: perCall,
      note: 'ms/call (O(k))',
    });
    expect(perCall).toBeLessThan(0.5);
  });
});

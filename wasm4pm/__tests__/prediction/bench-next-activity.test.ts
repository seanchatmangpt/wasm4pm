/**
 * Next Activity Prediction Benchmarks
 * Perspective: "What happens next?" — Van der Aalst
 *
 * Each test is self-contained: loads its own log and builds its own handles.
 * setup.ts calls clear_all_objects() before each test, so handles cannot be
 * shared across tests via beforeAll.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { readXes, countTraces, printTable, BenchRow, SAMPLE_XES, BPI_XES } from './bench-helpers.js';

// Read files once at module level (synchronous FS reads, not WASM handles)
const SAMPLE = readXes(SAMPLE_XES);
const SAMPLE_TRACES = countTraces(SAMPLE);
let BPI: string, BPI_TRACES: number;
try { BPI = readXes(BPI_XES); BPI_TRACES = countTraces(BPI); } catch { BPI = ''; BPI_TRACES = 0; }

const rows: BenchRow[] = [];
afterAll(() => printTable(rows));

async function loadWasm() {
  const w = await import('../../pkg/wasm4pm.js');
  w.init();
  return w;
}

// ─── predict_next_k ───────────────────────────────────────────────────────────

describe('predict_next_k', () => {
  it('sample — top-3, single-activity prefix', async () => {
    const wasm = await loadWasm();
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const t = performance.now();
    const result = JSON.parse(wasm.predict_next_k(model, JSON.stringify(['Request']), 3));
    const dur = Number((performance.now() - t).toFixed(3));
    expect(result.activities.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result).toHaveProperty('entropy');
    rows.push({ algorithm: 'predict_next_k(k=3)', dataset: 'sample', traces: SAMPLE_TRACES, durationMs: dur, note: `top=${result.activities[0]}` });
  });

  it('sample — 1 000 calls latency', async () => {
    const wasm = await loadWasm();
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const prefix = JSON.stringify(['Request', 'Review']);
    const t = performance.now();
    for (let i = 0; i < 1000; i++) wasm.predict_next_k(model, prefix, 3);
    const perCall = Number(((performance.now() - t) / 1000).toFixed(4));
    rows.push({ algorithm: 'predict_next_k(1k)', dataset: 'sample', traces: SAMPLE_TRACES, durationMs: perCall, note: 'ms/call' });
    expect(perCall).toBeLessThan(5);
  });

  it('BPI 2020 — 1 000 calls throughput', async () => {
    if (!BPI) return;
    const wasm = await loadWasm();
    const log = wasm.load_eventlog_from_xes(BPI);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const prefix = JSON.stringify(['Declaration SUBMITTED by EMPLOYEE']);
    const t = performance.now();
    for (let i = 0; i < 1000; i++) wasm.predict_next_k(model, prefix, 3);
    const perCall = Number(((performance.now() - t) / 1000).toFixed(4));
    rows.push({ algorithm: 'predict_next_k(1k)', dataset: 'BPI2020', traces: BPI_TRACES, durationMs: perCall, note: 'ms/call' });
    expect(perCall).toBeLessThan(10);
  });
});

// ─── predict_beam_paths ───────────────────────────────────────────────────────

describe('predict_beam_paths', () => {
  it('sample — beam=3 steps=4', async () => {
    const wasm = await loadWasm();
    const log = wasm.load_eventlog_from_xes(SAMPLE);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const t = performance.now();
    const result = JSON.parse(wasm.predict_beam_paths(model, JSON.stringify(['Request']), 3, 4));
    const dur = Number((performance.now() - t).toFixed(3));
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 1) {
      expect(result[0].probability).toBeGreaterThanOrEqual(result[1].probability);
    }
    rows.push({ algorithm: 'predict_beam_paths(w=3,s=4)', dataset: 'sample', traces: SAMPLE_TRACES, durationMs: dur, note: `${result.length} paths` });
  });

  it('BPI 2020 — beam=5 steps=5', async () => {
    if (!BPI) return;
    const wasm = await loadWasm();
    const log = wasm.load_eventlog_from_xes(BPI);
    const model = wasm.build_ngram_predictor(log, 'concept:name', 2);
    const prefix = JSON.stringify(['Declaration SUBMITTED by EMPLOYEE']);
    const t = performance.now();
    const result = JSON.parse(wasm.predict_beam_paths(model, prefix, 5, 5));
    const dur = Number((performance.now() - t).toFixed(3));
    rows.push({ algorithm: 'predict_beam_paths(w=5,s=5)', dataset: 'BPI2020', traces: BPI_TRACES, durationMs: dur, note: `${result.length} paths` });
    expect(Array.isArray(result)).toBe(true);
  });
});

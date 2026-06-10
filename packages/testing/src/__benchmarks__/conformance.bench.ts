/**
 * conformance.bench.ts
 *
 * perf-baseline is used by CI to measure all 60 algorithms; benchmarking the
 * measurement harness itself reveals test infrastructure overhead.
 */

import { bench, describe } from 'vitest';
import {
  formatMeasurement,
  generateSummaryTable,
  measureAlgorithm,
  type Measurement,
  type TestEventLog,
} from '../perf-baseline.js';

const FAST = { time: 100, iterations: 50 };

// ---------------------------------------------------------------------------
// Static test data — all fields populated with literal numbers and strings
// ---------------------------------------------------------------------------

const SINGLE_MEASUREMENT: Measurement = {
  algorithm: 'alpha_miner',
  dataSize: 'small',
  eventCount: 100,
  latencyMs: { mean: 12.4, stdDev: 0.8, min: 11.6, max: 13.9, runs: 3 },
  memoryMB: { mean: 0.42, stdDev: 0.03, min: 0.39, max: 0.46 },
  throughputEventsPerSec: { mean: 8064, stdDev: 52 },
  timestamp: '2026-06-10T00:00:00.000Z',
  successRate: 1.0,
};

const makeMeasurement = (i: number): Measurement => ({
  algorithm: `algo_${i}`,
  dataSize: i % 3 === 0 ? 'small' : i % 3 === 1 ? 'medium' : 'large',
  eventCount: i % 3 === 0 ? 100 : i % 3 === 1 ? 1000 : 10000,
  latencyMs: {
    mean: 10 + i * 3.7,
    stdDev: 0.5 + i * 0.1,
    min: 9 + i * 3.7,
    max: 11 + i * 3.7,
    runs: 3,
  },
  memoryMB: {
    mean: 0.1 + i * 0.05,
    stdDev: 0.01,
    min: 0.09 + i * 0.05,
    max: 0.11 + i * 0.05,
  },
  throughputEventsPerSec: { mean: 9000 - i * 120, stdDev: 40 },
  timestamp: '2026-06-10T00:00:00.000Z',
  successRate: 1.0,
});

const TEN_MEASUREMENTS: Measurement[] = Array.from({ length: 10 }, (_, i) => makeMeasurement(i));

const HUNDRED_MEASUREMENTS: Measurement[] = Array.from({ length: 100 }, (_, i) => makeMeasurement(i));

const TINY_EVENT_LOG: TestEventLog = {
  eventCount: 10,
  traceCount: 2,
  activityCount: 3,
  content: JSON.stringify({
    log: [
      { 'concept:name': 'A', 'case:concept:name': 'Case_1', 'time:timestamp': '2026-01-01T10:00:00.000Z' },
      { 'concept:name': 'B', 'case:concept:name': 'Case_1', 'time:timestamp': '2026-01-01T10:01:00.000Z' },
      { 'concept:name': 'C', 'case:concept:name': 'Case_1', 'time:timestamp': '2026-01-01T10:02:00.000Z' },
      { 'concept:name': 'A', 'case:concept:name': 'Case_1', 'time:timestamp': '2026-01-01T10:03:00.000Z' },
      { 'concept:name': 'B', 'case:concept:name': 'Case_1', 'time:timestamp': '2026-01-01T10:04:00.000Z' },
      { 'concept:name': 'A', 'case:concept:name': 'Case_2', 'time:timestamp': '2026-01-02T10:00:00.000Z' },
      { 'concept:name': 'C', 'case:concept:name': 'Case_2', 'time:timestamp': '2026-01-02T10:01:00.000Z' },
      { 'concept:name': 'B', 'case:concept:name': 'Case_2', 'time:timestamp': '2026-01-02T10:02:00.000Z' },
      { 'concept:name': 'A', 'case:concept:name': 'Case_2', 'time:timestamp': '2026-01-02T10:03:00.000Z' },
      { 'concept:name': 'C', 'case:concept:name': 'Case_2', 'time:timestamp': '2026-01-02T10:04:00.000Z' },
    ],
  }),
};

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe('formatMeasurement() — one measurement', () => {
  bench('formatMeasurement', () => {
    formatMeasurement(SINGLE_MEASUREMENT);
  }, FAST);
});

describe('generateSummaryTable() — 10 measurements', () => {
  bench('generateSummaryTable 10', () => {
    generateSummaryTable(TEN_MEASUREMENTS);
  }, FAST);
});

describe('generateSummaryTable() — 100 measurements', () => {
  bench('generateSummaryTable 100', () => {
    generateSummaryTable(HUNDRED_MEASUREMENTS);
  }, FAST);
});

describe('measureAlgorithm() — harness overhead with no-op fn', () => {
  bench(
    'measureAlgorithm no-op',
    async () => {
      await measureAlgorithm(
        async (_data: TestEventLog) => ({ ok: true }),
        TINY_EVENT_LOG,
        'noop',
        1,
      );
    },
    { time: 500, iterations: 5 },
  );
});

describe('JSON.stringify — full Measurement baseline', () => {
  bench('JSON.stringify Measurement', () => {
    JSON.stringify(SINGLE_MEASUREMENT);
  }, FAST);
});

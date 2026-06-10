/**
 * hashing.bench.ts
 *
 * Benchmarks for canonicalize(), hashOutput(), hashRaw(), verifyOutputHash(),
 * and hashAlgorithmResult() from src/hashing.ts.
 *
 * Every algorithm result is hashed for receipts — this runs in the hot path
 * alongside Zod validation for every wpm run.
 */

import { bench, describe } from 'vitest';
import {
  canonicalize,
  hashOutput,
  hashRaw,
  verifyOutputHash,
  hashAlgorithmResult,
} from '../hashing.js';

// ── Fixed test payloads (deterministic — no Math.random) ─────────────────────

const TINY = { a: 1 };

const SMALL = {
  algorithm: 'dfg',
  nodes: ['A', 'B', 'C'],
  edges: [{ from: 'A', to: 'B', weight: 5 }, { from: 'B', to: 'C', weight: 3 }],
  start_activities: { A: 10 },
  end_activities: { C: 10 },
};

const MEDIUM = {
  algorithm: 'heuristic_miner',
  places: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `place_${i}` })),
  transitions: Array.from({ length: 25 }, (_, i) => ({ id: `t${i}`, label: `activity_${i}` })),
  arcs: Array.from({ length: 55 }, (_, i) => ({ from: `p${i % 30}`, to: `t${i % 25}`, weight: 1 })),
  fitness: 0.92,
  precision: 0.87,
  metadata: { duration_ms: 42, event_count: 500 },
};

const LARGE = {
  algorithm: 'inductive_miner',
  traces: Array.from({ length: 200 }, (_, i) => ({
    case_id: `case_${i}`,
    events: Array.from({ length: 10 }, (_, j) => ({
      activity: `activity_${j % 8}`,
      timestamp: 1700000000 + i * 3600 + j * 300,
      resource: `resource_${j % 3}`,
    })),
  })),
  statistics: { total_traces: 200, unique_variants: 12, avg_trace_length: 10 },
};

// Key-ordering stress — 50 keys that get sorted during canonicalize()
const MANY_KEYS = Object.fromEntries(
  Array.from({ length: 50 }, (_, i) => [`key_${String(i).padStart(3, '0')}`, i * 1.5])
);

const SMALL_CANONICAL = canonicalize(SMALL);
const SMALL_HASH = hashOutput(SMALL);
const BAD_HASH = 'a'.repeat(64);

// ── canonicalize() ────────────────────────────────────────────────────────────

describe('canonicalize (deterministic JSON serialization)', () => {
  bench('tiny object (2 keys)', () => {
    canonicalize(TINY);
  });

  bench('small object (DFG, ~6 keys)', () => {
    canonicalize(SMALL);
  });

  bench('medium object (Petri net, ~55 arcs)', () => {
    canonicalize(MEDIUM);
  });

  bench('large object (200 traces × 10 events)', () => {
    canonicalize(LARGE);
  });

  bench('50-key flat object (key-sort stress)', () => {
    canonicalize(MANY_KEYS);
  });
});

// ── hashOutput() ──────────────────────────────────────────────────────────────

describe('hashOutput (SHA-256 of canonical form)', () => {
  bench('tiny payload', () => {
    hashOutput(TINY);
  });

  bench('small payload (DFG)', () => {
    hashOutput(SMALL);
  });

  bench('medium payload (Petri net)', () => {
    hashOutput(MEDIUM);
  });

  bench('large payload (200 traces)', () => {
    hashOutput(LARGE);
  });
});

// ── hashRaw() ─────────────────────────────────────────────────────────────────

describe('hashRaw (SHA-256 of pre-serialized string)', () => {
  bench('small canonical string (~120 chars)', () => {
    hashRaw(SMALL_CANONICAL);
  });

  bench('500-char string', () => {
    hashRaw('x'.repeat(500));
  });

  bench('5000-char string', () => {
    hashRaw('x'.repeat(5000));
  });
});

// ── verifyOutputHash() ────────────────────────────────────────────────────────

describe('verifyOutputHash (hash comparison)', () => {
  bench('match (returns true)', () => {
    verifyOutputHash(SMALL, SMALL_HASH);
  });

  bench('mismatch (returns false)', () => {
    verifyOutputHash(SMALL, BAD_HASH);
  });
});

// ── hashAlgorithmResult() ─────────────────────────────────────────────────────

describe('hashAlgorithmResult (envelope + SHA-256)', () => {
  bench('small output', () => {
    hashAlgorithmResult('dfg', { threshold: 0.2 }, SMALL);
  });

  bench('medium output', () => {
    hashAlgorithmResult('heuristic_miner', { threshold: 0.5, dependency: 0.8 }, MEDIUM);
  });

  bench('large output', () => {
    hashAlgorithmResult('inductive_miner', { noise_threshold: 0.2 }, LARGE);
  });
});

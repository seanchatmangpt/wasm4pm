/**
 * Receipt building and validation benchmarks.
 *
 * All 60 algorithm results emit receipts; receipt building and validation are
 * in the critical path. These benchmarks establish a performance baseline and
 * detect regressions in the BLAKE3 hash chain and Zod-validation layers.
 */

import { bench, describe } from 'vitest';
import { ReceiptBuilder } from '../receipt-builder.js';
import { validateReceipt } from '../validation.js';
import { hashData } from '../hash.js';
import type { Receipt } from '../receipt.js';

const FAST = { time: 100, iterations: 50 };

// ---------------------------------------------------------------------------
// Static BLAKE3 hashes (64 hex chars) used throughout — no runtime hashing at
// module level so the constant is unconditionally available in all bench runs.
// ---------------------------------------------------------------------------
const HASH_A = 'a'.repeat(64) as string;
const HASH_B = 'b'.repeat(64) as string;
const HASH_C = 'c'.repeat(64) as string;
const HASH_D = 'd'.repeat(64) as string;
const TRACE_ID = 'a'.repeat(32) as string;

/** A fully-populated, structurally valid Receipt used as bench input. */
const VALID_FULL_RECEIPT: Receipt = {
  run_id: '12345678-1234-4234-b234-123456789abc',
  trace_id: TRACE_ID,
  schema_version: '1.1',
  config_hash: HASH_A,
  input_hash: HASH_B,
  plan_hash: HASH_C,
  output_hash: HASH_D,
  start_time: '2026-06-10T00:00:00.000Z',
  end_time: '2026-06-10T00:00:00.047Z',
  duration_ms: 47,
  status: 'success',
  summary: {
    traces_processed: 342,
    objects_processed: 1024,
    variants_discovered: 8,
  },
  algorithm: {
    name: 'dfg',
    version: '1.0.0',
    parameters: { activity_key: 'concept:name', case_id_key: 'case:concept:name' },
  },
  model: {
    nodes: 5,
    edges: 12,
  },
};

/** Minimal valid Receipt — only required fields, all defaults minimal. */
const VALID_MINIMAL_RECEIPT: Receipt = {
  run_id: '12345678-1234-4234-b234-123456789abc',
  trace_id: TRACE_ID,
  schema_version: '1.1',
  config_hash: HASH_A,
  input_hash: HASH_B,
  plan_hash: HASH_C,
  output_hash: HASH_D,
  start_time: '2026-06-10T00:00:00.000Z',
  end_time: '2026-06-10T00:00:00.001Z',
  duration_ms: 1,
  status: 'success',
  summary: { traces_processed: 0, objects_processed: 0, variants_discovered: 0 },
  algorithm: { name: 'alpha', version: '1.0.0', parameters: {} },
  model: { nodes: 0, edges: 0 },
};

// ---------------------------------------------------------------------------
// 1. ReceiptBuilder — construction only
// ---------------------------------------------------------------------------
describe('ReceiptBuilder construction', () => {
  bench('new ReceiptBuilder() — no args', () => {
    new ReceiptBuilder();
  }, FAST);

  bench('new ReceiptBuilder(runId) — explicit run_id', () => {
    new ReceiptBuilder('12345678-1234-4234-b234-123456789abc');
  }, FAST);
});

// ---------------------------------------------------------------------------
// 2. ReceiptBuilder — full chain + terminal build()
// ---------------------------------------------------------------------------
describe('ReceiptBuilder full chain', () => {
  bench('all setters + build()', () => {
    new ReceiptBuilder('12345678-1234-4234-b234-123456789abc')
      .setTraceId(TRACE_ID)
      .setConfig({ algorithm: 'dfg', activity_key: 'concept:name' })
      .setInput({ traces: 342, source: 'running-example.xes' })
      .setPlan({ profile: 'balanced', steps: ['discover', 'conform'] })
      .setOutput({ nodes: 5, edges: 12, fitness: 0.97 })
      .setTiming('2026-06-10T00:00:00.000Z', '2026-06-10T00:00:00.047Z')
      .setStatus('success')
      .setSummary({ traces_processed: 342, objects_processed: 1024, variants_discovered: 8 })
      .setAlgorithm({ name: 'dfg', version: '1.0.0', parameters: { activity_key: 'concept:name' } })
      .setModel({ nodes: 5, edges: 12 })
      .build();
  }, FAST);
});

// ---------------------------------------------------------------------------
// 3. validateReceipt() — valid minimal receipt
// ---------------------------------------------------------------------------
describe('validateReceipt() — valid minimal', () => {
  bench('minimal valid receipt', () => {
    validateReceipt(VALID_MINIMAL_RECEIPT);
  }, FAST);
});

// ---------------------------------------------------------------------------
// 4. validateReceipt() — valid full receipt
// ---------------------------------------------------------------------------
describe('validateReceipt() — valid full', () => {
  bench('full valid receipt', () => {
    validateReceipt(VALID_FULL_RECEIPT);
  }, FAST);
});

// ---------------------------------------------------------------------------
// 5. validateReceipt() — tampered / invalid receipts
// ---------------------------------------------------------------------------
describe('validateReceipt() — invalid receipts', () => {
  bench('null input', () => {
    validateReceipt(null);
  }, FAST);

  bench('missing run_id', () => {
    validateReceipt({
      trace_id: TRACE_ID,
      schema_version: '1.1',
      config_hash: HASH_A,
      input_hash: HASH_B,
      plan_hash: HASH_C,
      output_hash: HASH_D,
      start_time: '2026-06-10T00:00:00.000Z',
      end_time: '2026-06-10T00:00:00.001Z',
      duration_ms: 1,
      status: 'success',
      summary: { traces_processed: 0, objects_processed: 0, variants_discovered: 0 },
      algorithm: { name: 'alpha', version: '1.0.0', parameters: {} },
      model: { nodes: 0, edges: 0 },
    });
  }, FAST);

  bench('missing required fields — summary/algorithm/model absent', () => {
    validateReceipt({
      run_id: '12345678-1234-4234-b234-123456789abc',
      trace_id: TRACE_ID,
      schema_version: '1.1',
      config_hash: HASH_A,
      input_hash: HASH_B,
      plan_hash: HASH_C,
      output_hash: HASH_D,
      start_time: '2026-06-10T00:00:00.000Z',
      end_time: '2026-06-10T00:00:00.001Z',
      duration_ms: 1,
      status: 'success',
    });
  }, FAST);

  bench('invalid hash format (too short)', () => {
    validateReceipt({
      ...VALID_FULL_RECEIPT,
      config_hash: 'deadbeef',
    });
  }, FAST);
});

// ---------------------------------------------------------------------------
// 6. hashData() — small / medium / large payloads
// ---------------------------------------------------------------------------
describe('hashData() — payload sizes', () => {
  const SMALL_PAYLOAD = { algorithm: 'dfg', traces: 10 };

  const MEDIUM_PAYLOAD = {
    algorithm: 'inductive_miner',
    traces: 1000,
    variants: Array.from({ length: 50 }, (_, i) => ({
      id: `v${i}`,
      frequency: i * 3,
      activities: ['A', 'B', 'C', 'D'],
    })),
    parameters: { noise_threshold: 0.2, activity_key: 'concept:name' },
  };

  const LARGE_PAYLOAD = {
    algorithm: 'heuristic_miner',
    traces: 10000,
    events: Array.from({ length: 500 }, (_, i) => ({
      case_id: `case_${i % 200}`,
      activity: `Activity_${i % 20}`,
      timestamp: `2026-06-10T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`,
      resource: `resource_${i % 10}`,
      cost: i * 1.5,
    })),
    parameters: {
      dependency_threshold: 0.3,
      and_threshold: 0.65,
      loop_two_threshold: 0.5,
      activity_key: 'concept:name',
      case_id_key: 'case:concept:name',
    },
  };

  bench('small payload (~30 bytes)', () => {
    hashData(SMALL_PAYLOAD);
  }, FAST);

  bench('medium payload (~3 KB)', () => {
    hashData(MEDIUM_PAYLOAD);
  }, FAST);

  bench('large payload (~80 KB)', () => {
    hashData(LARGE_PAYLOAD);
  }, FAST);
});

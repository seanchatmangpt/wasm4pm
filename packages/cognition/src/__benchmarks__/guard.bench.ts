/**
 * guard.bench.ts
 *
 * Benchmarks for cognition WASM output guards from contract/guard.ts.
 * Guard runs on every cognition_run output — with 13 breeds in parallel,
 * overhead multiplies. Compares Zod-on path vs direct-cast baseline.
 */

import { bench, describe } from 'vitest';
import {
  assertContractResult,
  assertVerifyResult,
  assertSystemBuildResult,
} from '../contract/guard.js';
import type { ContractResult, VerifyResult, SystemBuildResult } from '../schemas.js';

// ── Valid minimal payloads ────────────────────────────────────────────────────
// replay_pointer must be exactly 16 chars and match start of output_hash

const OUTPUT_HASH = 'abcd1234efgh5678ijkl9012mnop3456';
const REPLAY_PTR = OUTPUT_HASH.slice(0, 16);

const VALID_CONTRACT: unknown = {
  status: 'ok',
  breed: 'eliza',
  run_id: 'run_abc123def456',
  output_hash: OUTPUT_HASH,
  replay_pointer: REPLAY_PTR,
  options_profile: null,
  output: {
    breed: 'Eliza',
    candidates: [{ id: 'c1', score: 0.9, eliminated: false }],
    facts: [{ key: 'intent', value: 'test' }],
    selected: 'c1',
    explanation: 'Selected by score',
  },
};

const VALID_VERIFY_CLEAN: unknown = {
  status: 'verified',
  findings: [],
};

const VALID_VERIFY_WITH_FINDINGS: unknown = {
  status: 'has_findings',
  findings: [
    { code: 'CF-001', severity: 'Warning', message: 'Possible drift', evidence: ['trace_1', 'trace_2'] },
    { code: 'CF-002', severity: 'Info', message: 'Low confidence', evidence: [] },
  ],
};

const VALID_SYSTEM_BUILD: unknown = {
  pareto_front: [
    { id: 'c1', family_id: 'f1', dimensions: { cost: 0.2, quality: 0.9 } },
    { id: 'c2', family_id: 'f2', dimensions: { cost: 0.5, quality: 0.7 } },
  ],
  dominated: [{ id: 'd1', reason: 'dominated by c1 on all dimensions' }],
};

// Maximal payload — stresses the full parse traversal
const LARGE_CONTRACT: unknown = {
  status: 'ok',
  breed: 'cbr',
  run_id: 'run_large_payload_bench',
  output_hash: OUTPUT_HASH,
  replay_pointer: REPLAY_PTR,
  options_profile: 'quality',
  output: {
    breed: 'CBR',
    candidates: Array.from({ length: 50 }, (_, i) => ({
      id: `c${i}`,
      score: 1 - i * 0.01,
      eliminated: i > 40,
      elimination_reason: i > 40 ? 'below threshold' : null,
    })),
    facts: Array.from({ length: 30 }, (_, i) => ({ key: `fact_${i}`, value: `value_${i}` })),
    selected: 'c0',
    explanation: 'Selected highest scoring non-eliminated candidate',
    inference_trace: Array.from({ length: 20 }, (_, i) => ({
      step: i,
      kind: 'forward',
      detail: `step ${i} detail text`,
      depth: i % 5,
    })),
  },
};

// ── assertContractResult() ────────────────────────────────────────────────────

describe('assertContractResult (cognition_run guard)', () => {
  bench('minimal valid payload', () => {
    assertContractResult(VALID_CONTRACT);
  });

  bench('large payload (50 candidates, 30 facts, 20-step trace)', () => {
    assertContractResult(LARGE_CONTRACT);
  });

  bench('baseline: direct cast (simulates WASM4PM_SKIP_ZOD=1)', () => {
    VALID_CONTRACT as ContractResult;
  });
});

// ── assertVerifyResult() ──────────────────────────────────────────────────────

describe('assertVerifyResult (cognition_verify guard)', () => {
  bench('status=verified, 0 findings', () => {
    assertVerifyResult(VALID_VERIFY_CLEAN);
  });

  bench('status=has_findings, 2 findings', () => {
    assertVerifyResult(VALID_VERIFY_WITH_FINDINGS);
  });

  bench('baseline: direct cast (simulates WASM4PM_SKIP_ZOD=1)', () => {
    VALID_VERIFY_CLEAN as VerifyResult;
  });
});

// ── assertSystemBuildResult() ─────────────────────────────────────────────────

describe('assertSystemBuildResult (system_build guard)', () => {
  bench('2 pareto front, 1 dominated', () => {
    assertSystemBuildResult(VALID_SYSTEM_BUILD);
  });

  bench('baseline: direct cast (simulates WASM4PM_SKIP_ZOD=1)', () => {
    VALID_SYSTEM_BUILD as SystemBuildResult;
  });
});

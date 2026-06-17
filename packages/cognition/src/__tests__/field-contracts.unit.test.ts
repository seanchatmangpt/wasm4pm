/**
 * field-contracts.unit.test.ts — Field-level invariants for all WASM output shapes.
 *
 * Oracle rank: Rank 1 and Rank 2.
 *
 * Source of truth: `.claude/rules/cognition-contracts.md` and Rust `wasm.rs` lines
 * 182-190 (ContractResult), 226-228 (VerifyResult), 287-290 (SystemBuildResult).
 *
 * This file covers 20+ contracts grouped by output type.  It uses vi.mock on
 * init.js (permitted here — FM-5 sentinel coverage is already provided by
 * cognition-wasm.integration.test.ts and cognition-breeds.integration.test.ts
 * which import the real binary without any mock).
 *
 * Tests are intentionally narrow: each assertion names exactly one field from
 * cognition-contracts.md.  A reader who changes a Rust field name will see
 * precisely which contract broke — not just "something failed".
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type {
  ContractResult,
  VerifyResult,
  SystemBuildResult,
  SystemVerifyResult,
  Finding,
  BreedOutput,
  Rule,
} from '../types.js';

// ── WasmLoader mock ─────────────────────────────────────────────────────────
// Unit mock is necessary; FM-5 real-binary coverage is in other files.

const mockCognitionRun = vi.fn();
const mockCognitionVerify = vi.fn();
const mockSystemBuild = vi.fn();
const mockSystemVerify = vi.fn();
const mockCognitionReplay = vi.fn();

vi.mock('../init.js', () => ({
  WasmLoader: {
    getInstance: () => ({
      init: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(() => ({
        cognition_run: mockCognitionRun,
        cognition_verify: mockCognitionVerify,
        cognition_show: vi.fn(),
        cognition_replay: mockCognitionReplay,
        system_build: mockSystemBuild,
        system_verify: mockSystemVerify,
      })),
    }),
    reset: vi.fn(),
  },
  getWasmLoader: () => ({
    init: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  }),
}));

const { runContract } = await import('../contract/run.js');
const { verifyContract } = await import('../contract/verify.js');
const { buildSystem } = await import('../system/build.js');
const { verifySystem } = await import('../system/verify.js');

// ── Canonical fixtures (exact Rust serde shape) ─────────────────────────────

/** Canonical ContractResult — Rust wasm.rs lines 182-190. */
const CANONICAL_RUN: ContractResult = {
  status: 'ok',
  breed: 'eliza',
  run_id: 'a'.repeat(64),
  output_hash: 'b'.repeat(64),
  replay_pointer: 'b'.repeat(16),
  options_profile: null,
  output: {
    breed: 'ELIZA',
    candidates: [],
    facts: [],
    explanation: 'ELIZA mirrors the input with pattern matching.',
    inference_trace: [],
  },
};

/** VerifyResult clean — Rust wasm.rs line 226. */
const VERIFY_CLEAN: VerifyResult = {
  status: 'verified',
  findings: [],
};

/** VerifyResult with findings — Rust wasm.rs line 228. */
const VERIFY_DIRTY: VerifyResult = {
  status: 'has_findings',
  findings: [
    {
      code: 'MISSING_RUNTIME_EVIDENCE',
      severity: 'Fatal',
      message: 'No runtime spans emitted for this run.',
      evidence: ['run_id=aaaa...', 'span_count=0'],
    },
  ],
};

/** SystemBuildResult — Rust wasm.rs lines 287-290. */
const CANONICAL_BUILD: SystemBuildResult = {
  pareto_front: [
    { id: 'c1', family_id: 'f1', dimensions: { latency: 10, cost: 5 } },
  ],
  dominated: [
    { id: 'c2', reason: 'dominated by c1 on latency and cost' },
  ],
};

/** Minimal BreedInput. */
function makeInput() {
  return {
    intent: 'test',
    candidates: [],
    facts: [],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ── GROUP 1: ContractResult field invariants (Rank 1 — mathematical) ─────────

describe('ContractResult: field names are exact (Rank 1)', () => {
  beforeEach(() => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN));
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('status field is present and equals "ok" on a successful run', async () => {
    const r = await runContract('eliza', makeInput());
    expect(r.status).toBe('ok');
  });

  it('breed field is a non-empty string', async () => {
    const r = await runContract('eliza', makeInput());
    expect(typeof r.breed).toBe('string');
    expect(r.breed.length).toBeGreaterThan(0);
  });

  it('run_id is exactly 64 hex chars (BLAKE3)', async () => {
    const r = await runContract('eliza', makeInput());
    expect(r.run_id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('output_hash is exactly 64 hex chars (BLAKE3)', async () => {
    const r = await runContract('eliza', makeInput());
    expect(r.output_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('replay_pointer is exactly 16 chars — the first 16 chars of output_hash', async () => {
    const r = await runContract('eliza', makeInput());
    expect(r.replay_pointer.length).toBe(16);
    expect(r.replay_pointer).toBe(r.output_hash.slice(0, 16));
  });

  it('options_profile is present and null when no profile was requested', async () => {
    const r = await runContract('eliza', makeInput());
    // Field must be present (not undefined) even when null — Rust always serialises it.
    expect('options_profile' in r).toBe(true);
    expect(r.options_profile).toBeNull();
  });

  it('options_profile is a non-null string when profile was specified', async () => {
    mockCognitionRun.mockReturnValue(
      JSON.stringify({ ...CANONICAL_RUN, options_profile: 'quality' }),
    );
    const r = await runContract('eliza', makeInput(), { profile: 'quality' });
    expect(typeof r.options_profile).toBe('string');
    expect(r.options_profile).toBe('quality');
  });

  it('output sub-object is present and is a BreedOutput-shaped object', async () => {
    const r = await runContract('eliza', makeInput());
    expect(r.output).toBeDefined();
    expect(typeof r.output).toBe('object');
    expect(r.output).not.toBeNull();
  });

  it('output.inference_trace is an array (Rust #[serde(default)] guarantees it)', async () => {
    const r = await runContract('eliza', makeInput());
    expect(Array.isArray((r.output as BreedOutput).inference_trace)).toBe(true);
  });
});

// ── GROUP 2: FM-5 guards — forbidden field names (Rank 2 — domain contract) ──

describe('ContractResult: forbidden fields are absent (FM-5 Rank 2)', () => {
  beforeEach(() => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN));
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('.exit_code is undefined — not emitted by Rust wasm.rs', async () => {
    const r = await runContract('eliza', makeInput());
    expect('exit_code' in r).toBe(false);
    expect((r as unknown as Record<string, unknown>)['exit_code']).toBeUndefined();
  });

  it('.receipt_chain is undefined — not emitted by Rust wasm.rs', async () => {
    const r = await runContract('eliza', makeInput());
    expect('receipt_chain' in r).toBe(false);
    expect((r as unknown as Record<string, unknown>)['receipt_chain']).toBeUndefined();
  });

  it('.findings is undefined on ContractResult — only VerifyResult carries findings', async () => {
    const r = await runContract('eliza', makeInput());
    expect('findings' in r).toBe(false);
    expect((r as unknown as Record<string, unknown>)['findings']).toBeUndefined();
  });

  it('.decision is undefined — not emitted by Rust wasm.rs', async () => {
    const r = await runContract('eliza', makeInput());
    expect('decision' in r).toBe(false);
    expect((r as unknown as Record<string, unknown>)['decision']).toBeUndefined();
  });

  it('.hash is undefined — correct field name is output_hash', async () => {
    const r = await runContract('eliza', makeInput());
    expect('hash' in r).toBe(false);
    expect((r as unknown as Record<string, unknown>)['hash']).toBeUndefined();
  });

  it('success check is status === "ok" — NOT exit_code === 0', async () => {
    const r = await runContract('eliza', makeInput());
    // Correct predicate per cognition-contracts.md
    const isOk = (r as { status?: string }).status === 'ok';
    expect(isOk).toBe(true);
    // Wrong predicate returns false/undefined, not true
    const wrongCheck = (r as unknown as Record<string, unknown>)['exit_code'] === 0;
    expect(wrongCheck).toBe(false);
  });
});

// ── GROUP 3: VerifyResult field invariants (Rank 2 — domain contract) ────────

describe('VerifyResult: "verified" and "has_findings" are the only valid statuses (Rank 2)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('status is "verified" when detectors find nothing', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFY_CLEAN));
    const r = await verifyContract(CANONICAL_RUN);
    expect(r.status).toBe('verified');
  });

  it('status is "has_findings" when detectors fire', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFY_DIRTY));
    const r = await verifyContract(CANONICAL_RUN);
    // CRITICAL: Rust wasm.rs line 228 emits exactly this string.
    expect(r.status).toBe('has_findings');
  });

  it('non-clean status is not "failed", "invalid", or "error"', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFY_DIRTY));
    const r = await verifyContract(CANONICAL_RUN);
    // Confirm the status matches the valid domain set
    const validStatuses: VerifyResult['status'][] = ['verified', 'has_findings'];
    expect(validStatuses).toContain(r.status);
    // And is not any fabricated alternative
    const invalidStatuses = ['failed', 'invalid', 'error', 'bad', 'denied'];
    expect(invalidStatuses).not.toContain(r.status);
  });

  it('findings is always an array — never undefined or null', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFY_CLEAN));
    const r = await verifyContract(CANONICAL_RUN);
    expect(Array.isArray(r.findings)).toBe(true);
    expect(r.findings).not.toBeNull();
  });

  it('findings is empty when status is "verified"', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFY_CLEAN));
    const r = await verifyContract(CANONICAL_RUN);
    expect(r.findings).toHaveLength(0);
  });

  it('findings is non-empty when status is "has_findings"', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFY_DIRTY));
    const r = await verifyContract(CANONICAL_RUN);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it('Finding uses "evidence" field (string[]) — not "details" (wrong alias)', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFY_DIRTY));
    const r = await verifyContract(CANONICAL_RUN);
    const finding: Finding = r.findings[0];
    // Correct field: evidence
    expect(Array.isArray(finding.evidence)).toBe(true);
    // Wrong alias: details must not be present
    expect('details' in finding).toBe(false);
  });

  it('Finding.severity is PascalCase Rust Debug format — not lowercase', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFY_DIRTY));
    const r = await verifyContract(CANONICAL_RUN);
    const severity = r.findings[0].severity;
    const validPascal: Finding['severity'][] = ['Info', 'Warning', 'Error', 'Fatal'];
    expect(validPascal).toContain(severity);
    // Rust format!("{:?}") produces PascalCase — confirm not lowercase
    expect(severity).not.toBe(severity.toLowerCase());
  });
});

// ── GROUP 4: SystemBuildResult field invariants (Rank 2 — domain contract) ───

describe('SystemBuildResult: pareto_front and dominated — never candidates (Rank 2)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('result has pareto_front array', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify(CANONICAL_BUILD));
    const r = await buildSystem({ description: 'test' });
    expect(Array.isArray(r.pareto_front)).toBe(true);
  });

  it('result has dominated array', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify(CANONICAL_BUILD));
    const r = await buildSystem({ description: 'test' });
    expect(Array.isArray(r.dominated)).toBe(true);
  });

  it('.candidates is undefined — Rust wasm.rs never emits this field', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify(CANONICAL_BUILD));
    const r = await buildSystem({ description: 'test' });
    // CRITICAL: callers must use .pareto_front, not .candidates
    expect('candidates' in r).toBe(false);
    expect((r as unknown as Record<string, unknown>)['candidates']).toBeUndefined();
  });

  it('pareto_front entries have id, family_id, dimensions', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify(CANONICAL_BUILD));
    const r = await buildSystem({ description: 'test' });
    const entry = r.pareto_front[0];
    expect(typeof entry.id).toBe('string');
    expect(typeof entry.family_id).toBe('string');
    expect(typeof entry.dimensions).toBe('object');
  });

  it('dominated entries have id and reason', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify(CANONICAL_BUILD));
    const r = await buildSystem({ description: 'test' });
    const entry = r.dominated[0];
    expect(typeof entry.id).toBe('string');
    expect(typeof entry.reason).toBe('string');
  });

  it('empty pareto_front and dominated are valid (Rank 1 — empty result is legal)', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify({ pareto_front: [], dominated: [] }));
    const r = await buildSystem({ description: 'no inputs' });
    expect(r.pareto_front).toEqual([]);
    expect(r.dominated).toEqual([]);
    // Neither field is null or undefined even when empty
    expect(r.pareto_front).not.toBeNull();
    expect(r.dominated).not.toBeNull();
  });
});

// ── GROUP 5: SystemVerifyResult field invariants (Rank 2) ────────────────────

describe('SystemVerifyResult: target, status, findings (Rank 2)', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('result has target field matching the argument passed to verifySystem', async () => {
    const expectedResult: SystemVerifyResult = {
      target: 'arch-v1',
      status: 'verified',
      findings: [],
    };
    mockSystemVerify.mockReturnValue(JSON.stringify(expectedResult));
    const r = await verifySystem('arch-v1', []);
    expect(r.target).toBe('arch-v1');
  });

  it('result status is "verified" when system checks out clean', async () => {
    const clean: SystemVerifyResult = { target: 't', status: 'verified', findings: [] };
    mockSystemVerify.mockReturnValue(JSON.stringify(clean));
    const r = await verifySystem('t', []);
    expect(r.status).toBe('verified');
  });

  it('result status is "has_findings" when system checks find issues', async () => {
    const dirty: SystemVerifyResult = {
      target: 't',
      status: 'has_findings',
      findings: [{ code: 'X', severity: 'Error', message: 'fail', evidence: [] }],
    };
    mockSystemVerify.mockReturnValue(JSON.stringify(dirty));
    const r = await verifySystem('t', []);
    expect(r.status).toBe('has_findings');
  });

  it('findings is always an array on SystemVerifyResult', async () => {
    const res: SystemVerifyResult = { target: 't', status: 'verified', findings: [] };
    mockSystemVerify.mockReturnValue(JSON.stringify(res));
    const r = await verifySystem('t', []);
    expect(Array.isArray(r.findings)).toBe(true);
  });
});

// ── GROUP 6: Rule.certainty is required (Rank 2 — domain contract) ────────────

describe('Rule type: certainty is a required field (Rank 2)', () => {
  it('Rule object with certainty at 0.8 satisfies the contract', () => {
    // Rust Rule struct has no #[serde(default)] on certainty — it is required.
    // A Rule sent to WASM without certainty would be rejected with
    // "missing field 'certainty'". The TypeScript type must require it.
    const validRule: Rule = {
      id: 'r1',
      premise: ['symptom=fever'],
      conclusion: 'diagnosis=flu',
      certainty: 0.8,
    };
    expect(typeof validRule.certainty).toBe('number');
    expect(validRule.certainty).toBeGreaterThanOrEqual(-1.0);
    expect(validRule.certainty).toBeLessThanOrEqual(1.0);
  });

  it('certainty accepts boundary values -1.0 and 1.0 (full certainty-factor range)', () => {
    const boundaries = [-1.0, 0.0, 1.0];
    for (const cf of boundaries) {
      const rule: Rule = { id: 'r', premise: [], conclusion: 'c', certainty: cf };
      expect(rule.certainty).toBe(cf);
    }
  });
});

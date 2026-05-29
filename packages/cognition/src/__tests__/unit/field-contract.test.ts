/**
 * field-contract.test.ts — Field contract compliance for all WASM wrapper layers.
 *
 * Oracle rank: Rank 2 (Domain contract — exact field names as specified in
 * `.claude/rules/cognition-contracts.md` and Rust `wasm.rs` source of truth).
 *
 * This file lives in unit/ — vi.mock('../init.js') is ALLOWED here per FM-5 doctrine.
 *
 * What is under test:
 *   1. cognition_run output uses exactly: status, breed, run_id, output_hash,
 *      replay_pointer, options_profile, output.
 *   2. Success check is `status === 'ok'` — NOT truthy, NOT 'success', NOT 'ok!'.
 *   3. Receipt save uses `.run_id` — NOT `.hash`, NOT `.id`, NOT `.receipt_id`.
 *   4. cognition_verify returns status 'has_findings' when detectors fire —
 *      this is the ONLY non-clean status; the string 'rejected' is NEVER emitted.
 *   5. cognition_verify returns status 'verified' when no findings.
 *   6. system_build result exposes `.pareto_front` and `.dominated` —
 *      NOT `.candidates` (which does not exist on that type).
 *   7. Input to runContract is wrapped as { breed, contract: BreedInput } —
 *      sending bare BreedInput would trigger Rust's deny_unknown_fields rejection.
 *   8. replay_pointer is present and is a string (first 16 chars of output_hash).
 *   9. options_profile is string | null — present even when null.
 *  10. Finding severity uses PascalCase Rust Debug format: 'Info'|'Warning'|'Error'|'Fatal'.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { OtelSpan } from '../../observability-types.js';

// ── WASM mock setup ──────────────────────────────────────────────────────────
// Mock WasmLoader before any module under test is imported.
// Unit tests in __tests__/unit/ MAY mock init.js (FM-5 doctrine: only integration
// tests are forbidden from mocking it).

const mockCognitionRun = vi.fn();
const mockCognitionVerify = vi.fn();
const mockSystemBuild = vi.fn();
const mockCognitionReplay = vi.fn();

vi.mock('../../init.js', () => ({
  WasmLoader: {
    getInstance: () => ({
      init: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(() => ({
        cognition_run: mockCognitionRun,
        cognition_verify: mockCognitionVerify,
        cognition_show: vi.fn(),
        cognition_replay: mockCognitionReplay,
        system_build: mockSystemBuild,
        system_verify: vi.fn(),
      })),
    }),
    reset: vi.fn(),
  },
  getWasmLoader: () => ({
    init: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  }),
}));

// Import AFTER mock is in place
const { runContract } = await import('../../contract/run.js');
const { verifyContract } = await import('../../contract/verify.js');
const { buildSystem } = await import('../../system/build.js');
const { replayReceipt } = await import('../../receipt/replay.js');

// ── Canonical output fixtures ─────────────────────────────────────────────────
// These fixtures mirror the EXACT Rust serde output shapes from wasm.rs.
// Field names here are the contract — any deviation is a defect.

/** Canonical ContractResult from cognition_run (wasm.rs lines 182-190). */
const CANONICAL_RUN_RESULT = {
  status: 'ok' as const,
  breed: 'eliza',
  run_id: 'a'.repeat(64),         // BLAKE3 hex-64
  output_hash: 'b'.repeat(64),    // BLAKE3 hex-64
  replay_pointer: 'b'.repeat(16), // first 16 chars of output_hash
  options_profile: null,           // null when no profile was specified
  output: {
    breed: 'ELIZA',
    candidates: [],
    facts: [],
    explanation: 'ELIZA pattern matching result',
    // inference_trace is always emitted by Rust (#[serde(default)]).
    // Real breeds produce non-empty traces; ELIZA stub emits [].
    inference_trace: [] as Array<{ step: number; kind: string; detail: string; depth: number }>,
  },
};

/** VerifyResult when no detectors fire (wasm.rs line 226). */
const VERIFIED_RESULT = {
  status: 'verified' as const,
  findings: [],
};

/** VerifyResult when detectors fire (wasm.rs line 228). Status is 'has_findings'. */
const HAS_FINDINGS_RESULT = {
  status: 'has_findings' as const,
  findings: [
    {
      code: 'CANDIDATE_SCORE_ANOMALY',
      severity: 'Warning' as const, // PascalCase Rust Debug format
      message: 'Candidate score exceeds expected range',
      evidence: ['candidate c1 score=1.5'],
    },
  ],
};

/** SystemBuildResult from system_build (wasm.rs lines 287-290). */
const CANONICAL_BUILD_RESULT = {
  pareto_front: [
    { id: 'c1', family_id: 'f1', dimensions: { latency: 10, cost: 5 } },
    { id: 'c2', family_id: 'f2', dimensions: { latency: 5, cost: 10 } },
  ],
  dominated: [
    { id: 'c3', reason: 'dominated by c1 on all dimensions' },
  ],
};

/** Minimal valid BreedInput. */
function makeBreedInput() {
  return {
    intent: 'select architecture',
    candidates: [{ id: 'edge-local', score: 0.9, eliminated: false }],
    facts: [],
    cases: [],
    rules: [],
    goals: [],
    state: [],
  };
}

// ── 1. cognition_run: output field names ─────────────────────────────────────

describe('cognition_run output field contracts', () => {
  beforeEach(() => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
  });
  afterEach(() => vi.clearAllMocks());

  it('result.status is exactly "ok" (not "success", not "OK", not truthy coerce)', async () => {
    const result = await runContract('eliza', makeBreedInput());
    expect(result.status).toBe('ok');
    // Negative checks — confirm these wrong values are absent
    expect(result.status).not.toBe('success');
    expect(result.status).not.toBe('OK');
  });

  it('result.breed is the breed name string', async () => {
    const result = await runContract('eliza', makeBreedInput());
    expect(result.breed).toBe('eliza');
  });

  it('result.run_id is present (used for receipt save)', async () => {
    const result = await runContract('eliza', makeBreedInput());
    expect(typeof result.run_id).toBe('string');
    expect(result.run_id.length).toBeGreaterThan(0);
    // Confirm forbidden aliases are not present instead
    expect('hash' in result).toBe(false);
    expect('id' in result).toBe(false);
    expect('receipt_id' in result).toBe(false);
  });

  it('result.output_hash is present and distinct from run_id', async () => {
    const result = await runContract('eliza', makeBreedInput());
    expect(typeof result.output_hash).toBe('string');
    expect(result.output_hash).not.toBe(result.run_id);
    // Confirm no wrong alias: .hash must not be used
    expect('hash' in result).toBe(false);
  });

  it('result.replay_pointer is present (first 16 chars of output_hash)', async () => {
    const result = await runContract('eliza', makeBreedInput());
    expect(typeof result.replay_pointer).toBe('string');
    expect(result.replay_pointer.length).toBe(16);
    expect(result.replay_pointer).toBe(result.output_hash.slice(0, 16));
  });

  it('result.options_profile is null when no profile given (field present, not omitted)', async () => {
    const result = await runContract('eliza', makeBreedInput());
    // Field must be present (not undefined), even when null
    expect('options_profile' in result).toBe(true);
    expect(result.options_profile).toBeNull();
  });

  it('result.options_profile is a string when profile is set', async () => {
    mockCognitionRun.mockReturnValue(
      JSON.stringify({ ...CANONICAL_RUN_RESULT, options_profile: 'fast' }),
    );
    const result = await runContract('eliza', makeBreedInput(), { profile: 'fast' });
    expect(result.options_profile).toBe('fast');
  });

  it('result.output sub-object is present', async () => {
    const result = await runContract('eliza', makeBreedInput());
    expect(result.output).toBeDefined();
    expect(typeof result.output).toBe('object');
  });

  it('forbidden top-level fields are absent: exit_code, receipt_chain, findings, decision', async () => {
    const result = await runContract('eliza', makeBreedInput());
    // Per cognition-contracts.md: these field names must never appear on ContractResult
    expect('exit_code' in result).toBe(false);
    expect('receipt_chain' in result).toBe(false);
    expect('findings' in result).toBe(false);
    expect('decision' in result).toBe(false);
  });

  it('result.output.inference_trace is an array (Rust #[serde(default)] guarantees it)', async () => {
    // Source of truth: breeds/mod.rs BreedOutput.inference_trace with #[serde(default)].
    // Rust always emits this field; TypeScript types.ts BreedOutput must declare it.
    const result = await runContract('eliza', makeBreedInput());
    expect(Array.isArray(result.output.inference_trace)).toBe(true);
  });
});

// ── 2. success check: status === 'ok' ────────────────────────────────────────

describe('success check: status === "ok" is the correct predicate', () => {
  afterEach(() => vi.clearAllMocks());

  it('status "ok" → success (run completes normally)', async () => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
    const result = await runContract('eliza', makeBreedInput());
    // Correct success predicate from cognition-contracts.md
    const isOk = (result as { status?: string }).status === 'ok';
    expect(isOk).toBe(true);
  });

  it('status other than "ok" → rejected by guard (guard throws OUTPUT_SHAPE_INVALID)', async () => {
    // The field-contract guard in guard.ts enforces that Rust ONLY emits status='ok'.
    // Any other value (e.g. 'partial') is a contract violation and throws CognitionError,
    // not a returned result. This proves the guard is active and status='ok' is required.
    mockCognitionRun.mockReturnValue(
      JSON.stringify({ ...CANONICAL_RUN_RESULT, status: 'partial' }),
    );
    const { CognitionError } = await import('../../errors.js');
    await expect(runContract('eliza', makeBreedInput())).rejects.toBeInstanceOf(CognitionError);
    await expect(
      runContract('eliza', makeBreedInput()).catch((e: { code: unknown }) => e.code),
    ).resolves.toBe('OUTPUT_SHAPE_INVALID');
  });
});

// ── 3. receipt save: use .run_id ─────────────────────────────────────────────

describe('receipt persistence contract: .run_id is the key for saving', () => {
  afterEach(() => vi.clearAllMocks());

  it('run_id is non-empty and suitable for file/key naming', async () => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
    const result = await runContract('eliza', makeBreedInput());
    const runId = (result as { run_id?: string }).run_id;
    // Must be present and non-empty — callers pass this to saveReceipt()
    expect(typeof runId).toBe('string');
    expect(runId!.length).toBeGreaterThan(0);
  });

  it('run_id value matches the canonical BLAKE3 hex pattern', async () => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
    const result = await runContract('eliza', makeBreedInput());
    // BLAKE3 outputs 64 hex chars
    expect(result.run_id).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── 4. cognition_verify: 'has_findings' — the only non-clean status ──────────

describe('cognition_verify: status values "verified" and "has_findings"', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns status "verified" when detectors find nothing (empty findings)', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFIED_RESULT));
    const result = await verifyContract(CANONICAL_RUN_RESULT);
    expect(result.status).toBe('verified');
    expect(result.findings).toHaveLength(0);
  });

  it('returns status "has_findings" when detectors fire', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(HAS_FINDINGS_RESULT));
    const result = await verifyContract(CANONICAL_RUN_RESULT);
    // CRITICAL contract: Rust emits exactly 'has_findings' — no other failure status.
    expect(result.status).toBe('has_findings');
  });

  it('non-clean status is not "failed", "invalid", or any other invented value', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(HAS_FINDINGS_RESULT));
    const result = await verifyContract(CANONICAL_RUN_RESULT);
    const nonCleanStatuses = ['failed', 'invalid', 'error', 'bad', 'denied'];
    expect(nonCleanStatuses).not.toContain(result.status);
  });

  it('"has_findings" result contains populated findings array', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(HAS_FINDINGS_RESULT));
    const result = await verifyContract(CANONICAL_RUN_RESULT);
    expect(result.findings.length).toBeGreaterThan(0);
    const finding = result.findings[0];
    expect(typeof finding.code).toBe('string');
    expect(typeof finding.message).toBe('string');
    expect(Array.isArray(finding.evidence)).toBe(true);
  });

  it('"verified" result has empty findings array — not undefined or null', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFIED_RESULT));
    const result = await verifyContract(CANONICAL_RUN_RESULT);
    // findings must always be an array, never undefined/null
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('finding severity is PascalCase Rust Debug format (not lowercase)', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(HAS_FINDINGS_RESULT));
    const result = await verifyContract(CANONICAL_RUN_RESULT);
    const severity = result.findings[0].severity;
    // Rust uses format!("{:?}", severity) which emits PascalCase
    const validSeverities = ['Info', 'Warning', 'Error', 'Fatal'];
    expect(validSeverities).toContain(severity);
    // Confirm NOT lowercase (would indicate wrong serialization)
    expect(severity).not.toBe(severity.toLowerCase());
  });
});

// ── 5. system_build: .pareto_front not .candidates ──────────────────────────

describe('system_build output: .pareto_front and .dominated — never .candidates', () => {
  afterEach(() => vi.clearAllMocks());

  it('result has pareto_front array (not candidates)', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify(CANONICAL_BUILD_RESULT));
    const result = await buildSystem({ description: 'test system' });
    // CRITICAL: Rust emits pareto_front. There is no .candidates field.
    expect(Array.isArray(result.pareto_front)).toBe(true);
    expect('candidates' in result).toBe(false);
  });

  it('result has dominated array (not filtered or excluded)', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify(CANONICAL_BUILD_RESULT));
    const result = await buildSystem({ description: 'test system' });
    expect(Array.isArray(result.dominated)).toBe(true);
    expect('filtered' in result).toBe(false);
    expect('excluded' in result).toBe(false);
  });

  it('pareto_front entries have id, family_id, dimensions', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify(CANONICAL_BUILD_RESULT));
    const result = await buildSystem({ description: 'test system' });
    const entry = result.pareto_front[0];
    expect(typeof entry.id).toBe('string');
    expect(typeof entry.family_id).toBe('string');
    expect(typeof entry.dimensions).toBe('object');
  });

  it('dominated entries have id and reason', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify(CANONICAL_BUILD_RESULT));
    const result = await buildSystem({ description: 'test system' });
    const entry = result.dominated[0];
    expect(typeof entry.id).toBe('string');
    expect(typeof entry.reason).toBe('string');
  });

  it('empty pareto_front is valid (not null/undefined)', async () => {
    mockSystemBuild.mockReturnValue(
      JSON.stringify({ pareto_front: [], dominated: [] }),
    );
    const result = await buildSystem({ description: 'no candidates' });
    expect(result.pareto_front).toEqual([]);
    expect(result.dominated).toEqual([]);
  });
});

// ── 6. Input wrapper: { breed, contract: BreedInput } ────────────────────────

describe('runContract input serialization: wraps input as { breed, contract }', () => {
  afterEach(() => vi.clearAllMocks());

  it('WASM receives serialized JSON with top-level "breed" field', async () => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
    const input = makeBreedInput();
    await runContract('mycin', input);

    // Inspect what was actually passed to WASM
    const calledWith = mockCognitionRun.mock.calls[0][0] as string;
    const parsed = JSON.parse(calledWith);
    expect(parsed.breed).toBe('mycin');
  });

  it('WASM receives "contract" key wrapping the BreedInput — not bare BreedInput', async () => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
    const input = makeBreedInput();
    await runContract('eliza', input);

    const calledWith = mockCognitionRun.mock.calls[0][0] as string;
    const parsed = JSON.parse(calledWith);
    // Rust uses deny_unknown_fields; bare BreedInput has no "breed" field and is
    // rejected with "missing field 'breed'". The wrapper must nest under "contract".
    expect(parsed.contract).toBeDefined();
    expect(parsed.contract.intent).toBe(input.intent);
    // The top-level must NOT be a bare BreedInput (which would have 'intent' at root)
    expect(parsed.intent).toBeUndefined();
  });

  it('options.profile is forwarded under options.profile in the WASM payload', async () => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
    await runContract('eliza', makeBreedInput(), { profile: 'quality' });

    const calledWith = mockCognitionRun.mock.calls[0][0] as string;
    const parsed = JSON.parse(calledWith);
    expect(parsed.options?.profile).toBe('quality');
  });

  it('options key is absent when no profile given (Rust ValidatedRunOptions rejects null)', async () => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
    await runContract('eliza', makeBreedInput()); // no profile

    const calledWith = mockCognitionRun.mock.calls[0][0] as string;
    const parsed = JSON.parse(calledWith);
    // Rust schema rejects null options; wrapper must omit the key entirely
    expect(parsed.options).toBeUndefined();
  });
});

// ── 7. replayReceipt: ReplayRecord field names ───────────────────────────────

describe('replayReceipt output field contracts', () => {
  afterEach(() => vi.clearAllMocks());

  it('result has run_id, output_hash, replay_pointer', async () => {
    mockCognitionReplay.mockReturnValue(
      JSON.stringify({
        run_id: 'c'.repeat(64),
        output_hash: 'd'.repeat(64),
        replay_pointer: 'd'.repeat(16),
      }),
    );
    const result = await replayReceipt('c'.repeat(64));
    expect(typeof result.run_id).toBe('string');
    expect(typeof result.output_hash).toBe('string');
    expect(typeof result.replay_pointer).toBe('string');
  });

  it('throws CognitionError with code REPLAY_NOT_FOUND when WASM throws', async () => {
    mockCognitionReplay.mockImplementation(() => {
      throw new Error('receipt not found');
    });
    const { CognitionError } = await import('../../errors.js');
    await expect(replayReceipt('nonexistent')).rejects.toBeInstanceOf(CognitionError);
    await expect(replayReceipt('nonexistent').catch((e: { code: unknown }) => e.code)).resolves.toBe(
      'REPLAY_NOT_FOUND',
    );
  });
});

// ── 8. OtelSpan field contracts across all wrappers ──────────────────────────

describe('OTEL span field contracts (nanosecond timestamps, hex IDs)', () => {
  afterEach(() => vi.clearAllMocks());

  it('runContract span: start_time and end_time are nanosecond integers', async () => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
    const spans: OtelSpan[] = [];
    await runContract('eliza', makeBreedInput(), { spanSink: (s) => spans.push(s) });

    const span = spans[0];
    expect(Number.isInteger(span.start_time)).toBe(true);
    expect(Number.isInteger(span.end_time)).toBe(true);
    // Nanosecond timestamps should be >> millisecond timestamps
    expect(span.start_time).toBeGreaterThan(Date.now() * 1_000); // at least microseconds
  });

  it('verifyContract span: trace_id is 32 hex chars, span_id is 16 hex chars', async () => {
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFIED_RESULT));
    const spans: OtelSpan[] = [];
    await verifyContract(CANONICAL_RUN_RESULT, { spanSink: (s) => spans.push(s) });

    expect(spans[0].trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(spans[0].span_id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('buildSystem span: kind is "INTERNAL"', async () => {
    mockSystemBuild.mockReturnValue(JSON.stringify(CANONICAL_BUILD_RESULT));
    const spans: OtelSpan[] = [];
    await buildSystem({ description: 'test' }, { spanSink: (s) => spans.push(s) });
    expect(spans[0].kind).toBe('INTERNAL');
  });

  it('all wrappers emit cognition.duration_ms as a non-negative number', async () => {
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
    mockCognitionVerify.mockReturnValue(JSON.stringify(VERIFIED_RESULT));
    mockSystemBuild.mockReturnValue(JSON.stringify(CANONICAL_BUILD_RESULT));

    const collectDuration = (span: OtelSpan) => span.attributes['cognition.duration_ms'] as number;

    const runSpans: OtelSpan[] = [];
    await runContract('eliza', makeBreedInput(), { spanSink: (s) => runSpans.push(s) });
    expect(collectDuration(runSpans[0])).toBeGreaterThanOrEqual(0);

    const verifySpans: OtelSpan[] = [];
    await verifyContract(CANONICAL_RUN_RESULT, { spanSink: (s) => verifySpans.push(s) });
    expect(collectDuration(verifySpans[0])).toBeGreaterThanOrEqual(0);

    const buildSpans: OtelSpan[] = [];
    await buildSystem({ description: 'test' }, { spanSink: (s) => buildSpans.push(s) });
    expect(collectDuration(buildSpans[0])).toBeGreaterThanOrEqual(0);
  });

  it('runContract span carries cognition.breed attribute for Jaeger traceability', async () => {
    // Rank-2 domain contract: breed name must appear in span so analysts can
    // filter by breed in Jaeger without parsing span names.
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
    const spans: OtelSpan[] = [];
    await runContract('cbr', makeBreedInput(), { spanSink: (s) => spans.push(s) });
    expect(spans[0].attributes['cognition.breed']).toBe('cbr');
  });

  it('runContract span carries cognition.run_id attribute on successful WASM parse', async () => {
    // Rank-2 domain contract: run_id links the span to the receipt in the registry.
    // Without this attribute, post-hoc tracing requires re-parsing the span payload.
    mockCognitionRun.mockReturnValue(JSON.stringify(CANONICAL_RUN_RESULT));
    const spans: OtelSpan[] = [];
    await runContract('eliza', makeBreedInput(), { spanSink: (s) => spans.push(s) });
    expect(spans[0].attributes['cognition.run_id']).toBe(CANONICAL_RUN_RESULT.run_id);
  });

  it('runContract span carries cognition.breed even on WASM error (breed known at call site)', async () => {
    // breed is a call-site parameter, always known before WASM is invoked.
    // The span must still carry it even when the call fails.
    mockCognitionRun.mockImplementation(() => { throw new Error('wasm panic'); });
    const spans: OtelSpan[] = [];
    try {
      await runContract('strips', makeBreedInput(), { spanSink: (s) => spans.push(s) });
    } catch { /* expected */ }
    expect(spans[0].attributes['cognition.breed']).toBe('strips');
    // run_id is absent on error (WASM never returned a result)
    expect(spans[0].attributes['cognition.run_id']).toBeUndefined();
  });
});

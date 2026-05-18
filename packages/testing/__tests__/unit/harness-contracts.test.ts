/**
 * Self-coverage gap-fill for @wasm4pm/testing harness contracts.
 *
 * Oracle hierarchy (van der Aalst / Chicago TDD):
 *   Rank 1 — Mathematical theorem (EXIT_CODES uniqueness, integer bounds)
 *   Rank 2 — Domain contract (assertExitCode error message, evidence envelope,
 *             fast-mode gate skip, assertJsonOutput structural guarantees)
 *
 * This file covers gaps NOT already in:
 *   - cli-helpers.test.ts  (EXIT_CODES uniqueness/range, error message content)
 *   - certification.test.ts (evidence envelope, fast mode, corpus_hash, options)
 *   - determinism.test.ts   (receiptsMatch structural equality edge cases)
 *
 * These tests would catch real regressions: they derive expected values from
 * the published wpm exit-code contract and the van der Aalst reproducibility
 * requirement — NOT from the implementation under test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  EXIT_CODES,
  assertExitCode,
  assertJsonOutput,
  type CliResult,
} from '../../src/harness/cli.js';
import {
  registerGate,
  runCertification,
  clearGates,
} from '../../src/certification.js';

// ─── EXIT_CODES — Rank 1: Mathematical Theorem ─────────────────────────────

describe('EXIT_CODES — Rank 1 mathematical invariants', () => {
  /**
   * The wpm contract (apps/wasm4pm/src/exit-codes.ts) specifies:
   *   0=success, 1=config_error, 2=source_error, 3=execution_error,
   *   4=partial_failure, 5=system_error, 6=conformance_fail
   * These exact values must never change without a breaking-change version bump.
   */
  it('success is 0', () => {
    expect(EXIT_CODES.success).toBe(0);
  });

  it('config_error is 1', () => {
    expect(EXIT_CODES.config_error).toBe(1);
  });

  it('source_error is 2', () => {
    expect(EXIT_CODES.source_error).toBe(2);
  });

  it('execution_error is 3', () => {
    expect(EXIT_CODES.execution_error).toBe(3);
  });

  it('partial_failure is 4', () => {
    expect(EXIT_CODES.partial_failure).toBe(4);
  });

  it('system_error is 5', () => {
    expect(EXIT_CODES.system_error).toBe(5);
  });

  it('conformance_fail is 6', () => {
    expect(EXIT_CODES.conformance_fail).toBe(6);
  });

  it('all values are integers in [0, 6] — no out-of-range code can be added silently', () => {
    for (const [key, value] of Object.entries(EXIT_CODES)) {
      expect(Number.isInteger(value), `${key} must be an integer`).toBe(true);
      expect(value, `${key} must be >= 0`).toBeGreaterThanOrEqual(0);
      expect(value, `${key} must be <= 6`).toBeLessThanOrEqual(6);
    }
  });

  it('all values are unique — no two error categories share a code', () => {
    const values = Object.values(EXIT_CODES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ─── assertExitCode — Rank 2: Domain Contract ────────────────────────────────

describe('assertExitCode — error message content', () => {
  const makeResult = (exitCode: number): CliResult => ({
    exitCode,
    stdout: 'stdout content',
    stderr: 'stderr content',
    durationMs: 5,
  });

  it('error message includes both expected and actual exit codes', () => {
    let message = '';
    try {
      assertExitCode(makeResult(2), 0);
    } catch (err) {
      message = (err as Error).message;
    }
    // Verify both codes appear so the practitioner can diagnose the mismatch
    expect(message).toContain('0');  // expected
    expect(message).toContain('2');  // actual
  });

  it('error message includes stdout snippet for context', () => {
    let message = '';
    try {
      assertExitCode(makeResult(3), 0);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('stdout');
  });

  it('error message includes stderr snippet for context', () => {
    let message = '';
    try {
      assertExitCode(makeResult(3), 0);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('stderr');
  });
});

// ─── assertJsonOutput — Rank 2: Domain Contract ──────────────────────────────

describe('assertJsonOutput — structural guarantees', () => {
  const makeResult = (stdout: string): CliResult => ({
    exitCode: 0,
    stdout,
    stderr: '',
    durationMs: 5,
  });

  it('parsed result has status field when JSON contains it', () => {
    const parsed = assertJsonOutput(makeResult('{"status":"ok","count":3}')) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
  });

  it('handles JSON array output without throwing', () => {
    const parsed = assertJsonOutput(makeResult('[1,2,3]'));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
  });

  it('handles nested JSON object', () => {
    const parsed = assertJsonOutput(
      makeResult('{"algorithm":{"name":"dfg","speed":5}}')
    ) as Record<string, unknown>;
    expect((parsed.algorithm as Record<string, unknown>).name).toBe('dfg');
  });
});

// ─── runCertification evidence envelope — Rank 2: Domain Contract ──────────

describe('runCertification — evidence envelope', () => {
  beforeEach(() => {
    clearGates();
  });

  /**
   * The evidence envelope is van der Aalst's reproducibility requirement made
   * executable: every certification run must record enough metadata that a
   * practitioner can reproduce it exactly next week.
   */
  it('report includes evidence envelope with run_environment', async () => {
    registerGate('test:pass', () => ({
      gate: 'test:pass',
      passed: true,
      details: 'ok',
      duration_ms: 0,
    }));
    const report = await runCertification('99.0.0');
    expect(report.evidence).toBeDefined();
    expect(report.evidence!.run_environment).toBeDefined();
  });

  it('evidence.run_environment.node_version is a non-empty string', async () => {
    registerGate('test:env', () => ({
      gate: 'test:env',
      passed: true,
      details: 'ok',
      duration_ms: 0,
    }));
    const report = await runCertification('1.0.0');
    expect(typeof report.evidence!.run_environment.node_version).toBe('string');
    expect(report.evidence!.run_environment.node_version.length).toBeGreaterThan(0);
  });

  it('evidence.run_environment.platform is a non-empty string', async () => {
    const report = await runCertification('1.0.0');
    expect(typeof report.evidence!.run_environment.platform).toBe('string');
    expect(report.evidence!.run_environment.platform.length).toBeGreaterThan(0);
  });

  it('evidence.corpus_hash is a non-empty hex string', async () => {
    registerGate('gate-a', () => ({ gate: 'gate-a', passed: true, details: '', duration_ms: 0 }));
    const report = await runCertification('1.0.0');
    expect(typeof report.evidence!.corpus_hash).toBe('string');
    expect(report.evidence!.corpus_hash.length).toBeGreaterThan(0);
    // corpus_hash is a signed int32 in hex — may start with '-' for negative values.
    // The important property is that it is non-empty and consistent across runs
    // for the same gate set; exact format is an implementation detail.
    expect(report.evidence!.corpus_hash).toMatch(/^-?[0-9a-f]+$/i);
  });

  it('evidence.corpus_hash differs when gate set changes', async () => {
    registerGate('only-gate', () => ({ gate: 'only-gate', passed: true, details: '', duration_ms: 0 }));
    const report1 = await runCertification('1.0.0');
    clearGates();

    registerGate('gate-x', () => ({ gate: 'gate-x', passed: true, details: '', duration_ms: 0 }));
    registerGate('gate-y', () => ({ gate: 'gate-y', passed: true, details: '', duration_ms: 0 }));
    const report2 = await runCertification('1.0.0');

    // Different gate set = different corpus fingerprint
    expect(report1.evidence!.corpus_hash).not.toBe(report2.evidence!.corpus_hash);
  });

  it('evidence.wasm_build_profile defaults to "browser"', async () => {
    const report = await runCertification('1.0.0');
    expect(report.evidence!.wasm_build_profile).toBe('browser');
  });

  it('evidence.wasm_build_profile reflects options.wasmBuildProfile', async () => {
    const report = await runCertification('1.0.0', { wasmBuildProfile: 'edge' });
    expect(report.evidence!.wasm_build_profile).toBe('edge');
  });

  it('evidence.feature_flags defaults to empty array', async () => {
    const report = await runCertification('1.0.0');
    expect(Array.isArray(report.evidence!.feature_flags)).toBe(true);
    expect(report.evidence!.feature_flags).toHaveLength(0);
  });

  it('evidence.feature_flags reflects options.featureFlags', async () => {
    const flags = ['feature-ml', 'feature-ocel'];
    const report = await runCertification('1.0.0', { featureFlags: flags });
    expect(report.evidence!.feature_flags).toEqual(flags);
  });

  it('fast mode skips performance:benchmarks gate', async () => {
    // Re-register the performance gate under the name runCertification checks
    registerGate('performance:benchmarks', () => ({
      gate: 'performance:benchmarks',
      passed: true,
      details: 'would run normally',
      duration_ms: 0,
    }));

    const report = await runCertification('1.0.0', { fast: true });
    const perfGate = report.gates.find((g) => g.gate === 'performance:benchmarks');
    expect(perfGate).toBeDefined();
    expect(perfGate!.details).toContain('Skipped');
    expect(perfGate!.passed).toBe(true); // Skipped gates are counted as passing
  });
});

// ─── OtelCapture assertion return-type contracts ────────────────────────────
//
// Oracle hierarchy:
//   Rank 1 (mathematical): Return type is string[] (never undefined/throws),
//                          length semantics, mutual exclusion between violation
//                          and clean paths.
//   Rank 2 (domain contract): Violation messages name the missing field /
//                             offending span.
//   Rank 3 (metamorphic): Adding a compliant span cannot increase violation count.
//
// Key API notes (actual signatures):
//   assertRequiredAttributes(requiredKeys: string[]) → string[]
//     (operates on ALL captured spans)
//   assertNonBlocking(maxDurationMs: number) → string[]
//     (duration threshold in ms; span times are in nanoseconds)
//   assertValidTraces() → string[]
//     (validates parent-child spanId relationships)

import { OtelCapture, createOtelCapture, type CapturedOtelSpan } from '../../src/harness/otel-capture.js';

function makeTestSpan(overrides: Partial<CapturedOtelSpan> = {}): CapturedOtelSpan {
  return {
    traceId: 'trace-001',
    spanId: 'span-001',
    name: 'test.span',
    startTime: Date.now() * 1_000_000, // nanoseconds
    endTime: (Date.now() + 10) * 1_000_000, // 10ms later
    attributes: {},
    events: [],
    ...overrides,
  };
}

// ─── assertRequiredAttributes — Rank 1: Return-type is string[] ─────────────

describe('OtelCapture.assertRequiredAttributes — Rank 1 (mathematical)', () => {
  let capture: OtelCapture;

  beforeEach(() => {
    capture = createOtelCapture();
  });

  it('returns [] when capture has no spans (empty capture, any key list)', () => {
    const result = capture.assertRequiredAttributes(['service.name', 'algorithm']);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns [] with empty key list even when spans are present', () => {
    capture.captureSpan(makeTestSpan({ attributes: {} }));
    const result = capture.assertRequiredAttributes([]);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns [] when span has ALL required attributes', () => {
    capture.captureSpan(
      makeTestSpan({
        attributes: { 'service.name': 'wpm', algorithm: 'dfg', run_id: 'abc-123' },
      })
    );
    const result = capture.assertRequiredAttributes(['service.name', 'algorithm', 'run_id']);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns non-empty array when a required attribute is missing', () => {
    capture.captureSpan(
      makeTestSpan({
        spanId: 'span-missing',
        name: 'kernel.run',
        attributes: { 'service.name': 'wpm' }, // 'algorithm' is absent
      })
    );
    const violations = capture.assertRequiredAttributes(['service.name', 'algorithm']);
    expect(Array.isArray(violations)).toBe(true);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('violation message names the missing attribute key', () => {
    capture.captureSpan(makeTestSpan({ name: 'kernel.run', attributes: {} }));
    const violations = capture.assertRequiredAttributes(['missing_field']);
    expect(violations.some((v) => v.includes('missing_field'))).toBe(true);
  });

  it('violation message names the offending span', () => {
    capture.captureSpan(makeTestSpan({ name: 'kernel.run', attributes: {} }));
    const violations = capture.assertRequiredAttributes(['required_attr']);
    expect(violations.some((v) => v.includes('kernel.run'))).toBe(true);
  });

  it('never throws — return type is always string[]', () => {
    expect(() => {
      const result = capture.assertRequiredAttributes(['any.key']);
      expect(Array.isArray(result)).toBe(true);
    }).not.toThrow();
  });

  it('one missing attribute on two spans → at least two violations', () => {
    capture.captureSpan(makeTestSpan({ spanId: 'span-1', name: 'span.one', attributes: {} }));
    capture.captureSpan(makeTestSpan({ spanId: 'span-2', name: 'span.two', attributes: {} }));
    const violations = capture.assertRequiredAttributes(['required_key']);
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── assertRequiredAttributes — Rank 2: Domain Contract ─────────────────────

describe('OtelCapture.assertRequiredAttributes — Rank 2 (domain contract)', () => {
  it('a span fully satisfying requirements contributes zero violations', () => {
    const capture = createOtelCapture();
    capture.captureSpan(
      makeTestSpan({
        attributes: { 'wpm.algorithm': 'dfg', 'wpm.run_id': 'run-xyz' },
      })
    );
    const violations = capture.assertRequiredAttributes(['wpm.algorithm', 'wpm.run_id']);
    expect(violations).toHaveLength(0);
  });

  it('attribute present but set to undefined is treated as missing', () => {
    const capture = createOtelCapture();
    capture.captureSpan(
      makeTestSpan({
        attributes: { 'service.name': undefined as unknown as string },
      })
    );
    const violations = capture.assertRequiredAttributes(['service.name']);
    expect(violations.length).toBeGreaterThan(0);
  });
});

// ─── assertRequiredAttributes — Rank 3: Metamorphic ─────────────────────────

describe('OtelCapture.assertRequiredAttributes — Rank 3 (metamorphic)', () => {
  it('adding a compliant span does not increase violation count', () => {
    const captureA = createOtelCapture();
    captureA.captureSpan(makeTestSpan({ name: 'bad.span', attributes: {} }));
    const violationsA = captureA.assertRequiredAttributes(['req_key']);

    const captureB = createOtelCapture();
    captureB.captureSpan(makeTestSpan({ name: 'bad.span', attributes: {} }));
    captureB.captureSpan(
      makeTestSpan({ spanId: 'span-good', name: 'good.span', attributes: { req_key: 'value' } })
    );
    const violationsB = captureB.assertRequiredAttributes(['req_key']);

    // same bad span + one good span → violation count unchanged (not increased)
    expect(violationsB.length).toBe(violationsA.length);
  });

  it('fixing the missing attribute reduces violation count to zero', () => {
    const captureBefore = createOtelCapture();
    captureBefore.captureSpan(makeTestSpan({ name: 'span.a', attributes: {} }));
    const violationsBefore = captureBefore.assertRequiredAttributes(['needed']);

    const captureAfter = createOtelCapture();
    captureAfter.captureSpan(makeTestSpan({ name: 'span.a', attributes: { needed: 'present' } }));
    const violationsAfter = captureAfter.assertRequiredAttributes(['needed']);

    expect(violationsAfter.length).toBeLessThan(violationsBefore.length);
    expect(violationsAfter).toHaveLength(0);
  });
});

// ─── assertNonBlocking — Rank 1: Return-type is string[] ────────────────────

describe('OtelCapture.assertNonBlocking — Rank 1 (mathematical)', () => {
  let capture: OtelCapture;

  beforeEach(() => {
    capture = createOtelCapture();
  });

  it('returns [] when capture has no spans', () => {
    const result = capture.assertNonBlocking(100);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns [] when span duration is within the limit', () => {
    const now = Date.now() * 1_000_000; // nanoseconds
    capture.captureSpan(
      makeTestSpan({
        startTime: now,
        endTime: now + 10 * 1_000_000, // 10ms in nanoseconds
      })
    );
    const violations = capture.assertNonBlocking(50); // 50ms limit → no violation
    expect(Array.isArray(violations)).toBe(true);
    expect(violations).toHaveLength(0);
  });

  it('returns non-empty array when span duration exceeds the limit', () => {
    const now = Date.now() * 1_000_000; // nanoseconds
    capture.captureSpan(
      makeTestSpan({
        name: 'slow.span',
        startTime: now,
        endTime: now + 200 * 1_000_000, // 200ms in nanoseconds
      })
    );
    const violations = capture.assertNonBlocking(100); // 100ms limit → violation
    expect(Array.isArray(violations)).toBe(true);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('violation message names the offending span', () => {
    const now = Date.now() * 1_000_000;
    capture.captureSpan(
      makeTestSpan({
        name: 'blocking.operation',
        startTime: now,
        endTime: now + 500 * 1_000_000, // 500ms
      })
    );
    const violations = capture.assertNonBlocking(100);
    expect(violations.some((v) => v.includes('blocking.operation'))).toBe(true);
  });

  it('span with no endTime is not flagged (duration cannot be computed)', () => {
    const now = Date.now() * 1_000_000;
    capture.captureSpan(
      makeTestSpan({
        name: 'open.span',
        startTime: now,
        endTime: undefined,
      })
    );
    const violations = capture.assertNonBlocking(1); // extremely tight limit
    expect(violations).toHaveLength(0); // no endTime → cannot compute duration
  });

  it('never throws — return type is always string[]', () => {
    expect(() => {
      const result = capture.assertNonBlocking(0);
      expect(Array.isArray(result)).toBe(true);
    }).not.toThrow();
  });
});

// ─── assertValidTraces — Rank 1: Return-type is string[] ────────────────────

describe('OtelCapture.assertValidTraces — Rank 1 (mathematical)', () => {
  let capture: OtelCapture;

  beforeEach(() => {
    capture = createOtelCapture();
  });

  it('returns [] when capture has no spans', () => {
    const result = capture.assertValidTraces();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns [] when all spans are root spans (no parentSpanId)', () => {
    capture.captureSpan(makeTestSpan({ spanId: 'root-1', parentSpanId: undefined }));
    capture.captureSpan(makeTestSpan({ spanId: 'root-2', parentSpanId: undefined }));
    const violations = capture.assertValidTraces();
    expect(Array.isArray(violations)).toBe(true);
    expect(violations).toHaveLength(0);
  });

  it('returns [] when parent-child relationships are valid', () => {
    capture.captureSpan(makeTestSpan({ spanId: 'parent-span', parentSpanId: undefined }));
    capture.captureSpan(
      makeTestSpan({ spanId: 'child-span', parentSpanId: 'parent-span', name: 'child.op' })
    );
    const violations = capture.assertValidTraces();
    expect(violations).toHaveLength(0);
  });

  it('returns non-empty array when a span references a missing parent', () => {
    capture.captureSpan(
      makeTestSpan({
        spanId: 'orphan-span',
        parentSpanId: 'nonexistent-parent',
        name: 'orphan.op',
      })
    );
    const violations = capture.assertValidTraces();
    expect(Array.isArray(violations)).toBe(true);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('violation message names the orphaned span', () => {
    capture.captureSpan(
      makeTestSpan({
        spanId: 'orphan-span',
        parentSpanId: 'ghost-parent',
        name: 'missing.parent',
      })
    );
    const violations = capture.assertValidTraces();
    expect(violations.some((v) => v.includes('missing.parent'))).toBe(true);
  });

  it('never throws — return type is always string[]', () => {
    expect(() => {
      const result = capture.assertValidTraces();
      expect(Array.isArray(result)).toBe(true);
    }).not.toThrow();
  });
});

// ─── Cross-method compositional safety ──────────────────────────────────────

describe('OtelCapture assertion methods — compositional safety (Rank 1)', () => {
  it('all three assertion methods return string[] on the same capture instance', () => {
    const capture = createOtelCapture();
    const now = Date.now() * 1_000_000;
    capture.captureSpan(
      makeTestSpan({
        spanId: 'span-001',
        parentSpanId: undefined,
        name: 'full.op',
        startTime: now,
        endTime: now + 5 * 1_000_000,
        attributes: { 'service.name': 'wpm' },
      })
    );

    const attrViolations = capture.assertRequiredAttributes(['service.name']);
    const blockingViolations = capture.assertNonBlocking(100);
    const traceViolations = capture.assertValidTraces();

    expect(Array.isArray(attrViolations)).toBe(true);
    expect(Array.isArray(blockingViolations)).toBe(true);
    expect(Array.isArray(traceViolations)).toBe(true);

    // Compliant span → zero violations from all three methods
    expect(attrViolations).toHaveLength(0);
    expect(blockingViolations).toHaveLength(0);
    expect(traceViolations).toHaveLength(0);
  });

  it('calling assertion methods does not mutate the captured span list', () => {
    const capture = createOtelCapture();
    capture.captureSpan(makeTestSpan({ spanId: 'immutable-span' }));

    const countBefore = capture.spans.length;
    capture.assertRequiredAttributes(['some.key']);
    capture.assertNonBlocking(100);
    capture.assertValidTraces();
    const countAfter = capture.spans.length;

    expect(countAfter).toBe(countBefore);
  });
});

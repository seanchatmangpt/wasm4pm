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

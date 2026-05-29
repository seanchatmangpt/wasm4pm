/**
 * Scenario: quality command — wpm quality <log.xes>
 *
 * Tests multi-dimensional quality assessment using real WASM.
 *
 * Key contracts verified:
 *   - Missing input exits 2 (source_error)
 *   - Missing file exits 2 (source_error)
 *   - Invalid metric exits 1 (config_error)
 *   - Valid log computes quality scores (fitness, precision, generalization, simplicity)
 *   - JSON output has status=success and quality scores field
 *   - Human output is readable and shows quality metrics
 *   - -i alias for input file works
 *   - --file alias for input file works
 *   - --activity-key flag is accepted
 *
 * Binary: apps/wasm4pm/dist/bin/wpm.js (must be built first)
 */

import { describe, it, expect } from 'vitest';
import { assertExitCode, wpm, wasm4pm, extractJson, combinedOutput, EXIT_CODES, resolveRepo } from '../helpers/cli.js';

// Real XES fixture files
const RUNNING_EXAMPLE = resolveRepo('wasm4pm/tests/fixtures/running-example.xes');
const BPI_DOMESTIC = resolveRepo('wasm4pm/tests/fixtures/BPI_2020_DomesticDeclarations.xes');

// The quality command uses ILP + alignment-based scoring which is CPU-intensive.
// Measured runtime on running-example.xes: ~74s. Tests that invoke WASM quality
// need a per-test timeout well above the 30s vitest global.
const QUALITY_TIMEOUT_MS = 150_000;

describe.sequential('quality command', () => {
  // ── Error cases ───────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('exits 2 when no input provided', async () => {
      const result = await wpm(['quality']);
      assertExitCode(result, EXIT_CODES.source_error);
    });

    it('exits 2 when input file does not exist', async () => {
      const result = await wpm(['quality', '/tmp/nonexistent-xyz.xes']);
      assertExitCode(result, EXIT_CODES.source_error);
      expect(combinedOutput(result)).toContain('not found');
    });

    it('exits 1 for invalid metric name', async () => {
      const result = await wpm(['quality', RUNNING_EXAMPLE, '--metrics', 'nonexistent_metric', '--format', 'json']);
      assertExitCode(result, EXIT_CODES.config_error);
      // Error message format: "Invalid --metrics value(s): nonexistent_metric"
      expect(combinedOutput(result)).toContain('nonexistent_metric');
    });

    it('exits 1 for mix of valid and invalid metrics', async () => {
      const result = await wpm(['quality', RUNNING_EXAMPLE, '--metrics', 'fitness,ghost_metric', '--format', 'json']);
      assertExitCode(result, EXIT_CODES.config_error);
      expect(combinedOutput(result)).toContain('ghost_metric');
    });
  });

  // ── Quality pipeline (WASM interaction) ───────────────────────────────────

  describe('quality pipeline', () => {
    it('computes quality scores and returns structured success output (JSON)', async () => {
      const result = await wpm(['quality', RUNNING_EXAMPLE, '--format', 'json'], { timeout: QUALITY_TIMEOUT_MS });
      assertExitCode(result, EXIT_CODES.success);
      // CLI wraps output in { command, status:"ok", payload:{ status:"success", scores, ... } }
      const envelope = extractJson(result.stdout) as Record<string, unknown>;
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;
      expect(json.status).toBe('success');
      expect(json.scores).toBeDefined();
    }, QUALITY_TIMEOUT_MS);

    it('returns readable success output in human format', async () => {
      const result = await wpm(['quality', RUNNING_EXAMPLE], { timeout: QUALITY_TIMEOUT_MS });
      assertExitCode(result, EXIT_CODES.success);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Human output contains quality assessment header
      expect(combinedOutput(result)).toContain('Model Quality Assessment');
    }, QUALITY_TIMEOUT_MS);

    it('quality scores include fitness metric', async () => {
      const result = await wpm(['quality', RUNNING_EXAMPLE, '--format', 'json'], { timeout: QUALITY_TIMEOUT_MS });
      const envelope = extractJson(result.stdout) as Record<string, unknown>;
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;
      const scores = json.scores as Record<string, unknown>;
      expect(scores.fitness).toBeDefined();
      expect(typeof scores.fitness).toBe('number');
    }, QUALITY_TIMEOUT_MS);

    it('quality scores include precision metric', async () => {
      const result = await wpm(['quality', RUNNING_EXAMPLE, '--format', 'json'], { timeout: QUALITY_TIMEOUT_MS });
      const envelope = extractJson(result.stdout) as Record<string, unknown>;
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;
      const scores = json.scores as Record<string, unknown>;
      expect(scores.precision).toBeDefined();
      expect(typeof scores.precision).toBe('number');
    }, QUALITY_TIMEOUT_MS);

    it('aggregate quality score is bounded [0, 1]', async () => {
      const result = await wpm(['quality', RUNNING_EXAMPLE, '--format', 'json'], { timeout: QUALITY_TIMEOUT_MS });
      const envelope = extractJson(result.stdout) as Record<string, unknown>;
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;
      const aggregate = json.aggregate as Record<string, unknown>;
      const score = aggregate.score as number;
      expect(score).toBeGreaterThanOrEqual(0.0);
      expect(score).toBeLessThanOrEqual(1.0);
    }, QUALITY_TIMEOUT_MS);
  });

  // ── Single metric selection ───────────────────────────────────────────────

  describe('metric selection', () => {
    it('computes fitness metric when requested', async () => {
      const result = await wpm(['quality', RUNNING_EXAMPLE, '--metrics', 'fitness', '--format', 'json'], { timeout: QUALITY_TIMEOUT_MS });
      assertExitCode(result, EXIT_CODES.success);
      const envelope = extractJson(result.stdout) as Record<string, unknown>;
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;
      const scores = json.scores as Record<string, unknown>;
      expect(scores.fitness).toBeDefined();
      expect(typeof scores.fitness).toBe('number');
    }, QUALITY_TIMEOUT_MS);

    it('computes precision metric when requested', async () => {
      const result = await wpm(['quality', RUNNING_EXAMPLE, '--metrics', 'precision', '--format', 'json'], { timeout: QUALITY_TIMEOUT_MS });
      assertExitCode(result, EXIT_CODES.success);
      const envelope = extractJson(result.stdout) as Record<string, unknown>;
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;
      const scores = json.scores as Record<string, unknown>;
      expect(scores.precision).toBeDefined();
      expect(typeof scores.precision).toBe('number');
    }, QUALITY_TIMEOUT_MS);

    it('computes all four metrics by default', async () => {
      const result = await wpm(['quality', RUNNING_EXAMPLE, '--format', 'json'], { timeout: QUALITY_TIMEOUT_MS });
      assertExitCode(result, EXIT_CODES.success);
      const envelope = extractJson(result.stdout) as Record<string, unknown>;
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;
      const scores = json.scores as Record<string, unknown>;
      expect(scores.fitness).toBeDefined();
      expect(scores.precision).toBeDefined();
      expect(scores.generalization).toBeDefined();
      expect(scores.simplicity).toBeDefined();
    }, QUALITY_TIMEOUT_MS);
  });

  // ── Flag variants ─────────────────────────────────────────────────────────

  it('supports -i alias for input file', async () => {
    const result = await wpm(['quality', '-i', RUNNING_EXAMPLE, '--format', 'json'], { timeout: QUALITY_TIMEOUT_MS });
    assertExitCode(result, EXIT_CODES.success);
    const envelope = extractJson(result.stdout) as Record<string, unknown>;
    const json = (envelope.payload ?? envelope) as Record<string, unknown>;
    expect(json.status).toBe('success');
    expect((json.scores as Record<string, unknown>).fitness).toBeDefined();
  }, QUALITY_TIMEOUT_MS);

  it('supports --file alias for input file', async () => {
    const result = await wpm(['quality', '--file', RUNNING_EXAMPLE, '--format', 'json'], { timeout: QUALITY_TIMEOUT_MS });
    assertExitCode(result, EXIT_CODES.success);
    const envelope = extractJson(result.stdout) as Record<string, unknown>;
    const json = (envelope.payload ?? envelope) as Record<string, unknown>;
    expect(json.status).toBe('success');
  }, QUALITY_TIMEOUT_MS);

  it('supports --activity-key flag', async () => {
    const result = await wpm(['quality', RUNNING_EXAMPLE, '--activity-key', 'concept:name', '--format', 'json'], { timeout: QUALITY_TIMEOUT_MS });
    assertExitCode(result, EXIT_CODES.success);
    const envelope = extractJson(result.stdout) as Record<string, unknown>;
    const json = (envelope.payload ?? envelope) as Record<string, unknown>;
    expect(json.status).toBe('success');
  }, QUALITY_TIMEOUT_MS);
});

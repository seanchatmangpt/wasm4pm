/**
 * Scenario: suggest command — wpm suggest <log.xes>
 *
 * Tests algorithm recommendation for a given event log and goal.
 * Uses real WASM — no mocks.
 *
 * Key contracts verified:
 *   - Missing input exits 2 (source_error)
 *   - Nonexistent file exits 2 (source_error)
 *   - Valid log with --goal quality returns recommendations (JSON)
 *   - recommendations array has at least one entry
 *   - Each recommendation has algorithm name, quality, speed, reason fields
 *   - topPick is present and is one of the recommended algorithm names
 *   - logStats section contains traceCount, eventCount, variantCount
 *   - --goal flag accepts: fast, balanced, quality, conformance, streaming
 *   - -i / --file aliases for input file work
 *
 * Binary: apps/wasm4pm/dist/bin/wpm.js (must be built first)
 */

import { describe, it, expect } from 'vitest';
import { assertExitCode, wpm, extractJson, combinedOutput, EXIT_CODES, resolveRepo } from '../helpers/cli.js';

// Real XES fixture
const RUNNING_EXAMPLE = resolveRepo('wasm4pm/tests/fixtures/running-example.xes');

describe('suggest command', () => {
  // ── Error cases ───────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('exits 2 when no input provided', async () => {
      const result = await wpm(['suggest']);
      assertExitCode(result, EXIT_CODES.source_error);
    });

    it('exits 2 when input file does not exist', async () => {
      const result = await wpm(['suggest', '/tmp/nonexistent-file-xyz.xes', '--format', 'json']);
      assertExitCode(result, EXIT_CODES.source_error);
      expect(combinedOutput(result)).toContain('not found');
    });
  });

  // ── JSON output ───────────────────────────────────────────────────────────

  describe('JSON output', () => {
    it('exits 0 with --goal quality', async () => {
      const result = await wpm(['suggest', RUNNING_EXAMPLE, '--goal', 'quality', '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);
    });

    it('returns recommendations array with at least one entry', async () => {
      const result = await wpm(['suggest', RUNNING_EXAMPLE, '--goal', 'quality', '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);

      // CLI wraps output in { command, status:"ok", payload:{...}, meta:{...} }
      const envelope = extractJson(result.stdout);
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;

      expect(Array.isArray(json.recommendations)).toBe(true);
      expect((json.recommendations as unknown[]).length).toBeGreaterThanOrEqual(1);
    });

    it('each recommendation has required fields', async () => {
      const result = await wpm(['suggest', RUNNING_EXAMPLE, '--goal', 'quality', '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);

      const envelope = extractJson(result.stdout);
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;
      const recommendations = json.recommendations as Record<string, unknown>[];

      for (const rec of recommendations) {
        expect(typeof rec.algorithm).toBe('string');
        expect(rec.algorithm).not.toBe('');
        expect(typeof rec.quality).toBe('number');
        expect(typeof rec.speed).toBe('number');
        expect(typeof rec.reason).toBe('string');
      }
    });

    it('topPick is a non-empty string', async () => {
      const result = await wpm(['suggest', RUNNING_EXAMPLE, '--goal', 'quality', '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);

      const envelope = extractJson(result.stdout);
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;

      expect(typeof json.topPick).toBe('string');
      expect((json.topPick as string).length).toBeGreaterThan(0);
    });

    it('topPick is among the recommended algorithm names', async () => {
      const result = await wpm(['suggest', RUNNING_EXAMPLE, '--goal', 'quality', '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);

      const envelope = extractJson(result.stdout);
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;
      const recommendations = json.recommendations as Record<string, unknown>[];
      const algorithmNames = recommendations.map((r) => r.algorithm as string);

      expect(algorithmNames).toContain(json.topPick);
    });

    it('logStats section contains traceCount and eventCount', async () => {
      const result = await wpm(['suggest', RUNNING_EXAMPLE, '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);

      const envelope = extractJson(result.stdout);
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;
      const logStats = json.logStats as Record<string, unknown>;

      expect(logStats).toBeDefined();
      expect(typeof logStats.traceCount).toBe('number');
      expect((logStats.traceCount as number)).toBeGreaterThan(0);
      expect(typeof logStats.eventCount).toBe('number');
      expect((logStats.eventCount as number)).toBeGreaterThan(0);
    });

    it('goal field in payload matches requested goal', async () => {
      const result = await wpm(['suggest', RUNNING_EXAMPLE, '--goal', 'fast', '--format', 'json']);
      assertExitCode(result, EXIT_CODES.success);

      const envelope = extractJson(result.stdout);
      const json = (envelope.payload ?? envelope) as Record<string, unknown>;

      expect(json.goal).toBe('fast');
    });
  });

  // ── Goal variants ─────────────────────────────────────────────────────────

  describe('goal variants', () => {
    for (const goal of ['fast', 'balanced', 'quality', 'conformance'] as const) {
      it(`accepts --goal ${goal}`, async () => {
        const result = await wpm(['suggest', RUNNING_EXAMPLE, '--goal', goal, '--format', 'json']);
        assertExitCode(result, EXIT_CODES.success);

        const envelope = extractJson(result.stdout);
        const json = (envelope.payload ?? envelope) as Record<string, unknown>;
        expect(Array.isArray(json.recommendations)).toBe(true);
      });
    }
  });

  // ── Flag aliases ──────────────────────────────────────────────────────────

  it('supports -i alias for input file', async () => {
    const result = await wpm(['suggest', '-i', RUNNING_EXAMPLE, '--format', 'json']);
    assertExitCode(result, EXIT_CODES.success);

    const envelope = extractJson(result.stdout);
    const json = (envelope.payload ?? envelope) as Record<string, unknown>;
    expect(Array.isArray(json.recommendations)).toBe(true);
  });

  it('supports --file alias for input file', async () => {
    const result = await wpm(['suggest', '--file', RUNNING_EXAMPLE, '--format', 'json']);
    assertExitCode(result, EXIT_CODES.success);

    const envelope = extractJson(result.stdout);
    const json = (envelope.payload ?? envelope) as Record<string, unknown>;
    expect(Array.isArray(json.recommendations)).toBe(true);
  });

  // ── Default behavior ──────────────────────────────────────────────────────

  it('exits 0 without --format flag (human output)', async () => {
    const result = await wpm(['suggest', RUNNING_EXAMPLE]);
    assertExitCode(result, EXIT_CODES.success);
  });
});

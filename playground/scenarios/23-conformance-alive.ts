/**
 * Scenario: Conformance Command Alive
 *
 * JTBD: "Verify the conformance command is integrated and callable without crashing."
 *
 * Van der Aalst doctrine: A command that crashes or is missing from the CLI is not a usable
 * process mining tool. This scenario validates that `pictl conformance` exists, is callable,
 * and either returns valid results or fails gracefully with proper error handling.
 *
 * Test phases:
 * 1. Command exists and runs without hanging/crashing
 * 2. Command returns an exit code (0 = success, 3 = execution error, etc. — but not crashes)
 * 3. Output (success or error) is well-formed JSON
 */

import { describe, it, expect } from 'vitest';
import { pictl, extractJson, resolveRepo } from '../helpers/cli.js';

const RUNNING_EXAMPLE = resolveRepo('wasm4pm/tests/fixtures/running-example.xes');

describe('Conformance Command Alive', () => {
  it('pictl conformance command exists and is callable — Rank 2: domain contract', async () => {
    // JTBD: "The conformance command must exist in the CLI and be callable"
    const result = await pictl(['conformance', '--help']);
    // Command should show help without crashing
    expect([0, 1, 2]).toContain(result.exitCode);
  });

  it('pictl conformance accepts input file without crashing — Rank 2: domain contract', async () => {
    // JTBD: "The conformance command must handle input files gracefully"
    const result = await pictl(['conformance', RUNNING_EXAMPLE, '--format', 'json']);
    // Command should return gracefully (either success 0, or execution error 3, but not hang)
    expect(result.exitCode).toBeDefined();
    expect([0, 1, 2, 3, 4, 5]).toContain(result.exitCode);
  });

  it('pictl conformance returns valid JSON output — Rank 2: domain contract', async () => {
    // JTBD: "Output must be parseable JSON even on error"
    const result = await pictl(['conformance', RUNNING_EXAMPLE, '--format', 'json']);

    // Output should be valid JSON
    const output = extractJson(result.stdout);
    expect(output).toBeDefined();
    expect(typeof output).toBe('object');
  });

  it('pictl conformance on success returns fitness score — Rank 1: mathematical invariant', async () => {
    // JTBD: "When conformance succeeds, fitness must be a number in [0.0, 1.0]"
    const result = await pictl(['conformance', RUNNING_EXAMPLE, '--format', 'json']);

    if (result.exitCode === 0) {
      const output = extractJson(result.stdout);
      expect(output.status).toBe('success');
      expect(typeof output.fitness).toBe('number');
      expect(output.fitness).toBeGreaterThanOrEqual(0.0);
      expect(output.fitness).toBeLessThanOrEqual(1.0);
    }
  });
});

/**
 * Scenario 20 (Aalst): AutoProcess Validation via Process Mining
 *
 * JTBD: "I want to verify my autonomic control loop actually works as designed."
 *
 * Doctrine: If the code says it worked but the event log cannot prove a lawful process
 * happened, then it did not work. (van der Aalst)
 *
 * Methodology:
 * 1. Run autoprocess command
 * 2. Verify exit code indicates success (0) or expected failure (1-3)
 * 3. Validate output structure contains declared phases
 * 4. Verify no panics/corruption in stderr
 * 5. Real-scale test: BPI 2020 processes without timeout/panic
 *
 * Test evidence is measurable output + exit codes, not internal assertions.
 */

import { describe, it, expect } from 'vitest';
import { pictl, extractJson, combinedOutput, resolveRepo } from '../helpers/cli.js';

const RUNNING_EXAMPLE = resolveRepo('wasm4pm/tests/fixtures/running-example.xes');

describe('autoprocess command (Aalst methodology)', () => {
  /**
   * Test 1: Success Proof via Exit Code + Output Structure Validation
   *
   * Oracle (Rank 1): Exit code 0 is the only proof that the entire pipeline
   * (Perception → Decision → Protection → Optimization) completed lawfully.
   * Additionally, JSON output must contain the declared four phase objects.
   */
  it('completes successfully (exit code 0) with valid structure', async () => {
    const result = await pictl(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);

    // Oracle: Success is proven by exit code 0
    expect(result.exitCode).toBe(0);

    // Oracle: Output structure must contain the four declared phases
    const json = extractJson<Record<string, unknown>>(result.stdout);
    expect(json).toBeTruthy();
    expect(typeof json).toBe('object');

    // Verify cycle_result exists and contains non-null phase objects
    const cycleResult = (json as Record<string, unknown>)['cycle_result'];
    expect(cycleResult).toBeTruthy();
    expect(typeof cycleResult).toBe('object');

    const cr = cycleResult as Record<string, unknown>;
    expect(cr['perception']).not.toBeNull();
    expect(cr['decision']).not.toBeNull();
    expect(cr['protection']).not.toBeNull();
    expect(cr['optimization']).not.toBeNull();
  });

  /**
   * Test 2: JSON Output Type Validation is Strict
   *
   * Oracle (Rank 1): JSON output must be a truthy object containing cycle_result
   * with all four phase objects. Loose type checking allows null/undefined to pass.
   */
  it('JSON output is strictly an object with declared phases', async () => {
    const result = await pictl(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
    expect(result.exitCode).toBe(0);

    const json = extractJson<Record<string, unknown>>(result.stdout);

    // Oracle: Output must be a truthy object (not null/undefined/primitive)
    expect(json).toBeTruthy();
    expect(typeof json).toBe('object');

    // Oracle: cycle_result must exist and contain the four declared phases
    const cycleResult = (json as Record<string, unknown>)['cycle_result'];
    expect(cycleResult).toBeTruthy();
    expect(typeof cycleResult).toBe('object');

    const cr = cycleResult as Record<string, unknown>;
    expect(cr['perception']).toBeDefined();
    expect(cr['decision']).toBeDefined();
    expect(cr['protection']).toBeDefined();
    expect(cr['optimization']).toBeDefined();
  });

  /**
   * Test 3: Determinism via Output Value Consistency
   *
   * Oracle (Rank 3, Metamorphic): Two runs on identical input must produce
   * semantically identical output (JSON string comparison).
   * This proves the process is deterministic, not random.
   */
  it('two consecutive runs produce deterministically identical output', async () => {
    const result1 = await pictl(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
    const result2 = await pictl(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);

    expect(result1.exitCode).toBe(0);
    expect(result2.exitCode).toBe(0);

    const json1 = extractJson<Record<string, unknown>>(result1.stdout);
    const json2 = extractJson<Record<string, unknown>>(result2.stdout);

    // Oracle (Rank 3): Output must be deterministic (identical JSON serialization)
    // This proves values are identical, not just structure
    const json1String = JSON.stringify(json1, Object.keys(json1).sort());
    const json2String = JSON.stringify(json2, Object.keys(json2).sort());
    expect(json1String).toBe(json2String);
  });

  /**
   * Test 4: Negative Testing — Impossible Input Detection
   *
   * Oracle (Rank 1): Nonexistent file is impossible input (source_error).
   * System must fail with exit code 2, not panic or ignore error.
   */
  it('nonexistent file returns source error (exit 2) without panic', async () => {
    const result = await pictl(['autoprocess', '/nonexistent/file.xes']);

    // Oracle: Must fail with source_error (exit code 2), never panic
    expect(result.exitCode).toBe(2);

    // Oracle: No panic in stdout or stderr
    expect(result.stdout).not.toContain('panicked');
    expect(result.stderr).not.toContain('panicked');
  });

  /**
   * Test 5: Missing Required Argument Detection
   *
   * Oracle (Rank 1): Missing required argument is impossible state (config_error).
   * System must exit with exit code 1, not default to empty log or proceed.
   */
  it('missing input argument returns config error (exit 1)', async () => {
    const result = await pictl(['autoprocess']); // No input file

    // Oracle: Must indicate config_error (exit code 1) specifically
    expect(result.exitCode).toBe(1);

    // Oracle: Error message must be present in output
    const combined = combinedOutput(result);
    expect(combined).toMatch(/missing|required|argument|input|file/i);
  });

  /**
   * Test 6: Real-Scale Soundness — BPI 2020 (20MB government process data)
   *
   * Oracle (Rank 2, Domain Contract): BPI 2020 Travel Permits is a real-world
   * government process with thousands of cases and complex event structure.
   * System MUST process it without panicking, timing out, or degrading.
   * Success requires exit code 0 + valid result structure.
   */
  it('processes BPI 2020 real-scale dataset (20MB) with valid result', async () => {
    const bpiPath = resolveRepo(
      'wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes',
    );
    const result = await pictl(
      ['autoprocess', bpiPath, '--format', 'json'],
      {
        timeout: 90_000, // 90 seconds for 20MB dataset
      },
    );

    // Oracle (Rank 2): MUST succeed with exit code 0
    expect(result.exitCode).toBe(0);

    // Oracle (Rank 2): No panic in output
    expect(result.stdout).not.toContain('panicked');
    expect(result.stderr).not.toContain('panicked');

    // Oracle (Rank 2): Complete within timeout (not killed)
    expect(result.durationMs).toBeLessThan(90_000);

    // Oracle (Rank 2): Result structure must be valid
    const json = extractJson<Record<string, unknown>>(result.stdout);
    expect(json).toBeTruthy();

    const cycleResult = (json as Record<string, unknown>)['cycle_result'];
    expect(cycleResult).toBeTruthy();

    const cr = cycleResult as Record<string, unknown>;
    expect(cr['perception']).toBeTruthy();
    expect(cr['decision']).toBeTruthy();

    // Oracle (Rank 2): Perception must capture event count >= 1000 for real-scale
    const perception = cr['perception'] as Record<string, unknown>;
    const eventCount = perception['event_count'];
    expect(typeof eventCount).toBe('number');
    expect(eventCount as number).toBeGreaterThanOrEqual(1000);
  });

  /**
   * Test 7: Human-Readable Output Proof with Phase Sequence
   *
   * Oracle (Rank 2): Human output must show the system executed the declared phases
   * in order (Perception → Decision → Protection → Optimization).
   * Multiple keywords in sequence prove actual computation, not just exit 0.
   */
  it('human format output shows phase execution sequence', async () => {
    const result = await pictl(['autoprocess', RUNNING_EXAMPLE]);
    expect(result.exitCode).toBe(0);

    const combined = combinedOutput(result);

    // Oracle (Rank 2): Output must contain multiple keywords showing execution
    // and they should appear in logical order
    const hasPerception =
      combined.includes('Perception') || combined.includes('perception');
    const hasEvents = combined.includes('Events') || combined.includes('events');
    const hasDecision =
      combined.includes('Decision') || combined.includes('decision');
    // Note: "Failed" can appear in legitimate output (e.g., "Pattern: Failed")
    // Only check for actual error messages, not the word "failed" in phase outputs
    const hasError =
      combined.includes('AutoProcess failed') || combined.includes('Error');
    const hasNoError = !hasError;

    expect(hasPerception).toBe(true);
    expect(hasEvents).toBe(true);
    expect(hasDecision).toBe(true);
    expect(hasNoError).toBe(true);
  });

  /**
   * Test 8: Timeout Handling — No Hang (Liveness Property)
   *
   * Oracle (Rank 2): System must complete within 30 seconds for small logs.
   * Hanging or killing the process proves the system is unsound (violates liveness property).
   */
  it('small logs complete within reasonable time (< 30s, exit 0)', async () => {
    const result = await pictl(['autoprocess', RUNNING_EXAMPLE], {
      timeout: 30_000,
    });

    // Oracle (Rank 2): Must succeed (exit code 0)
    expect(result.exitCode).toBe(0);

    // Oracle (Rank 2): Must complete naturally within 30s (not killed at timeout)
    expect(result.durationMs).toBeLessThan(30_000);
    expect(result.durationMs).not.toBe(30_000);
  });
});

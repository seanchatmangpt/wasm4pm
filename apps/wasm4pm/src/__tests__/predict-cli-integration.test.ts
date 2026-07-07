/**
 * Predict Command CLI Integration Tests
 *
 * Tests the `wpm predict` command via runCli() harness.
 * Validates CLI contract: exit codes, JSON envelope format, flag handling.
 *
 * JTBD: RevOps analyst predicts next activity in sales pipeline
 *   - Given: Event log (XES format)
 *   - When: `wpm predict next-activity -i log.xes`
 *   - Then: JSON envelope with predictions array, exit code 0
 *
 * Test categories:
 * - T1: Basic success case (next-activity, JSON envelope, exit 0)
 * - T2: Predictions array structure and top-k filtering
 * - T3: CLI flag respect (--top-k, --ngram-order, --activity-key)
 * - T4: Error handling (missing file, bad input)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';

// ─── Test fixture: minimal XES log ──────────────────────────────────────────

const MIN_XES_LOG = `<?xml version="1.0" encoding="utf-8"?>
<log xes.version="1849-2016" xmlns="http://www.xes-standard.org/">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="register"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="approve"/>
      <date key="time:timestamp" value="2026-01-01T10:15:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="invoice"/>
      <date key="time:timestamp" value="2026-01-01T10:30:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event>
      <string key="concept:name" value="register"/>
      <date key="time:timestamp" value="2026-01-02T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="approve"/>
      <date key="time:timestamp" value="2026-01-02T10:15:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="invoice"/>
      <date key="time:timestamp" value="2026-01-02T10:30:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_3"/>
    <event>
      <string key="concept:name" value="register"/>
      <date key="time:timestamp" value="2026-01-03T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="approve"/>
      <date key="time:timestamp" value="2026-01-03T10:15:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="invoice"/>
      <date key="time:timestamp" value="2026-01-03T10:30:00Z"/>
    </event>
  </trace>
</log>`;

// ─── Helper: extract JSON envelope from CLI output ────────────────────────

function extractJsonEnvelope(output: string): Record<string, unknown> {
  // Find the first { and match to the corresponding }
  const startIdx = output.indexOf('{');
  if (startIdx === -1) {
    throw new Error(`No JSON object found in output:\n${output.slice(0, 500)}`);
  }

  let braceCount = 0;
  let endIdx = -1;
  for (let i = startIdx; i < output.length; i++) {
    if (output[i] === '{') braceCount++;
    else if (output[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) {
    throw new Error(`Could not find matching closing brace:\n${output.slice(0, 500)}`);
  }

  const jsonStr = output.slice(startIdx, endIdx + 1);
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${(e as Error).message}\nJSON:\n${jsonStr.slice(0, 500)}`);
  }
}

describe('wpm predict CLI integration', () => {
  let testEnv: Awaited<ReturnType<typeof createCliTestEnv>>;
  let logPath: string;

  beforeAll(async () => {
    // Create isolated test environment
    testEnv = await createCliTestEnv();
    // Write minimal XES fixture
    logPath = path.join(testEnv.tempDir, 'test-log.xes');
    await fs.writeFile(logPath, MIN_XES_LOG, 'utf-8');
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  // ─── T1: Basic success case ──────────────────────────────────────────────

  it('T1: wpm predict next-activity exits with code 0 and returns JSON envelope', async () => {
    const result = await runCli(['model', 'predict', 'next-activity', '-i', logPath, '--format', 'json']);

    // Assertion 1: Exit code is success
    expect(result.exitCode).toBe(EXIT_CODES.success);

    // Assertion 2: stdout is valid JSON envelope
    const output = extractJsonEnvelope(result.stdout);
    expect(output).toHaveProperty('status');
    expect(['ok', 'success']).toContain(output.status);

    // Assertion 3: JSON envelope has required structure
    expect(output).toHaveProperty('payload');
    expect(output.payload).toHaveProperty('task');
    expect((output.payload as Record<string, unknown>).task).toBe('next-activity');
  });

  // ─── T2: Predictions array structure and top-k filtering ──────────────────

  it('T2: predictions array contains activity objects with probability', async () => {
    const result = await runCli([
      'model',
      'predict',
      'next-activity',
      '-i',
      logPath,
      '--format',
      'json',
      '--top-k',
      '2',
    ]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = extractJsonEnvelope(result.stdout);
    const payload = output.payload as Record<string, unknown>;

    // Assertion 1: predictions is an array
    expect(Array.isArray(payload.predictions)).toBe(true);

    // Assertion 2: each prediction has activity and probability
    const predictions = payload.predictions as Array<Record<string, unknown>>;
    for (const pred of predictions) {
      expect(pred).toHaveProperty('activity');
      expect(typeof pred.activity).toBe('string');
      expect(pred).toHaveProperty('probability');
      expect(typeof pred.probability).toBe('number');
      expect(pred.probability as number).toBeGreaterThanOrEqual(0);
      expect(pred.probability as number).toBeLessThanOrEqual(1);
    }

    // Assertion 3: top-k filtering works (max 2 results)
    expect(predictions.length).toBeLessThanOrEqual(2);
  });

  // ─── T3: CLI flags respect (--top-k, --ngram-order, --activity-key) ────────

  it('T3: respects --top-k flag to limit prediction count', async () => {
    // Test with --top-k 1
    const result = await runCli([
      'model',
      'predict',
      'next-activity',
      '-i',
      logPath,
      '--format',
      'json',
      '--top-k',
      '1',
    ]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = extractJsonEnvelope(result.stdout);
    const payload = output.payload as Record<string, unknown>;
    const predictions = payload.predictions as Array<unknown>;

    // Should return at most 1 prediction
    expect(predictions.length).toBeLessThanOrEqual(1);
  });

  it('T3: respects --activity-key flag for activity attribute', async () => {
    const result = await runCli([
      'model',
      'predict',
      'next-activity',
      '-i',
      logPath,
      '--format',
      'json',
      '--activity-key',
      'concept:name',
    ]);

    expect(result.exitCode).toBe(EXIT_CODES.success);
    const output = extractJsonEnvelope(result.stdout);
    const payload = output.payload as Record<string, unknown>;

    // Verify payload contains the activity-key that was requested
    expect(payload).toHaveProperty('activityKey');
    expect(payload.activityKey).toBe('concept:name');
  });

  // ─── T4: Error handling (missing file, bad input) ────────────────────────

  // NOTE on the T4 rewrites below: a failing `model predict` invocation
  // (bridged to `commands/predict.ts` via `nouns/_bridge.ts`) no longer
  // returns the legacy `{command,status,exit_code,payload,meta}` envelope on
  // stdout — bridged failures are re-thrown as a `NounVerbError` and
  // serialized as ONLY `{error:{code,message}}` (see
  // `packages/noun-verb/src/errors.ts`: "the ONLY shape a verb error ever
  // serializes to on stdout"). The legacy `INVALID_TASK`/`INVALID_ARG`
  // error codes are gone too — `classifyLegacyFailure` (`nouns/_bridge.ts`)
  // collapses every legacy config_error(1)/source_error(2) onto the single
  // framework code `INVALID_INPUT`, which wpm's error-code map resolves to
  // process exit 2 (source_error) — the legacy 1 vs 2 distinction is lost
  // (a documented, coarser-not-lossless mapping). The process exit code
  // (`result.exitCode`) is the correct place to check outcome; the old
  // `output.exit_code`/`output.status` fields don't exist on this shape.

  it('T4: exits with code 2 (SOURCE_ERROR) when input file does not exist', async () => {
    const result = await runCli([
      'model',
      'predict',
      'next-activity',
      '-i',
      '/nonexistent/path/to/log.xes',
      '--format',
      'json',
    ]);

    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const output = extractJsonEnvelope(result.stdout);
    expect((output.error as Record<string, unknown>).code).toBe('INVALID_INPUT');
  });

  it('T4: reports INVALID_INPUT (exit 2) when task is invalid', async () => {
    const result = await runCli([
      'model',
      'predict',
      'invalid-task',
      '-i',
      logPath,
      '--format',
      'json',
    ]);

    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const output = extractJsonEnvelope(result.stdout);
    expect((output.error as Record<string, unknown>).code).toBe('INVALID_INPUT');
    expect(String((output.error as Record<string, unknown>).message)).toMatch(/unknown task/i);
  });

  it('T4: reports INVALID_INPUT (exit 2, not the legacy config_error 1) when --top-k is not a number', async () => {
    const result = await runCli([
      'model',
      'predict',
      'next-activity',
      '-i',
      logPath,
      '--format',
      'json',
      '--top-k',
      'not-a-number',
    ]);

    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const output = extractJsonEnvelope(result.stdout);
    expect((output.error as Record<string, unknown>).code).toBe('INVALID_INPUT');
    expect(String((output.error as Record<string, unknown>).message)).toMatch(/top-k/i);
  });
});

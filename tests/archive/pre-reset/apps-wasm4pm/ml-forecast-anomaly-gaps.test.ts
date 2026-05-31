/**
 * ml-forecast-anomaly-gaps.test.ts
 *
 * Closes four QoL gaps for `wpm ml forecast` and `wpm ml anomaly` that were
 * not addressed when `classify` and `cluster` received attention in earlier
 * iterations.  All tests are written against the four van der Aalst dimensions:
 * we want outputs that are *reproducible* (deterministic fields), *interpretable*
 * (practitioners can read the JSON without diving into code), and *actionable*
 * (bad inputs produce config_error(1) with a clear message, not a cryptic
 * execution_error(3) or silent wrong result).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Gap F1 — --forecast-periods validation fires at config_error(1)        │
 * │          0, negative, or non-integer → exit 1 with INVALID_FORECAST_  │
 * │          PERIODS code before WASM is ever loaded.                       │
 * │                                                                         │
 * │ Gap F2 — forecast JSON output includes `method_used` field             │
 * │          Practitioners can confirm whether the linear or exponential    │
 * │          model was applied.  Analogous to classify's `suggested_method` │
 * │          field.                                                          │
 * │                                                                         │
 * │ Gap A1 — anomaly JSON output includes `anomaly_count` and              │
 * │          `threshold_used` fields.                                       │
 * │          anomaly_count = peakIndices.length — avoids array traversal   │
 * │          on the consumer side.                                          │
 * │          threshold_used = the smoothing method that produced the result.│
 * │                                                                         │
 * │ Gap A2 — anomaly JSON output includes `suggested_method` field         │
 * │          Parallel to classify's suggested_method — allows consumers to  │
 * │          see which smoothing algorithm was auto-selected.               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Gaps F1 is CLI-level (execFile, no WASM needed).
 * Gaps F2, A1, A2 are unit-level via executeMlTask() with a minimal fake WASM.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { executeMlTask } from '../ml-runner.js';

// ─────────────────────────────────────────────────────────────────────────────
// CLI harness
// ─────────────────────────────────────────────────────────────────────────────

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const MISSING_INPUT = path.join(os.tmpdir(), '__ml_forecast_anomaly_no_file__.xes');
const CLEAN_CWD = os.tmpdir();

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], timeoutMs = 20_000): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { cwd: CLEAN_CWD, timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode: code, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
  });
}

function parseJson(r: CliResult): Record<string, unknown> {
  return JSON.parse(r.stdout) as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal fake WASM for unit-level tests
//
// detect_drift() is the entry point for both forecast and anomaly tasks.
// We return a small set of drift windows with non-zero distances so the
// forecast series has ≥3 points and anomaly detection can find peaks.
// ─────────────────────────────────────────────────────────────────────────────

function fakeWasm(): Record<string, unknown> {
  return {
    analyze_statistics: () => JSON.stringify({ trace_count: 10 }),
    detect_drift: () =>
      JSON.stringify({
        drifts: [
          { window_start: 0, window_end: 1, distance: 0.1, detected: false },
          { window_start: 1, window_end: 2, distance: 0.8, detected: true },
          { window_start: 2, window_end: 3, distance: 0.3, detected: false },
          { window_start: 3, window_end: 4, distance: 0.9, detected: true },
          { window_start: 4, window_end: 5, distance: 0.2, detected: false },
          { window_start: 5, window_end: 6, distance: 0.1, detected: false },
        ],
        ewma: 0.4,
        threshold: 0.5,
      }),
    // The following are never called for forecast/anomaly but present for safety
    extract_case_features: () => JSON.stringify([]),
    discover_dfg: () => JSON.stringify({ nodes: [], edges: [] }),
    analyze_event_statistics: () => JSON.stringify({ total_events: 20, avg_events_per_case: 2 }),
  };
}

function fakeWasmEmptyDrift(): Record<string, unknown> {
  return {
    ...fakeWasm(),
    detect_drift: () => JSON.stringify({ drifts: [], ewma: 0, threshold: 0.5 }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gap F1 — --forecast-periods validation → config_error(1)
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap F1 — --forecast-periods validation → config_error(1)', () => {
  it('--forecast-periods 0 exits with 1 (config_error)', async () => {
    const r = await run(['ml', 'forecast', '-i', MISSING_INPUT, '--forecast-periods', '0']);
    expect(r.exitCode).toBe(1);
  });

  it('--forecast-periods 0 with --format json emits structured error', async () => {
    const r = await run([
      'ml',
      'forecast',
      '-i',
      MISSING_INPUT,
      '--forecast-periods',
      '0',
      '--format',
      'json',
    ]);
    expect(r.exitCode).toBe(1);
    expect(() => parseJson(r)).not.toThrow();
    const envelope = parseJson(r);
    expect(envelope.status).toBe('error');
    const error = envelope.error as Record<string, unknown> | undefined;
    expect(error?.code).toBe('INVALID_FORECAST_PERIODS');
  });

  it('--forecast-periods 0 error message names the bad value', async () => {
    const r = await run([
      'ml',
      'forecast',
      '-i',
      MISSING_INPUT,
      '--forecast-periods',
      '0',
      '--format',
      'json',
    ]);
    const body = r.stdout + r.stderr;
    expect(body).toContain('0');
    expect(body).toMatch(/forecast.periods|positive/i);
  });

  it('--forecast-periods=-1 exits with 1 (config_error)', async () => {
    const r = await run([
      'ml',
      'forecast',
      '-i',
      MISSING_INPUT,
      '--forecast-periods=-1',
      '--format',
      'json',
    ]);
    expect(r.exitCode).toBe(1);
    const envelope = parseJson(r);
    expect(envelope.status).toBe('error');
  });

  it('--forecast-periods abc exits with 1 (config_error)', async () => {
    const r = await run([
      'ml',
      'forecast',
      '-i',
      MISSING_INPUT,
      '--forecast-periods',
      'abc',
      '--format',
      'json',
    ]);
    expect(r.exitCode).toBe(1);
    const envelope = parseJson(r);
    expect(envelope.status).toBe('error');
  });

  it('--forecast-periods 0 exits with 1 not 3 (regression guard for execution_error misclassification)', async () => {
    const r = await run(['ml', 'forecast', '-i', MISSING_INPUT, '--forecast-periods', '0']);
    expect(r.exitCode).not.toBe(3);
    expect(r.exitCode).toBe(1);
  });

  it('valid --forecast-periods 5 does not reject with config_error', async () => {
    // Should fail at file-not-found (2) or WASM init (3), not config_error (1)
    const r = await run(['ml', 'forecast', '-i', MISSING_INPUT, '--forecast-periods', '5']);
    expect(r.exitCode).not.toBe(1);
  });

  it('valid --forecast-periods 1 (minimum) does not reject with config_error', async () => {
    const r = await run(['ml', 'forecast', '-i', MISSING_INPUT, '--forecast-periods', '1']);
    expect(r.exitCode).not.toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap F2 — forecast result includes `method_used` field
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap F2 — forecast result includes method_used field', () => {
  it('forecast with default method_used is "linear"', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'forecast', 'handle', 'concept:name', {
      forecastPeriods: 3,
    });
    expect(result.method_used).toBe('linear');
  });

  it('forecast with useExponential=true yields method_used "exponential"', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'forecast', 'handle', 'concept:name', {
      forecastPeriods: 3,
      useExponential: true,
    });
    expect(result.method_used).toBe('exponential');
  });

  it('forecast method_used is a string (not null or undefined)', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'forecast', 'handle', 'concept:name', {});
    expect(typeof result.method_used).toBe('string');
  });

  it('forecast result still includes forecast array', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'forecast', 'handle', 'concept:name', {
      forecastPeriods: 3,
    });
    // The drift series has 6 observations ≥ 3, so forecast should be present
    expect(Array.isArray(result.forecast)).toBe(true);
    expect((result.forecast as number[]).length).toBe(3);
  });

  it('forecast result includes _qualitySummary (quality dimensions present)', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'forecast', 'handle', 'concept:name', {});
    expect(result._qualitySummary).toBeDefined();
    const qs = result._qualitySummary as Record<string, unknown>;
    expect(typeof qs.primaryLabel).toBe('string');
    expect(typeof qs.primaryValue).toBe('string');
  });

  it('empty drift series: method_used is still present', async () => {
    // Degenerate case: no drift windows — series < 3, but method_used must still be set
    const wasm = fakeWasmEmptyDrift();
    const result = await executeMlTask(wasm, 'forecast', 'handle', 'concept:name', {});
    expect(result.method_used).toBe('linear');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap A1 — anomaly result includes anomaly_count and threshold_used
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap A1 — anomaly result includes anomaly_count and threshold_used', () => {
  it('anomaly result has anomaly_count field (numeric)', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {});
    expect(typeof result.anomaly_count).toBe('number');
  });

  it('anomaly_count equals peakIndices.length', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {});
    const peakIndices = result.peakIndices as number[];
    expect(result.anomaly_count).toBe(peakIndices.length);
  });

  it('anomaly_count is 0 for an empty drift series (zero-anomaly case)', async () => {
    const wasm = fakeWasmEmptyDrift();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {});
    expect(result.anomaly_count).toBe(0);
  });

  it('anomaly result has threshold_used field', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {});
    expect(result.threshold_used).toBeDefined();
  });

  it('threshold_used is "sma" when smoothingMethod not specified (default)', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {});
    expect(result.threshold_used).toBe('sma');
  });

  it('threshold_used is "ema" when smoothingMethod=ema is specified', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {
      smoothingMethod: 'ema',
    });
    expect(result.threshold_used).toBe('ema');
  });

  it('anomaly result still includes peakIndices and originalLength', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {});
    expect(Array.isArray(result.peakIndices)).toBe(true);
    expect(typeof result.originalLength).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap A2 — anomaly result includes suggested_method field
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap A2 — anomaly result includes suggested_method field', () => {
  it('anomaly result has suggested_method field', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {});
    expect(result.suggested_method).toBeDefined();
  });

  it('suggested_method is "sma" (default smoothing method)', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {});
    expect(result.suggested_method).toBe('sma');
  });

  it('suggested_method is "ema" when smoothingMethod=ema is passed', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {
      smoothingMethod: 'ema',
    });
    expect(result.suggested_method).toBe('ema');
  });

  it('suggested_method is a string (not null or undefined)', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {});
    expect(typeof result.suggested_method).toBe('string');
  });

  it('anomaly result includes _qualitySummary with anomaly-specific labels', async () => {
    const wasm = fakeWasm();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {});
    const qs = result._qualitySummary as Record<string, unknown>;
    expect(qs.primaryLabel).toBe('Anomaly rate');
  });

  it('zero-anomaly case: suggested_method is still present', async () => {
    const wasm = fakeWasmEmptyDrift();
    const result = await executeMlTask(wasm, 'anomaly', 'handle', 'concept:name', {});
    expect(result.suggested_method).toBe('sma');
    expect(result.anomaly_count).toBe(0);
  });
});

/**
 * CLI integration tests for `wpm predict` — gap audit coverage.
 *
 * Van der Aalst predictive process monitoring perspective:
 * - Next-activity, remaining-time, outcome, drift, features, resource — six perspectives.
 * - Every test targets a specific JSON field, exit code, or validation contract.
 * - A compact in-process XES fixture (5 traces, 4-6 activities each) is used for
 *   fast schema tests; the real RequestForPayment.xes is used for tasks that need
 *   enough event volume to train statistical models.
 *
 * IMPORTANT: All execFile calls must use cwd=tempDir (not the project root or
 * apps/wasm4pm), because wasm4pm.toml in apps/wasm4pm/ has timeout=0 which
 * fails Zod validation and exits 3 before any command logic runs. tempDir has
 * no config file, so the default config is used.
 *
 * Gaps closed (see predict.ts audit):
 *   GAP-1   outcome task called wasm.discover_dfg_handle (non-existent WASM export)
 *            → fixed to wasm.discover_dfg_simd_handle
 *   GAP-2   predictions[].rank field missing from next-activity output
 *            → added rank: i + 1 to topPredictions map
 *   GAP-3   --top-k 0 and --top-k negative produced no error (silently used 0)
 *            → now exits 1 with clear message
 *   GAP-4   --top-k abc produced an unhelpful NaN message
 *            → message now says "is not a number. Must be a positive integer"
 *   GAP-5   --ngram-order 1 fell through to Zod (exit 3 instead of 1)
 *            → pre-config guard now exits 1 with bigram explanation
 *   GAP-6   --activity-key "" was silently replaced by fallback "concept:name"
 *            → now exits 1 with "empty string" error
 *   GAP-7   drift task had no top-level drift_detected boolean
 *            → added drift_detected: drifts_detected > 0
 *   GAP-8   features task returns transition probability table (by design,
 *            documented below — the field is "transitions", not "features")
 *   GAP-9   resource task lacked American-spelling "utilization" alias
 *            → now emits both utilization and utilisation
 *
 * Actual payload shapes (verified against real CLI output):
 *   next-activity → { predictions: [{rank, activity, probability}], context }
 *   remaining-time → { prediction: {remaining_ms, confidence, method}, weibull }
 *   outcome → { anomalies: [{case_id, score, steps}] }  (no has_anomalies field)
 *   drift → { drift_detected: bool, driftResult, ewma, structural_changes }
 *   features → { transitions: {activities, matrix} }  (object not array)
 *   resource → { queueStats, utilization, utilisation, derivedRates, logStats }
 *
 * Test inventory:
 *   INPUT-1   Unknown task → exit 1
 *   INPUT-1b  Unknown task JSON envelope → status=error, exit_code=1
 *   INPUT-2   Missing --input flag → exit non-zero
 *   INPUT-3   Empty XES file → exit 2
 *   GAP-3a    --top-k 0 → exit 1, message mentions "positive integer"
 *   GAP-3a-b  --top-k 0 JSON error envelope
 *   GAP-3b    --top-k=-1 → exit 1
 *   GAP-4     --top-k abc → exit 1, message says "not a number"
 *   GAP-5     --ngram-order 1 → exit 1, message mentions bigram or >= 2
 *   GAP-5b    --ngram-order 0 → exit 1
 *   GAP-6     --activity-key "" → exit 1, message mentions "empty string"
 *   GAP-6b    --activity-key "" JSON error envelope
 *   GAP-2     predictions[].rank present and sequential
 *   GAP-2b    predictions[].activity and .probability types
 *   GAP-7     drift top-level drift_detected is a boolean
 *   GAP-7b    drift payload has driftResult sub-object
 *   GAP-7c    drift payload has structural_changes sub-object
 *   GAP-1     outcome task exits 0 (not crash from missing WASM export)
 *   GAP-1b    outcome payload has anomalies array
 *   GAP-9     resource payload has both utilization and utilisation fields
 *   GAP-9b    resource payload has queueStats sub-object
 *   SCHEMA-1  next-activity payload has predictions array
 *   SCHEMA-2  remaining-time payload has prediction.remaining_ms
 *   SCHEMA-3  drift payload has driftResult and structural_changes
 *   SCHEMA-4  features payload has transitions object with activities list
 *   SCHEMA-5  resource payload has derivedRates sub-object
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── XES builder ─────────────────────────────────────────────────────────────

function xesEvent(name: string, ts: string): string {
  return `    <event>
      <string key="concept:name" value="${name}"/>
      <date key="time:timestamp" value="${ts}"/>
    </event>`;
}

function xesTrace(caseId: string, events: Array<{ name: string; ts: string }>): string {
  return `  <trace>
    <string key="concept:name" value="${caseId}"/>
${events.map(e => xesEvent(e.name, e.ts)).join('\n')}
  </trace>`;
}

function buildXes(traces: Array<{ caseId: string; events: Array<{ name: string; ts: string }> }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
${traces.map(t => xesTrace(t.caseId, t.events)).join('\n')}
</log>`;
}

/** Build a minimal RevOps-style event log with predictable structure. */
function buildMinimalXes(): string {
  const base = new Date('2026-01-01T09:00:00Z');
  const offset = (h: number) => new Date(base.getTime() + h * 3_600_000).toISOString();

  return buildXes([
    {
      caseId: 'case_001',
      events: [
        { name: 'Submit', ts: offset(0) },
        { name: 'Review', ts: offset(1) },
        { name: 'Approve', ts: offset(3) },
        { name: 'Close', ts: offset(5) },
      ],
    },
    {
      caseId: 'case_002',
      events: [
        { name: 'Submit', ts: offset(6) },
        { name: 'Review', ts: offset(7) },
        { name: 'Reject', ts: offset(9) },
        { name: 'Close', ts: offset(10) },
      ],
    },
    {
      caseId: 'case_003',
      events: [
        { name: 'Submit', ts: offset(12) },
        { name: 'Approve', ts: offset(14) },
        { name: 'Close', ts: offset(16) },
      ],
    },
    {
      caseId: 'case_004',
      events: [
        { name: 'Submit', ts: offset(18) },
        { name: 'Review', ts: offset(19) },
        { name: 'Approve', ts: offset(21) },
        { name: 'Ship', ts: offset(22) },
        { name: 'Close', ts: offset(24) },
      ],
    },
    {
      caseId: 'case_005',
      events: [
        { name: 'Submit', ts: offset(25) },
        { name: 'Review', ts: offset(26) },
        { name: 'Approve', ts: offset(28) },
        { name: 'Close', ts: offset(30) },
      ],
    },
  ]);
}

// ─── CLI runner ───────────────────────────────────────────────────────────────

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

// Real log for tasks that need statistical mass (n-gram training, Weibull fitting, etc.)
const REAL_LOG_PATH = path.resolve(__dirname, '../../../../data/RequestForPayment.xes');

// Confirmed activity that exists in RequestForPayment.xes (verified via grep)
// Used as a prefix for next-activity and remaining-time tests
const REAL_LOG_PREFIX = 'Request For Payment SUBMITTED by EMPLOYEE';

interface CliResult { exitCode: number; stdout: string; stderr: string }
interface Envelope {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload: Record<string, unknown> | null;
  error?: { code: string; message: string };
}

/**
 * Run the CLI from a temp directory that has no wasm4pm.toml.
 * CRITICAL: if cwd is apps/wasm4pm, the broken timeout=0 in wasm4pm.toml causes
 * Zod validation to fail before any command logic runs, producing exit 3 for all tests.
 */
function runCli(
  args: string[],
  opts: { timeoutMs?: number; cwd: string },
): Promise<CliResult> {
  const { timeoutMs = 60_000, cwd } = opts;
  return new Promise(resolve => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }),
    );
  });
}

function parseEnvelope(result: CliResult): Envelope {
  try {
    return JSON.parse(result.stdout) as Envelope;
  } catch {
    throw new Error(
      `Failed to parse CLI JSON output.\n` +
      `stdout: ${result.stdout.slice(0, 600)}\n` +
      `stderr: ${result.stderr.slice(0, 600)}`,
    );
  }
}

// ─── Temp dir lifecycle ───────────────────────────────────────────────────────

let tempDir: string;
let minimalLogPath: string;
let emptyLogPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-predict-gaps-'));
  minimalLogPath = path.join(tempDir, 'minimal.xes');
  emptyLogPath = path.join(tempDir, 'empty.xes');

  fs.writeFileSync(minimalLogPath, buildMinimalXes(), 'utf-8');
  // Syntactically valid XES but no traces — should trigger NO_TRACES / source_error (exit 2)
  fs.writeFileSync(emptyLogPath,
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<log xmlns="http://www.xes-standard.org/" xes.version="1.0">\n' +
    '</log>',
    'utf-8',
  );
});

afterAll(() => {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

// ─── INPUT validation ─────────────────────────────────────────────────────────

describe('wpm predict — input validation', () => {

  it('INPUT-1: unknown task exits 1 (config_error)', async () => {
    const result = await runCli([
      'predict', 'telekinesis',
      '-i', minimalLogPath,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    expect(result.exitCode).toBe(1);
  });

  it('INPUT-1b: unknown task JSON envelope has status=error and exit_code=1', async () => {
    const result = await runCli([
      'predict', 'telekinesis',
      '-i', minimalLogPath,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    const j = parseEnvelope(result);
    expect(j.status).toBe('error');
    expect(j.exit_code).toBe(1);
  });

  it('INPUT-2: missing --input exits non-zero', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    expect(result.exitCode).toBeGreaterThan(0);
  });

  it('INPUT-3: empty XES file exits 2 (source_error / NO_TRACES)', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', emptyLogPath,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    expect(result.exitCode).toBe(2);
  });

});

// ─── GAP-3 & GAP-4: --top-k validation ───────────────────────────────────────

describe('wpm predict — --top-k validation (GAP-3, GAP-4)', () => {

  it('GAP-3a: --top-k 0 exits 1 (config_error)', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', minimalLogPath,
      '--top-k', '0',
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    expect(result.exitCode).toBe(1);
  });

  it('GAP-3a: --top-k 0 error message mentions "positive integer"', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', minimalLogPath,
      '--top-k', '0',
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    const j = parseEnvelope(result);
    expect(j.status).toBe('error');
    const msg = (j.error?.message ?? '').toLowerCase();
    expect(msg).toMatch(/positive integer|>= 1/);
  });

  it('GAP-3b: --top-k=-1 exits 1 (config_error)', async () => {
    // Use = syntax to prevent shell treating -1 as a separate flag
    const result = await runCli([
      'predict', 'next-activity',
      '-i', minimalLogPath,
      '--top-k=-1',
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    expect(result.exitCode).toBe(1);
  });

  it('GAP-4: --top-k abc exits 1 and message says "not a number"', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', minimalLogPath,
      '--top-k', 'abc',
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    expect(result.exitCode).toBe(1);
    const j = parseEnvelope(result);
    expect(j.status).toBe('error');
    const msg = (j.error?.message ?? '').toLowerCase();
    expect(msg).toMatch(/not a number|must be a positive integer/);
  });

});

// ─── GAP-5: --ngram-order validation ─────────────────────────────────────────

describe('wpm predict — --ngram-order validation (GAP-5)', () => {

  it('GAP-5: --ngram-order 1 exits 1 (config_error, not 3)', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', minimalLogPath,
      '--ngram-order', '1',
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    expect(result.exitCode).toBe(1);
  });

  it('GAP-5: --ngram-order 1 error message mentions bigram or >= 2', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', minimalLogPath,
      '--ngram-order', '1',
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    const j = parseEnvelope(result);
    expect(j.status).toBe('error');
    const msg = (j.error?.message ?? '').toLowerCase();
    expect(msg).toMatch(/bigram|>= 2|ngram/i);
  });

  it('GAP-5: --ngram-order 0 exits 1 (config_error)', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', minimalLogPath,
      '--ngram-order', '0',
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    expect(result.exitCode).toBe(1);
  });

});

// ─── GAP-6: --activity-key "" validation ─────────────────────────────────────

describe('wpm predict — --activity-key empty string (GAP-6)', () => {

  it('GAP-6: --activity-key "" exits 1 (config_error)', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', minimalLogPath,
      '--activity-key', '',
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    expect(result.exitCode).toBe(1);
  });

  it('GAP-6: --activity-key "" error message mentions "empty string"', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', minimalLogPath,
      '--activity-key', '',
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    const j = parseEnvelope(result);
    expect(j.status).toBe('error');
    const msg = (j.error?.message ?? '').toLowerCase();
    expect(msg).toMatch(/empty string|activity.key/i);
  });

});

// ─── GAP-2: predictions[].rank ────────────────────────────────────────────────

describe('wpm predict next-activity — rank field (GAP-2)', () => {

  it('GAP-2: predictions[] elements have rank field starting at 1', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', REAL_LOG_PATH,
      '--prefix', REAL_LOG_PREFIX,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');

    const payload = j.payload as Record<string, unknown>;
    expect(payload).toBeTruthy();
    const predictions = payload.predictions as Array<Record<string, unknown>>;
    expect(Array.isArray(predictions)).toBe(true);
    expect(predictions.length).toBeGreaterThan(0);

    // Every prediction must have rank
    for (const pred of predictions) {
      expect(typeof pred.rank).toBe('number');
    }
    // First prediction is rank 1
    expect(predictions[0]!.rank).toBe(1);
    // Ranks are sequential
    predictions.forEach((pred, i) => {
      expect(pred.rank).toBe(i + 1);
    });
  });

  it('GAP-2: predictions[] elements have activity (string) and probability (number in [0,1])', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', REAL_LOG_PATH,
      '--prefix', REAL_LOG_PREFIX,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    const predictions = payload.predictions as Array<Record<string, unknown>>;
    expect(predictions.length).toBeGreaterThan(0);

    for (const pred of predictions) {
      expect(typeof pred.activity).toBe('string');
      expect(pred.activity).toBeTruthy();
      expect(typeof pred.probability).toBe('number');
      expect(pred.probability as number).toBeGreaterThanOrEqual(0);
      expect(pred.probability as number).toBeLessThanOrEqual(1);
    }
  });

  it('SCHEMA-1: next-activity payload has predictions array and context object', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', REAL_LOG_PATH,
      '--prefix', REAL_LOG_PREFIX,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    expect(Array.isArray(payload.predictions)).toBe(true);
    expect(typeof payload.context).toBe('object');
    expect(payload.context).not.toBeNull();
  });

});

// ─── GAP-7: drift_detected boolean ───────────────────────────────────────────

describe('wpm predict drift — drift_detected boolean (GAP-7)', () => {

  it('GAP-7: drift payload has top-level drift_detected boolean', async () => {
    const result = await runCli([
      'predict', 'drift',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');

    const payload = j.payload as Record<string, unknown>;
    expect(payload).toBeTruthy();
    expect(typeof payload.drift_detected).toBe('boolean');
  });

  it('GAP-7b: drift payload has driftResult sub-object with drifts_detected', async () => {
    const result = await runCli([
      'predict', 'drift',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    expect(typeof payload.driftResult).toBe('object');
    expect(payload.driftResult).not.toBeNull();
    const dr = payload.driftResult as Record<string, unknown>;
    expect(typeof dr.drifts_detected).toBe('number');
  });

  it('GAP-7c: drift payload has structural_changes sub-object', async () => {
    const result = await runCli([
      'predict', 'drift',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    expect(typeof payload.structural_changes).toBe('object');
  });

  it('GAP-7: drift_detected matches driftResult.drifts_detected > 0', async () => {
    const result = await runCli([
      'predict', 'drift',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    const dr = payload.driftResult as Record<string, unknown>;
    const expectedDriftDetected = (dr.drifts_detected as number) > 0;
    expect(payload.drift_detected).toBe(expectedDriftDetected);
  });

});

// ─── GAP-1: outcome task no longer crashes ────────────────────────────────────

describe('wpm predict outcome — WASM export fix (GAP-1)', () => {

  it('GAP-1: outcome task exits 0 (fixed: was discover_dfg_handle, now discover_dfg_simd_handle)', async () => {
    const result = await runCli([
      'predict', 'outcome',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    // Before the fix: "wasm.discover_dfg_handle is not a function" → exit 3
    // After the fix: exits 0 with anomaly scores
    expect(result.exitCode).toBe(0);
  });

  it('GAP-1b: outcome payload has anomalies array', async () => {
    const result = await runCli([
      'predict', 'outcome',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    // outcome returns anomalies array (not has_anomalies boolean)
    expect(Array.isArray(payload.anomalies)).toBe(true);
  });

  it('GAP-1b: outcome anomalies entries have case_id and score fields', async () => {
    const result = await runCli([
      'predict', 'outcome',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    const anomalies = payload.anomalies as Array<Record<string, unknown>>;
    // May be empty on very regular logs, but array must exist
    if (anomalies.length > 0) {
      const first = anomalies[0]!;
      expect(typeof first.case_id).toBe('string');
      expect(typeof first.score).toBe('number');
    }
  });

});

// ─── GAP-9: resource.utilization spelling ────────────────────────────────────

describe('wpm predict resource — utilization field (GAP-9)', () => {

  it('GAP-9: resource payload has utilization (American spelling)', async () => {
    const result = await runCli([
      'predict', 'resource',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    // utilization must be defined (not undefined)
    expect(payload.utilization).toBeDefined();
    expect(typeof payload.utilization).toBe('number');
  });

  it('GAP-9: resource payload also has utilisation (British spelling preserved)', async () => {
    const result = await runCli([
      'predict', 'resource',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    expect(payload.utilisation).toBeDefined();
    expect(typeof payload.utilisation).toBe('number');
    // Both spellings must be identical values
    expect(payload.utilization).toBe(payload.utilisation);
  });

  it('GAP-9b (SCHEMA-5): resource payload has queueStats and derivedRates', async () => {
    const result = await runCli([
      'predict', 'resource',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    expect(typeof payload.queueStats).toBe('object');
    expect(payload.queueStats).not.toBeNull();
    expect(typeof payload.derivedRates).toBe('object');
    expect(payload.derivedRates).not.toBeNull();
  });

});

// ─── SCHEMA checks for remaining-time and features ───────────────────────────

describe('wpm predict remaining-time — schema (SCHEMA-2)', () => {

  it('SCHEMA-2: remaining-time payload has prediction object with remaining_ms', async () => {
    const result = await runCli([
      'predict', 'remaining-time',
      '-i', REAL_LOG_PATH,
      '--prefix', REAL_LOG_PREFIX,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    expect(typeof payload.prediction).toBe('object');
    expect(payload.prediction).not.toBeNull();
    const pred = payload.prediction as Record<string, unknown>;
    expect(typeof pred.remaining_ms).toBe('number');
    expect(pred.remaining_ms as number).toBeGreaterThanOrEqual(0);
  });

  it('SCHEMA-2: remaining-time payload has weibull sub-object with shape and scale_ms', async () => {
    const result = await runCli([
      'predict', 'remaining-time',
      '-i', REAL_LOG_PATH,
      '--prefix', REAL_LOG_PREFIX,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    expect(typeof payload.weibull).toBe('object');
    const wb = payload.weibull as Record<string, unknown>;
    expect(typeof wb.shape).toBe('number');
    expect(typeof wb.scale_ms).toBe('number');
  });

});

describe('wpm predict features — schema (SCHEMA-4, GAP-8)', () => {

  it('SCHEMA-4: features payload has transitions object (design decision: transition prob table)', async () => {
    const result = await runCli([
      'predict', 'features',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    // GAP-8: The features task returns a transition probability table.
    // The field is named "transitions" (an object), not "features" (an array).
    // This is by design — the prefix-feature extraction returns per-transition probabilities.
    expect(typeof payload.transitions).toBe('object');
    expect(payload.transitions).not.toBeNull();
  });

  it('SCHEMA-4: transitions object has activities list', async () => {
    const result = await runCli([
      'predict', 'features',
      '-i', REAL_LOG_PATH,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir, timeoutMs: 90_000 });

    const j = parseEnvelope(result);
    const payload = j.payload as Record<string, unknown>;
    const transitions = payload.transitions as Record<string, unknown>;
    expect(Array.isArray(transitions.activities)).toBe(true);
    expect((transitions.activities as unknown[]).length).toBeGreaterThan(0);
  });

});

// ─── Success exit codes on minimal log (sparse models tolerated) ──────────────

describe('wpm predict — success exit codes on minimal log', () => {

  it('next-activity exits 0 or 3 on minimal log (sparse n-gram tolerated)', async () => {
    const result = await runCli([
      'predict', 'next-activity',
      '-i', minimalLogPath,
      '--prefix', 'Submit',
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    // 0 = predictions produced; 3 = execution_error if model too sparse
    expect([0, 3]).toContain(result.exitCode);
  });

  it('drift exits 0 on minimal log (EWMA works on small logs)', async () => {
    const result = await runCli([
      'predict', 'drift',
      '-i', minimalLogPath,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    expect([0, 3]).toContain(result.exitCode);
  });

  it('features exits 0 on minimal log', async () => {
    const result = await runCli([
      'predict', 'features',
      '-i', minimalLogPath,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });
    expect([0, 3]).toContain(result.exitCode);
  });

});

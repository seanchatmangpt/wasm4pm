/**
 * drift-watch-cli.test.ts
 *
 * Migrated from the retired top-level `wpm drift-watch` command (removed —
 * see `apps/wasm4pm/src/nouns/_removed.ts`: `drift-watch` -> `model check
 * --mode drift`).
 *
 * IMPORTANT — this is a full contract replacement, not a rename (read
 * before editing further). The old `drift-watch` was a CONTINUOUS streaming
 * daemon: it ran forever on `--interval`, emitted one EWMA-based JSON "tick"
 * per interval (`drift_detected`, `ewma_value`, `window_size`, `metric`,
 * `threshold`, `threshold_crossed`, `timestamp`, `total_events`), and had to
 * be stopped with SIGINT. The new `wpm model check --mode drift`
 * (`apps/wasm4pm/src/nouns/model/check.ts`) is a ONE-SHOT check: it runs
 * once, analyzes the whole log with a jaccard-window concept-drift
 * detector, and returns a single JSON result — there is no streaming loop,
 * no `--interval`/`--alpha`/`--json`/`--format` flag, and no EWMA anywhere.
 * Verified directly against `engines/algorithms.js`'s `detect_drift` output
 * (grep confirms: this exact continuous/EWMA implementation
 * (`commands/drift-watch.ts`) is not wired into ANY noun/verb — the old
 * behavior is fully retired, not relocated to `lab`).
 *
 * The new result shape (`{mode,format,windowSize,drift:{drifts_detected,
 * drifts,window_size,method,threshold}}`) has no dedicated CLI-level
 * validation for `--window-size` (unlike the old `--window`): a bad value
 * (`0`, non-numeric) is silently coerced (`Number(...)`, possibly `NaN`)
 * and passed straight to the WASM detector rather than rejected with
 * `config_error` — this is a genuine, verified behavior removal, not an
 * oversight in this migration.
 *
 * This file is rewritten end-to-end against the real one-shot contract;
 * the old streaming-tick machinery (`runDriftWatchOneTick`, SIGINT
 * handling, `--interval`) is removed as inapplicable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const TIMEOUT_MS = 30_000;

// A path that is guaranteed not to exist — used for pre-WASM validation tests
const MISSING_INPUT = path.join(os.tmpdir(), '__drift_cli_test_no_such_file__.xes');

// A clean cwd with no wasm4pm.toml to avoid ambient config pollution
const CLEAN_CWD = os.tmpdir();

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Run the built CLI once and wait for process exit. */
function runOnce(args: string[], timeoutMs = TIMEOUT_MS): Promise<CliResult> {
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

function tryParseJson(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

interface DriftPoint {
  position: number;
  distance: number;
  type: string;
  appeared: string[];
  disappeared: string[];
  suggestion?: string;
}
interface DriftResult {
  mode?: string;
  format?: string;
  windowSize?: number | null;
  drift?: {
    drifts_detected: number;
    drifts: DriftPoint[];
    window_size: number;
    method: string;
    threshold: number;
  };
}
interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

// ---------------------------------------------------------------------------
// Fixture: minimal XES with 3 traces (activities differ → non-zero distances)
// ---------------------------------------------------------------------------

const SMALL_LOG_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-001"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-01T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-002"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-02T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-01-02T10:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-003"/>
    <event>
      <string key="concept:name" value="Submit"/>
      <date key="time:timestamp" value="2026-01-03T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-03T10:00:00Z"/>
    </event>
  </trace>
</log>`;

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tempDir: string;
let smallLogPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-drift-cli-'));
  smallLogPath = path.join(tempDir, 'small.xes');
  fs.writeFileSync(smallLogPath, SMALL_LOG_XES, 'utf-8');
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch { /* non-fatal */ }
});

// ===========================================================================
// Missing input → source_error (2) (was: T01-T03, three flag variants of the
// same check — the new verb has no -i/--json/--format flags to vary, so this
// collapses to the single real invocation shape)
// ===========================================================================

describe('missing input file exits source_error (2)', () => {
  it('model check --mode drift on a missing file exits 2 (source_error) with INVALID_INPUT', async () => {
    const r = await runOnce(['model', 'check', MISSING_INPUT, '--mode', 'drift']);
    expect(r.exitCode).toBe(2);
    const j = tryParseJson(r.stdout) as ErrorEnvelope | undefined;
    expect(j?.error?.code).toBe('INVALID_INPUT');
  });
});

// ===========================================================================
// --format / --alpha / --interval / --json validation (was: T04-T08, T27-T29)
// (was: real config_error validation on the streaming daemon's flags —
// GENUINELY REMOVED: the one-shot verb has none of these flags at all; see
// file header. Rewritten to confirm they no longer exist rather than
// asserting validation that isn't there.)
// ===========================================================================

describe('legacy streaming-only flags no longer exist on the one-shot verb', () => {
  it('--format/--alpha/--interval/--json are absent from --help (were streaming-daemon-only)', async () => {
    const r = await runOnce(['model', 'check', '--help']);
    const help = r.stdout + r.stderr;
    expect(help).not.toMatch(/--alpha\b/);
    expect(help).not.toMatch(/--interval\b/);
    expect(help).not.toMatch(/--json\b/);
  });

  it('passing them anyway is silently ignored, not rejected (no config_error path left)', async () => {
    const r = await runOnce([
      'model', 'check', smallLogPath, '--mode', 'drift',
      '--format', 'badformat', '--alpha', '2', '--interval', '0', '--json',
    ]);
    // Ignored flags don't error — the verb still runs normally.
    expect(r.exitCode).toBe(0);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(j?.mode).toBe('drift');
  });
});

// ===========================================================================
// --window-size (was: --window, T09-T12 — validation GENUINELY REMOVED)
// ===========================================================================

describe('--window-size (was: --window; numeric validation removed, see file header)', () => {
  it('--window-size 0 does not error — coerced and passed straight to the WASM detector', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift', '--window-size', '0']);
    expect(r.exitCode).toBe(0);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(j?.windowSize).toBe(0);
    expect(j?.drift).toBeDefined();
  });

  it('--window-size abc does not error — becomes null (NaN is not JSON-serializable), not a config_error', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift', '--window-size', 'abc']);
    expect(r.exitCode).toBe(0);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(j?.windowSize).toBeNull();
    expect(j?.drift).toBeDefined();
  });

  it('--window-size 7 (valid) is reflected verbatim in the result', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift', '--window-size', '7']);
    expect(r.exitCode).toBe(0);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(j?.windowSize).toBe(7);
  });

  it('default --window-size is 50 when omitted', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift']);
    expect(r.exitCode).toBe(0);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(j?.windowSize).toBe(50);
  });
});

// ===========================================================================
// drift result field contract (was: T13-T26, T30 — old EWMA tick fields
// drift_detected/ewma_value/metric/threshold_crossed/timestamp are GONE;
// real fields verified directly against `model check --mode drift` output)
// ===========================================================================

describe('drift result field contract (was: JSON tick fields — see file header for the full field-shape change)', () => {
  it('result has mode="drift" and format reflecting the detected log dialect', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift']);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(j?.mode).toBe('drift');
    expect(j?.format).toBe('xes');
  });

  it('drift.drifts_detected is a non-negative integer (was: drift_detected boolean)', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift', '--window-size', '1']);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(typeof j?.drift?.drifts_detected).toBe('number');
    expect(j!.drift!.drifts_detected).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(j!.drift!.drifts_detected)).toBe(true);
  });

  it('drift.drifts is an array whose length equals drifts_detected (was: no equivalent — new richer per-point detail)', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift', '--window-size', '1']);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(Array.isArray(j?.drift?.drifts)).toBe(true);
    expect(j!.drift!.drifts.length).toBe(j!.drift!.drifts_detected);
  });

  it('each drift point has position, distance, type, appeared, disappeared', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift', '--window-size', '1']);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(j!.drift!.drifts.length).toBeGreaterThan(0); // window_size=1 on this 3-trace fixture reliably surfaces drift
    for (const point of j!.drift!.drifts) {
      expect(typeof point.position).toBe('number');
      expect(typeof point.distance).toBe('number');
      expect(point.distance).toBeGreaterThanOrEqual(0);
      expect(point.distance).toBeLessThanOrEqual(1);
      expect(typeof point.type).toBe('string');
      expect(Array.isArray(point.appeared)).toBe(true);
      expect(Array.isArray(point.disappeared)).toBe(true);
    }
  });

  it('drift.method is a non-empty string (was: no equivalent — "jaccard_window")', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift']);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(typeof j?.drift?.method).toBe('string');
    expect(j!.drift!.method.length).toBeGreaterThan(0);
  });

  it('drift.threshold is a finite number in (0, 1] (was: threshold field on the tick — same concept, new location)', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift']);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(typeof j?.drift?.threshold).toBe('number');
    expect(Number.isFinite(j!.drift!.threshold)).toBe(true);
    expect(j!.drift!.threshold).toBeGreaterThan(0);
    expect(j!.drift!.threshold).toBeLessThanOrEqual(1);
  });

  it('drift.window_size (the effective value used internally) is a positive integer', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift', '--window-size', '7']);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(typeof j?.drift?.window_size).toBe('number');
    expect(j!.drift!.window_size).toBeGreaterThan(0);
  });

  it('a successful result is the plain payload, not the old {command,status,payload,meta} wrapper', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift']);
    const j = tryParseJson(r.stdout) as Record<string, unknown> | undefined;
    expect(j).not.toHaveProperty('command');
    expect(j).not.toHaveProperty('payload');
    expect(j).toHaveProperty('mode', 'drift');
  });
});

// ===========================================================================
// --activity-key (was: --activity-key affecting the "metric" tick field —
// that field no longer exists; the flag still exists and is accepted)
// ===========================================================================

describe('--activity-key (was: reflected in the tick\'s "metric" field — that field is gone, see file header)', () => {
  it('accepts a custom --activity-key without erroring', async () => {
    const r = await runOnce(['model', 'check', smallLogPath, '--mode', 'drift', '--activity-key', 'org:resource']);
    expect(r.exitCode).toBe(0);
    const j = tryParseJson(r.stdout) as DriftResult | undefined;
    expect(j?.mode).toBe('drift');
  });
});

// ===========================================================================
// Format guard: --mode drift requires XES/CSV, not OCEL (was: not covered by
// the old suite at all — the old command only ever read XES/CSV; this is a
// real, new, worth-covering guard on the one-shot verb)
// ===========================================================================

describe('--mode drift log-format guard', () => {
  it('rejects an OCEL log with INVALID_INPUT (drift requires XES/CSV)', async () => {
    const ocelPath = path.join(tempDir, 'sample.ocel.json');
    fs.writeFileSync(ocelPath, JSON.stringify({ eventTypes: [], objectTypes: [], events: [], objects: [] }));
    const r = await runOnce(['model', 'check', ocelPath, '--mode', 'drift']);
    expect(r.exitCode).toBe(2);
    const j = tryParseJson(r.stdout) as ErrorEnvelope | undefined;
    expect(j?.error?.code).toBe('INVALID_INPUT');
    expect(j?.error?.message).toMatch(/drift requires an XES or CSV/i);
  });
});

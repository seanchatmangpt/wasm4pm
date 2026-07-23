/**
 * drift-watch-streaming.test.ts
 *
 * MIGRATION NOTE: the old `wpm drift-watch` was a continuous, streaming
 * monitor (SIGINT-driven ticks, `--report`/`--alert`/`--compare-windows`/
 * `--interval` flags, an EWMA time series). `nouns/_removed.ts` maps
 * `drift-watch` -> `model check --mode drift`, but per that verb's own doc
 * comment (`nouns/model/check.ts`), it deliberately absorbs drift-watch
 * only "as a one-shot check" — the continuous watch loop, its report file,
 * alerting, and window-comparison features were NOT carried over to the
 * new surface. There is no replacement for them today, so this file no
 * longer tests streaming behavior: it tests the one-shot
 * `model check --mode drift` contract that actually exists, grounded in
 * `wasm4pm/src/prediction_drift.rs`'s real `detect_drift` output shape
 * (`{ drifts_detected, drifts, window_size, method, threshold }`).
 *
 * Original test IDs (T01-T15) covered streaming-only features; the ones
 * that map to real one-shot behavior are kept (renumbered below), the rest
 * are intentionally dropped with a note.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const TIMEOUT_MS = 30_000;

const FIXTURE_XES = path.resolve(__dirname, '../../../../data/small-example.xes');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// A minimal XES fixture used for tests that need deterministic output.
// Contains 6 traces: 3 with path A→B→C, 3 with path A→D→E (introduces drift midway).
function buildDriftXes(): string {
  const baseDate = new Date('2024-01-01T00:00:00Z');
  const ts = (offset: number) => new Date(baseDate.getTime() + offset * 60000).toISOString();

  const stableTrace = (id: number, t0: number) => `
  <trace>
    <string key="concept:name" value="case${id}"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="${ts(t0)}"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="${ts(t0 + 1)}"/>
    </event>
    <event>
      <string key="concept:name" value="C"/>
      <date key="time:timestamp" value="${ts(t0 + 2)}"/>
    </event>
  </trace>`;

  const driftTrace = (id: number, t0: number) => `
  <trace>
    <string key="concept:name" value="case${id}"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="${ts(t0)}"/>
    </event>
    <event>
      <string key="concept:name" value="D"/>
      <date key="time:timestamp" value="${ts(t0 + 1)}"/>
    </event>
    <event>
      <string key="concept:name" value="E"/>
      <date key="time:timestamp" value="${ts(t0 + 2)}"/>
    </event>
  </trace>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  ${stableTrace(1, 0)}
  ${stableTrace(2, 10)}
  ${stableTrace(3, 20)}
  ${driftTrace(4, 30)}
  ${driftTrace(5, 40)}
  ${driftTrace(6, 50)}
</log>`;
}

let tmpDir: string;
let localXes: string;

function getFixturePath(): string {
  if (fs.existsSync(FIXTURE_XES)) return FIXTURE_XES;
  return localXes;
}

function runCli(args: string[], timeoutMs = TIMEOUT_MS): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
  });
}

interface DriftResult {
  mode: string;
  format: string;
  windowSize: number;
  drift: {
    drifts_detected: number;
    drifts: unknown[];
    window_size: number;
    method: string;
    threshold: number;
  };
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-streaming-test-'));
  localXes = path.join(tmpDir, 'drift-test.xes');
  fs.writeFileSync(localXes, buildDriftXes(), 'utf-8');
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe('T01: basic invocation', () => {
  it('exits 0 for a valid XES file', async () => {
    const r = await runCli(['model', 'check', localXes, '--mode', 'drift', '--window-size', '2']);
    expect(r.exitCode).toBe(0);
  }, TIMEOUT_MS);
});

describe('T02-T05: one-shot JSON output fields', () => {
  it('T02: output contains mode, format, windowSize, and a drift object', async () => {
    const r = await runCli(['model', 'check', localXes, '--mode', 'drift', '--window-size', '2']);
    const parsed = JSON.parse(r.stdout) as DriftResult;
    expect(parsed.mode).toBe('drift');
    expect(parsed.format).toBe('xes');
    expect(parsed.windowSize).toBe(2);
    expect(typeof parsed.drift).toBe('object');
  }, TIMEOUT_MS);

  it('T03: drift.drifts is an array; drift.drifts_detected is its length', async () => {
    const r = await runCli(['model', 'check', localXes, '--mode', 'drift', '--window-size', '2']);
    const parsed = JSON.parse(r.stdout) as DriftResult;
    expect(Array.isArray(parsed.drift.drifts)).toBe(true);
    expect(parsed.drift.drifts_detected).toBe(parsed.drift.drifts.length);
  }, TIMEOUT_MS);

  it('T04: drift.threshold is a finite number in [0, 1] (the engine\'s fixed default, not a CLI flag)', async () => {
    // Unlike the old streaming --threshold flag, `model check --mode drift`
    // has no --threshold flag at all — the Rust engine uses a fixed
    // DEFAULT_DRIFT_THRESHOLD (0.3) internally. Assert on the real,
    // observable field instead of a flag that no longer exists.
    const r = await runCli(['model', 'check', localXes, '--mode', 'drift', '--window-size', '2']);
    const parsed = JSON.parse(r.stdout) as DriftResult;
    expect(typeof parsed.drift.threshold).toBe('number');
    expect(parsed.drift.threshold).toBeGreaterThanOrEqual(0);
    expect(parsed.drift.threshold).toBeLessThanOrEqual(1);
  }, TIMEOUT_MS);

  it('T05: --window-size 2 over a 6-trace log with a mid-log behavior shift detects at least one drift', async () => {
    const r = await runCli(['model', 'check', localXes, '--mode', 'drift', '--window-size', '2']);
    const parsed = JSON.parse(r.stdout) as DriftResult;
    expect(parsed.drift.drifts_detected).toBeGreaterThan(0);
  }, TIMEOUT_MS);
});

describe('T06-T09: --window-size default and reflection', () => {
  it('T06: default --window-size is 50 when omitted', async () => {
    const r = await runCli(['model', 'check', localXes, '--mode', 'drift']);
    const parsed = JSON.parse(r.stdout) as DriftResult;
    expect(parsed.windowSize).toBe(50);
    expect(parsed.drift.window_size).toBe(50);
  }, TIMEOUT_MS);

  it('T07: --window-size is reflected in both the top-level windowSize and drift.window_size', async () => {
    const r = await runCli(['model', 'check', localXes, '--mode', 'drift', '--window-size', '3']);
    const parsed = JSON.parse(r.stdout) as DriftResult;
    expect(parsed.windowSize).toBe(3);
    expect(parsed.drift.window_size).toBe(3);
  }, TIMEOUT_MS);

  it('T08: --window-size 0 is clamped to 1 by the Rust engine (window_size.max(1))', async () => {
    const r = await runCli(['model', 'check', localXes, '--mode', 'drift', '--window-size', '0']);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout) as DriftResult;
    expect(parsed.drift.window_size).toBe(1);
  }, TIMEOUT_MS);

  it('T09: drift.method is a non-empty descriptive string (exact algorithm name is a WASM-build implementation detail, not asserted)', async () => {
    const r = await runCli(['model', 'check', localXes, '--mode', 'drift', '--window-size', '2']);
    const parsed = JSON.parse(r.stdout) as DriftResult;
    expect(typeof parsed.drift.method).toBe('string');
    expect(parsed.drift.method.length).toBeGreaterThan(0);
  }, TIMEOUT_MS);
});

describe('T10: mode drift rejects OCEL input', () => {
  it('OCEL-format input is rejected as INVALID_INPUT (source_error=2), never silently accepted', async () => {
    const ocelFile = path.join(tmpDir, 'tiny.ocel.json');
    fs.writeFileSync(ocelFile, JSON.stringify({ eventTypes: [], objectTypes: [], events: [], objects: [] }));
    const r = await runCli(['model', 'check', ocelFile, '--mode', 'drift']);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as { error?: { code?: string; message?: string } };
    expect(parsed.error?.code).toBe('INVALID_INPUT');
    expect(parsed.error?.message).toMatch(/OCEL/i);
  }, TIMEOUT_MS);
});

describe('T11: missing file is a clean INVALID_INPUT error, not a crash', () => {
  it('missing input file exits 2 with a message naming the path', async () => {
    const missing = path.join(os.tmpdir(), '__drift_streaming_test_no_such_file__.xes');
    const r = await runCli(['model', 'check', missing, '--mode', 'drift']);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as { error?: { code?: string; message?: string } };
    expect(parsed.error?.code).toBe('INVALID_INPUT');
    expect(parsed.error?.message).toContain(missing);
  }, TIMEOUT_MS);
});

describe('dropped streaming features (documented, not tested)', () => {
  it('documents that --report/--alert/--compare-windows/--interval have no equivalent on `model check --mode drift`', () => {
    // This is a documentation-only assertion (no CLI invocation): the old
    // continuous drift-watch monitor (EWMA time series, alert-on-threshold,
    // window-vs-window comparison, --report file) was not migrated. Passing
    // any of those flags to `model check --mode drift` either does nothing
    // (unknown flags are ignored) or is rejected by citty's arg parser —
    // there is no monitoring loop to test. Flagged here so this gap isn't
    // silently lost; a future work item would need a new `pipeline watch`-
    // style verb to restore it.
    expect(true).toBe(true);
  });
});

describe('fixture availability', () => {
  it('the shared small-example.xes fixture or the local synthetic one is readable', () => {
    const p = getFixturePath();
    expect(fs.existsSync(p)).toBe(true);
  });
});

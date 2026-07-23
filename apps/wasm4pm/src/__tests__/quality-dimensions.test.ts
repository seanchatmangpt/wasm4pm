/**
 * quality-dimensions.test.ts
 *
 * ORIGINALLY: end-to-end CLI tests for `wpm quality`'s Van der Aalst
 * 4-dimension (fitness/precision/generalization/simplicity) quality
 * assessment — 24 QD-* checks covering dimension presence, score ranges,
 * aggregate consistency, --metrics subsetting, error handling, etc.
 *
 * CONFIRMED, DELIBERATE REMOVAL — read before extending this file:
 * `quality` maps to `log stats` per nouns/_removed.ts, but `log stats`
 * (nouns/log/stats.ts) is an explicitly NEW, much smaller implementation:
 *
 *   "wpm log stats — basic log statistics (event/case/activity counts).
 *    New implementation wrapping the existing analyze_event_statistics /
 *    analyze_ocel_statistics WASM exports directly (reused, not
 *    reimplemented) rather than the old quality/bench-data commands,
 *    NEITHER OF WHICH WAS ACTUALLY A LOG-STATISTICS PROFILER."
 *
 * Verified live and by source inspection: there is NO verb anywhere in the
 * new noun-verb surface that computes fitness/precision/generalization/
 * simplicity scores, an aggregate score, quality levels
 * (excellent/good/fair/poor), or accepts `--metrics`/`--threshold`/
 * `--explain-quality-dims`. A grep for "generalization" across
 * `src/nouns/` and `src/engines/` returns zero matches. The rich
 * Van der Aalst assessment logic still exists, UNUSED, in
 * `commands/quality.ts` (1800+ lines), but no verb bridges to it — it is
 * dead code as of this migration (a candidate for work item #6's audited
 * deletion, once confirmed to have zero remaining importers).
 *
 * THIS IS A REAL FUNCTIONAL GAP worth flagging to a human reviewer, not
 * just a test-surface rename: a practitioner who ran `wpm quality -i
 * log.xes` to get a fitness/precision/generalization/simplicity report
 * has no equivalent command in the new CLI. `model check` computes fitness
 * via token-replay conformance (see model-check-fail-closed.test.ts) but
 * that requires an explicit reference model and never computes precision/
 * generalization/simplicity or an aggregate Van der Aalst score.
 *
 * This file is rewritten to comprehensively test what `log stats` actually
 * does (format detection, event/case/activity counts, OCEL vs event-log
 * branching, error handling) rather than assert removed behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const FIXTURE_XES = path.resolve(__dirname, '../../../../test/fixtures/small.xes');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const TEST_TIMEOUT_MS = 45_000;

function runCli(args: string[], timeoutMs = TEST_TIMEOUT_MS): Promise<CliResult> {
  const cwd = path.resolve(__dirname, '../..');
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd, env },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

function json<T = Record<string, unknown>>(r: CliResult): T {
  return JSON.parse(r.stdout) as T;
}

let tempDir: string;
let xesPath: string;
let ocelPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-log-stats-'));
  xesPath = path.join(tempDir, 'test.xes');
  fs.copyFileSync(FIXTURE_XES, xesPath);

  ocelPath = path.join(tempDir, 'test.ocel.json');
  fs.writeFileSync(
    ocelPath,
    JSON.stringify({
      eventTypes: [{ name: 'place order', attributes: [] }],
      objectTypes: [{ name: 'order', attributes: [] }],
      events: [
        {
          id: 'e1',
          type: 'place order',
          time: '2026-01-01T10:00:00Z',
          attributes: [],
          relationships: [{ objectId: 'o1', qualifier: 'order' }],
        },
      ],
      objects: [{ id: 'o1', type: 'order', attributes: [] }],
    })
  );
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // non-fatal
  }
});

// ---------------------------------------------------------------------------
// Removed-feature documentation (not weakened assertions — the old
// behavior genuinely does not exist; this proves it rather than assuming it)
// ---------------------------------------------------------------------------

describe('REMOVED: Van der Aalst 4-dimension quality assessment has no verb equivalent', () => {
  it('log stats payload never contains fitness/precision/generalization/simplicity/aggregate', async () => {
    const result = await runCli(['log', 'stats', xesPath]);
    expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);
    const payload = json<Record<string, unknown>>(result);
    for (const removedField of ['fitness', 'precision', 'generalization', 'simplicity', 'aggregate', 'scores', 'dimensions']) {
      expect(payload).not.toHaveProperty(removedField);
      expect((payload.stats as Record<string, unknown> | undefined) ?? {}).not.toHaveProperty(removedField);
    }
  });

  it('old top-level "quality" invocation is intercepted by the hard-break table, not silently reinterpreted', async () => {
    const result = await runCli(['quality', '-i', xesPath]);
    expect(result.stderr).toMatch(/'wpm quality' was removed.*'wpm log stats'/i);
  });
});

// ---------------------------------------------------------------------------
// log stats: actual current contract
// ---------------------------------------------------------------------------

describe('log stats: format and shape', () => {
  it('returns format, isObjectCentric, and a stats object', async () => {
    const result = await runCli(['log', 'stats', xesPath]);
    expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);
    const payload = json<{ format: string; isObjectCentric: boolean; stats: Record<string, unknown> }>(result);
    expect(payload.format).toBe('xes');
    expect(payload.isObjectCentric).toBe(false);
    expect(typeof payload.stats).toBe('object');
  }, TEST_TIMEOUT_MS);

  it('stats has total_events, total_cases, avg_events_per_case for an event log', async () => {
    const result = await runCli(['log', 'stats', xesPath]);
    const payload = json<{ stats: Record<string, unknown> }>(result);
    expect(typeof payload.stats.total_events).toBe('number');
    expect(typeof payload.stats.total_cases).toBe('number');
    expect(typeof payload.stats.avg_events_per_case).toBe('number');
    expect(payload.stats.total_events as number).toBeGreaterThan(0);
    expect(payload.stats.total_cases as number).toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);

  it('avg_events_per_case is consistent with total_events / total_cases', async () => {
    const result = await runCli(['log', 'stats', xesPath]);
    const payload = json<{ stats: { total_events: number; total_cases: number; avg_events_per_case: number } }>(result);
    const expected = payload.stats.total_events / payload.stats.total_cases;
    expect(Math.abs(payload.stats.avg_events_per_case - expected)).toBeLessThan(1e-6);
  }, TEST_TIMEOUT_MS);
});

describe('log stats: OCEL input uses analyze_ocel_statistics, not analyze_event_statistics', () => {
  it('detects an OCEL log and sets isObjectCentric true', async () => {
    const result = await runCli(['log', 'stats', ocelPath]);
    expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);
    const payload = json<{ isObjectCentric: boolean; stats: Record<string, unknown> }>(result);
    expect(payload.isObjectCentric).toBe(true);
  }, TEST_TIMEOUT_MS);
});

describe('log stats: missing/invalid input is a structured JSON error, never a crash', () => {
  it('no input file argument exits 2 (INVALID_INPUT)', async () => {
    const result = await runCli(['log', 'stats']);
    expect(result.exitCode).toBe(2);
    const envelope = json<{ error?: { code: string; message: string } }>(result);
    expect(envelope.error?.code).toBe('INVALID_INPUT');
  });

  it('nonexistent file exits 2 (INVALID_INPUT), naming the path', async () => {
    const result = await runCli(['log', 'stats', '/no/such/file-wpm-log-stats-test.xes']);
    expect(result.exitCode).toBe(2);
    const envelope = json<{ error?: { code: string; message: string } }>(result);
    expect(envelope.error?.code).toBe('INVALID_INPUT');
    expect(envelope.error?.message).toContain('/no/such/file-wpm-log-stats-test.xes');
  });
});

describe('log stats: --help documents its real (small) arg surface', () => {
  it('--help exits 0 and lists input/activity-key, no --metrics or --threshold', async () => {
    const result = await runCli(['log', 'stats', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/usage/i);
    expect(result.stdout).toMatch(/activity-key/i);
    expect(result.stdout).not.toMatch(/--metrics/);
    expect(result.stdout).not.toMatch(/--threshold/);
  }, TEST_TIMEOUT_MS);
});

describe('log stats: --activity-key flag is accepted', () => {
  it('--activity-key concept:name does not cause an error', async () => {
    const result = await runCli(['log', 'stats', xesPath, '--activity-key', 'concept:name']);
    expect(result.exitCode, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);
  }, TEST_TIMEOUT_MS);
});

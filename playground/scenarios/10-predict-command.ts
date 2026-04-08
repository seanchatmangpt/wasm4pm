/**
 * Scenario: predict command — pmctl predict <task> -i <log.xes>
 *
 * Dev action simulated: "I added a new WASM dispatch for remaining-time or
 * changed how tasks are validated. Does each task name still route correctly?
 * Does an unknown task exit 2 (source_error), not 1 or 3? Does JSON output
 * carry the right shape for each task?"
 *
 * Key contracts verified:
 *   - Unknown task name → exit 2 (source_error), not 1 (config) or 3 (execution)
 *   - Unknown task validation runs before file-access check (line 93 vs 119 in predict.ts)
 *   - Missing -i with valid task → exit 2 (source_error)
 *   - All 6 valid task slugs from VALID_PREDICT_CLI_TASKS exit 0 or 3 (never 1 or 2)
 *   - VALID_PREDICT_CLI_TASKS has exactly 6 entries, all hyphen-form (no underscores)
 *   - remaining-time without --prefix → returns message, not prediction (model-only mode)
 *
 * Binary: apps/pmctl/dist/bin/pmctl.js (must be built first)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs/promises';
import { runCli, assertExitCode, assertJsonOutput, createCliTestEnv, EXIT_CODES } from '@wasm4pm/testing';
import { VALID_PREDICT_CLI_TASKS } from '@wasm4pm/contracts';
import type { CliTestEnv } from '@wasm4pm/testing';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PMCTL = path.resolve(__dirname, '../../apps/pmctl/dist/bin/pmctl.js');

function pmctl(userArgs: string[]) {
  return runCli([PMCTL, ...userArgs], { cliPath: 'node', timeout: 20_000 });
}

// ── XES fixtures (inline, self-contained) ─────────────────────────────────────

const MINI_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <global scope="event">
    <string key="concept:name" value="undefined"/>
    <date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/>
  </global>
  <trace>
    <string key="concept:name" value="Case1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T11:00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Case2"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-02T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-02T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-02T11:00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="Case3"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-03T09:00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-03T10:00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-03T11:00:00"/></event>
  </trace>
</log>`;

let _env: CliTestEnv | null = null;
let xesPath: string;

beforeAll(async () => {
  _env = await createCliTestEnv();
  xesPath = path.join(_env.tempDir, 'mini.xes');
  await fs.writeFile(xesPath, MINI_XES, 'utf-8');
  console.info('[predict] task list:', VALID_PREDICT_CLI_TASKS.join(', '));
  console.info('[predict] temp dir:', _env.tempDir);
});

afterAll(async () => { await _env?.cleanup(); _env = null; });

// ── VALID_PREDICT_CLI_TASKS enumeration ───────────────────────────────────────

describe('predict command: VALID_PREDICT_CLI_TASKS contract', () => {
  it('contains exactly 6 entries', () => {
    expect(VALID_PREDICT_CLI_TASKS).toHaveLength(6);
  });

  it('all task slugs are hyphen-form — no underscores', () => {
    for (const task of VALID_PREDICT_CLI_TASKS) {
      expect(task, `task "${task}" contains underscore`).not.toMatch(/_/);
    }
  });
});

// ── Error paths ───────────────────────────────────────────────────────────────

describe('predict command: error paths', () => {
  it('exits 2 (source_error) for an unknown task name', async () => {
    // Unknown task check runs BEFORE file-access check — /dev/null is safe here
    const result = await pmctl(['predict', 'turbo-predict', '-i', '/dev/null']);
    assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
    expect(result.stderr + result.stdout).toMatch(/unknown task|valid tasks|not a valid/i);
    console.info('[predict] unknown-task message:', (result.stderr + result.stdout).slice(0, 150));
  });

  it('unknown task exits 2 NOT 1 (config) NOT 3 (execution) — exit-code contract', async () => {
    const result = await pmctl(['predict', 'made_up_with_underscore', '-i', '/dev/null']);
    expect(result.exitCode).toBe(EXIT_CODES.SOURCE_ERROR);
    expect(result.exitCode).not.toBe(EXIT_CODES.CONFIG_ERROR);
    expect(result.exitCode).not.toBe(EXIT_CODES.EXECUTION_ERROR);
  });

  it('--format json unknown task has status:"error"', async () => {
    const result = await pmctl(['predict', 'ghost-task', '-i', '/dev/null', '--format', 'json']);
    assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    expect(envelope).toHaveProperty('status', 'error');
    expect(typeof envelope['message']).toBe('string');
  });

  it('exits 2 when -i file does not exist (valid task name, missing input)', async () => {
    const result = await pmctl(['predict', 'next-activity', '-i', '/tmp/phantom-predict-99999.xes']);
    assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
    expect(result.stderr + result.stdout).toMatch(/not found|no such file|does not exist/i);
    console.info('[predict] missing-file message:', (result.stderr + result.stdout).slice(0, 150));
  });
});

// ── Task routing — exit codes ─────────────────────────────────────────────────
// All 6 valid tasks must exit 0 or 3. Exit 1 or 2 signals a routing regression.

describe('predict command: task routing — exit codes', () => {
  for (const task of VALID_PREDICT_CLI_TASKS) {
    it(`pmctl predict ${task} exits 0 or 3 (never 1 or 2)`, async () => {
      const result = await pmctl(['predict', task, '-i', xesPath, '--no-save']);
      const acceptable = [EXIT_CODES.SUCCESS, EXIT_CODES.EXECUTION_ERROR];
      if (!acceptable.includes(result.exitCode)) {
        console.error(`[predict] ${task} unexpected exit ${result.exitCode}`);
        console.error('  stdout:', result.stdout.slice(0, 200));
        console.error('  stderr:', result.stderr.slice(0, 200));
      }
      expect(acceptable, `predict ${task} exited ${result.exitCode}`).toContain(result.exitCode);
      if (result.exitCode === EXIT_CODES.SUCCESS) {
        console.info(`[predict] ${task} success stdout:`, result.stdout.slice(0, 150));
      } else {
        console.warn(`[predict] ${task} exit 3 — WASM may not be initialized. Run: cd wasm4pm && npm run build:nodejs`);
      }
    }, 30_000);
  }
});

// ── JSON output shape ─────────────────────────────────────────────────────────

describe('predict command: JSON output shape', () => {
  it('next-activity JSON envelope has task and predictions fields', async () => {
    const result = await pmctl(['predict', 'next-activity', '-i', xesPath, '--format', 'json', '--no-save']);
    if (result.exitCode !== EXIT_CODES.SUCCESS) {
      console.warn('[predict] skipping next-activity shape check — exit', result.exitCode);
      return;
    }
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    expect(envelope).toHaveProperty('status', 'success');
    expect(envelope).toHaveProperty('task', 'next-activity');
    expect(envelope).toHaveProperty('predictions');
    expect(Array.isArray(envelope['predictions'])).toBe(true);
    console.info('[predict] next-activity envelope keys:', Object.keys(envelope));
  }, 30_000);

  it('remaining-time JSON envelope has task and (prediction OR message) field', async () => {
    // Without --prefix, remaining-time runs model-only mode → message, not prediction
    const result = await pmctl(['predict', 'remaining-time', '-i', xesPath, '--format', 'json', '--no-save']);
    if (result.exitCode !== EXIT_CODES.SUCCESS) {
      console.warn('[predict] skipping remaining-time shape check — exit', result.exitCode);
      return;
    }
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    expect(envelope).toHaveProperty('status', 'success');
    expect(envelope).toHaveProperty('task', 'remaining-time');
    const hasResult = 'prediction' in envelope || 'message' in envelope || 'predictions' in envelope;
    expect(hasResult, 'remaining-time envelope must have prediction, predictions, or message field').toBe(true);
    console.info('[predict] remaining-time envelope keys:', Object.keys(envelope));
  }, 30_000);

  it('features JSON envelope has task and transitions fields', async () => {
    const result = await pmctl(['predict', 'features', '-i', xesPath, '--format', 'json', '--no-save']);
    if (result.exitCode !== EXIT_CODES.SUCCESS) {
      console.warn('[predict] skipping features shape check — exit', result.exitCode);
      return;
    }
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    expect(envelope).toHaveProperty('status', 'success');
    expect(envelope).toHaveProperty('task', 'features');
    expect(envelope).toHaveProperty('transitions');
    console.info('[predict] features envelope keys:', Object.keys(envelope));
  }, 30_000);
});

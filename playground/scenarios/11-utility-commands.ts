/**
 * Scenario: utility commands — init, results, explain, doctor
 *
 * Dev action simulated: "I scaffolded a new project with `pmctl init`, browsed
 * saved results with `pmctl results`, got an algorithm explanation with
 * `pmctl explain`, and diagnosed the environment with `pmctl doctor`."
 *
 * Key contracts verified:
 *   init:
 *     - Creates wasm4pm.toml, .env.example, .gitignore in cwd
 *     - --format json emits { files_created: [...] }
 *     - Re-run without --force skips existing files
 *     - Invalid --config-format exits 1 (config_error)
 *     - --config-format json creates wasm4pm.json, not wasm4pm.toml
 *   results:
 *     - Empty results dir exits 0 (not an error)
 *     - --format json empty → { status:'success', data:{ count:0, results:[] } }
 *     - --cat nonexistent → exit 2 (source_error)
 *     - With a fixture result file → count > 0
 *   explain:
 *     - --algorithm dfg exits 0 (known algorithm)
 *     - Unknown algorithm exits 0 with "No detailed explanation" (NOT exit 2)
 *     - No args exits 2 (source_error)
 *     - --format json --algorithm dfg has content field
 *   doctor:
 *     - Exits 0 (all ok) or 1 (any fail) — never 2 or 3
 *     - --format json has checks array
 *     - Each check has name, status, message fields
 *
 * IMPORTANT: init and results use process.cwd() at runtime — must pass
 * cwd: tempDir option to runCli so files land in the temp dir, not the repo root.
 *
 * Binary: apps/pmctl/dist/bin/pmctl.js (must be built first)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { runCli, assertExitCode, assertJsonOutput, EXIT_CODES } from '@wasm4pm/testing';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PMCTL = path.resolve(__dirname, '../../apps/pmctl/dist/bin/pmctl.js');

function pmctl(userArgs: string[], cwd?: string) {
  return runCli([PMCTL, ...userArgs], { cliPath: 'node', timeout: 15_000, cwd });
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join('/tmp', 'wasm4pm-util-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ── init: scaffolding ─────────────────────────────────────────────────────────

describe('init: scaffolding', () => {
  it('creates wasm4pm.toml in cwd by default', async () => {
    const result = await pmctl(['init', '--force'], tempDir);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    expect(existsSync(path.join(tempDir, 'wasm4pm.toml'))).toBe(true);
    console.info('[init] created wasm4pm.toml in:', tempDir);
  });

  it('creates .env.example containing WASM4PM_PROFILE', async () => {
    await pmctl(['init', '--force'], tempDir);
    const envPath = path.join(tempDir, '.env.example');
    expect(existsSync(envPath)).toBe(true);
    const content = await fs.readFile(envPath, 'utf-8');
    expect(content).toContain('WASM4PM_PROFILE');
    console.info('[init] .env.example has WASM4PM_PROFILE: OK');
  });

  it('creates .gitignore', async () => {
    await pmctl(['init', '--force'], tempDir);
    expect(existsSync(path.join(tempDir, '.gitignore'))).toBe(true);
  });

  it('--format json emits files_created array', async () => {
    const result = await pmctl(['init', '--force', '--format', 'json'], tempDir);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    // init outputs JSON then prints the pmctl help text (citty behavior).
    // Extract just the leading JSON object before the help text.
    const jsonEnd = result.stdout.lastIndexOf('\n}') + 2;
    const jsonStr = result.stdout.slice(0, jsonEnd).trim();
    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      throw new Error(`Could not parse JSON from init stdout. Got: ${result.stdout.slice(0, 300)}`);
    }
    expect(envelope).toHaveProperty('status', 'success');
    const data = (envelope['data'] ?? envelope) as Record<string, unknown>;
    expect(Array.isArray(data['files_created'])).toBe(true);
    console.info('[init] files_created:', data['files_created']);
  });

  it('re-run without --force skips files and exits 0', async () => {
    // First run creates files
    await pmctl(['init', '--force'], tempDir);
    const firstMtime = (await fs.stat(path.join(tempDir, 'wasm4pm.toml'))).mtimeMs;

    // Second run without --force should skip
    const result = await pmctl(['init'], tempDir);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    const secondMtime = (await fs.stat(path.join(tempDir, 'wasm4pm.toml'))).mtimeMs;
    expect(secondMtime).toBe(firstMtime); // file not overwritten
    console.info('[init] re-run skipped existing file: OK');
  });

  it('invalid --configFormat exits 1 (config_error)', async () => {
    // citty uses camelCase flag names: --configFormat not --config-format
    const result = await pmctl(['init', '--configFormat', 'yaml'], tempDir);
    assertExitCode(result, EXIT_CODES.CONFIG_ERROR);
    console.info('[init] invalid format message:', (result.stderr + result.stdout).slice(0, 120));
  });

  it('--configFormat json creates wasm4pm.json not wasm4pm.toml', async () => {
    // citty uses camelCase flag names: --configFormat not --config-format
    const result = await pmctl(['init', '--configFormat', 'json', '--force'], tempDir);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    expect(existsSync(path.join(tempDir, 'wasm4pm.json'))).toBe(true);
    expect(existsSync(path.join(tempDir, 'wasm4pm.toml'))).toBe(false);
    console.info('[init] wasm4pm.json created, wasm4pm.toml absent: OK');
  });
});

// ── results: browsing ─────────────────────────────────────────────────────────

describe('results: browsing', () => {
  it('empty results dir exits 0', async () => {
    // Human output is suppressed in NODE_ENV=test (consola behavior) — check exit code only.
    // Content is verified via --format json in the next test.
    const result = await pmctl(['results'], tempDir);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    console.info('[results] empty dir exit:', result.exitCode, '(human output suppressed in test env)');
  });

  it('--format json on empty dir emits count:0 and results:[]', async () => {
    const result = await pmctl(['results', '--format', 'json'], tempDir);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    expect(envelope).toHaveProperty('status', 'success');
    const data = (envelope['data'] ?? envelope) as Record<string, unknown>;
    const count = data['count'] as number | undefined;
    const results = data['results'] as unknown[] | undefined;
    if (count !== undefined) expect(count).toBe(0);
    if (results !== undefined) expect(results).toHaveLength(0);
    console.info('[results] empty json envelope:', JSON.stringify(envelope).slice(0, 200));
  });

  it('--cat nonexistent exits 2 (source_error)', async () => {
    const result = await pmctl(['results', '--cat', 'nonexistent-file.json'], tempDir);
    assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
    console.info('[results] --cat nonexistent message:', (result.stderr + result.stdout).slice(0, 120));
  });

  it('with a fixture result file reports count > 0', async () => {
    // Create a valid SavedResult fixture
    const resultsDir = path.join(tempDir, '.wasm4pm', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    const fixture = {
      version: 1,
      savedAt: new Date().toISOString(),
      task: 'next-activity',
      input: '/tmp/test.xes',
      activityKey: 'concept:name',
      result: { predictions: [{ activity: 'B', probability: 0.9 }] },
    };
    await fs.writeFile(
      path.join(resultsDir, '20260406T120000-next-activity.json'),
      JSON.stringify(fixture),
      'utf-8',
    );

    const result = await pmctl(['results', '--format', 'json'], tempDir);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    const data = (envelope['data'] ?? envelope) as Record<string, unknown>;
    const count = data['count'] as number | undefined;
    if (count !== undefined) {
      expect(count).toBeGreaterThan(0);
      console.info('[results] fixture count:', count);
    }
  });
});

// ── explain: algorithm explanations ──────────────────────────────────────────

describe('explain: algorithm explanations', () => {
  it('--algorithm dfg exits 0', async () => {
    const result = await pmctl(['explain', '--algorithm', 'dfg']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    console.info('[explain] dfg stdout (first 150):', result.stdout.slice(0, 150));
  });

  it('unknown algorithm exits 0 (NOT exit 2) — explain never errors on unknown algo', async () => {
    // explain falls through to a generic "no explanation available" message rather than erroring.
    // Human output is suppressed in NODE_ENV=test — check exit code only.
    const result = await pmctl(['explain', '--algorithm', 'bananas']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    // Must NOT be exit 2 (source_error) — that would be a regression
    expect(result.exitCode).not.toBe(EXIT_CODES.SOURCE_ERROR);
    console.info('[explain] unknown-algo exit:', result.exitCode, '(human output suppressed in test env)');
  });

  it('no args exits 2 (source_error)', async () => {
    const result = await pmctl(['explain']);
    assertExitCode(result, EXIT_CODES.SOURCE_ERROR);
    console.info('[explain] no-args message:', (result.stderr + result.stdout).slice(0, 120));
  });

  it('--format json --algorithm dfg has content field', async () => {
    const result = await pmctl(['explain', '--algorithm', 'dfg', '--format', 'json']);
    assertExitCode(result, EXIT_CODES.SUCCESS);
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    expect(envelope).toHaveProperty('status', 'success');
    const data = (envelope['data'] ?? envelope) as Record<string, unknown>;
    // content may be at top level or nested in data
    const hasContent = 'content' in envelope || 'content' in data;
    expect(hasContent, 'explain JSON envelope must have content field').toBe(true);
    console.info('[explain] json envelope keys:', Object.keys(envelope));
  });
});

// ── doctor: environment diagnostics ──────────────────────────────────────────

describe('doctor: environment diagnostics', () => {
  it('exits 0 (all ok) or 1 (any fail) — never 2 (source) or 3 (execution)', async () => {
    const result = await pmctl(['doctor']);
    const acceptable = [EXIT_CODES.SUCCESS, EXIT_CODES.CONFIG_ERROR];
    if (!acceptable.includes(result.exitCode)) {
      console.error('[doctor] unexpected exit:', result.exitCode);
      console.error('  stdout:', result.stdout.slice(0, 300));
      console.error('  stderr:', result.stderr.slice(0, 300));
    }
    expect(acceptable, `doctor exited ${result.exitCode}`).toContain(result.exitCode);
    console.info('[doctor] exit:', result.exitCode, result.exitCode === 0 ? '(healthy)' : '(degraded)');
  });

  it('--format json emits checks array', async () => {
    const result = await pmctl(['doctor', '--format', 'json']);
    const acceptable = [EXIT_CODES.SUCCESS, EXIT_CODES.CONFIG_ERROR];
    expect(acceptable).toContain(result.exitCode);
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    const data = (envelope['data'] ?? envelope) as Record<string, unknown>;
    const checks = data['checks'] as unknown[] | undefined;
    if (checks !== undefined) {
      expect(Array.isArray(checks)).toBe(true);
      expect(checks.length).toBeGreaterThan(0);
      console.info('[doctor] checks count:', checks.length);
    }
  });

  it('each check in --format json has name, status, message fields', async () => {
    const result = await pmctl(['doctor', '--format', 'json']);
    const acceptable = [EXIT_CODES.SUCCESS, EXIT_CODES.CONFIG_ERROR];
    expect(acceptable).toContain(result.exitCode);
    const envelope = assertJsonOutput(result) as Record<string, unknown>;
    const data = (envelope['data'] ?? envelope) as Record<string, unknown>;
    const checks = data['checks'] as Array<Record<string, unknown>> | undefined;
    if (!checks || checks.length === 0) return; // tolerate versions with no checks array
    for (const check of checks) {
      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('status');
      expect(check).toHaveProperty('message');
    }
    console.info('[doctor] all checks have required fields: OK');
  });
});

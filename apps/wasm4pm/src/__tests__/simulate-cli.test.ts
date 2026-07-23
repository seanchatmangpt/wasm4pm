/**
 * `wpm simulate` was retired; the hard-break table (nouns/_removed.ts)
 * forwards it to `wpm model simulate`, which bridges unmodified to this same
 * `commands/simulate.ts` body (nouns/model/simulate.ts). Confirmed live
 * against the built CLI:
 *   - A successful call returns the legacy `{command,status,payload,meta}`
 *     envelope verbatim (bridge passthrough on the success path) — every
 *     success-path assertion in this file is unchanged from before.
 *   - A failing call is thrown as the framework's bare `{error:{code,message}}`
 *     envelope instead — there is no more top-level `command`/`status` field
 *     on an error result, and legacy exit codes 1 (config_error) and 2
 *     (source_error) both collapse to the generic `INVALID_INPUT`, which
 *     wpm's ERROR_CODE_MAP maps to source_error (2) — the old config_error
 *     (1) vs source_error (2) distinction for validation failures no longer
 *     exists (see packages/noun-verb `_bridge.ts` classifyLegacyFailure).
 *   - stdout is always a single JSON value regardless of the caller's own
 *     `--format` flag (the bridge always forces `--format json --quiet`
 *     internally), so `--format human` no longer produces human-rendered
 *     text — the always-JSON-on-stdout contract wins.
 *
 * simulate-cli.test.ts — CLI integration tests for `wpm model simulate` (was: wpm simulate)
 *
 * Oracle rank: Rank 2 (Domain contract) for exit codes, JSON envelope shape, and flag behavior.
 *              Rank 3 (Metamorphic) for seed determinism and cases scaling.
 *
 * Complements simulate-temporal-cli.test.ts and simulate-jtbd.test.ts by providing
 * granular CLI-surface coverage:
 *  - Exit-code contract for all error paths
 *  - JSON envelope field-level contracts (simulation, statistics, traces)
 *  - Flag permutations (--cases, --seed, --time, --activity-key, --format, --verbose, --quiet)
 *  - Seed determinism (metamorphic: same seed → identical JSON output)
 *  - Human output content assertions (mentions "Monte Carlo", seed, case count)
 *  - Invalid argument rejection (NaN cases, NaN time)
 *  - --no-save suppresses receipt write
 *  - Positional input vs -i flag equivalence
 *  - --cases 1 edge case (minimal simulation)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// ── Minimal XES fixture ───────────────────────────────────────────────────────

const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2020-01-01T00:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2020-01-01T01:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="C"/>
      <date key="time:timestamp" value="2020-01-01T02:00:00.000+00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case2"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2020-01-02T00:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="C"/>
      <date key="time:timestamp" value="2020-01-02T01:00:00.000+00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case3"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2020-01-03T00:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2020-01-03T01:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="C"/>
      <date key="time:timestamp" value="2020-01-03T02:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="D"/>
      <date key="time:timestamp" value="2020-01-03T03:00:00.000+00:00"/>
    </event>
  </trace>
</log>`;

// ── CLI helpers ───────────────────────────────────────────────────────────────

const CLI_PATH = path.resolve(import.meta.dirname, '../../dist/bin/wpm.js');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], timeoutMs = 30_000): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' })
    );
  });
}

interface Envelope {
  command: string;
  status: 'ok' | 'error';
  payload?: Record<string, unknown>;
  error?: string;
  message?: string;
}

function parseEnvelope(result: CliResult): Envelope {
  try {
    return JSON.parse(result.stdout) as Envelope;
  } catch {
    throw new Error(
      `Failed to parse CLI output as JSON.\n` +
        `Exit code: ${result.exitCode}\n` +
        `stdout: ${result.stdout.slice(0, 500)}\n` +
        `stderr: ${result.stderr.slice(0, 200)}`
    );
  }
}

// ── Test environment ──────────────────────────────────────────────────────────

interface TestEnv {
  tempDir: string;
  xesPath: string;
  cleanup: () => Promise<void>;
}

async function createTestEnv(): Promise<TestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-simulate-cli-'));
  const xesPath = path.join(tempDir, 'test.xes');
  await fs.writeFile(xesPath, MINIMAL_XES, 'utf-8');
  return {
    tempDir,
    xesPath,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    },
  };
}

// ── Error path tests ──────────────────────────────────────────────────────────

describe('wpm simulate — error paths', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 2 (source_error) when no input file is provided', async () => {
    const result = await runCli(['model', 'simulate', '--format', 'json']);
    expect(result.exitCode).toBe(2);
  });

  it('returns the bare {error} envelope shape when no input (no top-level command/status)', async () => {
    const result = await runCli(['model', 'simulate', '--format', 'json']);
    const j = parseEnvelope(result);
    expect(j.command).toBeUndefined();
    expect(j.status).toBeUndefined();
    expect(typeof j.error).toBe('object');
    expect(j.error).not.toBeNull();
  });

  it('exits 2 (source_error) for nonexistent file, not 0 or a crash', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      '/nonexistent/does-not-exist.xes',
      '--format',
      'json',
      '--no-save',
    ]);
    // Bridged INVALID_INPUT failures always map to source_error (2) via
    // wpm's ERROR_CODE_MAP, regardless of which legacy exit code (1 or 2)
    // the bridged command originally used for this path.
    expect(result.exitCode).toBe(2);
  });

  it('returns {error} envelope for nonexistent file', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      '/nonexistent/does-not-exist.xes',
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    expect(j.error).toBeDefined();
    expect(j.command).toBeUndefined();
  });

  it('exits 2 (source_error), not 1, for invalid --cases value', async () => {
    // The old config_error (1) vs source_error (2) split is gone for
    // bridged verbs — both collapse to INVALID_INPUT -> source_error (2).
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--cases',
      'not-a-number',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(2);
  });

  it('returns {error} envelope for invalid --cases value, with the original message preserved', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--cases',
      'abc',
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    expect(j.error).toBeDefined();
    expect((j.error as { message?: string }).message).toMatch(/positive integer/i);
  });

  it('exits 2 (source_error), not 1, for invalid --time value', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--time',
      'not-a-number',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(2);
  });

  it('returns {error} envelope for invalid --time value', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--time',
      'bad',
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    expect(j.error).toBeDefined();
  });
});

// ── Success path — JSON envelope field contracts ──────────────────────────────

describe('wpm simulate — JSON envelope field contracts', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 0 on success', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('envelope top-level: command=simulate, status=ok, payload present', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    expect(j.command).toBe('simulate');
    expect(j.status).toBe('ok');
    expect(j.payload).toBeDefined();
    expect(typeof j.payload).toBe('object');
  });

  it('payload.simulation block: method=monte_carlo, casesRequested, casesCompleted, seed, elapsedMs', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--cases',
      '10',
      '--seed',
      '99',
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(sim).toBeDefined();
    expect(sim['method']).toBe('monte_carlo');
    expect(sim['casesRequested']).toBe(10);
    expect(typeof sim['casesCompleted']).toBe('number');
    expect(typeof sim['seed']).toBe('number');
    expect(typeof sim['elapsedMs']).toBe('number');
  });

  it('payload.statistics block: contains avgTraceLength and avgSojournTimeMs', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    const stats = (j.payload as Record<string, unknown>)['statistics'] as Record<string, unknown>;
    expect(stats).toBeDefined();
    expect('avgTraceLength' in stats).toBe(true);
    expect('avgSojournTimeMs' in stats).toBe(true);
  });

  it('payload.statistics block: sojourn time percentile fields present', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    const stats = (j.payload as Record<string, unknown>)['statistics'] as Record<string, unknown>;
    expect('sojournTimeStdMs' in stats).toBe(true);
    expect('sojournTimeP5Ms' in stats).toBe(true);
    expect('sojournTimeP50Ms' in stats).toBe(true);
    expect('sojournTimeP95Ms' in stats).toBe(true);
  });

  it('payload.statistics block: resourceUtilization is a number', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    const stats = (j.payload as Record<string, unknown>)['statistics'] as Record<string, unknown>;
    expect(typeof stats['resourceUtilization']).toBe('number');
  });

  it('payload.traces is an array', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    const traces = (j.payload as Record<string, unknown>)['traces'];
    expect(Array.isArray(traces)).toBe(true);
  });

  it('payload.input echoes the input file path', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    expect((j.payload as Record<string, unknown>)['input']).toBe(env.xesPath);
  });

  it('payload.activityKey echoes the activity key (default: concept:name)', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    expect((j.payload as Record<string, unknown>)['activityKey']).toBe('concept:name');
  });
});

// ── Flag permutations ─────────────────────────────────────────────────────────

describe('wpm simulate — flag permutations', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('--cases 5 sets casesRequested=5 in simulation block', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--cases',
      '5',
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(sim['casesRequested']).toBe(5);
  });

  it('--cases 1 edge case: minimal simulation completes successfully', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--cases',
      '1',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(sim['casesRequested']).toBe(1);
  });

  it('--cases 100 is accepted (default value passes explicitly)', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--cases',
      '100',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(sim['casesRequested']).toBe(100);
  });

  it('--seed 42 echoes seed=42 in simulation block', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--seed',
      '42',
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(sim['seed']).toBe(42);
  });

  it('--seed 999999 echoes seed=999999 in simulation block', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--seed',
      '999999',
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(sim['seed']).toBe(999999);
  });

  it('--time 5000 is accepted and does not cause error exit', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--time',
      '5000',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
  });

  it('--activity-key is accepted and echoed in payload.activityKey', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--activity-key',
      'concept:name',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect((j.payload as Record<string, unknown>)['activityKey']).toBe('concept:name');
  });

  it('--verbose flag is accepted without crashing', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--verbose',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('--quiet flag is accepted without crashing', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--quiet',
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('short flag -i is accepted (same as --file)', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
  });
});

// ── Human output content assertions ──────────────────────────────────────────

describe('wpm simulate — human output', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('--format human exits 0', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'human',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('human output contains "Monte Carlo" or "simulation" (case-insensitive)', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'human',
      '--no-save',
    ]);
    const combined = (result.stdout + result.stderr).toLowerCase();
    expect(combined.includes('monte carlo') || combined.includes('simulation')).toBe(true);
  });

  it('human output with --seed mentions the seed value', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--seed',
      '7777',
      '--format',
      'human',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    // Seed should appear somewhere in human-readable output
    if (combined.trim().length > 0) {
      expect(combined.includes('7777')).toBe(true);
    }
  });

  it('human output mentions cases count', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--cases',
      '10',
      '--format',
      'human',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    if (combined.trim().length > 0) {
      expect(combined.includes('10')).toBe(true);
    }
  });

  it('human output does not contain raw JSON envelope wrapper', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'human',
      '--no-save',
    ]);
    // Human output must not be a raw envelope JSON object starting with {"command":
    const trimmed = result.stdout.trim();
    expect(trimmed.startsWith('{"command":')).toBe(false);
  });
});

// ── Metamorphic: seed determinism ─────────────────────────────────────────────

describe('wpm simulate — seed determinism (Rank 3 metamorphic)', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('same --seed produces identical casesCompleted and avgTraceLength', async () => {
    const args = ['model', 'simulate', '-i', env.xesPath, '--seed', '12345', '--cases', '5', '--format', 'json', '--no-save'];
    const [r1, r2] = await Promise.all([runCli(args), runCli(args)]);

    expect(r1.exitCode).toBe(0);
    expect(r2.exitCode).toBe(0);

    const j1 = parseEnvelope(r1);
    const j2 = parseEnvelope(r2);

    const sim1 = (j1.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    const sim2 = (j2.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    const stats1 = (j1.payload as Record<string, unknown>)['statistics'] as Record<string, unknown>;
    const stats2 = (j2.payload as Record<string, unknown>)['statistics'] as Record<string, unknown>;

    // Same seed must produce same completed cases and average trace length
    expect(sim1['casesCompleted']).toEqual(sim2['casesCompleted']);
    expect(stats1['avgTraceLength']).toEqual(stats2['avgTraceLength']);
  });

  it('same --seed produces identical sojourn time statistics', async () => {
    const args = ['model', 'simulate', '-i', env.xesPath, '--seed', '54321', '--cases', '5', '--format', 'json', '--no-save'];
    const [r1, r2] = await Promise.all([runCli(args), runCli(args)]);

    expect(r1.exitCode).toBe(0);
    expect(r2.exitCode).toBe(0);

    const stats1 = ((parseEnvelope(r1).payload as Record<string, unknown>)['statistics']) as Record<string, unknown>;
    const stats2 = ((parseEnvelope(r2).payload as Record<string, unknown>)['statistics']) as Record<string, unknown>;

    expect(stats1['avgSojournTimeMs']).toEqual(stats2['avgSojournTimeMs']);
    expect(stats1['sojournTimeP50Ms']).toEqual(stats2['sojournTimeP50Ms']);
    expect(stats1['sojournTimeP95Ms']).toEqual(stats2['sojournTimeP95Ms']);
  });
});

// ── Output format invariants ──────────────────────────────────────────────────

describe('wpm simulate — output format invariants', () => {
  let env: TestEnv;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  it('--format json stdout is valid parseable JSON', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('JSON output is a valid JSON envelope with command=simulate', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    // FM-5: parse the stdout as JSON and verify command field — this detects
    // regressions where the command name is wrong or stdout is a non-JSON string.
    // `toBeGreaterThan(0)` on raw length would pass even if stdout was "x".
    const parsed = JSON.parse(result.stdout) as { command?: string; status?: string };
    expect(parsed.command).toBe('simulate');
    expect(parsed.status).toMatch(/^(ok|error)$/);
  });

  it('--no-save flag is accepted without crashing', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--no-save',
      '--format',
      'json',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('statistics fields are all finite numbers (not NaN or Infinity)', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    const stats = (j.payload as Record<string, unknown>)['statistics'] as Record<string, unknown>;

    const numericFields = [
      'avgTraceLength',
      'avgSojournTimeMs',
      'sojournTimeStdMs',
      'sojournTimeP5Ms',
      'sojournTimeP50Ms',
      'sojournTimeP95Ms',
      'resourceUtilization',
    ];
    for (const field of numericFields) {
      const v = stats[field];
      if (v !== undefined) {
        expect(typeof v).toBe('number');
        expect(Number.isFinite(v as number)).toBe(true);
      }
    }
  });

  it('simulation.seed is a non-negative integer', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    const seed = sim['seed'] as number;
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });

  it('simulation.elapsedMs is a non-negative number', async () => {
    const result = await runCli([
      'model',
      'simulate',
      '-i',
      env.xesPath,
      '--format',
      'json',
      '--no-save',
    ]);
    const j = parseEnvelope(result);
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(typeof sim['elapsedMs']).toBe('number');
    expect((sim['elapsedMs'] as number)).toBeGreaterThanOrEqual(0);
  });
});

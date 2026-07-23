/**
 * `wpm simulate` was retired; the hard-break table (nouns/_removed.ts)
 * forwards it to `wpm model simulate`, which bridges unmodified to this same
 * `commands/simulate.ts` body (nouns/model/simulate.ts). Confirmed live
 * against the built CLI:
 *   - A successful call returns the legacy `{command,status,payload,meta}`
 *     envelope verbatim.
 *   - A failing call is thrown as the framework's bare `{error:{code,message}}`
 *     envelope — no top-level `command`/`status` field survives. Legacy exit
 *     codes 1 (config_error) and 2 (source_error) both collapse to the
 *     generic `INVALID_INPUT`, which wpm's ERROR_CODE_MAP maps to
 *     source_error (2) — every "exit 1 (config_error)" expectation below is
 *     now exit 2, and the legacy `INVALID_ARG` error code is gone (always
 *     `INVALID_INPUT`). The underlying validation messages themselves
 *     (e.g. "must be a positive integer") are unchanged — only the wrapper
 *     shape and exit/error codes differ — so message-content assertions are
 *     preserved, re-pointed at `error.message` instead of `j.error`'s old
 *     string-or-object ambiguity.
 *
 * simulate-edge-cases.test.ts — Edge-case coverage for `wpm model simulate` (was: wpm simulate)
 *
 * Oracle rank: Rank 1 (Mathematical invariant) for seed=0 and numeric field bounds.
 *              Rank 2 (Domain contract) for exit codes, validation messages, JSON contract.
 *              Rank 3 (Metamorphic) for float truncation coercion and seed=0 determinism.
 *
 * What this file covers that simulate-cli.test.ts and simulate-temporal-cli.test.ts do NOT:
 *  1. --cases 0 → config_error (exit 1) — previously silently accepted as "0 cases"
 *  2. --cases -5 (equals syntax) → config_error (exit 1) — previously silently accepted
 *  3. --cases 1.5 → parseInt coercion to 1, succeeds (documented behavior)
 *  4. --time 0 → config_error (exit 1) — previously silently accepted as "0ms limit"
 *  5. --time -1 (equals syntax) → config_error (exit 1) — previously silently accepted
 *  6. --seed -1 (equals syntax) → config_error (exit 1) — previously silently accepted
 *  7. --seed 0 → accepted, seed=0 echoed in payload
 *  8. --seed 2147483647 → accepted (maximum safe Monte Carlo seed value)
 *  9. Positional input (wpm simulate <file>) vs named --file/-i equivalence
 * 10. activityStatistics field is present in payload.statistics
 * 11. resourceUtilizationByActivity field is present in payload.statistics
 * 12. payload.simulation.casesCompleted is a number (not undefined)
 * 13. Error envelope includes the code field for validation errors
 * 14. Missing XES file exits 2 or 3 (source or execution error, not config error)
 * 15. --format json with no input gives structured JSON error (not a crash)
 * 16. Very short --time (1ms) still returns valid envelope (not a crash)
 * 17. Seed determinism: seed=0 produces identical output on two successive runs
 * 18. --cases string with spaces (e.g., " 5 ") is handled without crashing
 * 19. payload.traces is an array (can be empty — WASM may not populate traces)
 * 20. Envelope meta fields: run_id, timestamp, duration_ms, version are present
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// ── XES fixture WITHOUT <global> sections (WASM parser compatible) ────────────
// Note: <global> sections in XES cause exit 3 in some WASM builds. This fixture
// avoids them entirely for maximum parser compatibility.

const MINIMAL_XES_NO_GLOBAL = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <trace>
    <string key="concept:name" value="case1"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2020-01-01T08:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2020-01-01T09:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2020-01-01T10:00:00.000+00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case2"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2020-01-02T08:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Reject"/>
      <date key="time:timestamp" value="2020-01-02T09:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2020-01-02T10:00:00.000+00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case3"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2020-01-03T08:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2020-01-03T09:30:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Notify"/>
      <date key="time:timestamp" value="2020-01-03T10:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2020-01-03T11:00:00.000+00:00"/>
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

// `command`/`status`/`meta` only exist on the bridge's success-path
// passthrough of the legacy envelope; a bridged failure is thrown and
// reaches stdout as the bare `{error:{code,message}}` shape with none of
// those fields (see file header comment) — all now optional to model both.
interface Envelope {
  command?: string;
  status?: 'ok' | 'error';
  exit_code?: number;
  payload?: Record<string, unknown>;
  error?: { code?: string; message?: string };
  message?: string;
  meta?: {
    run_id?: string;
    timestamp?: string;
    duration_ms?: number;
    version?: string;
  };
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
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-sim-edge-'));
  const xesPath = path.join(tempDir, 'edge.xes');
  await fs.writeFile(xesPath, MINIMAL_XES_NO_GLOBAL, 'utf-8');
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

// ── Group 1: --cases validation edge cases ─────────────────────────────────────

describe('wpm simulate — --cases validation edge cases', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--cases=0 exits 2 (source_error), not the old config_error (1): zero cases is not a positive integer', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=0', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
  });

  it('--cases=0 returns the bare {error} envelope shape, with the legacy INVALID_ARG code now generalized to INVALID_INPUT', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=0', '--format', 'json', '--no-save']);
    const j = parseEnvelope(result);
    expect(j.command).toBeUndefined();
    expect(j.status).toBeUndefined();
    const err = j.error as { code?: string; message?: string } | undefined;
    expect(err?.code).toBe('INVALID_INPUT');
  });

  it('--cases=-5 exits 2 (source_error): negative cases are not valid', async () => {
    // Use equals syntax so the negative value is bound to --cases, not parsed as a flag
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=-5', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
  });

  it('--cases=-5 error message mentions "positive integer"', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=-5', '--format', 'json', '--no-save']);
    const j = parseEnvelope(result);
    const err = j.error as { code?: string; message?: string } | undefined;
    const msg = err?.message ?? '';
    expect(msg.toLowerCase()).toMatch(/positive integer|≥ 1/);
  });

  it('--cases=1.5 is silently truncated to 1 via parseInt coercion (not rejected)', async () => {
    // parseInt('1.5') === 1: documented JavaScript parseInt behavior.
    // The validator only rejects NaN and non-positive values; 1 is positive.
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=1.5', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    // parseInt('1.5') === 1, so casesRequested must be 1
    expect(sim['casesRequested']).toBe(1);
  });

  it('--cases=abc exits 2 (source_error): non-numeric string rejected', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=abc', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
    const j = parseEnvelope(result);
    expect(j.error).toBeDefined();
  });

  it('--cases=500 is accepted (large but valid case count)', async () => {
    // 500 cases may be slow — we trust validation passes and the command starts
    // but we use --time=1 to force a very short wall-time limit
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=500', '--time=1000', '--format', 'json', '--no-save'], 60_000);
    // Validation should pass (exit 2 would mean validation failure, not expected)
    expect(result.exitCode).not.toBe(2);
    if (result.exitCode === 0) {
      const j = parseEnvelope(result);
      expect(j.status).toBe('ok');
      const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
      expect(sim['casesRequested']).toBe(500);
    }
  });
});

// ── Group 2: --time validation edge cases ─────────────────────────────────────

describe('wpm simulate — --time validation edge cases', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--time=0 exits 2 (source_error), not the old config_error (1): zero milliseconds is not a valid limit', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--time=0', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
  });

  it('--time=0 error message mentions "positive integer" or milliseconds', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--time=0', '--format', 'json', '--no-save']);
    const j = parseEnvelope(result);
    const err = j.error as { code?: string; message?: string } | undefined;
    const msg = err?.message ?? '';
    expect(msg.toLowerCase()).toMatch(/positive integer|milliseconds|≥ 1/);
  });

  it('--time=-1 exits 2 (source_error): negative time is not valid', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--time=-1', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
  });

  it('--time=bad exits 2 (source_error): non-numeric string rejected', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--time=bad', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
    const j = parseEnvelope(result);
    expect(j.error).toBeDefined();
  });

  it('--time=1 is accepted (1ms limit, completes without crash)', async () => {
    // Very short wall-time. The simulation may produce 0 completed cases but must not crash.
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=5', '--time=1', '--format', 'json', '--no-save']);
    // Must not be a validation error (exit 2)
    expect(result.exitCode).not.toBe(2);
    if (result.exitCode === 0) {
      const j = parseEnvelope(result);
      expect(j.status).toBe('ok');
    }
  });
});

// ── Group 3: --seed validation edge cases ─────────────────────────────────────

describe('wpm simulate — --seed validation edge cases', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--seed=-1 exits 2 (source_error), not the old config_error (1): negative seed is not valid', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--seed=-1', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
  });

  it('--seed=-1 error message mentions "non-negative"', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--seed=-1', '--format', 'json', '--no-save']);
    const j = parseEnvelope(result);
    const err = j.error as { code?: string; message?: string } | undefined;
    const msg = err?.message ?? '';
    expect(msg.toLowerCase()).toMatch(/non-negative|≥ 0/);
  });

  it('--seed=0 is accepted as a valid seed value', async () => {
    // Seed 0 is a valid non-negative integer
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--seed=0', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(sim['seed']).toBe(0);
  });

  it('--seed=0 produces deterministic output on two successive runs (Rank 3 metamorphic)', async () => {
    const args = ['model', 'simulate', '-i', env.xesPath, '--seed=0', '--cases=3', '--format', 'json', '--no-save'];
    const [r1, r2] = await Promise.all([runCli(args), runCli(args)]);

    expect(r1.exitCode).toBe(0);
    expect(r2.exitCode).toBe(0);

    const j1 = parseEnvelope(r1);
    const j2 = parseEnvelope(r2);

    const stats1 = (j1.payload as Record<string, unknown>)['statistics'] as Record<string, unknown>;
    const stats2 = (j2.payload as Record<string, unknown>)['statistics'] as Record<string, unknown>;

    // Same seed=0 must produce identical statistical output
    expect(stats1['avgSojournTimeMs']).toEqual(stats2['avgSojournTimeMs']);
    expect(stats1['avgTraceLength']).toEqual(stats2['avgTraceLength']);
  });

  it('--seed=2147483647 is accepted (maximum safe Monte Carlo seed)', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--seed=2147483647', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(sim['seed']).toBe(2147483647);
  });

  it('--seed=nan exits 2 (source_error), not the old config_error (1): "nan" string is not an integer', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--seed=nan', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
    const j = parseEnvelope(result);
    expect(j.error).toBeDefined();
  });

  it('--seed=1.5 coerced to 1 via parseInt: accepted (not NaN, not negative)', async () => {
    // parseInt('1.5') === 1. This is a valid non-negative integer.
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--seed=1.5', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(sim['seed']).toBe(1);
  });
});

// ── Group 4: JSON output contract — fields not covered by existing tests ───────

describe('wpm simulate — JSON output contract (uncovered fields)', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('payload.statistics.activityStatistics is present and is an object', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const stats = (j.payload as Record<string, unknown>)['statistics'] as Record<string, unknown>;
    expect('activityStatistics' in stats).toBe(true);
    expect(typeof stats['activityStatistics']).toBe('object');
    expect(stats['activityStatistics']).not.toBeNull();
  });

  it('payload.statistics.resourceUtilizationByActivity is present and is an object', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const stats = (j.payload as Record<string, unknown>)['statistics'] as Record<string, unknown>;
    expect('resourceUtilizationByActivity' in stats).toBe(true);
    expect(typeof stats['resourceUtilizationByActivity']).toBe('object');
    expect(stats['resourceUtilizationByActivity']).not.toBeNull();
  });

  it('payload.simulation.casesCompleted is a number (not undefined, not NaN)', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=5', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(typeof sim['casesCompleted']).toBe('number');
    expect(Number.isNaN(sim['casesCompleted'] as number)).toBe(false);
    expect(Number.isFinite(sim['casesCompleted'] as number)).toBe(true);
  });

  it('payload.traces is an array (may be empty)', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const traces = (j.payload as Record<string, unknown>)['traces'];
    expect(Array.isArray(traces)).toBe(true);
  });

  it('envelope meta block contains run_id, timestamp, duration_ms, version', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.meta).toBeDefined();
    expect(typeof j.meta?.run_id).toBe('string');
    expect(j.meta?.run_id?.length).toBeGreaterThan(0);
    expect(typeof j.meta?.timestamp).toBe('string');
    expect(typeof j.meta?.duration_ms).toBe('number');
    expect(typeof j.meta?.version).toBe('string');
  });

  it('payload.simulation block contains all five required fields', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const sim = (j.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    const required = ['method', 'casesRequested', 'casesCompleted', 'elapsedMs', 'seed'] as const;
    for (const field of required) {
      expect(field in sim).toBe(true);
    }
  });

  it('payload.statistics block contains all seven required fields', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const stats = (j.payload as Record<string, unknown>)['statistics'] as Record<string, unknown>;
    const required = [
      'avgTraceLength',
      'avgSojournTimeMs',
      'sojournTimeStdMs',
      'sojournTimeP5Ms',
      'sojournTimeP50Ms',
      'sojournTimeP95Ms',
      'resourceUtilization',
    ] as const;
    for (const field of required) {
      expect(field in stats).toBe(true);
    }
  });

  it('error envelope for an invalid-argument failure has code=INVALID_INPUT', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=0', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
    const j = parseEnvelope(result);
    const err = j.error as { code?: string } | undefined;
    expect(err?.code).toBe('INVALID_INPUT');
  });
});

// ── Group 5: Input path — positional vs named flag ────────────────────────────

describe('wpm simulate — positional vs named input', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('positional input (wpm simulate <file>) exits 0 and echoes the input path', async () => {
    const result = await runCli(['model', 'simulate', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
    expect((j.payload as Record<string, unknown>)['input']).toBe(env.xesPath);
  });

  it('positional input produces the same payload structure as -i flag', async () => {
    const rPositional = await runCli(['model', 'simulate', env.xesPath, '--seed=42', '--cases=5', '--format', 'json', '--no-save']);
    const rFlag = await runCli(['model', 'simulate', '-i', env.xesPath, '--seed=42', '--cases=5', '--format', 'json', '--no-save']);

    expect(rPositional.exitCode).toBe(0);
    expect(rFlag.exitCode).toBe(0);

    const jPos = parseEnvelope(rPositional);
    const jFlag = parseEnvelope(rFlag);

    // Both must report the same casesRequested and seed
    const simPos = (jPos.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    const simFlag = (jFlag.payload as Record<string, unknown>)['simulation'] as Record<string, unknown>;
    expect(simPos['casesRequested']).toBe(simFlag['casesRequested']);
    expect(simPos['seed']).toBe(simFlag['seed']);
  });

  it('missing input (no positional and no -i) exits 2 (source_error)', async () => {
    const result = await runCli(['model', 'simulate', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
  });

  it('nonexistent positional file exits 2 or 3', async () => {
    const result = await runCli(['model', 'simulate', '/nonexistent/nope.xes', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBeGreaterThanOrEqual(2);
    expect(result.exitCode).toBeLessThanOrEqual(3);
  });
});

// ── Group 6: Exit code contract — comprehensive ───────────────────────────────

describe('wpm simulate — exit code contract', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('success → exit 0', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(0);
  });

  it('missing input → exit 2 (source_error)', async () => {
    const result = await runCli(['model', 'simulate', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
  });

  // The old config_error (1) vs source_error (2) split no longer applies to
  // bridged verbs: every validation failure below is now source_error (2),
  // confirmed live against the built CLI (see file header comment).

  it('--cases=0 → exit 2 (source_error)', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=0', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
  });

  it('--cases=-1 → exit 2 (source_error)', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=-1', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
  });

  it('--time=0 → exit 2 (source_error)', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--time=0', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
  });

  it('--seed=-1 → exit 2 (source_error)', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--seed=-1', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
  });

  it('non-existent file → exit 2 or 3, not exit 0', async () => {
    const result = await runCli(['model', 'simulate', '-i', '/no/such/file.xes', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBeGreaterThanOrEqual(2);
    expect(result.exitCode).not.toBe(0);
  });

  it('validation-error exits carry a structured JSON error, not raw text', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=0', '--format', 'json', '--no-save']);
    expect(result.exitCode).toBe(2);
    // Must not throw
    expect(() => parseEnvelope(result)).not.toThrow();
  });
});

// ── Group 7: Human output sanity checks ──────────────────────────────────────

describe('wpm simulate — human output sanity (edge inputs)', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--seed=0 human output contains "0" (seed is printed)', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--seed=0', '--format', 'human', '--no-save']);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    // Seed 0 should appear somewhere in the human-readable output
    expect(combined).toMatch(/\b0\b/);
  });

  it('--cases=0 error in (now always-JSON) output is readable (not a crash or empty)', async () => {
    const result = await runCli(['model', 'simulate', '-i', env.xesPath, '--cases=0', '--format', 'human', '--no-save']);
    expect(result.exitCode).toBe(2);
    const combined = result.stdout + result.stderr;
    expect(combined.trim().length).toBeGreaterThan(0);
  });

  it('positional input human output does not crash and contains file path', async () => {
    const result = await runCli(['model', 'simulate', env.xesPath, '--format', 'human', '--no-save']);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    // The file path or its basename should appear in human output
    const base = path.basename(env.xesPath);
    expect(combined).toContain(base);
  });
});

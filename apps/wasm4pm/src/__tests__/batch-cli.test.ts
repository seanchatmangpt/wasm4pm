/**
 * batch-cli.test.ts
 *
 * CLI tests for the retired `wpm batch` command — formerly parallel
 * discovery across MULTIPLE event logs in a directory (glob expansion,
 * `--workers` concurrency, `--continue-on-error`, `--output-dir`,
 * `--timeout`, per-file JSON/CSV summaries).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * GENUINE CAPABILITY RETIREMENT (not a renamed/reshaped equivalent) —
 * documented here rather than silently dropped:
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `nouns/_removed.ts` maps the retired `batch` top-level command to
 * `pipeline run`, and `nouns/pipeline/run.ts`'s own doc comment says it
 * "Also absorbs the retired `wpm analyze`/`wpm batch`". In practice this
 * absorption is name-only: `pipeline run` (`engines/orchestrator/plan.ts`
 * `buildPlan()`) accepts exactly ONE `--input <path>` string, which each
 * plan step (`log validate`, `model discover`, ...) treats as a single
 * file to `fs.readFile()` — there is no directory/glob expansion,
 * `--workers`/`--parallel` concurrency, `--continue-on-error`,
 * `--output-dir`, or per-file summary statistics anywhere in the new
 * noun/verb surface. This was confirmed by reading `plan.ts`'s own scoping
 * note and `model discover`'s single-file `readInput()`, not assumed.
 *
 * So almost the entirety of the original 40+ tests in this file (multi-file
 * directories, `--workers N`, `--timeout N`, `--continue-on-error`,
 * per-file JSON payload fields like `success_count`/`per_file_results`)
 * exercise behavior that no longer exists anywhere in `wpm`, under any
 * name. Per the migration's rule against silently deleting coverage: this
 * file is rewritten to (a) prove the retirement is real and consistent
 * (`wpm batch ...` always hard-fails with the documented redirect, for any
 * argument shape), and (b) exercise the closest surviving capability — a
 * SINGLE log through `wpm pipeline run --auto --input <file>` — which is
 * the only remaining behavior actually inherited from old `wpm batch`
 * (batch-of-one). It intentionally does NOT invent assertions for
 * multi-file/worker/timeout behavior that has no implementation to test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Minimal valid XES event log with 1 trace. `time:timestamp` must be a
 * `<date>` element (not `<string>`) for `log validate` to accept it —
 * `pipeline run`'s `validate` step runs before `discover` and aborts the
 * whole plan on a hard schema violation.
 */
const MIN_VALID_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes.org/">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="Start"/>
      <date key="time:timestamp" value="2024-01-01T00:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Process"/>
      <date key="time:timestamp" value="2024-01-01T00:01:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="End"/>
      <date key="time:timestamp" value="2024-01-01T00:02:00Z"/>
    </event>
  </trace>
</log>`;

const INVALID_XES = `not-xml-at-all {{ broken`;

describe("wpm batch — retired; hard-redirects to 'wpm pipeline run'", () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let tmpDir: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-batch-test-'));
  });

  afterEach(async () => {
    env?.cleanup?.();
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('wpm batch <dir> prints the removal redirect to stderr and exits 1, regardless of directory contents', async () => {
    const filePath = path.join(tmpDir, 'log.xes');
    await fs.writeFile(filePath, MIN_VALID_XES);

    const result = await runCli(['batch', tmpDir, '--algorithm', 'dfg']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/'wpm batch' was removed/);
    expect(result.stderr).toMatch(/wpm pipeline run/);
  });

  it('wpm batch (no args) also hard-redirects (checkRemoved fires before argument parsing)', async () => {
    const result = await runCli(['batch']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/'wpm batch' was removed/);
  });

  it('stdout is empty on the removal path (the redirect message goes to stderr only)', async () => {
    const result = await runCli(['batch', tmpDir]);
    expect(result.stdout.trim()).toBe('');
  });

  it('every --workers/--parallel/--timeout/--continue-on-error flag shape still just hard-redirects', async () => {
    // These flags belonged to the retired multi-file processing behavior;
    // none of them change the removal outcome — 'wpm batch' is intercepted
    // by the hard-break table (nouns/_removed.ts) before any flag is parsed.
    const result = await runCli([
      'batch', tmpDir,
      '--workers', '4',
      '--timeout', '60',
      '--continue-on-error',
      '--parallel', '2',
      '--output-dir', tmpDir,
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/'wpm batch' was removed/);
  });
});

describe("wpm pipeline run --auto — the surviving single-log capability formerly reached via 'wpm batch'", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-pipeline-run-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('processes a single valid XES file end-to-end (validate -> discover) and exits 0', async () => {
    const filePath = path.join(tmpDir, 'log.xes');
    await fs.writeFile(filePath, MIN_VALID_XES);

    const result = await runCli(['pipeline', 'run', '--auto', '--input', filePath], { cwd: tmpDir });
    expect(result.exitCode).toBe(EXIT_CODES.success);

    const report = JSON.parse(result.stdout) as {
      planId: string;
      status: string;
      steps: Array<{ stepId: string; noun: string; verb: string; status: string }>;
      chainHash: string;
    };
    expect(report.status).toBe('ok');
    expect(report.steps.map((s) => `${s.noun} ${s.verb}`)).toEqual(['log validate', 'model discover']);
    expect(report.steps.every((s) => s.status === 'ok')).toBe(true);
    // BLAKE3 chain hash — Absolute Rule 6.
    expect(report.chainHash).toMatch(/^[0-9a-f]{64,72}$/);
  });

  it('fails closed (nonzero exit, status:"failed") when the log fails validation', async () => {
    const filePath = path.join(tmpDir, 'bad.xes');
    await fs.writeFile(filePath, INVALID_XES);

    const result = await runCli(['pipeline', 'run', '--auto', '--input', filePath], { cwd: tmpDir });
    expect(result.exitCode).not.toBe(EXIT_CODES.success);

    const report = JSON.parse(result.stdout) as { status: string; exitCode: number };
    expect(report.status).toBe('failed');
    // pipeline run's own fail-closed exitCode field (see nouns/pipeline/run.ts)
    // must match the process's real exit code — Absolute Rule / plan item 2.
    expect(report.exitCode).toBe(result.exitCode);
  });

  it('requires --input for --auto (no directory/glob expansion exists anymore)', async () => {
    const result = await runCli(['pipeline', 'run', '--auto']);
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
    const parsed = JSON.parse(result.stdout) as { error?: { code: string; message: string } };
    expect(parsed.error?.message).toMatch(/--input/);
  });

  it('does NOT accept a directory as --input (single-file only; confirms multi-file batch has no replacement)', async () => {
    await fs.writeFile(path.join(tmpDir, 'log.xes'), MIN_VALID_XES);
    const result = await runCli(['pipeline', 'run', '--auto', '--input', tmpDir], { cwd: tmpDir });
    // A directory path fails `fs.readFile()` inside `model discover` (EISDIR)
    // or fails validation — either way it does NOT transparently expand into
    // per-file processing the way `wpm batch <dir>` used to.
    expect(result.exitCode).not.toBe(EXIT_CODES.success);
  });
});

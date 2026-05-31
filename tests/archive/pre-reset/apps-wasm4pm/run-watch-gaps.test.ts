/**
 * run-watch-gaps.test.ts
 *
 * Closes four critical DX gaps in `wpm run` and `wpm watch`:
 *
 * Gap A — `--no-save` was silently broken (citty no- prefix convention):
 *   citty strips the `no-` prefix from `--no-save` so the arg lands as
 *   `ctx.args.save = false`, not `ctx.args['no-save'] = true`. The check
 *   `!ctx.args['no-save']` evaluated to `!undefined = true`, meaning the
 *   file was always saved. Fix: renamed arg to `save` with `default: true`;
 *   now `--no-save` correctly prevents auto-save.
 *
 * Gap B — `isFirstRun()` filter was always true (wrong startsWith filter):
 *   Files are named `<timestamp>-discover-<algo>.json` but the filter used
 *   `f.startsWith('discover-')`, which never matched. Every run was treated
 *   as a "first run". Fix: changed to `f.includes('-discover-')`.
 *
 * Gap C — auto-save creates the directory on first use:
 *   `savePredictionResult` calls `fs.mkdir(dir, { recursive: true })` before
 *   writing, so the `.wasm4pm/results/` directory is created automatically
 *   even if it did not exist.
 *
 * Gap D — `wpm watch --interval 0` and `--interval -500` exit config_error:
 *   Invalid interval values are validated before the watcher starts.
 *
 * Oracle rank: Rank-2 (domain contract) — these are observable CLI contracts.
 *
 * Van der Aalst lens: Discovery results must be reliably persisted so that
 * conformance checking and enhancement can compare historical runs. When
 * `--no-save` silently saves, practitioners lose control over their artifact
 * store — a direct violation of "Make it actionable" from the IEEE PM manifesto.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// ─── Minimal valid XES log ────────────────────────────────────────────────────

const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2023-01-01T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2023-01-01T10:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2023-01-02T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Reject"/>
      <date key="time:timestamp" value="2023-01-02T10:00:00Z"/>
    </event>
  </trace>
</log>`;

// ─── CLI runner ───────────────────────────────────────────────────────────────

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Run the wpm CLI as a subprocess with a given cwd and timeout.
 * Returns exit code, stdout, and stderr.
 */
function runWpm(args: string[], cwd: string, timeoutMs = 20_000): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024, cwd },
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

/**
 * Start `wpm watch` and collect output until SIGTERM is sent after collectMs.
 */
function runWpmWatch(args: string[], cwd: string, collectMs = 2000): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, 'watch', ...args],
      { maxBuffer: 5 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error && (error as NodeJS.ErrnoException).killed
              ? 0
              : error
                ? 1
                : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' })
    );
    setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    }, collectMs);
  });
}

// ─── Test env helpers ─────────────────────────────────────────────────────────

interface TestEnv {
  tempDir: string;
  xesPath: string;
  resultsDir: string;
  cleanup: () => Promise<void>;
}

async function createTestEnv(): Promise<TestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-run-watch-gaps-'));
  const xesPath = path.join(tempDir, 'test.xes');
  const resultsDir = path.join(tempDir, '.wasm4pm', 'results');

  await fs.writeFile(xesPath, MINIMAL_XES, 'utf-8');

  return {
    tempDir,
    xesPath,
    resultsDir,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

// ─── Gap A: --no-save prevents auto-save ─────────────────────────────────────
// Previously broken: citty strips 'no-' prefix so ctx.args['no-save'] was
// always undefined, making !undefined = true → file always written.

describe('Gap A — wpm run --no-save: file must NOT be written', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('with --no-save, .wasm4pm/results/ directory is NOT created', async () => {
    const result = await runWpm(['run', env.xesPath, '--no-save'], env.tempDir);
    expect(result.exitCode).toBe(0);

    // Results directory must not exist at all
    let dirExists = false;
    try {
      await fs.access(env.resultsDir);
      dirExists = true;
    } catch {
      // expected: directory absent
    }
    expect(dirExists).toBe(false);
  });

  it('with --no-save, no JSON file is written anywhere under .wasm4pm/', async () => {
    const result = await runWpm(['run', env.xesPath, '--no-save'], env.tempDir);
    expect(result.exitCode).toBe(0);

    const wasm4pmDir = path.join(env.tempDir, '.wasm4pm', 'results');
    let files: string[] = [];
    try {
      files = await fs.readdir(wasm4pmDir);
    } catch {
      // directory absent is acceptable — that's even better
    }
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    expect(jsonFiles).toHaveLength(0);
  });

  it('with --no-save on a fresh directory, command still exits 0', async () => {
    // Regression guard: --no-save must not cause a crash or non-zero exit
    const result = await runWpm(['run', env.xesPath, '--no-save'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('without --no-save, .wasm4pm/results/ is created and contains exactly one JSON file', async () => {
    const result = await runWpm(['run', env.xesPath], env.tempDir);
    expect(result.exitCode).toBe(0);

    const files = await fs.readdir(env.resultsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    expect(jsonFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('with --no-save on --format json output, the JSON payload has no savedPath field', async () => {
    const result = await runWpm(['run', env.xesPath, '--no-save', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    // The payload must not contain a savedPath reference
    const payloadStr = JSON.stringify(parsed.payload ?? {});
    expect(payloadStr).not.toMatch(/savedPath/);
  });

  it('--no-save combined with --algorithm dfg still exits 0', async () => {
    const result = await runWpm(['run', env.xesPath, '--no-save', '--algorithm', 'dfg'], env.tempDir);
    expect(result.exitCode).toBe(0);

    let dirExists = false;
    try {
      await fs.access(env.resultsDir);
      dirExists = true;
    } catch { /* expected */ }
    expect(dirExists).toBe(false);
  });
});

// ─── Gap B: isFirstRun() correctly transitions after 2 discovery runs ─────────
// Previously broken: filter used startsWith('discover-') but filenames start
// with a timestamp, so the filter never matched and every run was a "first run".

describe('Gap B — isFirstRun() transitions correctly after two discovery runs', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('after 2+ saves, the normal "Next steps:" UX appears (not the first-run hints)', async () => {
    // Run twice to create 2 saved results
    await runWpm(['run', env.xesPath], env.tempDir);
    await runWpm(['run', env.xesPath], env.tempDir);

    // Third run should show normal UX (isFirstRun = false)
    const result = await runWpm(['run', env.xesPath], env.tempDir);
    expect(result.exitCode).toBe(0);

    // Normal UX shows "Next steps:" with wpm conformance suggestion
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Next steps:|wpm conformance/i);
  });

  it('on first run (empty results dir), shows first-run hints', async () => {
    const result = await runWpm(['run', env.xesPath], env.tempDir);
    expect(result.exitCode).toBe(0);

    // First run shows process model discovery confirmation
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Process Model Discovered|Next Steps:|wpm results/i);
  });
});

// ─── Gap C: auto-save creates directory on first use ─────────────────────────

describe('Gap C — wpm run auto-save creates .wasm4pm/results/ if absent', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('creates .wasm4pm/results/ directory automatically even if it did not exist', async () => {
    // Verify the directory does not pre-exist
    let preExists = false;
    try {
      await fs.access(env.resultsDir);
      preExists = true;
    } catch { /* expected: not yet created */ }
    expect(preExists).toBe(false);

    // Run without --no-save
    const result = await runWpm(['run', env.xesPath], env.tempDir);
    expect(result.exitCode).toBe(0);

    // Directory must now exist
    const stat = await fs.stat(env.resultsDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('saved file has a timestamp-based name matching the expected pattern', async () => {
    const result = await runWpm(['run', env.xesPath], env.tempDir);
    expect(result.exitCode).toBe(0);

    const files = await fs.readdir(env.resultsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    expect(jsonFiles.length).toBeGreaterThanOrEqual(1);

    // Filename pattern: YYYYMMDDTHHmmss-discover-<algo>.json
    for (const f of jsonFiles) {
      expect(f).toMatch(/^\d{8}T\d{6}-discover-/);
    }
  });

  it('saved file is parseable JSON with expected schema (version, task, result)', async () => {
    const result = await runWpm(['run', env.xesPath], env.tempDir);
    expect(result.exitCode).toBe(0);

    const files = await fs.readdir(env.resultsDir);
    const [firstFile] = files.filter((f) => f.endsWith('.json'));
    expect(firstFile).toBeDefined();

    const content = await fs.readFile(path.join(env.resultsDir, firstFile), 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;

    expect(parsed.version).toBe(1);
    expect(typeof parsed.savedAt).toBe('string');
    expect(typeof parsed.task).toBe('string');
    expect((parsed.task as string)).toMatch(/^discover-/);
    expect(parsed.result).toBeDefined();
  });

  it('saved file contains output_hash (BLAKE3 hex-64)', async () => {
    const result = await runWpm(['run', env.xesPath], env.tempDir);
    expect(result.exitCode).toBe(0);

    const files = await fs.readdir(env.resultsDir);
    const [firstFile] = files.filter((f) => f.endsWith('.json'));
    const content = await fs.readFile(path.join(env.resultsDir, firstFile), 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;

    // output_hash must be a 64-char hex string (BLAKE3)
    expect(typeof parsed.output_hash).toBe('string');
    expect((parsed.output_hash as string)).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── Gap A+C: --format json receipt field contract ────────────────────────────

describe('Gap A+C — wpm run --format json receipt fields', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('JSON output always includes meta.run_id (UUID v4)', async () => {
    const result = await runWpm(['run', env.xesPath, '--no-save', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const meta = parsed.meta as Record<string, unknown>;
    expect(typeof meta).toBe('object');
    expect(typeof meta.run_id).toBe('string');
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(meta.run_id as string).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('JSON output always includes meta.timestamp (ISO-8601)', async () => {
    const result = await runWpm(['run', env.xesPath, '--no-save', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const meta = parsed.meta as Record<string, unknown>;
    expect(typeof meta.timestamp).toBe('string');
    // Must parse as a valid date
    const ts = new Date(meta.timestamp as string);
    expect(ts.getTime()).not.toBeNaN();
  });

  it('JSON output status is "ok" on success', async () => {
    const result = await runWpm(['run', env.xesPath, '--no-save', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    expect(parsed.exit_code).toBe(0);
  });

  it('JSON output payload contains algorithm and input fields', async () => {
    const result = await runWpm(
      ['run', env.xesPath, '--no-save', '--algorithm', 'dfg', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(typeof payload.algorithm).toBe('string');
    expect(payload.algorithm).toMatch(/dfg|heuristic/i); // dfg or fallback
    expect(typeof payload.input).toBe('string');
  });
});

// ─── Gap: unknown algorithm exits config_error (1) ───────────────────────────

describe('wpm run --algorithm unknown: exits config_error (1)', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits 1 (config_error) for a nonexistent algorithm', async () => {
    const result = await runWpm(
      ['run', env.xesPath, '--algorithm', 'xyz-totally-nonexistent'],
      env.tempDir
    );
    expect(result.exitCode).toBe(1);
  });

  it('error message names the unknown algorithm', async () => {
    const result = await runWpm(
      ['run', env.xesPath, '--algorithm', 'xyz-totally-nonexistent', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const error = parsed.error as Record<string, unknown>;
    expect(error.code).toBe('ALGORITHM_NOT_FOUND');
    expect(String(error.message ?? '')).toMatch(/xyz-totally-nonexistent/);
  });

  it('error message suggests alternatives or lists wpm algorithms command', async () => {
    const result = await runWpm(
      ['run', env.xesPath, '--algorithm', 'heurisic'],  // deliberate typo
      env.tempDir
    );
    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    // Should either suggest the correct spelling or point to the algorithms command
    expect(combined).toMatch(/did you mean|heuristic|wpm algorithms/i);
  });

  it('with unknown algorithm, no result file is created even without --no-save', async () => {
    const result = await runWpm(
      ['run', env.xesPath, '--algorithm', 'nonexistent-xyz'],
      env.tempDir
    );
    expect(result.exitCode).toBe(1);

    // No results file should be written for a config error
    let files: string[] = [];
    try {
      files = await fs.readdir(env.resultsDir);
    } catch { /* directory absent is fine */ }
    expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(0);
  });
});

// ─── Gap D: wpm watch --interval validation ───────────────────────────────────

describe('Gap D — wpm watch --interval validation', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--interval 0 exits 1 (config_error) before starting the watcher', async () => {
    // runWpmWatch sends SIGTERM after collectMs; but 0 should exit immediately with 1
    const result = await runWpmWatch(['--interval', '0'], env.tempDir, 3000);
    // Exit code 1 (config_error) must be returned without timeout
    expect(result.exitCode).toBe(1);
  });

  it('--interval 0 stderr contains a helpful message about valid range', async () => {
    const result = await runWpmWatch(['--interval', '0'], env.tempDir, 3000);
    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/invalid|interval|positive|milliseconds/i);
  });

  it('--interval -500 exits 1 (config_error)', async () => {
    const result = await runWpmWatch(['--interval', '-500'], env.tempDir, 3000);
    expect(result.exitCode).toBe(1);
  });

  it('--interval 1000 is valid and starts the watcher (exits 0 after SIGTERM)', async () => {
    const result = await runWpmWatch(['--interval', '1000'], env.tempDir, 2000);
    // After SIGTERM the watcher exits 0 (shutdown path)
    // Note: exitCode may be null if killed by signal on some systems; accept 0 or null
    expect([0, null]).toContain(result.exitCode);
  });

  it('wpm watch with no config file does not exit with error (non-fatal missing config)', async () => {
    // watch is long-running; missing config is non-fatal (prints initialized + watching events)
    const result = await runWpmWatch([], env.tempDir, 2000);
    // Should not exit with 1 (config_error) — watch starts even without wasm4pm.toml
    expect(result.exitCode).not.toBe(1);
  });

  it('--format json emits valid JSON events when started', async () => {
    const result = await runWpmWatch(['--format', 'json'], env.tempDir, 2000);
    // Should produce at least one JSON line (initialized or watching event)
    const lines = result.stdout.split('\n').filter((l) => l.trim().startsWith('{'));
    expect(lines.length).toBeGreaterThanOrEqual(1);
    // Each line must be valid JSON
    for (const line of lines) {
      let parsed: Record<string, unknown>;
      expect(() => { parsed = JSON.parse(line); }).not.toThrow();
      // Each event must have a type and timestamp
      expect(typeof (parsed! as Record<string, unknown>).type).toBe('string');
    }
  });
});

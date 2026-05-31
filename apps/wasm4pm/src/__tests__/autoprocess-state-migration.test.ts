/**
 * autoprocess-state-migration.test.ts
 *
 * Regression suite for loadState() schema-version migration guard in
 * `wpm autoprocess`.
 *
 * Audit finding #6: loadState() silently discards state on schema version
 * mismatch with only an opaque console.warn — users upgrading lose all RL
 * state without knowing what happened or where to find a backup.
 *
 * The fixes verified here:
 *   1. STATE_SCHEMA_VERSION is exported so tests (and future tooling) can
 *      reference the canonical value without hard-coding it.
 *   2. On version mismatch the warning message names the file path, old
 *      version, new version, and the backup location.
 *   3. A .bak copy of the stale state file is written so the operator can
 *      manually recover their RL state.
 *   4. A missing/absent state file (cold start) produces NO warning.
 *   5. A state file whose version matches the current schema loads silently
 *      with no .bak file written.
 *
 * Oracle rank: Rank-2 (domain contract) — assertions are derived from the
 * explicit warning contract documented in autoprocess.ts.
 *
 * FM-5 clean: uses the real compiled CLI binary; no init.js mocking.
 *
 * Architecture note: loadState() is called INSIDE withLogSession(), after the
 * XES event log has been opened.  Therefore:
 *   - A valid XES fixture is required for the migration path to be exercised.
 *   - If autonomic_execute_cycle is absent from the current WASM build
 *     (non-cloud feature flag) the cycle itself fails with exit 3; that is
 *     expected and not a test defect — the state-migration warning still fires
 *     BEFORE the WASM error.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

// ── Compiled artefacts ───────────────────────────────────────────────────────

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

/**
 * Small XES fixture used to satisfy withLogSession().
 * loadState() is called inside the withLogSession callback, so the XES must
 * be valid and readable for the migration code path to run.
 */
const FIXTURE_XES = path.resolve(__dirname, '../../../../test/fixtures/small.xes');

/**
 * Import STATE_SCHEMA_VERSION from the compiled JS module.
 * Tests must use this import, not a hard-coded literal, so they remain
 * correct across future schema bumps.
 */
const { STATE_SCHEMA_VERSION } = await import('../../dist/commands/autoprocess.js');

// ── CLI runner ───────────────────────────────────────────────────────────────

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {}
): Promise<CliResult> {
  const cwd = opts.cwd ?? tmpdir();
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    // Prevent ambient env vars from altering the config resolution path
    WASM4PM_PROFILE: undefined,
    WASM4PM_ALGORITHM: undefined,
    WASM4PM_OUTPUT_FORMAT: undefined,
  };
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, cwd, env },
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
    child.on('error', (err) => {
      resolve({ exitCode: 1, stdout: '', stderr: err.message });
    });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve the fixed state-file path relative to a given working directory. */
function stateFilePath(cwd: string): string {
  return path.join(cwd, '.wasm4pm', 'autoprocess-state.json');
}

function bakFilePath(cwd: string): string {
  return stateFilePath(cwd) + '.bak';
}

/** Write a state file with an arbitrary version number. */
async function writeStateFile(
  cwd: string,
  version: number,
  extra: Record<string, unknown> = {}
) {
  const dir = path.join(cwd, '.wasm4pm');
  await fs.mkdir(dir, { recursive: true });
  const content = JSON.stringify(
    { version, saved_at: new Date().toISOString(), ...extra },
    null,
    2
  );
  await fs.writeFile(stateFilePath(cwd), content, 'utf-8');
}

// ── Test scaffold ─────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wasm4pm-state-migration-'));
});

afterEach(async () => {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('STATE_SCHEMA_VERSION export', () => {
  it('is a positive integer', () => {
    expect(typeof STATE_SCHEMA_VERSION).toBe('number');
    expect(Number.isInteger(STATE_SCHEMA_VERSION)).toBe(true);
    expect(STATE_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});

describe('loadState() — version mismatch', () => {
  it('emits warning with old version, new version, and file path on schema mismatch', async () => {
    // Write a state file with version 0 (pre-versioning era, always stale)
    await writeStateFile(tempDir, 0, { rl_state: { cycle_count: 999 } });

    // autoprocess runs loadState() inside withLogSession() after opening the XES;
    // exit code will be non-0 but NOT 5 (system error).
    // Typical: exit 3 when autonomic_execute_cycle is absent from the build.
    const result = await runCli(['autoprocess', FIXTURE_XES], { cwd: tempDir });

    // Must NOT crash with exit 5 (unhandled error in loadState)
    expect(result.exitCode).not.toBe(5);

    // The warning must appear in the combined output
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/schema v0/i);
    expect(combined).toMatch(new RegExp(`v${STATE_SCHEMA_VERSION}`));
  });

  it('warning message includes the absolute file path', async () => {
    await writeStateFile(tempDir, 0);

    const result = await runCli(['autoprocess', FIXTURE_XES], { cwd: tempDir });

    const combined = result.stdout + result.stderr;
    expect(combined).toContain('.wasm4pm');
    expect(combined).toContain('autoprocess-state.json');
  });

  it('warning message mentions the .bak backup path', async () => {
    await writeStateFile(tempDir, 0);

    const result = await runCli(['autoprocess', FIXTURE_XES], { cwd: tempDir });

    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/\.bak/i);
  });

  it('writes a .bak file preserving the original stale state', async () => {
    await writeStateFile(tempDir, 0, { rl_state: { cycle_count: 42 } });

    await runCli(['autoprocess', FIXTURE_XES], { cwd: tempDir });

    // The .bak file must exist after the command exits
    const bakPath = bakFilePath(tempDir);
    await expect(fs.stat(bakPath)).resolves.toBeTruthy();

    // The backup must be valid JSON and contain the original version + data
    const bakContent = JSON.parse(await fs.readFile(bakPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(bakContent['version']).toBe(0);
    expect((bakContent['rl_state'] as Record<string, unknown>)['cycle_count']).toBe(42);
  });

  it('also triggers and creates .bak for a future version (downgrade scenario)', async () => {
    const futureVersion = STATE_SCHEMA_VERSION + 1;
    await writeStateFile(tempDir, futureVersion);

    const result = await runCli(['autoprocess', FIXTURE_XES], { cwd: tempDir });

    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(new RegExp(`schema v${futureVersion}`));
    expect(combined).toMatch(new RegExp(`v${STATE_SCHEMA_VERSION}`));
    await expect(fs.stat(bakFilePath(tempDir))).resolves.toBeTruthy();
  });
});

describe('loadState() — cold start (no state file)', () => {
  it('produces no schema-version warning when the state file does not exist', async () => {
    // Ensure there is no state file in the temp dir
    await fs.rm(stateFilePath(tempDir), { force: true });

    const result = await runCli(['autoprocess', FIXTURE_XES], { cwd: tempDir });

    const combined = result.stdout + result.stderr;
    // No migration warning for a clean cold start
    expect(combined).not.toMatch(/schema v/i);
    expect(combined).not.toMatch(/starting.*fresh/i);
  });
});

describe('loadState() — correct version', () => {
  it('loads silently and does NOT create a .bak when version matches', async () => {
    await writeStateFile(tempDir, STATE_SCHEMA_VERSION);

    const result = await runCli(['autoprocess', FIXTURE_XES], { cwd: tempDir });

    const combined = result.stdout + result.stderr;
    // No schema-version warning
    expect(combined).not.toMatch(/schema v/i);
    expect(combined).not.toMatch(/starting.*fresh/i);

    // No backup file
    let bakExists = false;
    try {
      await fs.stat(bakFilePath(tempDir));
      bakExists = true;
    } catch {
      /* expected */
    }
    expect(bakExists).toBe(false);
  });
});

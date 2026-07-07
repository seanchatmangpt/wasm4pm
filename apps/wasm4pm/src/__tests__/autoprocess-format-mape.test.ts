/**
 * autoprocess-format-mape.test.ts
 *
 * Tests for two bug fixes in `wpm autoprocess` (now `wpm lab autoprocess` —
 * 'autoprocess' was retired as a top-level command; see nouns/_removed.ts.
 * The verb bridges unchanged to the legacy command via nouns/_bridge.ts, so
 * the guard logic itself is identical; only the invocation prefix and the
 * JSON/exit-code contract around it changed with the noun-verb rebuild —
 * see the note below):
 *
 *  1. --format validation guard (config_error before WASM)
 *     - `--format badformat` must exit 2 (source_error, was 1/config_error
 *       pre-rebuild — see exit-code note below), not 3 (execution_error)
 *     - Guard fires before withSpan so invalid format never reaches WASM
 *     - Still reachable through the bridge: `nouns/_bridge.ts`'s
 *       `stripLegacyOutputFlags` only strips a caller `--format` when its
 *       value is exactly 'json'/'human'; any other value (e.g.
 *       'badformat') passes through to the legacy guard unchanged.
 *
 *  2. --cycles float rejection
 *     - `--cycles 1.7` must exit 2 (source_error)
 *     - parseInt('1.7') silently truncates; the '.' check fires first
 *
 *  3. MAPE-K JSON contract (when WASM is available)
 *     - payload must include `cycles_run`
 *     - payload must include at least two MAPE-K phase keys
 *       (perception, decision, protection, optimization)
 *     - JSON envelope must have `status`, `command`, `exit_code` (success
 *       path only — the bridge returns the legacy CommandResult unchanged
 *       on success; see exit-code note below for the error path)
 *
 *  4. Regression suite for previously-fixed guards (negative / NaN / --cycles 0)
 *
 * Exit-code / envelope contract change (noun-verb rebuild):
 *   Standalone legacy `wpm autoprocess` reported guard rejections as
 *   `exit_code: 1` (config_error) directly in its own CommandResult envelope.
 *   Through `wpm lab autoprocess`, a guard rejection is a thrown error inside
 *   the legacy command, which `nouns/_bridge.ts`'s `invokeLegacyCommandAsJson`
 *   catches and reclassifies via `classifyLegacyFailure()`: legacy exit codes
 *   1 (config_error) AND 2 (source_error) both become `NounVerbError.invalidInput()`
 *   (code `INVALID_INPUT`), which `apps/wasm4pm/src/cli.ts`'s `ERROR_CODE_MAP`
 *   maps onto `EXIT_CODES.source_error` = 2 — never 1. The stdout contract also
 *   changes: a thrown verb error serializes to the framework's
 *   `{ error: { code, message } }` envelope (packages/noun-verb/src/errors.ts),
 *   not the legacy `{ command, status, exit_code, payload, meta }` shape — the
 *   `command`/`status`/top-level `exit_code` fields no longer exist on a guard
 *   rejection's stdout.
 *
 * Oracle rank: Rank-2 (domain contract) — all assertions follow the documented
 * exit-code contract and the noun-verb framework's ErrorEnvelope JSON shape.
 *
 * FM-5 clean: tests call the real CLI binary (dist/bin/wpm.js), no init.js mocking.
 *
 * Ambient config pollution prevention:
 *   Every runCli() call uses { cwd: tempDir } where tempDir contains NO
 *   wasm4pm.toml.  This prevents Zod config validation from triggering before
 *   the flag guards fire and contaminating the exit code.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

// ─── CLI runner ───────────────────────────────────────────────────────────────

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

function runCli(
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {}
): Promise<CliResult> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  // Minimal env — no ambient WASM4PM_* overrides from CI / developer shell
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    NO_COLOR: '1',
    // Explicitly clear env vars that could load a config file or change output format
    WASM4PM_PROFILE: undefined,
    WASM4PM_ALGORITHM: undefined,
    WASM4PM_OUTPUT_FORMAT: undefined,
  };

  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        cwd: opts.cwd,
        env,
      },
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

/** Parse JSON from stdout; returns null on failure. */
function tryJson(stdout: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Extract error.message from the new `{ error: { code, message } }` envelope. */
function errorMsg(parsed: Record<string, unknown> | null): string {
  if (!parsed) return '';
  const err = parsed.error as Record<string, unknown> | undefined;
  return typeof err?.message === 'string' ? err.message : '';
}

/** Extract error.code from the new `{ error: { code, message } }` envelope. */
function errorCode(parsed: Record<string, unknown> | null): string {
  if (!parsed) return '';
  const err = parsed.error as Record<string, unknown> | undefined;
  return typeof err?.code === 'string' ? err.code : '';
}

/**
 * Detect when WASM does not export `autonomic_execute_cycle` in the current build.
 * Used for honest skipping of MAPE-K payload assertions.
 */
function wasmMissing(r: CliResult): boolean {
  return /autonomic_execute_cycle is not a function/i.test(r.stderr + r.stdout);
}

// ─── Minimal XES fixture (no <global> elements) ───────────────────────────────

const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case1"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2024-01-01T00:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="Approve"/><date key="time:timestamp" value="2024-01-01T01:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="Complete"/><date key="time:timestamp" value="2024-01-01T02:00:00.000+00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case2"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2024-01-02T00:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="Reject"/><date key="time:timestamp" value="2024-01-02T01:00:00.000+00:00"/></event>
  </trace>
</log>`;

// ─── Test lifecycle ───────────────────────────────────────────────────────────

let tempDir: string;
let xesPath: string;

beforeEach(async () => {
  // Fresh isolated temp dir — NO wasm4pm.toml, NO wasm4pm.json
  tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-ap-fmt-'));
  xesPath = path.join(tempDir, 'fixture.xes');
  await fs.writeFile(xesPath, MINIMAL_XES, 'utf-8');
});

afterEach(async () => {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. --format flag validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('--format flag validation guard (source_error, not execution_error)', () => {
  it('--format badformat exits 2 (source_error)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--format', 'badformat', '--cycles', '1', '--no-save'],
      { cwd: tempDir }
    );
    expect(r.exitCode).toBe(2);
  });

  it('--format badformat produces a parseable JSON error envelope', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--format', 'badformat', '--cycles', '1', '--no-save'],
      { cwd: tempDir }
    );
    // When format is bad we still get a clean JSON error envelope
    const parsed = tryJson(r.stdout);
    expect(parsed).not.toBeNull();
  });

  it('--format badformat JSON envelope has an error object (new contract: no top-level status field)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--format', 'badformat', '--cycles', '1', '--no-save'],
      { cwd: tempDir }
    );
    const parsed = tryJson(r.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed).toHaveProperty('error');
    expect(parsed).not.toHaveProperty('status');
  });

  it('--format badformat error.code is INVALID_INPUT (framework classification)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--format', 'badformat', '--cycles', '1', '--no-save'],
      { cwd: tempDir }
    );
    const parsed = tryJson(r.stdout);
    expect(errorCode(parsed)).toBe('INVALID_INPUT');
  });

  it('--format badformat error message mentions --format', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--format', 'badformat', '--cycles', '1', '--no-save'],
      { cwd: tempDir }
    );
    const msg = errorMsg(tryJson(r.stdout));
    expect(msg).toMatch(/--format/i);
  });

  // The legacy top-level `command` field no longer exists on the new error
  // envelope (see file header) — the closest equivalent identity signal is
  // the ErrorCode itself, already asserted above.
  it('--format "" (empty string) exits 2 (source_error)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--format', '', '--cycles', '1', '--no-save'],
      { cwd: tempDir }
    );
    expect(r.exitCode).toBe(2);
  });

  it('--format json is accepted (does not exit 2)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--format', 'json', '--cycles', '1', '--no-save'],
      { cwd: tempDir, timeoutMs: 30_000 }
    );
    // source_error must not fire for a valid format
    expect(r.exitCode).not.toBe(2);
  }, 35_000);

  it('--format human is accepted (does not exit 2)', async () => {
    // NOTE: --format human is stripped by the bridge and forced to json
    // regardless (bridged-verb stdout is ALWAYS JSON — see nouns/_bridge.ts),
    // so this now also verifies stdout is valid JSON despite requesting human.
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--format', 'human', '--cycles', '1', '--no-save'],
      { cwd: tempDir, timeoutMs: 30_000 }
    );
    expect(r.exitCode).not.toBe(2);
  }, 35_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. --cycles float rejection (new behavior)
// ═══════════════════════════════════════════════════════════════════════════════

describe('--cycles float rejection (whole-integer guard)', () => {
  it('--cycles 1.7 exits 2 (source_error) — float strings are rejected', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '1.7', '--no-save'],
      { cwd: tempDir }
    );
    expect(r.exitCode).toBe(2);
  });

  it('--cycles 1.7 produces a JSON error envelope', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '1.7', '--no-save'],
      { cwd: tempDir }
    );
    const parsed = tryJson(r.stdout);
    expect(parsed).not.toBeNull();
    expect(errorCode(parsed)).toBe('INVALID_INPUT');
  });

  it('--cycles 1.7 error message mentions "whole integer" or "--cycles"', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '1.7', '--no-save'],
      { cwd: tempDir }
    );
    const msg = errorMsg(tryJson(r.stdout));
    expect(msg).toMatch(/whole integer|--cycles/i);
  });

  it('--cycles 0.5 also exits 2 (any float is rejected)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '0.5', '--no-save'],
      { cwd: tempDir }
    );
    expect(r.exitCode).toBe(2);
  });

  it('--cycles 10.0 also exits 2 (trailing .0 is still a float string)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '10.0', '--no-save'],
      { cwd: tempDir }
    );
    expect(r.exitCode).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. --cycles 0 preserved as unlimited sentinel (regression)
// ═══════════════════════════════════════════════════════════════════════════════

describe('--cycles 0 is the unlimited sentinel (must not be rejected)', () => {
  it('--cycles 0 does not exit source_error (2)', async () => {
    // 0 is the unlimited sentinel — the guard must pass it through.
    // The process will run until interrupted or WASM exits; use a short
    // timeout. A real timeout kill reports exitCode 1 via this file's own
    // runCli fallback (see below) — NOT 2 — so this assertion still
    // distinguishes "guard incorrectly rejected 0" from "ran until timeout".
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '0', '--no-save'],
      { cwd: tempDir, timeoutMs: 5_000 }
    );
    // source_error (2) must NOT fire for the unlimited sentinel
    expect(r.exitCode).not.toBe(2);
  }, 8_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Regression tests for pre-existing guards (NaN, negative)
// ═══════════════════════════════════════════════════════════════════════════════

describe('--cycles regression: pre-existing guards still fire correctly', () => {
  it('--cycles abc exits 2 (source_error) — NaN guard', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', 'abc', '--no-save'],
      { cwd: tempDir }
    );
    expect(r.exitCode).toBe(2);
  });

  it('--cycles -1 exits 2 (source_error) — negative guard', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '-1', '--no-save'],
      { cwd: tempDir }
    );
    expect(r.exitCode).toBe(2);
  });

  it('--cycles -1 JSON envelope has an error object with code INVALID_INPUT', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '-1', '--no-save'],
      { cwd: tempDir }
    );
    const parsed = tryJson(r.stdout);
    expect(errorCode(parsed)).toBe('INVALID_INPUT');
  });

  it('--cycles abc JSON envelope has an error object with code INVALID_INPUT', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', 'abc', '--no-save'],
      { cwd: tempDir }
    );
    const parsed = tryJson(r.stdout);
    expect(errorCode(parsed)).toBe('INVALID_INPUT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. MAPE-K JSON contract (when WASM is available)
// ═══════════════════════════════════════════════════════════════════════════════

describe('MAPE-K JSON contract — payload structure (honest-skip when WASM absent)', () => {
  it('produces parseable JSON envelope', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '1', '--no-save'],
      { cwd: tempDir, timeoutMs: 45_000 }
    );
    if (wasmMissing(r)) return; // honest skip: autonomic_execute_cycle not exported
    const parsed = tryJson(r.stdout);
    expect(parsed).not.toBeNull();
    expect(typeof parsed).toBe('object');
  }, 45_000);

  it('on success, envelope has the legacy top-level fields: status, command, exit_code', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '1', '--no-save'],
      { cwd: tempDir, timeoutMs: 45_000 }
    );
    if (wasmMissing(r)) return;
    if (r.exitCode !== 0) return; // error path uses the new { error } envelope instead
    const parsed = tryJson(r.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed).toHaveProperty('status');
    expect(parsed).toHaveProperty('command');
    expect(parsed).toHaveProperty('exit_code');
  }, 45_000);

  it('on success, envelope command field is "autoprocess" (bridge preserves the legacy envelope)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '1', '--no-save'],
      { cwd: tempDir, timeoutMs: 45_000 }
    );
    if (wasmMissing(r)) return;
    if (r.exitCode !== 0) return;
    const parsed = tryJson(r.stdout);
    expect(parsed?.command).toBe('autoprocess');
  }, 45_000);

  it('JSON envelope payload includes cycles_run', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '1', '--no-save'],
      { cwd: tempDir, timeoutMs: 45_000 }
    );
    if (wasmMissing(r)) return;
    if (r.exitCode !== 0) return; // WASM returned error — skip payload check
    const parsed = tryJson(r.stdout);
    expect(parsed).not.toBeNull();
    const payload = parsed!.payload as Record<string, unknown> | null;
    expect(payload).not.toBeNull();
    expect(payload).toHaveProperty('cycles_run');
    expect(typeof payload!.cycles_run).toBe('number');
  }, 45_000);

  it('JSON payload cycles_run equals --cycles value (1 for --cycles 1)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '1', '--no-save'],
      { cwd: tempDir, timeoutMs: 45_000 }
    );
    if (wasmMissing(r)) return;
    if (r.exitCode !== 0) return;
    const parsed = tryJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | null;
    if (!payload) return;
    expect(payload.cycles_run).toBe(1);
  }, 45_000);

  it('JSON payload includes at least two MAPE-K phase keys (perception, decision, protection, optimization)', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '1', '--no-save'],
      { cwd: tempDir, timeoutMs: 45_000 }
    );
    if (wasmMissing(r)) return;
    if (r.exitCode !== 0) return;
    const parsed = tryJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | null;
    if (!payload) return;

    // The MAPE-K phases are nested inside the cycleResult returned from WASM.
    // The command spreads cycleResult into payload, so at least two phase keys
    // must be present at the top level of payload (or inside cycle_result).
    const mapePhases = ['perception', 'decision', 'protection', 'optimization'];
    const topLevelPhases = mapePhases.filter((k) => k in payload);
    const cycleResult = payload.cycle_result as Record<string, unknown> | undefined;
    const nestedPhases = cycleResult
      ? mapePhases.filter((k) => k in cycleResult)
      : [];
    const foundPhases = topLevelPhases.length > 0 ? topLevelPhases : nestedPhases;

    expect(foundPhases.length).toBeGreaterThanOrEqual(2);
  }, 45_000);

  it('JSON payload health_level is a number (0-4) when WASM cycle succeeds', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '1', '--no-save'],
      { cwd: tempDir, timeoutMs: 45_000 }
    );
    if (wasmMissing(r)) return;
    if (r.exitCode !== 0) return;
    const parsed = tryJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | null;
    if (!payload) return;

    // Extract perception.health_score from payload (top-level or inside cycle_result)
    const cycleResult = (payload.cycle_result ?? payload) as Record<string, unknown>;
    const perception = cycleResult.perception as Record<string, unknown> | undefined;
    if (!perception) return; // WASM may not expose perception — skip

    const healthScore = perception.health_score;
    if (healthScore !== undefined) {
      expect(typeof healthScore).toBe('number');
      expect(healthScore as number).toBeGreaterThanOrEqual(0);
      expect(healthScore as number).toBeLessThanOrEqual(4);
    }
  }, 45_000);

  it('JSON envelope exits 0 on successful cycle', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '1', '--no-save'],
      { cwd: tempDir, timeoutMs: 45_000 }
    );
    if (wasmMissing(r)) return; // honest skip
    expect(r.exitCode).toBe(0);
  }, 45_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Combined: format guard fires before WASM (guard ordering verification)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Guard ordering: format guard fires before WASM execution', () => {
  it('--format badformat exits 2 even when WASM is not available', async () => {
    // The format guard must fire before withSpan/withLogSession — it must never
    // reach the WASM layer.  If it did, it would exit 3 (execution_error).
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--format', 'badformat', '--cycles', '1', '--no-save'],
      { cwd: tempDir }
    );
    // Must be 2 (source_error, via the bridge's INVALID_INPUT classification),
    // not 3 (execution_error from WASM)
    expect(r.exitCode).toBe(2);
    // Must never show the WASM error message
    expect(r.stdout + r.stderr).not.toMatch(/autonomic_execute_cycle/i);
  });

  it('--cycles float guard fires before WASM execution', async () => {
    const r = await runCli(
      ['lab', 'autoprocess', xesPath, '--cycles', '2.5', '--no-save'],
      { cwd: tempDir }
    );
    expect(r.exitCode).toBe(2);
    expect(r.stdout + r.stderr).not.toMatch(/autonomic_execute_cycle/i);
  });
});

/**
 * autoprocess-cycles-guard.test.ts
 *
 * Regression-suite for the --cycles flag validation guard added to
 * `wpm autoprocess` (now `wpm lab autoprocess` — see nouns/_removed.ts:
 * 'autoprocess' -> 'lab autoprocess'. The verb bridges unchanged to the
 * legacy command via nouns/_bridge.ts, so the guard logic itself is
 * identical; only the invocation prefix and the JSON/exit-code contract
 * around it changed with the noun-verb rebuild — see the note below).
 *
 * Background (the bug):
 *   `parseInt('abc', 10)` returns NaN.
 *   The original code: `const unlimited = maxCycles === 0` → NaN === 0 → false.
 *   Loop condition: `cyclesRun < NaN` is ALWAYS false.
 *   Result: zero cycles run, exit 0 — silent success for an invalid input.
 *
 * The guard (fix):
 *   1. Number.isNaN(parsed) → guard rejects, message "–-cycles must be a positive integer"
 *   2. parsed < 0          → guard rejects, same message
 *   3. parsed > 10_000     → guard rejects, message "–-cycles exceeds maximum (10000)"
 *   4. parsed === 0        → allowed (unlimited mode, runs until interrupted)
 *   5. parsed ≥ 1          → allowed (finite run)
 *
 * Exit-code contract change (noun-verb rebuild):
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
 *   rejection's stdout. Every assertion below is updated for this: `.toBe(1)`
 *   guard-rejection checks become `.toBe(2)`, and envelope-shape checks read
 *   `parsed.error.code`/`parsed.error.message` instead of the retired
 *   `status`/`exit_code`/`command` fields.
 *
 * Oracle rank: Rank-2 (domain contract) — all assertions follow the documented
 *   exit-code contract and the noun-verb framework's ErrorEnvelope JSON shape.
 *
 * FM-5 clean: tests call the real CLI binary, no init.js mocking.
 *
 * IMPORTANT — ambient config pollution prevention:
 *   Every runCli call uses { cwd: tempDir } where tempDir contains NO
 *   wasm4pm.toml.  This prevents Zod config validation from triggering before
 *   the --cycles guard fires and contaminating the exit code.
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

/**
 * Run the CLI in an isolated directory with no ambient config.
 *
 * `cwd` defaults to tempDir (set in beforeEach).  Always pass a real `cwd`
 * option — never use the repo root, which may contain a wasm4pm.toml.
 */
function runCli(
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {}
): Promise<CliResult> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  // Minimal env: avoid ambient WASM4PM_* env vars from CI / developer shell
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    // Explicitly unset common env overrides to avoid config pollution
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
        maxBuffer: 5 * 1024 * 1024,
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

/** Extract the error.message string from the new `{ error: { code, message } }` envelope. */
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

// ─── Minimal inline XES fixture ───────────────────────────────────────────────

const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <trace>
    <string key="concept:name" value="case_1"/>
    <event><string key="concept:name" value="register"/><date key="time:timestamp" value="2024-01-01T09:00:00Z"/></event>
    <event><string key="concept:name" value="approve"/><date key="time:timestamp" value="2024-01-01T09:05:00Z"/></event>
    <event><string key="concept:name" value="close"/><date key="time:timestamp" value="2024-01-01T09:10:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event><string key="concept:name" value="register"/><date key="time:timestamp" value="2024-01-01T10:00:00Z"/></event>
    <event><string key="concept:name" value="reject"/><date key="time:timestamp" value="2024-01-01T10:10:00Z"/></event>
  </trace>
</log>`;

// ─── Test lifecycle ───────────────────────────────────────────────────────────

let tempDir: string;
let xesPath: string;

beforeEach(async () => {
  // Fresh isolated temp dir — NO wasm4pm.toml, NO wasm4pm.json
  tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-cycles-guard-'));
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
// Guard 1 — NaN input (alphabetic string)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Guard 1 — --cycles with non-integer string', () => {
  it('--cycles abc exits source_error (2) via the bridged INVALID_INPUT classification', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', 'abc', '--no-save'], {
      cwd: tempDir,
    });
    expect(r.exitCode).toBe(2);
  });

  it('--cycles abc produces the new { error: { code, message } } envelope', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', 'abc', '--no-save'], {
      cwd: tempDir,
    });
    const parsed = tryJson(r.stdout);
    expect(parsed).not.toBeNull();
    expect(errorCode(parsed)).toBe('INVALID_INPUT');
    expect(typeof errorMsg(parsed)).toBe('string');
    expect(errorMsg(parsed).length).toBeGreaterThan(0);
  });

  it('--cycles abc error message mentions --cycles', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', 'abc', '--no-save'], {
      cwd: tempDir,
    });
    const msg = errorMsg(tryJson(r.stdout));
    expect(msg).toMatch(/--cycles/i);
  });

  // The legacy `{ command: 'autoprocess', ... }` envelope field no longer
  // exists on a bridged verb's error path (see file header) — the closest
  // equivalent identity signal is the ErrorCode itself.
  it('--cycles abc error.code identifies the failure as INVALID_INPUT', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', 'abc', '--no-save'], {
      cwd: tempDir,
    });
    const parsed = tryJson(r.stdout);
    expect(errorCode(parsed)).toBe('INVALID_INPUT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard 2 — Negative values
// ═══════════════════════════════════════════════════════════════════════════════

describe('Guard 2 — --cycles with negative value', () => {
  it('--cycles -1 exits source_error (2)', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '-1', '--no-save'], {
      cwd: tempDir,
    });
    expect(r.exitCode).toBe(2);
  });

  it('--cycles -1 produces the new error envelope', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '-1', '--no-save'], {
      cwd: tempDir,
    });
    const parsed = tryJson(r.stdout);
    expect(parsed).not.toBeNull();
    expect(errorCode(parsed)).toBe('INVALID_INPUT');
  });

  it('--cycles -1 error message mentions --cycles', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '-1', '--no-save'], {
      cwd: tempDir,
    });
    expect(errorMsg(tryJson(r.stdout))).toMatch(/--cycles/i);
  });

  it('--cycles -100 also exits source_error (2)', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '-100', '--no-save'], {
      cwd: tempDir,
    });
    expect(r.exitCode).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard 3 — Zero value (special: unlimited mode)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Guard 3 — --cycles 0 (unlimited mode)', () => {
  it('--cycles 0 does NOT exit source_error (2) — 0 is the unlimited sentinel', async () => {
    // Use a short timeout; the command runs indefinitely in unlimited mode.
    // We just need to verify the guard does not reject it (2). It will exit
    // via timeout (execFile reports exitCode 1 for a signal-killed process —
    // see runCli above — which is fine, that's not the guard's rejection
    // code) or via WASM-missing (3).
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '0', '--no-save'], {
      cwd: tempDir,
      timeoutMs: 5_000,
    });
    // source_error (2) must NOT fire for the unlimited sentinel value
    expect(r.exitCode).not.toBe(2);
  }, 8_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard 4 — Over-cap value
// ═══════════════════════════════════════════════════════════════════════════════

describe('Guard 4 — --cycles over maximum cap (10000)', () => {
  it('--cycles 10001 exits source_error (2)', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '10001', '--no-save'], {
      cwd: tempDir,
    });
    expect(r.exitCode).toBe(2);
  });

  it('--cycles 10001 error message mentions maximum', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '10001', '--no-save'], {
      cwd: tempDir,
    });
    const msg = errorMsg(tryJson(r.stdout));
    expect(msg).toMatch(/maximum|10000/i);
  });

  it('--cycles 99999 exits source_error (2)', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '99999', '--no-save'], {
      cwd: tempDir,
    });
    expect(r.exitCode).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard 5 — Valid boundary values (must NOT be rejected)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Guard 5 — valid --cycles values pass the guard', () => {
  it('--cycles 1 does not exit source_error (2)', async () => {
    // Guard fires BEFORE WASM; if it returns 2 the guard is broken.
    // WASM may not be available (returns 3); that is acceptable.
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '1', '--no-save'], {
      cwd: tempDir,
      timeoutMs: 30_000,
    });
    expect(r.exitCode).not.toBe(2);
  }, 35_000);

  it('--cycles 10000 does not exit source_error (2) — boundary is inclusive', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '10000', '--no-save'], {
      cwd: tempDir,
      timeoutMs: 30_000,
    });
    // 10000 is the maximum allowed; guard must pass it through
    expect(r.exitCode).not.toBe(2);
  }, 35_000);

  it('--cycles 5 does not exit source_error (2)', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '5', '--no-save'], {
      cwd: tempDir,
      timeoutMs: 30_000,
    });
    expect(r.exitCode).not.toBe(2);
  }, 35_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard 6 — Float input (parseInt truncates to integer)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Guard 6 — --cycles with float value', () => {
  it('--cycles 1.7 exits source_error (2) — float strings are rejected as ambiguous', async () => {
    // Floats are rejected: a raw string containing '.' is not a whole integer.
    // parseInt('1.7', 10) silently truncates; the guard detects the '.' before
    // parseInt is called and emits CONFIG_INVALID_CYCLES, bridged to INVALID_INPUT
    // (exit 2).
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '1.7', '--no-save'], {
      cwd: tempDir,
      timeoutMs: 15_000,
    });
    expect(r.exitCode).toBe(2);
  }, 20_000);

  it('--cycles 1.7 error message mentions whole integer', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '1.7', '--no-save'], {
      cwd: tempDir,
      timeoutMs: 15_000,
    });
    const parsed = tryJson(r.stdout);
    expect(parsed).not.toBeNull();
    const msg = errorMsg(parsed);
    expect(msg).toMatch(/whole integer|--cycles/i);
  }, 20_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard 7 — Empty string
// ═══════════════════════════════════════════════════════════════════════════════

describe('Guard 7 — --cycles with empty string', () => {
  it('--cycles "" exits source_error (2)', async () => {
    // parseInt('', 10) === NaN — same path as "abc"
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', '', '--no-save'], {
      cwd: tempDir,
    });
    expect(r.exitCode).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard 8 — Default (no --cycles flag)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Guard 8 — no --cycles flag uses default (1)', () => {
  it('omitting --cycles does not exit source_error (2)', async () => {
    // Default is "1" (single cycle). Guard must not fire on the default.
    const r = await runCli(['lab', 'autoprocess', xesPath, '--no-save'], {
      cwd: tempDir,
      timeoutMs: 30_000,
    });
    // Must not be source_error — the default value is valid
    expect(r.exitCode).not.toBe(2);
  }, 35_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Guard 9 — Error envelope shape contract
// ═══════════════════════════════════════════════════════════════════════════════

describe('Guard 9 — error JSON envelope shape', () => {
  it('all guard rejections produce { error: { code, message } } shaped envelopes', async () => {
    const badCyclesValues = ['abc', '-1', '10001', ''];
    for (const val of badCyclesValues) {
      const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', val, '--no-save'], {
        cwd: tempDir,
      });
      expect(r.exitCode).toBe(2);
      const parsed = tryJson(r.stdout);
      expect(parsed, `parsed JSON must not be null for --cycles ${JSON.stringify(val)}`).not.toBeNull();
      const err = parsed!.error as Record<string, unknown> | undefined;
      expect(err, `error field must be present for --cycles ${JSON.stringify(val)}`).toBeDefined();
      expect(err!.code).toBe('INVALID_INPUT');
      expect(typeof err!.message).toBe('string');
      expect((err!.message as string).length).toBeGreaterThan(0);
    }
  });

  it('process exit code matches the framework ErrorCode->exit-code mapping (2) for guard rejections', async () => {
    const r = await runCli(['lab', 'autoprocess', xesPath, '--cycles', 'abc', '--no-save'], {
      cwd: tempDir,
    });
    const parsed = tryJson(r.stdout);
    expect(parsed).not.toBeNull();
    expect(errorCode(parsed)).toBe('INVALID_INPUT');
    expect(r.exitCode).toBe(2);
  });
});

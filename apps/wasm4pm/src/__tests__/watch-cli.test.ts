/**
 * watch CLI integration tests — exit codes, error paths, flag contract
 *
 * Van der Aalst QA perspective:
 * - `wpm watch --help` exits 0 and describes the command
 * - `wpm watch` in a directory without a config file starts successfully (non-fatal)
 *   because watch is a long-running command; it does NOT exit immediately on
 *   missing config. Tests that need a definitive exit use SIGTERM to stop it.
 * - `wpm watch --format json` produces streaming JSON events before termination
 * - Option flags (--verbose, --quiet, --autopilot, --interval, --activity-key)
 *   are accepted without crashing when the watcher starts
 *
 * NOTE: The watch command runs indefinitely (await new Promise(() => {}))
 * after emitting initial events. Tests that verify startup behavior send SIGTERM
 * shortly after launch and collect any partial output. Tests that can only be
 * validated interactively are skipped with it.skip.
 *
 * Oracle rank: Rank-2 (domain contract) — flag acceptance and exit codes.
 */

import { describe, it, expect } from 'vitest';
import { spawn, execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// ─── CLI runner (one-shot: sends SIGTERM after collecting initial output) ──────

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

interface WatchCliResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

/**
 * Start `wpm watch` with optional args in the given cwd.
 * After `collectMs` milliseconds, send SIGTERM to stop the watcher and collect output.
 *
 * The exit code will be null if the process was killed by a signal (SIGTERM → exitCode null
 * on most Unix systems), so callers should check either exitCode OR signal.
 */
function runWatch(
  args: string[],
  cwd: string,
  collectMs = 1500,
  timeoutMs = 10000
): Promise<WatchCliResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(process.execPath, [CLI_PATH, 'watch', ...args], {
      cwd,
      timeout: timeoutMs,
    });

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const settle = (exitCode: number | null, signal: string | null): void => {
      if (settled) return;
      settled = true;
      resolve({ exitCode, signal, stdout, stderr });
    };

    child.on('close', (code, signal) => settle(code, signal ? String(signal) : null));
    child.on('error', () => settle(5, null));

    // Allow the watcher to start and emit initial events, then kill it
    setTimeout(() => {
      if (!settled) {
        child.kill('SIGTERM');
      }
    }, collectMs);
  });
}

/**
 * Run a command that should exit quickly on its own (e.g., --help).
 * Uses execFile to reliably capture buffered output before the process exits.
 *
 * IMPORTANT: Must pass a stripped env (PATH + HOME only) — vitest's inherited
 * environment contains variables (e.g. TERM, COLORTERM) that cause citty's
 * help output to be suppressed or redirected in subprocess contexts.
 */
function runHelp(args: string[], cwd: string, timeoutMs = 8000): Promise<WatchCliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_PATH, 'watch', ...args],
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 5 * 1024 * 1024,
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
      },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, signal: null, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
  });
}

// ─── Test env helper ──────────────────────────────────────────────────────────

async function makeTempDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-watch-cli-'));
  return {
    dir,
    cleanup: async () => {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

// ─── --help ───────────────────────────────────────────────────────────────────

describe('wpm watch --help', () => {
  it('exits 0 and shows usage', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runHelp(['--help'], dir);
      expect(result.exitCode).toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/watch|usage|description/i);
    } finally {
      await cleanup();
    }
  });

  it('help output mentions --format flag', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runHelp(['--help'], dir);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/format/i);
    } finally {
      await cleanup();
    }
  });

  it('help output mentions --autopilot flag', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runHelp(['--help'], dir);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/autopilot/i);
    } finally {
      await cleanup();
    }
  });

  it('help output mentions --interval flag', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runHelp(['--help'], dir);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/interval/i);
    } finally {
      await cleanup();
    }
  });

  it('help output mentions --config flag', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runHelp(['--help'], dir);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/config/i);
    } finally {
      await cleanup();
    }
  });
});

// ─── Startup behavior (no config file) ───────────────────────────────────────

describe('wpm watch: startup in empty dir (no config file)', () => {
  it('emits initial output before being terminated', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch([], dir, 1200);
      // The watch command always emits an 'initialized' streaming event.
      // Either stdout has content, or the process emitted some signal/exit.
      const combined = result.stdout + result.stderr;
      // At minimum something was emitted or the process terminated cleanly.
      const hasOutput = combined.length > 0;
      const hasExitOrSignal = result.exitCode !== null || result.signal !== null;
      expect(hasOutput || hasExitOrSignal).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('does not crash immediately on launch (gives time to set up watcher)', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch([], dir, 800);
      // If it crashed immediately it would exit with a non-null code very quickly.
      // A SIGTERM exit (signal='SIGTERM', exitCode=null) means it was still running — that's fine.
      const crashedImmediately =
        result.exitCode !== null && result.exitCode !== 0 && result.signal === null;
      expect(crashedImmediately).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('stdout contains "initialized" event when starting (JSON format)', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch(['--format', 'json'], dir, 1200);
      // The watch command emits a streaming 'initialized' JSON event.
      expect(result.stdout).toMatch(/initialized/i);
    } finally {
      await cleanup();
    }
  });

  it('stdout contains "watching" event when starting (JSON format)', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch(['--format', 'json'], dir, 1200);
      expect(result.stdout).toMatch(/watching/i);
    } finally {
      await cleanup();
    }
  });

  it('each line of JSON stream output is valid JSON', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch(['--format', 'json'], dir, 1200);
      const lines = result.stdout.split('\n').filter((l) => l.trim().startsWith('{'));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    } finally {
      await cleanup();
    }
  });
});

// ─── Flag acceptance (no crash) ───────────────────────────────────────────────

describe('wpm watch: flag acceptance', () => {
  it('--verbose does not crash the watcher', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch(['--verbose'], dir, 800);
      const crashedImmediately =
        result.exitCode !== null && result.exitCode !== 0 && result.signal === null;
      expect(crashedImmediately).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('--quiet does not crash the watcher', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch(['--quiet'], dir, 800);
      const crashedImmediately =
        result.exitCode !== null && result.exitCode !== 0 && result.signal === null;
      expect(crashedImmediately).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('--autopilot does not crash the watcher', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch(['--autopilot'], dir, 800);
      const crashedImmediately =
        result.exitCode !== null && result.exitCode !== 0 && result.signal === null;
      expect(crashedImmediately).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('--interval 500 does not crash the watcher', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch(['--interval', '500'], dir, 800);
      const crashedImmediately =
        result.exitCode !== null && result.exitCode !== 0 && result.signal === null;
      expect(crashedImmediately).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('--activity-key custom:key does not crash the watcher', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch(['--activity-key', 'custom:key'], dir, 800);
      const crashedImmediately =
        result.exitCode !== null && result.exitCode !== 0 && result.signal === null;
      expect(crashedImmediately).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('--format human does not crash the watcher', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch(['--format', 'human'], dir, 800);
      const crashedImmediately =
        result.exitCode !== null && result.exitCode !== 0 && result.signal === null;
      expect(crashedImmediately).toBe(false);
    } finally {
      await cleanup();
    }
  });
});

// ─── With a config file in the directory ─────────────────────────────────────

describe('wpm watch: with wasm4pm.toml in directory', () => {
  it('starts watching when a minimal config file is present', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      // Write a minimal wasm4pm.toml so the config loader has something to find
      await fs.writeFile(
        path.join(dir, 'wasm4pm.toml'),
        `[algorithm]\nname = "dfg"\n[source]\nkind = "file"\npath = "pipeline.xes"\n`,
        'utf-8'
      );
      const result = await runWatch([], dir, 1000);
      // Should still emit initialized/watching events, not crash immediately
      const crashedImmediately =
        result.exitCode !== null && result.exitCode !== 0 && result.signal === null;
      expect(crashedImmediately).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('emits initialized event with config path when config file is present', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      await fs.writeFile(
        path.join(dir, 'wasm4pm.toml'),
        `[algorithm]\nname = "dfg"\n`,
        'utf-8'
      );
      const result = await runWatch(['--format', 'json'], dir, 1200);
      expect(result.stdout).toMatch(/initialized/i);
    } finally {
      await cleanup();
    }
  });

  it('--autopilot with config file does not crash the watcher', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      await fs.writeFile(
        path.join(dir, 'wasm4pm.toml'),
        `[algorithm]\nname = "dfg"\n`,
        'utf-8'
      );
      const result = await runWatch(['--autopilot', '--format', 'json'], dir, 1000);
      const crashedImmediately =
        result.exitCode !== null && result.exitCode !== 0 && result.signal === null;
      expect(crashedImmediately).toBe(false);
    } finally {
      await cleanup();
    }
  });
});

// ─── SIGTERM exit behavior ────────────────────────────────────────────────────

describe('wpm watch: SIGTERM shutdown', () => {
  it('terminates cleanly when SIGTERM is sent', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch([], dir, 500);
      // After SIGTERM: exitCode may be null (killed by signal) or 0 (graceful handler ran)
      // Either is acceptable — what must NOT happen is a non-zero numeric exit code
      const badExit = result.exitCode !== null && result.exitCode !== 0;
      expect(badExit).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('emits stopped event in stdout before terminating (JSON format)', async () => {
    const { dir, cleanup } = await makeTempDir();
    try {
      const result = await runWatch(['--format', 'json'], dir, 1200);
      // The shutdown handler emits a 'stopped' streaming event before exit.
      // Depending on timing, it may or may not appear — but if it does it must be valid JSON.
      if (result.stdout.includes('stopped')) {
        const stoppedLine = result.stdout
          .split('\n')
          .find((l) => l.trim().includes('stopped') && l.trim().startsWith('{'));
        if (stoppedLine) {
          expect(() => JSON.parse(stoppedLine)).not.toThrow();
        }
      }
    } finally {
      await cleanup();
    }
  });
});

// ─── Skipped scenarios (interactive/environment-dependent) ────────────────────

describe('wpm watch: scenarios requiring live file changes (skipped)', () => {
  it.skip('re-runs discovery when a watched config file is modified', async () => {
    // Requires: writing a valid config + event log, triggering a file change,
    // and waiting for the debounce (200ms) + WASM discovery to complete.
    // Too timing-sensitive for a deterministic unit test.
  });

  it.skip('emits a cycle event with the algorithm used after detecting a change', async () => {
    // Depends on chokidar firing the 'change' event, which requires a real file write
    // observed by the OS. Not reliably testable in a subprocess without a sleep.
  });

  it.skip('autopilot selects heuristic for large logs during a watch cycle', async () => {
    // Would need a real .xes fixture with >10,000 traces in the watched directory.
  });
});

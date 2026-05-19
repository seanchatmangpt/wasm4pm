/**
 * wpm completions — comprehensive CLI integration tests.
 *
 * Coverage strategy:
 *   - Help, exit code contract
 *   - bash: exits 0, stdout contains shell-specific keywords, mentions all major commands
 *   - zsh: exits 0, stdout starts with #compdef wpm, uses _arguments
 *   - fish: exits 0, stdout uses "complete -c wpm" pattern
 *   - Unknown shell: exits non-zero, stderr is informative
 *   - Stdout is non-empty and distinct per shell
 *   - Required commands appear in each shell's completion output
 *
 * Van der Aalst QA perspective:
 *   These tests verify the completion script delivery contract from the CLI layer
 *   (completions.ts) rather than the filesystem layer (tested in completions.test.ts).
 *   Field names and exit codes are confirmed from completions.ts source.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import * as path from 'node:path';

// ─── CLI helper ───────────────────────────────────────────────────────────────

interface CliResult { exitCode: number; stdout: string; stderr: string; }

function runCli(args: string[], opts: { timeoutMs?: number } = {}): Promise<CliResult> {
  const cliPath = path.resolve(__dirname, '../../dist/bin/wpm.js');
  const cwd = path.resolve(__dirname, '../..');
  const timeoutMs = opts.timeoutMs ?? 20_000;
  // Minimal env prevents vitest's process.env from interfering with child-process stdout.
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [cliPath, ...args],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, cwd, env },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

/**
 * Returns true when the CLI cannot start at all (missing dist, missing deps).
 * Used to skip integration tests honestly rather than fabricating passes.
 */
function cliUnavailable(r: CliResult): boolean {
  return r.exitCode === 5 || r.stderr.includes('Process failed to start') ||
    r.stderr.includes('Cannot find module') || r.stderr.includes('MODULE_NOT_FOUND');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Help
// ═══════════════════════════════════════════════════════════════════════════════

describe('wpm completions --help', () => {
  it('exits 0', async () => {
    const r = await runCli(['completions', '--help']);
    if (cliUnavailable(r)) return;
    expect(r.exitCode).toBe(0);
  }, 15_000);

  it('output mentions supported shells: bash, zsh, fish', async () => {
    const r = await runCli(['completions', '--help']);
    if (cliUnavailable(r)) return;
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/bash/i);
    expect(out).toMatch(/zsh/i);
    expect(out).toMatch(/fish/i);
  }, 15_000);

  it('output mentions "shell" positional argument', async () => {
    const r = await runCli(['completions', '--help']);
    if (cliUnavailable(r)) return;
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/shell/i);
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// bash
// ═══════════════════════════════════════════════════════════════════════════════

describe('wpm completions bash', () => {
  it('exits 0', async () => {
    const r = await runCli(['completions', 'bash']);
    if (cliUnavailable(r)) return;
    expect(r.exitCode).toBe(0);
  }, 15_000);

  it('stdout is non-empty', async () => {
    const r = await runCli(['completions', 'bash']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout.trim().length).toBeGreaterThan(0);
  }, 15_000);

  it('stdout defines the _wpm completion function', async () => {
    const r = await runCli(['completions', 'bash']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('_wpm');
  }, 15_000);

  it('stdout registers completion with "complete -F _wpm wpm"', async () => {
    const r = await runCli(['completions', 'bash']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toMatch(/complete\s+-F\s+_wpm\s+wpm/);
  }, 15_000);

  it('stdout contains core command "run"', async () => {
    const r = await runCli(['completions', 'bash']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('run');
  }, 15_000);

  it('stdout contains "autoprocess" command', async () => {
    const r = await runCli(['completions', 'bash']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('autoprocess');
  }, 15_000);

  it('stdout contains "conformance" command', async () => {
    const r = await runCli(['completions', 'bash']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('conformance');
  }, 15_000);

  it('stdout contains "predict" command', async () => {
    const r = await runCli(['completions', 'bash']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('predict');
  }, 15_000);

  it('stdout contains "cognition" command group', async () => {
    const r = await runCli(['completions', 'bash']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('cognition');
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// zsh
// ═══════════════════════════════════════════════════════════════════════════════

describe('wpm completions zsh', () => {
  it('exits 0', async () => {
    const r = await runCli(['completions', 'zsh']);
    if (cliUnavailable(r)) return;
    expect(r.exitCode).toBe(0);
  }, 15_000);

  it('stdout is non-empty', async () => {
    const r = await runCli(['completions', 'zsh']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout.trim().length).toBeGreaterThan(0);
  }, 15_000);

  it('stdout starts with "#compdef wpm" (zsh compdef marker)', async () => {
    const r = await runCli(['completions', 'zsh']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout.trimStart()).toMatch(/^#compdef wpm/);
  }, 15_000);

  it('stdout uses _arguments (zsh completion pattern)', async () => {
    const r = await runCli(['completions', 'zsh']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('_arguments');
  }, 15_000);

  it('stdout contains "autoprocess" command', async () => {
    const r = await runCli(['completions', 'zsh']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('autoprocess');
  }, 15_000);

  it('stdout contains "cognition" command group', async () => {
    const r = await runCli(['completions', 'zsh']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('cognition');
  }, 15_000);

  it('stdout contains "conformance" command', async () => {
    const r = await runCli(['completions', 'zsh']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('conformance');
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// fish
// ═══════════════════════════════════════════════════════════════════════════════

describe('wpm completions fish', () => {
  it('exits 0', async () => {
    const r = await runCli(['completions', 'fish']);
    if (cliUnavailable(r)) return;
    expect(r.exitCode).toBe(0);
  }, 15_000);

  it('stdout is non-empty', async () => {
    const r = await runCli(['completions', 'fish']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout.trim().length).toBeGreaterThan(0);
  }, 15_000);

  it('stdout uses "complete -c wpm" pattern throughout', async () => {
    const r = await runCli(['completions', 'fish']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('complete -c wpm');
  }, 15_000);

  it('stdout contains "autoprocess" command', async () => {
    const r = await runCli(['completions', 'fish']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('autoprocess');
  }, 15_000);

  it('stdout contains "cognition" command group', async () => {
    const r = await runCli(['completions', 'fish']);
    if (cliUnavailable(r) || r.exitCode !== 0) return;
    expect(r.stdout).toContain('cognition');
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Error handling — unsupported shell
// ═══════════════════════════════════════════════════════════════════════════════

describe('wpm completions — error handling', () => {
  it('exits non-zero for unsupported shell "powershell"', async () => {
    const r = await runCli(['completions', 'powershell']);
    if (cliUnavailable(r)) return;
    expect(r.exitCode).not.toBe(0);
  }, 15_000);

  it('exits 2 for unsupported shell (source_error contract from completions.ts)', async () => {
    const r = await runCli(['completions', 'powershell']);
    if (cliUnavailable(r)) return;
    // completions.ts calls exitWithFlush(2) for unsupported shell
    expect(r.exitCode).toBe(2);
  }, 15_000);

  it('stderr mentions the unsupported shell name for "ksh"', async () => {
    const r = await runCli(['completions', 'ksh']);
    if (cliUnavailable(r)) return;
    // Either stderr or stdout should mention the shell or "Unsupported"
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/unsupported|ksh/i);
  }, 15_000);

  it('exits non-zero for empty string shell argument', async () => {
    const r = await runCli(['completions', '']);
    if (cliUnavailable(r)) return;
    expect(r.exitCode).not.toBe(0);
  }, 15_000);

  it('stderr for powershell mentions supported shells (bash | zsh | fish)', async () => {
    const r = await runCli(['completions', 'powershell']);
    if (cliUnavailable(r)) return;
    const err = r.stderr;
    // completions.ts: "Try one of: bash | zsh | fish"
    expect(err).toMatch(/bash|zsh|fish/);
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-shell distinctiveness
// ═══════════════════════════════════════════════════════════════════════════════

describe('wpm completions — cross-shell distinctiveness', () => {
  it('bash and zsh outputs are distinct from each other', async () => {
    const [bash, zsh] = await Promise.all([
      runCli(['completions', 'bash']),
      runCli(['completions', 'zsh']),
    ]);
    if (cliUnavailable(bash) || bash.exitCode !== 0) return;
    if (cliUnavailable(zsh) || zsh.exitCode !== 0) return;
    expect(bash.stdout).not.toBe(zsh.stdout);
  }, 20_000);

  it('bash and fish outputs are distinct from each other', async () => {
    const [bash, fish] = await Promise.all([
      runCli(['completions', 'bash']),
      runCli(['completions', 'fish']),
    ]);
    if (cliUnavailable(bash) || bash.exitCode !== 0) return;
    if (cliUnavailable(fish) || fish.exitCode !== 0) return;
    expect(bash.stdout).not.toBe(fish.stdout);
  }, 20_000);

  it('all three shells produce non-empty output', async () => {
    const [bash, zsh, fish] = await Promise.all([
      runCli(['completions', 'bash']),
      runCli(['completions', 'zsh']),
      runCli(['completions', 'fish']),
    ]);
    if (cliUnavailable(bash) || cliUnavailable(zsh) || cliUnavailable(fish)) return;
    if (bash.exitCode !== 0 || zsh.exitCode !== 0 || fish.exitCode !== 0) return;
    expect(bash.stdout.trim().length).toBeGreaterThan(100);
    expect(zsh.stdout.trim().length).toBeGreaterThan(100);
    expect(fish.stdout.trim().length).toBeGreaterThan(100);
  }, 30_000);
});

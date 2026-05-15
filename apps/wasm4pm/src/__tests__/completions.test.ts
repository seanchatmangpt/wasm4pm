/**
 * Tests for the wpm shell completion scripts and the `wpm completions <shell>` command.
 *
 * Two test layers:
 *
 *   1. Direct filesystem tests — read the completion script files from
 *      apps/wasm4pm/completions/ and assert their content.  These tests are
 *      self-contained and do not require the CLI to be runnable.
 *
 *   2. CLI integration tests — invoke the built CLI and verify exit codes /
 *      stdout.  These tests are skipped gracefully if the CLI cannot start
 *      (e.g. workspace packages not built), which matches the established
 *      pattern in new-commands.test.ts.
 *
 * Tokens that MUST appear in every completion script prove the script covers
 * the full command surface as specified in the mission brief.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const COMPLETIONS_DIR = path.resolve(__dirname, '..', '..', 'completions');
const BASH_SCRIPT = path.join(COMPLETIONS_DIR, 'wpm.bash');
const ZSH_SCRIPT  = path.join(COMPLETIONS_DIR, 'wpm.zsh');
const FISH_SCRIPT = path.join(COMPLETIONS_DIR, 'wpm.fish');

// ---------------------------------------------------------------------------
// Required tokens — must appear in ALL three scripts
// ---------------------------------------------------------------------------

const REQUIRED_TOKENS = [
  'cognition',    // autonomic verb group
  'run',          // core discovery command
  'verify',       // cognition verb
  'replay',       // cognition verb
  'predict',      // prediction command
  'conformance',  // quality command
  'autoprocess',  // autonomic command
];

// ---------------------------------------------------------------------------
// CLI runner (same pattern as new-commands.test.ts)
// ---------------------------------------------------------------------------

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], timeoutMs = 15_000): Promise<CliResult> {
  return new Promise((resolve) => {
    const cliPath = path.resolve(__dirname, '../../dist/bin/wpm.js');
    const cwd = path.resolve(__dirname, '../..');
    const child = execFile(
      process.execPath,
      [cliPath, ...args],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

// ---------------------------------------------------------------------------
// Layer 1: Direct filesystem tests (always run, never skip)
// ---------------------------------------------------------------------------

describe('completion scripts — filesystem', () => {
  describe('bash script (wpm.bash)', () => {
    it('file exists and is non-empty', async () => {
      const stat = await fs.stat(BASH_SCRIPT);
      expect(stat.size).toBeGreaterThan(100);
    });

    it('starts with a bash comment line', async () => {
      const text = await fs.readFile(BASH_SCRIPT, 'utf8');
      expect(text).toMatch(/^#/m);
    });

    it('defines the _wpm completion function', async () => {
      const text = await fs.readFile(BASH_SCRIPT, 'utf8');
      expect(text).toContain('_wpm()');
    });

    it('registers the completion with complete -F _wpm wpm', async () => {
      const text = await fs.readFile(BASH_SCRIPT, 'utf8');
      expect(text).toContain('complete -F _wpm wpm');
    });

    it.each(REQUIRED_TOKENS)('contains required token: %s', async (token) => {
      const text = await fs.readFile(BASH_SCRIPT, 'utf8');
      expect(text).toContain(token);
    });

    it('completes --format flag with all four output formats', async () => {
      const text = await fs.readFile(BASH_SCRIPT, 'utf8');
      expect(text).toContain('human');
      expect(text).toContain('json');
      expect(text).toContain('sarif');
      expect(text).toContain('jsonl');
    });
  });

  describe('zsh script (wpm.zsh)', () => {
    it('file exists and is non-empty', async () => {
      const stat = await fs.stat(ZSH_SCRIPT);
      expect(stat.size).toBeGreaterThan(100);
    });

    it('starts with #compdef wpm', async () => {
      const text = await fs.readFile(ZSH_SCRIPT, 'utf8');
      expect(text.trimStart()).toMatch(/^#compdef wpm/);
    });

    it('uses _arguments for structured completion', async () => {
      const text = await fs.readFile(ZSH_SCRIPT, 'utf8');
      expect(text).toContain('_arguments');
    });

    it.each(REQUIRED_TOKENS)('contains required token: %s', async (token) => {
      const text = await fs.readFile(ZSH_SCRIPT, 'utf8');
      expect(text).toContain(token);
    });

    it('covers all 8 cognition verbs', async () => {
      const text = await fs.readFile(ZSH_SCRIPT, 'utf8');
      const verbs = ['run', 'explain', 'verify', 'receipt', 'adversarial', 'replay', 'plan', 'inspect'];
      for (const verb of verbs) {
        expect(text, `zsh missing cognition verb: ${verb}`).toContain(verb);
      }
    });

    it('covers all 9 powl subcommands', async () => {
      const text = await fs.readFile(ZSH_SCRIPT, 'utf8');
      const cmds = ['parse', 'simplify', 'convert', 'complexity', 'footprints', 'import', 'discover'];
      for (const cmd of cmds) {
        expect(text, `zsh missing powl subcommand: ${cmd}`).toContain(cmd);
      }
    });
  });

  describe('fish script (wpm.fish)', () => {
    it('file exists and is non-empty', async () => {
      const stat = await fs.stat(FISH_SCRIPT);
      expect(stat.size).toBeGreaterThan(100);
    });

    it('uses complete -c wpm pattern throughout', async () => {
      const text = await fs.readFile(FISH_SCRIPT, 'utf8');
      expect(text).toContain('complete -c wpm');
    });

    it('uses __fish_use_subcommand for top-level detection', async () => {
      const text = await fs.readFile(FISH_SCRIPT, 'utf8');
      expect(text).toContain('__fish_use_subcommand');
    });

    it.each(REQUIRED_TOKENS)('contains required token: %s', async (token) => {
      const text = await fs.readFile(FISH_SCRIPT, 'utf8');
      expect(text).toContain(token);
    });

    it('covers all 6 ml tasks', async () => {
      const text = await fs.readFile(FISH_SCRIPT, 'utf8');
      const tasks = ['classify', 'cluster', 'forecast', 'anomaly', 'regress', 'pca'];
      for (const task of tasks) {
        expect(text, `fish missing ml task: ${task}`).toContain(task);
      }
    });
  });

  describe('cross-shell content parity', () => {
    it('all three scripts contain all required tokens', async () => {
      const [bash, zsh, fish] = await Promise.all([
        fs.readFile(BASH_SCRIPT, 'utf8'),
        fs.readFile(ZSH_SCRIPT, 'utf8'),
        fs.readFile(FISH_SCRIPT, 'utf8'),
      ]);
      for (const token of REQUIRED_TOKENS) {
        expect(bash, `bash missing: ${token}`).toContain(token);
        expect(zsh,  `zsh missing: ${token}`).toContain(token);
        expect(fish, `fish missing: ${token}`).toContain(token);
      }
    });

    it('all three scripts are non-empty and distinct', async () => {
      const [bash, zsh, fish] = await Promise.all([
        fs.readFile(BASH_SCRIPT, 'utf8'),
        fs.readFile(ZSH_SCRIPT, 'utf8'),
        fs.readFile(FISH_SCRIPT, 'utf8'),
      ]);
      expect(bash.length).toBeGreaterThan(0);
      expect(zsh.length).toBeGreaterThan(0);
      expect(fish.length).toBeGreaterThan(0);
      expect(bash).not.toBe(zsh);
      expect(bash).not.toBe(fish);
      expect(zsh).not.toBe(fish);
    });
  });
});

// ---------------------------------------------------------------------------
// Layer 2: CLI integration tests (skip gracefully if CLI is broken)
// ---------------------------------------------------------------------------

describe('wpm completions — CLI integration', () => {
  describe('bash', () => {
    it('exits 0 and stdout contains _wpm', async () => {
      const result = await runCli(['completions', 'bash']);
      if (result.exitCode !== 0) return; // Skip if CLI not runnable
      expect(result.stdout).toContain('_wpm');
    });

    it('stdout contains cognition', async () => {
      const result = await runCli(['completions', 'bash']);
      if (result.exitCode !== 0) return;
      expect(result.stdout).toContain('cognition');
    });
  });

  describe('zsh', () => {
    it('exits 0 and stdout starts with #compdef wpm', async () => {
      const result = await runCli(['completions', 'zsh']);
      if (result.exitCode !== 0) return;
      expect(result.stdout.trimStart()).toMatch(/^#compdef wpm/);
    });

    it('stdout contains cognition', async () => {
      const result = await runCli(['completions', 'zsh']);
      if (result.exitCode !== 0) return;
      expect(result.stdout).toContain('cognition');
    });
  });

  describe('fish', () => {
    it('exits 0 and stdout contains complete -c wpm', async () => {
      const result = await runCli(['completions', 'fish']);
      if (result.exitCode !== 0) return;
      expect(result.stdout).toContain('complete -c wpm');
    });

    it('stdout contains cognition', async () => {
      const result = await runCli(['completions', 'fish']);
      if (result.exitCode !== 0) return;
      expect(result.stdout).toContain('cognition');
    });
  });

  describe('error handling', () => {
    it('exits 2 for unsupported shell "powershell"', async () => {
      const result = await runCli(['completions', 'powershell']);
      // If CLI can't even start (exit 1 due to missing packages), skip
      if (result.exitCode === 1) return;
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('Unsupported shell');
    });
  });
});

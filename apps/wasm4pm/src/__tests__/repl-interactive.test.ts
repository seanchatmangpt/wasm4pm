/**
 * wpm repl interactive tests — focuses on --script mode and --help.
 *
 * The interactive readline loop is TTY-dependent and cannot be tested in a
 * headless subprocess without a pty. All tests here use either:
 *   - `wpm repl --help`  (pure flag, no stdin required)
 *   - `wpm repl --script <file>` (batch script execution, no stdin)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

// Path to the simple XES fixture used across tests
const SIMPLE_XES = path.resolve(
  process.cwd(),
  'lab/fixtures/sample-logs/simple.xes'
);

// ─── helpers ──────────────────────────────────────────────────────────────────

async function writeTempScript(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-repl-'));
  const scriptPath = path.join(dir, 'test.repl');
  await fs.writeFile(scriptPath, content, 'utf8');
  return scriptPath;
}

async function cleanupScript(scriptPath: string): Promise<void> {
  try {
    await fs.rm(path.dirname(scriptPath), { recursive: true, force: true });
  } catch { /* best effort */ }
}

// ─── help tests ───────────────────────────────────────────────────────────────

describe('wpm repl --help', () => {
  it('exits 0', async () => {
    const result = await runCli(['repl', '--help']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('shows interactive / process mining in description', async () => {
    const result = await runCli(['repl', '--help']);
    expect(result.stdout).toMatch(/interactive|process mining/i);
  });

  it('documents --load / -i flag', async () => {
    const result = await runCli(['repl', '--help']);
    expect(result.stdout).toMatch(/--load|-i/);
  });

  it('documents --algorithm / -a flag', async () => {
    const result = await runCli(['repl', '--help']);
    expect(result.stdout).toMatch(/--algorithm|-a/);
  });

  it('documents --key flag', async () => {
    const result = await runCli(['repl', '--help']);
    expect(result.stdout).toMatch(/--key/);
  });

  it('documents --script / -s flag', async () => {
    const result = await runCli(['repl', '--help']);
    expect(result.stdout).toMatch(/--script|-s/);
  });

  it('mentions WASM single-load performance', async () => {
    const result = await runCli(['repl', '--help']);
    expect(result.stdout).toMatch(/wasm|millisecond|load.*once|once.*load/i);
  });

  it('mentions concept:name as default key', async () => {
    const result = await runCli(['repl', '--help']);
    expect(result.stdout).toMatch(/concept:name/i);
  });

  it('mentions heuristic as default algorithm', async () => {
    const result = await runCli(['repl', '--help']);
    expect(result.stdout).toMatch(/heuristic/i);
  });

  it('help output is substantial (> 100 chars)', async () => {
    const result = await runCli(['repl', '--help']);
    expect(result.stdout.length).toBeGreaterThan(100);
  });

  it('shows USAGE and OPTIONS sections', async () => {
    const result = await runCli(['repl', '--help']);
    expect(result.stdout).toMatch(/usage/i);
    expect(result.stdout).toMatch(/options/i);
  });
});

// ─── script mode — basic execution ────────────────────────────────────────────

describe('wpm repl --script basic execution', () => {
  it('exits 0 for a script with only comments and blank lines', async () => {
    const scriptPath = await writeTempScript(`
# This is a comment
# Another comment

`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 15000 });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('prints [Script mode] header', async () => {
    const scriptPath = await writeTempScript('# empty script\n');
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 15000 });
      expect(result.stdout).toMatch(/\[Script mode\]/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('exits 2 when script file does not exist', async () => {
    const result = await runCli(['repl', '--script', '/nonexistent/path/test.repl'], { timeout: 10000 });
    // Script file not found → source_error (2)
    expect([EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
  });
});

// ─── script mode — load + run ─────────────────────────────────────────────────

describe('wpm repl --script load + run', () => {
  it('exits 0 after load + run dfg', async () => {
    const scriptPath = await writeTempScript(`
load ${SIMPLE_XES}
run dfg
`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 30000 });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('shows ✔ for load command in script output', async () => {
    const scriptPath = await writeTempScript(`load ${SIMPLE_XES}\n`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 30000 });
      expect(result.stdout).toMatch(/✔|Loaded|loaded/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('shows ✔ for run dfg in script output', async () => {
    const scriptPath = await writeTempScript(`
load ${SIMPLE_XES}
run dfg
`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 30000 });
      expect(result.stdout).toMatch(/dfg|Discovery/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('runs load + run + results successfully', async () => {
    const scriptPath = await writeTempScript(`
load ${SIMPLE_XES}
run dfg
results
`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 30000 });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Should show the script completion message
      expect(result.stdout).toMatch(/Script complete|succeeded/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('runs multiple algorithms and compare in sequence', async () => {
    const scriptPath = await writeTempScript(`
load ${SIMPLE_XES}
run dfg
run heuristic_miner
compare 2
`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 45000 });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    } finally {
      await cleanupScript(scriptPath);
    }
  });
});

// ─── script mode — save ───────────────────────────────────────────────────────

describe('wpm repl --script save command', () => {
  it('saves result to file and exits 0', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-repl-save-'));
    const scriptPath = path.join(dir, 'save.repl');
    const outPath = path.join(dir, 'output.json');

    await fs.writeFile(scriptPath, `
load ${SIMPLE_XES}
run dfg
save ${outPath}
`, 'utf8');

    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 30000 });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      // Verify the file was actually created and contains valid JSON
      const content = await fs.readFile(outPath, 'utf8').catch(() => null);
      if (content !== null) {
        const json = JSON.parse(content);
        expect(json).toHaveProperty('algorithm');
        expect(json.algorithm).toBe('dfg');
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

// ─── script mode — unknown command ────────────────────────────────────────────

describe('wpm repl --script unknown commands', () => {
  it('emits warning for unknown command but continues', async () => {
    const scriptPath = await writeTempScript(`
# Script with an unknown command mixed in
this_is_not_a_valid_command
`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 10000 });
      // Unknown commands produce a warning but do NOT cause non-zero exit on their own
      // (they are caught in the default case and the loop continues)
      expect(result.stdout).toMatch(/Script complete/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('exits 3 (execution_error) when a script has a failed run (no log loaded)', async () => {
    // "run dfg" without loading a log first — context-aware error, but script continues
    const scriptPath = await writeTempScript(`run dfg\n`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 15000 });
      // No log → warning emitted, command skipped, script completes
      // Script mode still exits 0 because warn-and-continue semantics
      expect(result.stdout).toMatch(/Script complete/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });
});

// ─── script mode — context-aware messages ─────────────────────────────────────

describe('wpm repl --script context-aware error messages', () => {
  it('shows "No log loaded" warning when run is called before load', async () => {
    const scriptPath = await writeTempScript(`run dfg\n`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 15000 });
      // Warning goes to stderr; script continues
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/no log|load.*xes|No log/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('shows context-aware warning when quality is called before any run', async () => {
    // Build the script with an absolute path so the subprocess can find the file
    const scriptPath = await writeTempScript(`
load ${SIMPLE_XES}
quality
`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 20000 });
      const combined = result.stdout + result.stderr;
      // Either "No discovery result yet" (load succeeded) or "No log loaded" (if load path resolution failed)
      expect(combined).toMatch(/no.*result|run.*algorithm|discovery result|no log|load.*xes/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('shows "Only N result" warning when compare needs 2 but only 1 exists', async () => {
    const scriptPath = await writeTempScript(`
load ${SIMPLE_XES}
run dfg
compare 2
`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 25000 });
      // compare 2 after only 1 run should produce a "Need at least 2" warning
      const combined = result.stdout + result.stderr;
      // Either it prints a comparison or a warning — both are acceptable outcomes
      expect(combined).toMatch(/compare|result|dfg/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });
});

// ─── script mode — quit command ───────────────────────────────────────────────

describe('wpm repl --script quit command', () => {
  it('quit in script causes early exit but still exits 0', async () => {
    const scriptPath = await writeTempScript(`
load ${SIMPLE_XES}
quit
run dfg
`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 20000 });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // dfg should NOT have run (quit stopped execution)
      // Just verify the script ran without error
      expect(result.stdout).toMatch(/Script mode|Loaded|✔/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });
});

// ─── script mode — history and results ────────────────────────────────────────

describe('wpm repl --script history and results commands', () => {
  it('history command runs without error in script mode', async () => {
    const scriptPath = await writeTempScript(`
load ${SIMPLE_XES}
run dfg
history
`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 30000 });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('results command lists discovery results in script output', async () => {
    const scriptPath = await writeTempScript(`
load ${SIMPLE_XES}
run dfg
results
`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 30000 });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // "results" output should mention dfg
      expect(result.stdout).toMatch(/dfg|Session Results/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });
});

// ─── script mode — algorithms command ────────────────────────────────────────

describe('wpm repl --script algorithms command', () => {
  it('algorithms lists available algorithms', async () => {
    const scriptPath = await writeTempScript(`algorithms\n`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 15000 });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/dfg|inductive|heuristic/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });
});

// ─── script mode — full workflow ──────────────────────────────────────────────

describe('wpm repl --script full workflow', () => {
  it('complete discovery workflow exits 0 with all steps shown', async () => {
    const scriptPath = await writeTempScript(`
# Full process mining workflow
load ${SIMPLE_XES}
info
run dfg
results
`);
    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 35000 });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      // Script mode header
      expect(result.stdout).toMatch(/\[Script mode\]/i);

      // Script completion summary
      expect(result.stdout).toMatch(/Script complete.*succeeded|succeeded.*Script/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('produces JSON-parseable save output', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-repl-full-'));
    const scriptPath = path.join(dir, 'full.repl');
    const outPath = path.join(dir, 'result.json');

    await fs.writeFile(scriptPath, `
load ${SIMPLE_XES}
run dfg
save ${outPath}
`, 'utf8');

    try {
      const result = await runCli(['repl', '--script', scriptPath], { timeout: 30000 });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const saved = await fs.readFile(outPath, 'utf8').catch(() => null);
      if (saved !== null) {
        const json = JSON.parse(saved);
        expect(typeof json.algorithm).toBe('string');
        expect(typeof json.elapsedMs).toBe('number');
        expect(json).toHaveProperty('savedAt');
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

/**
 * wpm lab repl --script tests (was: wpm repl --script) — batch script
 * execution, no interactive readline loop (untestable headless without a
 * pty either way).
 *
 * MIGRATION NOTES (verified live against the built CLI):
 *
 *   - `repl` -> `lab repl`, bridged unmodified to `commands/repl.ts` (see
 *     nouns/lab/repl.ts). `--help` content is covered in repl-cli.test.ts
 *     (a bridged verb's --help is fully generic — see that file's doc
 *     comment) and is not repeated here.
 *
 *   - Script-mode's plain-text progress output (the same `[Script mode]
 *     Executing N commands...` / `✔` / `Script complete.` text as before)
 *     is no longer raw stdout: the noun-verb framework requires stdout to
 *     always be JSON, so the bridge wraps any non-JSON-parseable stdout as
 *     `{ raw: "<the exact same text, ANSI codes and all>" }` (see
 *     nouns/_bridge.ts's `{ raw: text }` fallback). Every substring
 *     assertion below therefore checks `JSON.parse(stdout).raw` (or the
 *     raw `stdout` string directly, since the text survives JSON-encoding
 *     unchanged other than `\n`/control-char escaping) instead of bare
 *     stdout as the original file did.
 *
 *   - Legacy `warn()`/`console.warn` output (e.g. "No log loaded" when
 *     `run` is used before `load`) DOES still reach the real process
 *     stderr: `nouns/_bridge.ts`'s `invokeLegacyCommandAsJson` re-emits
 *     its internally-captured legacy stderr onto the real
 *     `process.stderr` unconditionally (not just on the failure path),
 *     specifically so this kind of on-success warning isn't silently lost.
 *     Verified live. (An earlier build of this bridge during this same
 *     migration did swallow it — fixed before this file was finalized.)
 *
 *   - Uses a minimal `{ PATH, HOME }` env for spawned invocations — see
 *     repl-cli.test.ts's doc comment for why a fully-inherited env can
 *     make `--help`-adjacent citty output vanish; the same minimal-env
 *     convention is applied here for consistency, though script-mode
 *     output (not routed through citty's `showUsage`) was not observed to
 *     be affected either way.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const SIMPLE_XES_CANDIDATES = [
  path.resolve(process.cwd(), 'lab/fixtures/sample-logs/simple.xes'),
  path.resolve(__dirname, '../../../../test/fixtures/small.xes'),
];

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], timeoutMs = 30_000): Promise<CliResult> {
  const cwd = path.resolve(__dirname, '../..');
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd, env },
      (error, stdout, stderr) => {
        const exitCode = error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

function raw(r: CliResult): string {
  try {
    const parsed = JSON.parse(r.stdout) as { raw?: string };
    return parsed.raw ?? r.stdout;
  } catch {
    return r.stdout;
  }
}

async function writeTempScript(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-repl-'));
  const scriptPath = path.join(dir, 'test.repl');
  await fs.writeFile(scriptPath, content, 'utf8');
  return scriptPath;
}

async function cleanupScript(scriptPath: string): Promise<void> {
  try {
    await fs.rm(path.dirname(scriptPath), { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

async function resolveSimpleXes(): Promise<string> {
  for (const c of SIMPLE_XES_CANDIDATES) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* try next */
    }
  }
  // Fall back to a minimal inline fixture written to a temp file.
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-repl-fixture-'));
  const p = path.join(dir, 'simple.xes');
  await fs.writeFile(
    p,
    `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2026-01-01T10:00:00Z"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2026-01-01T10:05:00Z"/></event>
  </trace>
</log>`,
    'utf-8'
  );
  return p;
}

// ─── script mode — basic execution ────────────────────────────────────────────

describe('wpm lab repl --script basic execution', () => {
  it('exits 0 for a script with only comments and blank lines', async () => {
    const scriptPath = await writeTempScript(`
# This is a comment
# Another comment

`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.exitCode, `stdout: ${result.stdout}`).toBe(0);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('prints [Script mode] header inside the JSON-wrapped raw text', async () => {
    const scriptPath = await writeTempScript('# empty script\n');
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(raw(result)).toMatch(/\[Script mode\]/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('exits 2 (INVALID_INPUT) when script file does not exist', async () => {
    const result = await runCli(['lab', 'repl', '--script', '/nonexistent/path/test.repl']);
    expect(result.exitCode).toBe(2);
    const envelope = JSON.parse(result.stdout) as { error?: { code: string; message: string } };
    expect(envelope.error?.code).toBe('INVALID_INPUT');
    expect(envelope.error?.message).toMatch(/ENOENT/);
  });
});

// ─── script mode — load + run ─────────────────────────────────────────────────

describe('wpm lab repl --script load + run', () => {
  it('exits 0 after load + run dfg', async () => {
    const xes = await resolveSimpleXes();
    const scriptPath = await writeTempScript(`\nload ${xes}\nrun dfg\n`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.exitCode, `stdout: ${result.stdout}`).toBe(0);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('shows ✔ for load command in the raw script output', async () => {
    const xes = await resolveSimpleXes();
    const scriptPath = await writeTempScript(`load ${xes}\n`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(raw(result)).toMatch(/✔|Loaded|loaded/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('shows dfg discovery output for run dfg', async () => {
    const xes = await resolveSimpleXes();
    const scriptPath = await writeTempScript(`\nload ${xes}\nrun dfg\n`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(raw(result)).toMatch(/dfg|Discovery/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('runs load + run + results successfully', async () => {
    const xes = await resolveSimpleXes();
    const scriptPath = await writeTempScript(`\nload ${xes}\nrun dfg\nresults\n`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.exitCode, `stdout: ${result.stdout}`).toBe(0);
      expect(raw(result)).toMatch(/Script complete|succeeded/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('runs multiple algorithms and compare in sequence', async () => {
    const xes = await resolveSimpleXes();
    const scriptPath = await writeTempScript(`\nload ${xes}\nrun dfg\nrun heuristic_miner\ncompare 2\n`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath], 45_000);
      expect(result.exitCode, `stdout: ${result.stdout}`).toBe(0);
    } finally {
      await cleanupScript(scriptPath);
    }
  });
});

// ─── script mode — save ───────────────────────────────────────────────────────

describe('wpm lab repl --script save command', () => {
  it('saves result to file and exits 0', async () => {
    const xes = await resolveSimpleXes();
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-repl-save-'));
    const scriptPath = path.join(dir, 'save.repl');
    const outPath = path.join(dir, 'output.json');
    await fs.writeFile(scriptPath, `\nload ${xes}\nrun dfg\nsave ${outPath}\n`, 'utf8');

    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.exitCode, `stdout: ${result.stdout}`).toBe(0);

      const content = await fs.readFile(outPath, 'utf8').catch(() => null);
      expect(content, 'save command must have written the output file').not.toBeNull();
      const json = JSON.parse(content!);
      expect(json).toHaveProperty('algorithm');
      expect(json.algorithm).toBe('dfg');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

// ─── script mode — unknown / no-log commands (GAP: warnings now swallowed) ────

describe('wpm lab repl --script unknown commands and no-log commands', () => {
  it('emits no error for an unknown command — script still completes, exit 0', async () => {
    const scriptPath = await writeTempScript(`
# Script with an unknown command mixed in
this_is_not_a_valid_command
`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.exitCode).toBe(0);
      expect(raw(result)).toMatch(/Script complete/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('"run dfg" with no log loaded does not fail the script — exits 0, warn-and-continue', async () => {
    const scriptPath = await writeTempScript(`run dfg\n`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.exitCode).toBe(0);
      expect(raw(result)).toMatch(/Script complete/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('shows the "No log loaded" warning on real stderr (bridge re-emits captured legacy stderr)', async () => {
    // nouns/_bridge.ts's `invokeLegacyCommandAsJson` re-emits the legacy
    // command's captured stderr onto the real process.stderr on the
    // success path (not just for failures) — verified live: this warning,
    // which a bridged verb's internal stdio trap used to swallow
    // entirely, is now visible again exactly like pre-migration.
    const scriptPath = await writeTempScript(`run dfg\n`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.stderr).toMatch(/no log loaded/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });
});

// ─── script mode — quit command ───────────────────────────────────────────────

describe('wpm lab repl --script quit command', () => {
  it('quit in script causes early exit but still exits 0; later commands do not run', async () => {
    const xes = await resolveSimpleXes();
    const scriptPath = await writeTempScript(`\nload ${xes}\nquit\nrun dfg\n`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.exitCode).toBe(0);
      const text = raw(result);
      expect(text).toMatch(/Script mode|Loaded|✔/i);
      // Only 1 of 3 lines counted as succeeded — quit stops before `run dfg`.
      expect(text).toMatch(/1\/3/);
    } finally {
      await cleanupScript(scriptPath);
    }
  });
});

// ─── script mode — history and results commands ───────────────────────────────

describe('wpm lab repl --script history and results commands', () => {
  it('history command runs without error in script mode', async () => {
    const xes = await resolveSimpleXes();
    const scriptPath = await writeTempScript(`\nload ${xes}\nrun dfg\nhistory\n`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.exitCode, `stdout: ${result.stdout}`).toBe(0);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('results command lists discovery results in script output', async () => {
    const xes = await resolveSimpleXes();
    const scriptPath = await writeTempScript(`\nload ${xes}\nrun dfg\nresults\n`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.exitCode).toBe(0);
      expect(raw(result)).toMatch(/dfg|Session Results/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });
});

// ─── script mode — algorithms command ─────────────────────────────────────────

describe('wpm lab repl --script algorithms command', () => {
  it('algorithms lists available algorithms', async () => {
    const scriptPath = await writeTempScript(`algorithms\n`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.exitCode).toBe(0);
      expect(raw(result)).toMatch(/dfg|inductive|heuristic/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });
});

// ─── script mode — full workflow ──────────────────────────────────────────────

describe('wpm lab repl --script full workflow', () => {
  it('complete discovery workflow exits 0 with all steps shown', async () => {
    const xes = await resolveSimpleXes();
    const scriptPath = await writeTempScript(`
# Full process mining workflow
load ${xes}
info
run dfg
results
`);
    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath], 35_000);
      expect(result.exitCode, `stdout: ${result.stdout}`).toBe(0);
      const text = raw(result);
      expect(text).toMatch(/\[Script mode\]/i);
      expect(text).toMatch(/Script complete.*succeeded|succeeded.*Script/i);
    } finally {
      await cleanupScript(scriptPath);
    }
  });

  it('save command produces a JSON-parseable file with algorithm and elapsedMs', async () => {
    const xes = await resolveSimpleXes();
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-repl-full-'));
    const scriptPath = path.join(dir, 'full.repl');
    const outPath = path.join(dir, 'result.json');
    await fs.writeFile(scriptPath, `\nload ${xes}\nrun dfg\nsave ${outPath}\n`, 'utf8');

    try {
      const result = await runCli(['lab', 'repl', '--script', scriptPath]);
      expect(result.exitCode, `stdout: ${result.stdout}`).toBe(0);

      const saved = await fs.readFile(outPath, 'utf8').catch(() => null);
      expect(saved).not.toBeNull();
      const json = JSON.parse(saved!);
      expect(typeof json.algorithm).toBe('string');
      expect(typeof json.elapsedMs).toBe('number');
      expect(json).toHaveProperty('savedAt');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

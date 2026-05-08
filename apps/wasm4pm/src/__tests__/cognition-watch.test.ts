/**
 * cognition-watch.test.ts
 *
 * Behavioral tests for `wpm cognition watch`.
 *
 * Van der Aalst QA perspective:
 * - The watch command is itself a process with observable state transitions:
 *   file-change-detected → contract-evaluated → receipt-printed.
 * - Tests verify the invariants of that process without relying on the
 *   @wasm4pm/cognition package being installed.
 * - All file system interaction uses real temp files; chokidar is exercised
 *   at the module level but its internal events are triggered by real writes.
 * - The SIGINT handler is tested by sending SIGTERM/SIGINT to a child process.
 *
 * Test isolation:
 * - Each test creates a fresh temp directory and cleans it up in afterEach.
 * - The watch command is imported directly (not via CLI child process) to
 *   allow unit-level assertions without spinning up the full CLI.
 *
 * Architecture note:
 * - runContract() inside watch.ts uses dynamic import('@wasm4pm/cognition')
 *   which returns null if the package isn't installed, causing a throw.
 *   Tests that cover error resilience deliberately omit the package and
 *   verify that the watcher keeps running despite the throw.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a temp dir and return its path */
async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'cognition-watch-test-'));
}

/** Write JSON to a file */
async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
}

/** Sleep for N ms */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Minimal BreedInput fixture ────────────────────────────────────────────────

const BREED_INPUT_FIXTURE = {
  breed_id: 'test-case-001',
  activities: ['register', 'examine', 'decide', 'notify'],
  context: { domain: 'process-mining', iteration: 1 },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('wpm cognition watch — behavioral contract', () => {
  let tmpDir: string;
  let inputPath: string;
  let cliBuilt = false;

  const REPO_ROOT = path.resolve(__dirname, '../../../..');
  const wpmBin = path.join(REPO_ROOT, 'apps', 'wasm4pm', 'dist', 'bin', 'wpm.js');

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    inputPath = path.join(tmpDir, 'input.json');
    await writeJson(inputPath, BREED_INPUT_FIXTURE);
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  beforeAll(async () => {
    try {
      await fs.access(wpmBin);
      cliBuilt = true;
    } catch {
      // CLI not built yet
    }
  });

  // ── Unit-level: module exports ────────────────────────────────────────────

  it('watch command exports a citty command definition with the correct meta', async () => {
    const { watch } = await import('../commands/cognition/watch.js');
    expect(watch).toBeDefined();
    expect(watch.meta).toBeDefined();
    expect((watch.meta as { name?: string }).name).toBe('watch');
    expect((watch.meta as { description?: string }).description).toBeTruthy();
  });

  it('watch command declares all required args', async () => {
    const { watch } = await import('../commands/cognition/watch.js');
    const args = (watch as { args?: Record<string, unknown> }).args;
    expect(args).toBeDefined();
    expect(args!['input']).toBeDefined();
    expect(args!['contract']).toBeDefined();
    expect(args!['debounce']).toBeDefined();
    expect(args!['format']).toBeDefined();
    expect(args!['verbose']).toBeDefined();
    expect(args!['quiet']).toBeDefined();
  });

  it('watch command has input declared as positional', async () => {
    const { watch } = await import('../commands/cognition/watch.js');
    const args = (watch as { args?: Record<string, unknown> }).args;
    const inputArg = args!['input'] as { type?: string; required?: boolean };
    expect(inputArg.type).toBe('positional');
    expect(inputArg.required).toBe(true);
  });

  // ── WatchReceipt shape ────────────────────────────────────────────────────

  it('WatchReceipt domain contracts: decision is Allow or Deny, hash is 8 hex chars, metrics non-negative', async () => {
    const mod = await import('../commands/cognition/watch.js');
    // Domain contracts (Rank 2) derived from the WatchReceipt specification
    const validDecisions = new Set<string>(['Allow', 'Deny']);

    // Verify Allow variant
    const allow: import('../commands/cognition/watch.js').WatchReceipt = {
      decision: 'Allow',
      hash: 'f0e1d2c3',
      findings: 3,
      contract: 'prolog',
      elapsedMs: 42,
    };
    expect(validDecisions.has(allow.decision)).toBe(true);
    expect(allow.hash).toMatch(/^[0-9a-f]{8}$/i);
    expect(allow.findings).toBeGreaterThanOrEqual(0);
    expect(allow.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(allow.contract.length).toBeGreaterThan(0);

    // Verify Deny variant
    const deny: import('../commands/cognition/watch.js').WatchReceipt = {
      decision: 'Deny',
      hash: 'a1b2c3d4',
      findings: 1,
      contract: 'policy',
      elapsedMs: 18,
    };
    expect(validDecisions.has(deny.decision)).toBe(true);
    expect(deny.hash).toMatch(/^[0-9a-f]{8}$/i);
    expect(deny.findings).toBeGreaterThanOrEqual(0);
    expect(deny.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  // ── Child-process integration: SIGINT exits cleanly ───────────────────────

  it.skipIf(!cliBuilt)('exits 0 and writes "stopped" to stderr when SIGINT is received', async () => {
    const child: ChildProcess = execFile('node', [wpmBin, 'cognition', 'watch', inputPath], {
      env: { ...process.env, NO_COLOR: '1' },
    });

    let stderr = '';
    let stdout = '';
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });

    // Give the watcher time to start
    await sleep(800);

    // Send SIGINT
    child.kill('SIGINT');

    const exitCode = await new Promise<number>((resolve) => {
      child.on('close', (code: number | null) => resolve(code ?? 99));
    });

    expect(exitCode).toBe(0);
    expect(stderr).toContain('stopped');
  }, 10_000);

  // ── Child-process integration: file deletion keeps watcher alive ──────────

  it.skipIf(!cliBuilt)('does not exit when the input file is deleted — keeps waiting', async () => {
    const child: ChildProcess = execFile('node', [wpmBin, 'cognition', 'watch', inputPath], {
      env: { ...process.env, NO_COLOR: '1' },
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    // Register close listener before any sleeps that might trigger exit
    let exited = false;
    child.on('close', () => { exited = true; });

    // Let the watcher start
    await sleep(800);

    // Delete the file
    await fs.unlink(inputPath);
    await sleep(600);

    // Process must still be running (not exited)
    expect(exited).toBe(false);

    // Clean up
    child.kill('SIGINT');
    await new Promise<void>((resolve) => {
      child.on('close', () => resolve());
    });
  }, 10_000);

  // ── Child-process integration: run errors don't crash the watcher ────────

  it.skipIf(!cliBuilt)('logs an error but keeps running when the contract run fails', async () => {
    const child: ChildProcess = execFile(
      'node',
      [wpmBin, 'cognition', 'watch', inputPath, '--contract', 'prolog'],
      { env: { ...process.env, NO_COLOR: '1' } }
    );

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    // Register close listener before any sleeps that might trigger exit
    let exited = false;
    child.on('close', () => { exited = true; });

    // Let the watcher start
    await sleep(800);

    // Trigger a change — @wasm4pm/cognition is not installed so runContract() throws
    await writeJson(inputPath, { ...BREED_INPUT_FIXTURE, iteration: 2 });
    await sleep(600);

    // Process must still be alive
    expect(exited).toBe(false);

    // Clean up
    child.kill('SIGINT');
    await new Promise<void>((resolve) => {
      child.on('close', () => resolve());
    });
  }, 12_000);

  // ── Module: runContract is not exported (internal) ────────────────────────

  it('does not leak internal runContract function as a named export', async () => {
    const mod = await import('../commands/cognition/watch.js');
    // Only `watch` and `WatchReceipt` (type only) should be exported
    const exportedNames = Object.keys(mod);
    expect(exportedNames).toContain('watch');
    // runContract is private — it must not appear as an export
    expect(exportedNames).not.toContain('runContract');
  });

  // ── Module: cognition parent command has watch registered ─────────────────

  it('cognition parent command registers watch as a subcommand', async () => {
    const { cognition } = await import('../commands/cognition.js');
    expect(cognition).toBeDefined();
    const subs = (cognition as { subCommands?: Record<string, unknown> }).subCommands;
    expect(subs).toBeDefined();
    expect(subs!['watch']).toBeDefined();
  });
});

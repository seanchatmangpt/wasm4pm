/**
 * prolog8-smoke.test.ts
 *
 * Smoke tests for `wpm lab prolog8` (show/query) and `wpm evidence replay`
 * (replay) — was `wpm prolog8 <subcommand>` before the noun-verb rebuild.
 * See `apps/wasm4pm/src/nouns/_removed.ts`: bare `prolog8` -> `lab prolog8`;
 * the two-token pair `prolog8 replay` -> `evidence replay` specifically
 * (both bridge to the same `commands/prolog8.ts` body — see
 * `src/nouns/evidence/replay.ts` and `src/nouns/lab/prolog8.ts`).
 *
 * Contract notes (verified live against the built CLI):
 *   - A successful bridged verb still returns the full legacy envelope
 *     `{command, status, exit_code, payload, meta}` as the top-level JSON
 *     (the bridge in `nouns/_bridge.ts` returns the legacy result
 *     unmodified on the success path).
 *   - A FAILING bridged verb throws a `NounVerbError`, which the framework
 *     serializes as `{error:{code,message}}` ONLY — no `command`/`meta`/
 *     `payload` fields exist on that shape (see `packages/noun-verb/src/
 *     errors.ts`: "the ONLY shape a verb error ever serializes to on
 *     stdout"). `error.code` is one of the framework's 9 `ErrorCode`
 *     values (INVALID_INPUT, EXECUTION_ERROR, ...), NOT the legacy
 *     'source_error'/'config_error' strings.
 *   - Errors that occur inside `commands/prolog8.ts`'s own `run()` body
 *     (e.g. file-not-found) go through `classifyLegacyFailure`, which
 *     preserves the legacy exit code (2 -> INVALID_INPUT, 5 -> INTERNAL_ERROR,
 *     else -> EXECUTION_ERROR). Errors that occur at CITTY'S OWN dispatch
 *     layer BEFORE `run()` executes (a required arg missing, e.g.
 *     `--input`) throw a plain `Error` that bypasses that classification
 *     entirely and lands as generic EXECUTION_ERROR (exit 3) — this is why
 *     "missing --input" is now exit 3, not the legacy config_error (1).
 *   - OTEL/receipt coverage (Absolute Rule 6/7) is no longer visible via a
 *     `meta.run_id` field on error responses (that field doesn't exist on
 *     the error envelope) — it's verified via the receipt chain written to
 *     `.wasm4pm/receipts/latest.json` by `cli.ts`'s `onError`/`onResult`
 *     hooks, which fire for every verb invocation regardless of outcome.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';

// runCli defaults to 30s; set vitest test timeout higher to avoid race.
vi.setConfig({ testTimeout: 60_000 });

// `.wasm4pm/receipts/` is written relative to the CHILD process's cwd
// (`saveCommandReceipt`, `src/receipts/_shared.ts`). Other agents' test runs
// share this same repo tree and write to the same relative path concurrently
// (multi-agent reality — see CLAUDE.md), so receipt-coverage assertions here
// point the child process's cwd at the test's own isolated `env.tempDir`
// rather than reading the shared repo-root `.wasm4pm/` used by everyone else.
async function readLatestReceipt(cwd: string): Promise<Record<string, unknown> | undefined> {
  try {
    const content = await fs.readFile(path.join(cwd, '.wasm4pm/receipts/latest.json'), 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

describe('wpm prolog8 — smoke tests', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(async () => {
    await env?.cleanup?.();
  });

  // ── show (was: wpm prolog8 show -> wpm lab prolog8 show) ─────────────────────

  describe('lab prolog8 show', () => {
    it('exits 0 or INVALID_INPUT-mapped SOURCE_ERROR (2) — never any other code', async () => {
      const result = await runCli(['lab', 'prolog8', 'show'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('--format json always emits parseable JSON', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--format json output is either the legacy success envelope (status field) or the framework error envelope (error field)', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      if (result.exitCode === EXIT_CODES.success) {
        expect(parsed['status']).toBe('ok');
      } else {
        expect(parsed['error']).toBeDefined();
      }
    });

    it('--format json exit_code matches process exit code on the success path (legacy envelope)', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.success) return; // error path has no exit_code field — see contract notes
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['exit_code']).toBe(result.exitCode);
    });

    it('--format json error.code is "INVALID_INPUT" when WASM absent', async () => {
      const result = await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.source_error) return; // WASM present — vacuous
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown> | undefined;
      expect(err?.['code']).toBe('INVALID_INPUT');
    });

    it('combined output is non-empty', async () => {
      const result = await runCli(['lab', 'prolog8', 'show'], { env: env.env });
      expect((result.stdout + result.stderr).trim()).not.toBe('');
    });

    it('completes within 15000ms', async () => {
      const t0 = Date.now();
      await runCli(['lab', 'prolog8', 'show'], { env: env.env });
      expect(Date.now() - t0).toBeLessThan(15000);
    });
  });

  // ── query (was: wpm prolog8 query -> wpm lab prolog8 query) ──────────────────

  describe('lab prolog8 query', () => {
    it('missing --input exits EXECUTION_ERROR (3) — citty\'s own required-arg check fires before commands/prolog8.ts\'s run(), bypassing legacy config_error classification', async () => {
      const result = await runCli(['lab', 'prolog8', 'query'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
    });

    it('--input /nonexistent exits SOURCE_ERROR (2)', async () => {
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', '/nonexistent-prolog8-smoke.json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('--input /nonexistent --format json error.code is "INVALID_INPUT"', async () => {
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', '/nonexistent-prolog8-smoke.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown> | undefined;
      expect(err?.['code']).toBe('INVALID_INPUT');
    });

    it('--input /nonexistent --format json receipt records command "lab prolog8"', async () => {
      // The error envelope itself has no `command` field (see contract notes) —
      // the receipt chain is where the invoked command name is now recorded.
      await runCli(
        ['lab', 'prolog8', 'query', '-i', '/nonexistent-prolog8-smoke.json', '--format', 'json'],
        { env: env.env, cwd: env.tempDir }
      );
      const receipt = await readLatestReceipt(env.tempDir);
      expect(receipt?.['command']).toBe('lab prolog8');
      expect(receipt?.['status']).toBe('failed');
    });
  });

  // ── replay (was: wpm prolog8 replay -> wpm evidence replay) ──────────────────

  describe('evidence replay', () => {
    it('missing --input exits EXECUTION_ERROR (3) — citty\'s own required-arg check fires before commands/prolog8.ts\'s run(), bypassing legacy config_error classification', async () => {
      const result = await runCli(['evidence', 'replay'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
    });

    it('--input /nonexistent exits SOURCE_ERROR (2)', async () => {
      const result = await runCli(
        ['evidence', 'replay', '-i', '/nonexistent-prolog8-smoke-replay.json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('--input /nonexistent --format json error.code is "INVALID_INPUT"', async () => {
      const result = await runCli(
        ['evidence', 'replay', '-i', '/nonexistent-prolog8-smoke-replay.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown> | undefined;
      expect(err?.['code']).toBe('INVALID_INPUT');
    });

    it('--input /nonexistent --format json receipt records command "evidence replay"', async () => {
      await runCli(
        ['evidence', 'replay', '-i', '/nonexistent-prolog8-smoke-replay.json', '--format', 'json'],
        { env: env.env, cwd: env.tempDir }
      );
      const receipt = await readLatestReceipt(env.tempDir);
      expect(receipt?.['command']).toBe('evidence replay');
      expect(receipt?.['status']).toBe('failed');
    });
  });

  // ── OTEL / receipt coverage (structural) ─────────────────────────────────────
  // The legacy `meta.run_id` field doesn't exist on the framework's error
  // envelope (`{error:{code,message}}` only — see contract notes at top of
  // file). Absolute Rule 6/7 (BLAKE3 receipt + OTEL span per invocation) is
  // now verified via the receipt chain instead.

  describe('receipt coverage (structural)', () => {
    it('show --format json writes a receipt with a run_id (OTEL span emitted)', async () => {
      await runCli(['lab', 'prolog8', 'show', '--format', 'json'], { env: env.env, cwd: env.tempDir });
      const receipt = await readLatestReceipt(env.tempDir);
      expect(receipt).toBeDefined();
      expect(typeof receipt?.['run_id']).toBe('string');
    });

    it('query --format json writes a receipt with a run_id', async () => {
      await runCli(
        ['lab', 'prolog8', 'query', '-i', '/nonexistent-otel.json', '--format', 'json'],
        { env: env.env, cwd: env.tempDir }
      );
      const receipt = await readLatestReceipt(env.tempDir);
      expect(receipt).toBeDefined();
      expect(typeof receipt?.['run_id']).toBe('string');
    });

    it('replay --format json writes a receipt with a run_id', async () => {
      await runCli(
        ['evidence', 'replay', '-i', '/nonexistent-otel-replay.json', '--format', 'json'],
        { env: env.env, cwd: env.tempDir }
      );
      const receipt = await readLatestReceipt(env.tempDir);
      expect(receipt).toBeDefined();
      expect(typeof receipt?.['run_id']).toBe('string');
    });
  });
});

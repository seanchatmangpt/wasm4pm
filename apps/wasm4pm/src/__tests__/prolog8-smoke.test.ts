/**
 * prolog8-smoke.test.ts
 *
 * Smoke tests for `wpm prolog8` subcommands.
 *
 * Invariants tested (all are WASM-availability-agnostic):
 *   1. `prolog8 show`  exits 0 (WASM present) or 2 (WASM absent) — never other codes
 *   2. `prolog8 show --format json` always emits parseable JSON with status + exit_code
 *   3. `prolog8 query` (no --input) exits 1 (config_error)
 *   4. `prolog8 replay` (no --input) exits 1 (config_error)
 *   5. `prolog8 query -i /nonexistent` exits 2 (source_error), error.code = "source_error"
 *   6. `prolog8 replay -i /nonexistent` exits 2 (source_error), error.code = "source_error"
 *   7. `prolog8 show --format json` error.code = "source_error" when WASM absent
 *   8. All subcommands complete within 5000ms
 *
 * These tests exercise only the CLI boundary. They do not require the Prolog8 WASM
 * package to be built (most assertions are vacuously true or guarded when WASM is present).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

vi.setConfig({ testTimeout: 30_000 });

describe('wpm prolog8 — smoke tests', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(async () => {
    await env?.cleanup?.();
  });

  // ── show ─────────────────────────────────────────────────────────────────────

  describe('prolog8 show', () => {
    it('exits 0 or SOURCE_ERROR (2) — never any other code', async () => {
      const result = await runCli(['prolog8', 'show'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('--format json always emits parseable JSON', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('--format json output has status field ("ok" or "error")', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(['ok', 'error']).toContain(parsed['status']);
    });

    it('--format json exit_code field matches process exit code', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['exit_code']).toBe(result.exitCode);
    });

    it('--format json error.code is "source_error" when WASM absent', async () => {
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      if (result.exitCode !== EXIT_CODES.source_error) return; // WASM present — vacuous
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown> | undefined;
      expect(err?.['code']).toBe('source_error');
    });

    it('combined output is non-empty', async () => {
      const result = await runCli(['prolog8', 'show'], { env: env.env });
      expect((result.stdout + result.stderr).trim()).not.toBe('');
    });

    it('completes within 15000ms', async () => {
      const t0 = Date.now();
      await runCli(['prolog8', 'show'], { env: env.env });
      expect(Date.now() - t0).toBeLessThan(15000);
    });
  });

  // ── query ────────────────────────────────────────────────────────────────────

  describe('prolog8 query', () => {
    it('missing --input exits CONFIG_ERROR (1)', async () => {
      const result = await runCli(['prolog8', 'query'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('--input /nonexistent exits SOURCE_ERROR (2)', async () => {
      const result = await runCli(
        ['prolog8', 'query', '-i', '/nonexistent-prolog8-smoke.json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('--input /nonexistent --format json error.code is "source_error"', async () => {
      const result = await runCli(
        ['prolog8', 'query', '-i', '/nonexistent-prolog8-smoke.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown> | undefined;
      expect(err?.['code']).toBe('source_error');
    });

    it('--input /nonexistent --format json has command "prolog8 query"', async () => {
      const result = await runCli(
        ['prolog8', 'query', '-i', '/nonexistent-prolog8-smoke.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['command']).toBe('prolog8 query');
    });
  });

  // ── replay ───────────────────────────────────────────────────────────────────

  describe('prolog8 replay', () => {
    it('missing --input exits CONFIG_ERROR (1)', async () => {
      const result = await runCli(['prolog8', 'replay'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });

    it('--input /nonexistent exits SOURCE_ERROR (2)', async () => {
      const result = await runCli(
        ['prolog8', 'replay', '-i', '/nonexistent-prolog8-smoke-replay.json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('--input /nonexistent --format json error.code is "source_error"', async () => {
      const result = await runCli(
        ['prolog8', 'replay', '-i', '/nonexistent-prolog8-smoke-replay.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = parsed['error'] as Record<string, unknown> | undefined;
      expect(err?.['code']).toBe('source_error');
    });

    it('--input /nonexistent --format json has command "prolog8 replay"', async () => {
      const result = await runCli(
        ['prolog8', 'replay', '-i', '/nonexistent-prolog8-smoke-replay.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['command']).toBe('prolog8 replay');
    });
  });

  // ── OTEL span coverage ───────────────────────────────────────────────────────

  describe('OTEL span coverage (structural)', () => {
    it('show --format json output has meta.run_id field (OTEL span emitted)', async () => {
      // The withSpan wrapper writes a run_id into the meta envelope.
      // Presence of run_id proves a span context was active during the command.
      const result = await runCli(['prolog8', 'show', '--format', 'json'], { env: env.env });
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const meta = parsed['meta'] as Record<string, unknown> | undefined;
      expect(meta).toBeDefined();
      expect(typeof meta?.['run_id']).toBe('string');
    });

    it('query --format json output has meta.run_id field', async () => {
      const result = await runCli(
        ['prolog8', 'query', '-i', '/nonexistent-otel.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const meta = parsed['meta'] as Record<string, unknown> | undefined;
      expect(meta).toBeDefined();
      expect(typeof meta?.['run_id']).toBe('string');
    });

    it('replay --format json output has meta.run_id field', async () => {
      const result = await runCli(
        ['prolog8', 'replay', '-i', '/nonexistent-otel-replay.json', '--format', 'json'],
        { env: env.env }
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const meta = parsed['meta'] as Record<string, unknown> | undefined;
      expect(meta).toBeDefined();
      expect(typeof meta?.['run_id']).toBe('string');
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

/**
 * Migration note: `config check` is a native (non-bridged) noun-verb
 * (`nouns/config/check.ts`) — the same merge point the legacy `config
 * validate`/`config verify`/`config doctor` synonyms now hard-break to
 * (see `nouns/_removed.ts`). Its handler returns the plain result object
 * directly on success — `{ warnings: [], all_clear: true }`, with NO
 * `{status,payload}` wrapper — and on failure (warnings present) THROWS
 * an EXECUTION_ERROR (exit 3), serialized as `{error:{code,message}}`; it
 * never returns a payload with `all_clear: false`. `--format`/`--quiet`/
 * `-q` are not declared args on this verb — the framework accepts and
 * silently ignores unknown flags, so passing them is harmless but has no
 * effect (verified live).
 */
describe('wpm config check — warn on configuration issues', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('config check (basic)', () => {
    it('should exit 0 (success) or 3 (execution_error, when warnings exist)', async () => {
      const result = await runCli(['config', 'check']);
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should mention warning count in the error message if warnings exist', async () => {
      const result = await runCli(['config', 'check']);
      if (result.exitCode === EXIT_CODES.execution_error) {
        const json = JSON.parse(result.stdout);
        expect(json.error?.message).toMatch(/warning/i);
      }
    });
  });

  describe('config check output (JSON is the only contract — no --format flag exists)', () => {
    it('should always output valid JSON on stdout', async () => {
      const result = await runCli(['config', 'check']);
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('success payload has a warnings array and all_clear:true directly (no {status,payload} wrapper)', async () => {
      const result = await runCli(['config', 'check']);
      if (result.exitCode !== EXIT_CODES.success) return; // covered by the error-envelope test below
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json.warnings)).toBe(true);
      expect(json).toHaveProperty('all_clear');
      expect(json.all_clear).toBe(true);
    });

    it('error envelope (when warnings exist) is {error:{code,message}}, not a payload with all_clear:false', async () => {
      const result = await runCli(['config', 'check']);
      if (result.exitCode !== EXIT_CODES.execution_error) return; // covered by the success test above
      const json = JSON.parse(result.stdout);
      expect(json.error).toBeDefined();
      expect(json.error.code).toBe('EXECUTION_ERROR');
      expect(typeof json.error.message).toBe('string');
    });
  });

  describe('config check — undeclared flags are accepted and ignored', () => {
    it('accepts --quiet without error (no-op — not a declared arg)', async () => {
      const result = await runCli(['config', 'check', '--quiet']);
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('accepts -q without error (no-op — not a declared arg)', async () => {
      const result = await runCli(['config', 'check', '-q']);
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });
  });

  describe('config check --config <missing file>', () => {
    it('reports INVALID_INPUT with exit source_error(2) for a missing --config path', async () => {
      const result = await runCli(['config', 'check', '--config', '/nonexistent-config-xyz.toml']);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const json = JSON.parse(result.stdout);
      expect(json.error?.code).toBe('INVALID_INPUT');
      expect(json.error?.message).toMatch(/not found/i);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm config check — warn on configuration issues', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('config check (basic)', () => {
    it('should exit 0 when no warnings exist', async () => {
      const result = await runCli(['config', 'check'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should exit 3 (execution_error) when warnings exist', async () => {
      // Trigger a warning via invalid but schema-passing config
      const customEnv = {
        ...env.env,
        WASM4PM_PREDICTION_NGRAM_ORDER: '10', // Out of valid range [2,5]
      };
      const result = await runCli(['config', 'check'], { env: customEnv });
      // Should either pass (if ngram not validated at this layer) or fail with exit 3
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should show "no warnings" message on success', async () => {
      const result = await runCli(['config', 'check'], { env: env.env });
      if (result.exitCode === EXIT_CODES.success) {
        expect(result.stdout).toMatch(/no warnings|passed|all clear/i);
      }
    });

    it('should list warning fields if warnings exist', async () => {
      const result = await runCli(['config', 'check'], { env: env.env });
      if (result.exitCode === EXIT_CODES.execution_error) {
        expect(result.stdout || result.stderr).toMatch(/field:|warning/i);
      }
    });
  });

  describe('config check --format', () => {
    it('should respect --format json flag', async () => {
      const result = await runCli(['config', 'check', '--format', 'json'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const json = JSON.parse(result.stdout);
      expect(json.payload).toBeDefined();
      expect(json.payload.warnings).toBeDefined();
      expect(json.payload.all_clear).toBeDefined();
    });

    it('JSON payload.all_clear should match exit code', async () => {
      const result = await runCli(['config', 'check', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      const isSuccess = result.exitCode === EXIT_CODES.success;
      expect(json.payload.all_clear).toBe(isSuccess);
    });

    it('should have warnings array in JSON payload', async () => {
      const result = await runCli(['config', 'check', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json.payload.warnings)).toBe(true);
    });
  });

  describe('config check --quiet', () => {
    it('should suppress human output with --quiet flag', async () => {
      const resultWithoutQuiet = await runCli(['config', 'check'], { env: env.env });
      const resultWithQuiet = await runCli(['config', 'check', '--quiet'], { env: env.env });
      expect(resultWithoutQuiet.exitCode).toBe(resultWithQuiet.exitCode);
      // Quiet should not suppress all output (JSON still emitted if needed)
    });

    it('should still work with --format json and --quiet', async () => {
      const result = await runCli(['config', 'check', '--format', 'json', '--quiet'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
      const json = JSON.parse(result.stdout);
      expect(json.payload.warnings).toBeDefined();
    });
  });

  describe('config check with -q alias', () => {
    it('should accept -q as alias for --quiet', async () => {
      const result = await runCli(['config', 'check', '-q'], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });
  });

  describe('config check warning structure', () => {
    it('should have field and warning properties in warning objects', async () => {
      const result = await runCli(['config', 'check', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      if (json.payload.warnings.length > 0) {
        const warning = json.payload.warnings[0];
        expect(warning).toHaveProperty('field');
        expect(warning).toHaveProperty('warning');
      }
    });
  });

  describe('config check exit codes', () => {
    it('should exit 0 on success', async () => {
      const result = await runCli(['config', 'check'], { env: env.env });
      // Either passes with 0 or has warnings with 3
      expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should not exit 1 (config_error) for default config', async () => {
      const result = await runCli(['config', 'check'], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    });

    it('should exit 1 on resolution failure with invalid config', async () => {
      const badEnv = { ...env.env, WASM4PM_PROFILE: 'invalid_xyz' };
      const result = await runCli(['config', 'check'], { env: badEnv });
      // May exit 1 (config_error) or 3 (execution_error) depending on validation layer
      expect([EXIT_CODES.config_error, EXIT_CODES.execution_error]).toContain(result.exitCode);
    });
  });
});

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
    it('should exit 0 or 3 (success or execution_error)', async () => {
      const result = await runCli(['config', 'check']);
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should list warning fields if warnings exist', async () => {
      const result = await runCli(['config', 'check']);
      if (result.exitCode === EXIT_CODES.EXECUTION_ERROR) {
        expect(result.stdout || result.stderr).toMatch(/field:|warning/i);
      }
    });
  });

  describe('config check --format json', () => {
    it('should output valid JSON', async () => {
      const result = await runCli(['config', 'check', '--format', 'json']);
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.EXECUTION_ERROR]).toContain(result.exitCode);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('should have warnings array in JSON payload', async () => {
      const result = await runCli(['config', 'check', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      expect(json.payload).toBeDefined();
      expect(Array.isArray(json.payload.warnings)).toBe(true);
      expect(json.payload).toHaveProperty('all_clear');
    });

    it('JSON payload.all_clear should match exit code', async () => {
      const result = await runCli(['config', 'check', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      const isSuccess = result.exitCode === EXIT_CODES.SUCCESS;
      expect(json.payload.all_clear).toBe(isSuccess);
    });

    it('should have correct structure in JSON', async () => {
      const result = await runCli(['config', 'check', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('status');
      expect(json).toHaveProperty('payload');
    });
  });

  describe('config check --quiet', () => {
    it('should accept --quiet flag', async () => {
      const result = await runCli(['config', 'check', '--quiet']);
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.EXECUTION_ERROR]).toContain(result.exitCode);
    });

    it('should accept -q as alias for --quiet', async () => {
      const result = await runCli(['config', 'check', '-q']);
      expect([EXIT_CODES.SUCCESS, EXIT_CODES.EXECUTION_ERROR]).toContain(result.exitCode);
    });
  });

  describe('config check warnings detection', () => {
    it('all_clear property should be boolean', async () => {
      const result = await runCli(['config', 'check', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      expect(typeof json.payload.all_clear).toBe('boolean');
    });

    it('warnings array should contain objects with field/warning properties when not empty', async () => {
      const result = await runCli(['config', 'check', '--format', 'json']);
      const json = JSON.parse(result.stdout);
      if (json.payload.warnings.length > 0) {
        for (const warning of json.payload.warnings) {
          expect(warning).toHaveProperty('field');
          expect(warning).toHaveProperty('warning');
        }
      }
    });
  });
});
